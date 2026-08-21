use crate::models::{SyncConflict, SyncFile, ProjectBundle};
use crate::{frontmatter, workspace, Error};
use std::collections::HashMap;
use std::path::{Path, PathBuf};
use serde_yaml::{Mapping, Value};

/// 同步根目录：{ws}/.localflow/sync
fn sync_root(ws: &Path) -> PathBuf {
    ws.join(".localflow").join("sync")
}

fn peer_base_dir(ws: &Path, peer_id: &str, project_id: &str) -> PathBuf {
    sync_root(ws).join("peers").join(peer_id).join(project_id)
}

fn conflicts_path(ws: &Path) -> PathBuf {
    sync_root(ws).join("conflicts.json")
}

pub fn read_conflicts(ws: &Path) -> Vec<SyncConflict> {
    std::fs::read_to_string(conflicts_path(ws))
        .ok()
        .and_then(|s| serde_json::from_str(&s).ok())
        .unwrap_or_default()
}

fn save_conflicts(ws: &Path, list: &[SyncConflict]) {
    if let Some(dir) = conflicts_path(ws).parent() {
        let _ = std::fs::create_dir_all(dir);
    }
    let _ = std::fs::write(conflicts_path(ws), serde_json::to_string_pretty(list).unwrap_or_default());
}

fn base_path(base_dir: &Path, rel_path: &str) -> PathBuf {
    base_dir.join(rel_path)
}

fn base_content(base_dir: &Path, rel_path: &str) -> String {
    std::fs::read_to_string(base_path(base_dir, rel_path)).unwrap_or_default()
}

fn write_base(base_dir: &Path, rel_path: &str, content: &str) {
    let p = base_path(base_dir, rel_path);
    if let Some(dir) = p.parent() {
        let _ = std::fs::create_dir_all(dir);
    }
    let _ = std::fs::write(p, content);
}

/// 读取项目的全部同步文件（project.md + tasks/*.md 的原始文本）
fn local_project_files(ws: &Path, folder: &str) -> Result<HashMap<String, String>, Error> {
    let root = workspace::project_dir(ws, folder);
    let mut out = HashMap::new();
    let project_md = std::fs::read_to_string(root.join("project.md"))?;
    out.insert("project.md".to_string(), project_md);
    let tasks = root.join("tasks");
    if tasks.is_dir() {
        let mut entries: Vec<PathBuf> = std::fs::read_dir(&tasks)?
            .filter_map(|e| e.ok().map(|e| e.path()))
            .filter(|p| p.extension().map_or(false, |x| x == "md"))
            .collect();
        entries.sort();
        for p in entries {
            let name = p.file_name().unwrap().to_string_lossy().to_string();
            if let Ok(content) = std::fs::read_to_string(&p) {
                out.insert(format!("tasks/{name}"), content);
            }
        }
    }
    Ok(out)
}

/// 构建用于发给对方的项目数据包
pub fn build_bundle(ws: &Path, project_id: &str) -> Result<ProjectBundle, Error> {
    let project = workspace::read_project_by_id(ws, project_id)?;
    let files: Vec<SyncFile> = local_project_files(ws, &project.folder)?
        .into_iter()
        .map(|(rel_path, content)| SyncFile { rel_path, content })
        .collect();
    Ok(ProjectBundle {
        project_id: project.meta.id.clone(),
        name: project.meta.name.clone(),
        updated_at: project.meta.updated_at.clone(),
        meta: project.meta,
        files,
    })
}

/// 三向合并（文件级）：base / mine / theirs
/// 返回合并后的内容；无法自动合并时返回 None（触发冲突）。
fn three_way(base: &str, mine: &str, theirs: &str) -> Option<String> {
    if mine == theirs {
        Some(mine.to_string())
    } else if mine == base {
        Some(theirs.to_string())
    } else if theirs == base {
        Some(mine.to_string())
    } else {
        None
    }
}

fn mapping_of(raw: &str) -> Value {
    if let Ok((meta, _)) = frontmatter::parse_front_matter(raw) {
        let v = serde_yaml::to_value(&meta).unwrap_or(Value::Null);
        return v;
    }
    Value::Null
}

fn body_of(raw: &str) -> String {
    frontmatter::parse_front_matter(raw).map(|(_, body)| body).unwrap_or_default()
}

/// project.md 字段级合并：合并 frontmatter 字段 + 正文。
/// 任一字段两侧同时改为不同值 => 整体视为冲突（返回 None）。
fn merge_project_md(base: &str, mine: &str, theirs: &str) -> Option<String> {
    let b = mapping_of(base);
    let m = mapping_of(mine);
    let t = mapping_of(theirs);
    let (merged_map, conflict_keys) = merge_mapping(&b, &m, &t);
    if !conflict_keys.is_empty() {
        return None;
    }
    let body = three_way(&body_of(base), &body_of(mine), &body_of(theirs))?;
    let meta: crate::models::ProjectMeta = serde_yaml::from_value(merged_map).ok()?;
    frontmatter::project_to_file_content(&meta, &body).ok()
}

fn merge_mapping(base: &Value, mine: &Value, theirs: &Value) -> (Value, Vec<String>) {
    let key = |v: &Value| -> Vec<String> {
        v.as_mapping()
            .map(|mp| mp.keys().filter_map(|k| k.as_str().map(|s| s.to_string())).collect())
            .unwrap_or_default()
    };
    let mut keys: Vec<String> = key(base);
    for k in key(mine) {
        if !keys.contains(&k) {
            keys.push(k.clone());
        }
    }
    for k in key(theirs) {
        if !keys.contains(&k) {
            keys.push(k.clone());
        }
    }
    let get = |v: &Value, k: &str| -> Value {
        v.as_mapping()
            .and_then(|mp| mp.get(Value::String(k.to_string())))
            .cloned()
            .unwrap_or(Value::Null)
    };
    let mut merged = Mapping::new();
    let mut conflicts = Vec::new();
    for k in keys {
        let b = get(base, &k);
        let m = get(mine, &k);
        let t = get(theirs, &k);
        let chosen = if m == t {
            m.clone()
        } else if m == b {
            t.clone()
        } else if t == b {
            m.clone()
        } else {
            conflicts.push(k.clone());
            m.clone()
        };
        if chosen != Value::Null {
            merged.insert(Value::String(k.clone()), chosen);
        }
    }
    (Value::Mapping(merged), conflicts)
}

/// 应用来自 peer 的项目数据包：三向合并 + 写入本地 + 更新基准镜像。
/// 返回 (已应用文件数, 冲突数)。
pub fn apply_bundle(ws: &Path, peer_id: &str, bundle: &ProjectBundle) -> Result<(usize, usize), Error> {
    let base_dir = peer_base_dir(ws, peer_id, &bundle.project_id);
    let incoming: HashMap<String, String> = bundle
        .files
        .iter()
        .map(|f| (f.rel_path.clone(), f.content.clone()))
        .collect();

    // 判断项目是否已存在于本地（优先按 id，其次按名称）
    let existing = workspace::list_projects(ws)
        .ok()
        .and_then(|ps| ps.into_iter().find(|p| p.meta.id == bundle.project_id))
        .map(|p| p.folder.clone())
        .or_else(|| workspace::find_by_name(ws, &bundle.name));

    let local: HashMap<String, String> = match &existing {
        Some(folder) => local_project_files(ws, folder).unwrap_or_default(),
        None => HashMap::new(),
    };

    let mut keys: Vec<String> = Vec::new();
    for m in [&local, &incoming] {
        for k in m.keys() {
            if !keys.contains(k) {
                keys.push(k.clone());
            }
        }
    }

    let mut merged: HashMap<String, String> = HashMap::new();
    let mut conflicts: Vec<SyncConflict> = Vec::new();
    let mut applied = 0usize;

    for rel in &keys {
        let mine = local.get(rel).cloned().unwrap_or_default();
        let theirs = incoming.get(rel).cloned().unwrap_or_default();
        let base = base_content(&base_dir, rel);

        let result = if rel == "project.md" {
            merge_project_md(&base, &mine, &theirs)
        } else {
            three_way(&base, &mine, &theirs)
        };

        match result {
            Some(content) => {
                merged.insert(rel.clone(), content);
                applied += 1;
            }
            None => {
                conflicts.push(SyncConflict {
                    id: format!("{}::{}", bundle.project_id, rel),
                    peer_id: peer_id.to_string(),
                    project_id: bundle.project_id.clone(),
                    project_name: bundle.name.clone(),
                    file: rel.clone(),
                    mine,
                    theirs,
                    base,
                });
            }
        }
    }

    if !merged.is_empty() {
        if let Some(folder) = &existing {
            for (rel, content) in &merged {
                let target = ws.join(folder).join(rel);
                if let Some(dir) = target.parent() {
                    let _ = std::fs::create_dir_all(dir);
                }
                let _ = std::fs::write(target, content);
            }
        } else {
            // 本地不存在 => 创建项目
            let project_md = merged
                .get("project.md")
                .cloned()
                .unwrap_or_default();
            let (meta, body) = if project_md.is_empty() {
                (bundle.meta.clone(), String::new())
            } else {
                frontmatter::parse_front_matter(&project_md)
                    .map(|(me, bo)| (me, bo))
                    .unwrap_or_else(|_| (bundle.meta.clone(), String::new()))
            };
            let created = workspace::create_project(ws, meta, body)?;
            for (rel, content) in &merged {
                if rel == "project.md" {
                    continue;
                }
                let target = ws.join(&created.folder).join(rel);
                if let Some(dir) = target.parent() {
                    let _ = std::fs::create_dir_all(dir);
                }
                let _ = std::fs::write(target, content);
            }
        }
    }

    // 更新基准镜像：已应用的文件记录合并结果；冲突文件保留原基准
    for (rel, content) in &merged {
        write_base(&base_dir, rel, content);
    }

    let mut existing_conflicts = read_conflicts(ws);
    for c in &conflicts {
        if !existing_conflicts.iter().any(|x| x.id == c.id) {
            existing_conflicts.push(c.clone());
        }
    }
    save_conflicts(ws, &existing_conflicts);

    Ok((applied, conflicts.len()))
}

/// 冲突解决方案：保留本地 / 采用对方
pub fn resolve_conflict(ws: &Path, id: &str, choice: &str) -> Result<(), Error> {
    let mut list = read_conflicts(ws);
    let index = list.iter().position(|c| c.id == id)
        .ok_or_else(|| Error::NotFound("冲突不存在或已解决".into()))?;
    let conflict = list[index].clone();
    let content = match choice {
        "theirs" => conflict.theirs.clone(),
        _ => conflict.mine.clone(),
    };
    let folder = workspace::read_project_by_id(ws, &conflict.project_id)?.folder;
    let target = ws.join(&folder).join(&conflict.file);
    if let Some(dir) = target.parent() {
        let _ = std::fs::create_dir_all(dir);
    }
    // 更新对应 peer 的基准镜像，后续以本次选择为新的共同基线
    let base_dir = peer_base_dir(ws, &conflict.peer_id, &conflict.project_id);
    write_base(&base_dir, &conflict.file, &content);
    std::fs::write(target, content)?;
    list.remove(index);
    save_conflicts(ws, &list);
    let _ = workspace::refresh_sync_status(ws);
    let _ = workspace::generate_summary(ws);
    Ok(())
}

pub fn clear_conflicts(ws: &Path) {
    save_conflicts(ws, &[]);
}

pub fn project_hash_map(ws: &Path) -> Result<HashMap<String, String>, Error> {
    let mut map = HashMap::new();
    for p in workspace::list_projects(ws)? {
        if let crate::models::ProjectStatus::Deleted = p.meta.status {
            continue;
        }
        let hash = workspace::project_content_hash(ws, &p.folder)?;
        map.insert(p.meta.id.clone(), hash);
    }
    Ok(map)
}

pub use uuid::Uuid;

#[cfg(test)]
mod tests {
    use super::*;

    fn ctx() -> std::path::PathBuf {
        let dir = std::env::temp_dir().join(format!("vpf-sync-test-{}", Uuid::new_v4().simple()));
        let _ = std::fs::create_dir_all(&dir);
        workspace::init_dirs(&dir).unwrap();
        dir
    }

    fn bundle(project_id: &str, name: &str, md: &str) -> ProjectBundle {
        let (meta, _body) = frontmatter::parse_front_matter(md).unwrap_or_default();
        ProjectBundle {
            project_id: project_id.to_string(),
            name: name.to_string(),
            updated_at: String::new(),
            meta,
            files: vec![SyncFile { rel_path: "project.md".to_string(), content: md.to_string() }],
        }
    }

    fn md(id: &str, name: &str, updated: &str, desc: &str) -> String {
        format!("---\nid: \"{id}\"\nname: \"{name}\"\nstatus: active\ncreated_at: 2026-08-01\nupdated_at: {updated}\nversion: 1\nprogress: 20\n---\n\n## 项目目标\n{desc}")
    }

    #[test]
    fn three_way_rules() {
        assert_eq!(three_way("base", "base", "theirs").unwrap(), "theirs");
        assert_eq!(three_way("base", "mine", "base").unwrap(), "mine");
        assert_eq!(three_way("base", "same", "same").unwrap(), "same");
        assert!(three_way("base", "mineA", "mineB").is_none());
    }

    #[test]
    fn project_md_field_merge_combines_disjoint_changes() {
        let base = md("p1", "项目一", "2026-08-01T00:00:00Z", "初始目标");
        let mine = base.replace("progress: 20", "progress: 60");
        let theirs = base.replace("初始目标", "对方的目标描述");
        let merged = merge_project_md(&base, &mine, &theirs).unwrap();
        let (meta, body) = frontmatter::parse_front_matter(&merged).unwrap();
        assert_eq!(meta.progress, Some(60));
        assert!(body.contains("对方的目标描述"));
    }

    #[test]
    fn project_md_conflict_on_same_field() {
        let base = md("p1", "项目一", "2026-08-01T00:00:00Z", "目标");
        let mine = base.replace("progress: 20", "progress: 30");
        let theirs = base.replace("progress: 20", "progress: 50");
        assert!(merge_project_md(&base, &mine, &theirs).is_none());
    }

    #[test]
    fn apply_bundle_creates_new_project() {
        let ws = ctx();
        let src = md("p_new", "新项目", "2026-08-02T00:00:00Z", "来自对方");
        let b = bundle("p_new", "新项目", &src);
        let (applied, conflicts) = apply_bundle(&ws, "dev_b", &b).unwrap();
        assert!(conflicts == 0);
        assert!(applied >= 1);
        let project = workspace::read_project_by_id(&ws, "p_new").unwrap();
        assert_eq!(project.meta.name, "新项目");
    }

    #[test]
    fn apply_bundle_merges_and_conflicts() {
        let ws = ctx();
        // 本地创建项目
        let local_md = md("p2", "项目二", "2026-08-03T00:00:00Z", "本地目标");
        let (meta, body) = frontmatter::parse_front_matter(&local_md).unwrap();
        workspace::create_project(&ws, meta, body).unwrap();

        // 对方推一个不同版本（两侧都改了 => 冲突）
        let their_md = md("p2", "项目二", "2026-08-04T00:00:00Z", "对方目标");
        let b = bundle("p2", "项目二", &their_md);
        let (_applied, conflicts) = apply_bundle(&ws, "dev_b", &b).unwrap();
        assert_eq!(conflicts, 1);
        assert_eq!(read_conflicts(&ws).len(), 1);

        // 采用对方
        let id = format!("p2::project.md");
        resolve_conflict(&ws, &id, "theirs").unwrap();
        assert!(read_conflicts(&ws).is_empty());
        let project = workspace::read_project_by_id(&ws, "p2").unwrap();
        assert!(project.body.contains("对方目标"));
    }
}