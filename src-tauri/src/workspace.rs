use crate::frontmatter;
use crate::models::{AttachmentInfo, ExternalChangeInfo, Project, ProjectMeta, ProjectStatus, ProjectSummary, SnapshotInfo, SyncStatusEntry, SyncStatusFile, TrashEntry};
use crate::Error;
use chrono::{DateTime, NaiveDateTime, Utc};
use std::fs;
use std::path::{Path, PathBuf};
use std::time::SystemTime;
use uuid::Uuid;

pub const WORKSPACE_DIR: &str = "LocalFlowWorkspace";
pub const CONFIG_DIR: &str = ".localflow";
pub const PROJECT_FILE: &str = "project.md";
pub const SUMMARY_FILE: &str = "汇总视图.md";
pub const SYNC_STATUS_FILE: &str = "sync-status.json";

pub fn default_workspace_path() -> Result<PathBuf, Error> {
    let home = dirs::home_dir().ok_or_else(|| Error::Io("无法获取用户主目录".into()))?;
    Ok(home.join(WORKSPACE_DIR))
}

/// 指向「当前激活工作区」的稳定文件，存放于系统配置目录（独立于工作区本身，
/// 避免切换工作区后配置找不到）。与 net::config_root 保持一致，测试可用 LOCALFLOW_CONFIG_DIR 隔离。
fn pointer_file() -> PathBuf {
    crate::net::config_root().join("workspace.txt")
}

pub fn active_workspace_path() -> Result<PathBuf, Error> {
    let file = pointer_file();
    if let Ok(content) = fs::read_to_string(&file) {
        let p = PathBuf::from(content.trim());
        if p.is_absolute() && p.is_dir() {
            return Ok(p);
        }
    }
    default_workspace_path()
}

pub fn set_active_workspace(path: &Path) -> Result<PathBuf, Error> {
    if !path.is_dir() {
        return Err(Error::NotFound(format!("目录不存在: {}", path.display())));
    }
    let file = pointer_file();
    if let Some(parent) = file.parent() {
        fs::create_dir_all(parent)?;
    }
    fs::write(&file, path.to_string_lossy().as_bytes())?;
    Ok(path.to_path_buf())
}

pub fn workspace_path() -> Result<PathBuf, Error> {
    let ws = active_workspace_path()?;
    init_dirs(&ws)?;
    Ok(ws)
}

pub fn init_dirs(ws: &Path) -> Result<(), Error> {
    fs::create_dir_all(ws)?;
    set_permissions(ws, 0o700)?;
    fs::create_dir_all(ws.join(CONFIG_DIR))?;
    fs::create_dir_all(ws.join(CONFIG_DIR).join("templates"))?;
    fs::create_dir_all(ws.join(CONFIG_DIR).join("sync-log"))?;
    fs::create_dir_all(ws.join(CONFIG_DIR).join("backups"))?;
    fs::create_dir_all(ws.join(CONFIG_DIR).join("trash"))?;
    Ok(())
}

fn set_permissions(path: &Path, mode: u32) -> Result<(), Error> {
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        fs::set_permissions(path, fs::Permissions::from_mode(mode))?;
    }
    let _ = mode;
    Ok(())
}

pub fn is_project_dir(dir: &Path) -> bool {
    dir.join(PROJECT_FILE).is_file()
}

/// 工作区外链接目录清单（绝对值列表），存于 `.localflow/linked.json`
fn linked_dirs_path(ws: &Path) -> PathBuf {
    ws.join(CONFIG_DIR).join("linked.json")
}

fn load_linked_dirs(ws: &Path) -> Vec<PathBuf> {
    std::fs::read_to_string(linked_dirs_path(ws))
        .ok()
        .and_then(|s| serde_json::from_str::<Vec<String>>(&s).ok())
        .unwrap_or_default()
        .into_iter()
        .map(PathBuf::from)
        .collect()
}

fn save_linked_dirs(ws: &Path, list: &[PathBuf]) -> Result<(), Error> {
    let list: Vec<String> = list.iter().map(|p| p.to_string_lossy().to_string()).collect();
    let path = linked_dirs_path(ws);
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)?;
    }
    fs::write(&path, serde_json::to_string_pretty(&list)?)?;
    Ok(())
}

/// 解析项目的实际目录：外部链接（绝对路径）原样返回，内部项目位于工作区内。
pub fn project_dir(ws: &Path, folder: &str) -> PathBuf {
    let p = PathBuf::from(folder);
    if p.is_absolute() {
        p
    } else {
        ws.join(folder)
    }
}

/// 目录的稳定文件系统安全标识（用于快照/日志/回收站等文件名）。
/// 内部项目沿用原相对名（兼容既有文件），外部项目取「目录名-短哈希」。
pub fn folder_key(folder: &str) -> String {
    let p = PathBuf::from(folder);
    if p.is_absolute() {
        let name = p
            .file_name()
            .map(|n| n.to_string_lossy().to_string())
            .unwrap_or_else(|| "linked".to_string());
        let hash = short_hash(folder);
        format!("{name}-{hash}")
    } else {
        folder.to_string()
    }
}

fn short_hash(s: &str) -> String {
    use std::collections::hash_map::DefaultHasher;
    use std::hash::{Hash, Hasher};
    let mut h = DefaultHasher::new();
    s.hash(&mut h);
    format!("{:08x}", h.finish())
}

/// 把工作区外文件夹链接为项目（保持原位管理，不拷贝）。
/// 目录含 project.md 则直接收录；否则自动创建一份 project.md。
pub fn link_external_dir(ws: &Path, dir: &Path, body: Option<String>) -> Result<Project, Error> {
    if !dir.is_absolute() || !dir.is_dir() {
        return Err(Error::NotFound(format!("不是有效目录: {}", dir.display())));
    }
    let canonical = fs::canonicalize(dir)?;
    let ws_canon = fs::canonicalize(ws).unwrap_or_else(|_| ws.to_path_buf());
    if canonical.starts_with(&ws_canon) {
        return Err(Error::Config("该目录位于工作区内，直接作为项目管理即可".into()));
    }
    let mut list = load_linked_dirs(ws);
    let canonical_str = canonical.to_string_lossy().to_string();
    if !list.iter().any(|p| p.to_string_lossy() == canonical_str) {
        list.push(canonical.clone());
    }
    let project_file = canonical.join(PROJECT_FILE);
    if !project_file.is_file() {
        let name = canonical
            .file_name()
            .map(|n| n.to_string_lossy().to_string())
            .unwrap_or_else(|| "链接项目".to_string());
        let mut meta = ProjectMeta {
            id: new_project_id(),
            name: name.clone(),
            created_at: Utc::now().format("%Y-%m-%d").to_string(),
            version: 1,
            updated_at: Utc::now().format("%Y-%m-%dT%H:%M:%SZ").to_string(),
            ..Default::default()
        };
        if find_by_name(ws, &name).is_some() {
            meta.name = format!("{name}（链接）");
        }
        let project = Project {
            folder: canonical_str.clone(),
            meta,
            body: body.unwrap_or_default(),
        };
        write_project_file(ws, &project)?;
    }
    save_linked_dirs(ws, &list)?;
    let mut project = read_project_file(&project_file)?;
    project.folder = canonical_str;
    Ok(project)
}

/// 解除外部项目链接（仅移除登记，文件夹与内容保留原处）
pub fn unlink_external(ws: &Path, folder: &str) -> Result<(), Error> {
    let target = project_dir(ws, folder);
    let canonical = fs::canonicalize(&target)?;
    let list: Vec<PathBuf> = load_linked_dirs(ws)
        .into_iter()
        .filter(|p| fs::canonicalize(p).map(|c| c != canonical).unwrap_or(true))
        .collect();
    save_linked_dirs(ws, &list)
}

pub fn project_folder_slug(name: &str) -> String {
    let today = Utc::now().format("%Y-%m-%d").to_string();
    let slug: String = name
        .chars()
        .map(|c| if c.is_alphanumeric() || c == '-' || c == '_' { c } else { '-' })
        .collect();
    let slug = slug.trim_matches('-').to_string();
    let slug = if slug.is_empty() { "project".to_string() } else { slug };
    format!("{today}_{slug}")
}

pub fn read_project_file(path: &Path) -> Result<Project, Error> {
    let content = fs::read_to_string(path)
        .map_err(|e| Error::Io(format!("读取 {} 失败: {e}", path.display())))?;
    let (meta, body) = frontmatter::parse_front_matter(&content)?;
    let folder = path
        .parent()
        .and_then(|p| p.file_name())
        .map(|n| n.to_string_lossy().to_string())
        .unwrap_or_default();
    Ok(Project { meta, body, folder })
}

pub fn write_project_file(ws: &Path, project: &Project) -> Result<(), Error> {
    let folder = project_dir(ws, &project.folder);
    let file = folder.join(PROJECT_FILE);
    let content = frontmatter::project_to_file_content(&project.meta, &project.body)?;
    fs::write(&file, content)
        .map_err(|e| Error::Io(format!("写入 {} 失败: {e}", file.display())))?;
    Ok(())
}

pub fn create_project(
    ws: &Path,
    mut meta: ProjectMeta,
    body: String,
) -> Result<Project, Error> {
    if meta.id.is_empty() {
        meta.id = new_project_id();
    }
    if meta.created_at.is_empty() {
        meta.created_at = Utc::now().format("%Y-%m-%d").to_string();
    }
    if meta.version == 0 {
        meta.version = 1;
    }
    meta.updated_at = Utc::now().format("%Y-%m-%dT%H:%M:%SZ").to_string();

    let folder = unique_folder(ws, &meta.name, None);
    fs::create_dir_all(&folder)?;
    fs::create_dir_all(folder.join("tasks"))?;
    fs::create_dir_all(folder.join("attachments"))?;

    let project = Project {
        folder: folder.file_name().unwrap().to_string_lossy().to_string(),
        meta,
        body,
    };
    write_project_file(ws, &project)?;
    Ok(project)
}

pub fn create_project_file_at(
    ws: &Path,
    meta: ProjectMeta,
    body: String,
    source: Option<&Path>,
) -> Result<Project, Error> {
    let folder = unique_folder(ws, &meta.name, None);
    fs::create_dir_all(&folder)?;
    fs::create_dir_all(folder.join("tasks"))?;
    fs::create_dir_all(folder.join("attachments"))?;

    if let Some(src) = source {
        let src_dir = if src.is_dir() {
            Some(src)
        } else {
            src.parent()
        };
        if let Some(src_dir) = src_dir {
            if src_dir.is_dir() {
                let src_tasks = src_dir.join("tasks");
                if src_tasks.is_dir() {
                    copy_dir(&src_tasks, &folder.join("tasks"))?;
                }
                let src_attachments = src_dir.join("attachments");
                if src_attachments.is_dir() {
                    copy_dir(&src_attachments, &folder.join("attachments"))?;
                }
            }
        }
    }

    let project = Project {
        folder: folder.file_name().unwrap().to_string_lossy().to_string(),
        meta,
        body,
    };
    write_project_file(ws, &project)?;
    Ok(project)
}

fn unique_folder(ws: &Path, name: &str, suffix: Option<u32>) -> PathBuf {
    let base = project_folder_slug(name);
    let mut folder = ws.join(&base);
    let mut counter = suffix.unwrap_or(2);
    while folder.join(PROJECT_FILE).exists() {
        folder = ws.join(format!("{base}-{counter}"));
        counter += 1;
    }
    folder
}

fn copy_dir(src: &Path, dst: &Path) -> Result<(), Error> {
    if !dst.exists() {
        fs::create_dir_all(dst)?;
    }
    for entry in fs::read_dir(src)? {
        let entry = entry?;
        let from = entry.path();
        let to = dst.join(entry.file_name());
        if from.is_dir() {
            copy_dir(&from, &to)?;
        } else {
            fs::copy(&from, &to)?;
        }
    }
    Ok(())
}

pub fn find_by_name(ws: &Path, name: &str) -> Option<String> {
    list_projects(ws)
        .ok()?
        .into_iter()
        .find(|p| p.meta.name == name)
        .map(|p| p.meta.id)
}

fn short_rand() -> String {
    Uuid::new_v4().simple().to_string()[..8].to_string()
}

pub fn new_project_id() -> String {
    format!("proj_{}_{}", Utc::now().format("%Y%m%d"), short_rand())
}

pub fn list_projects(ws: &Path) -> Result<Vec<ProjectSummary>, Error> {
    let mut result = Vec::new();
    let mut seen = std::collections::HashSet::new();
    if !ws.is_dir() {
        return Ok(result);
    }
    let mut entries: Vec<PathBuf> = fs::read_dir(ws)?
        .filter_map(|e| e.ok().map(|e| e.path()))
        .filter(|p| p.is_dir() && is_project_dir(p))
        .collect();
    entries.sort();

    for dir in entries {
        if let Ok(project) = read_project_file(&dir.join(PROJECT_FILE)) {
            seen.insert(project.folder.clone());
            let tasks = dir.join("tasks");
            let task_count = count_tasks(&tasks);
            result.push(ProjectSummary {
                meta: project.meta,
                folder: project.folder,
                has_tasks_dir: tasks.is_dir(),
                task_count,
            });
        }
    }

    // 工作区外链接项目：folder 用绝对路径，读写经 project_dir 解析
    for link in load_linked_dirs(ws) {
        if link.strip_prefix(ws).is_ok() {
            continue; // 位于工作区内的链接已被上面的扫描覆盖
        }
        if !is_project_dir(&link) {
            continue;
        }
        if let Ok(mut project) = read_project_file(&link.join(PROJECT_FILE)) {
            project.folder = link.to_string_lossy().to_string();
            if seen.contains(&project.folder) {
                continue;
            }
            seen.insert(project.folder.clone());
            let tasks = link.join("tasks");
            result.push(ProjectSummary {
                meta: project.meta,
                folder: project.folder,
                has_tasks_dir: tasks.is_dir(),
                task_count: count_tasks(&tasks),
            });
        }
    }
    Ok(result)
}

fn count_tasks(tasks: &Path) -> usize {
    if tasks.is_dir() {
        fs::read_dir(tasks)
            .map(|rd| rd.filter_map(|e| e.ok()).filter(|e| e.path().extension().map_or(false, |x| x == "md")).count())
            .unwrap_or(0)
    } else {
        0
    }
}

pub fn read_project_by_id(ws: &Path, id: &str) -> Result<Project, Error> {
    for summary in list_projects(ws)? {
        if summary.meta.id == id {
            let mut p = read_project_file(&project_dir(ws, &summary.folder).join(PROJECT_FILE))?;
            p.folder = summary.folder.clone();
            return Ok(p);
        }
    }
    Err(Error::NotFound(format!("未找到项目: {id}")))
}

pub fn save_project(ws: &Path, project: &Project) -> Result<Project, Error> {
    let mut p = project.clone();
    p.meta.updated_at = Utc::now().format("%Y-%m-%dT%H:%M:%SZ").to_string();
    write_project_file(ws, &p)?;
    Ok(p)
}

pub fn delete_project(ws: &Path, id: &str) -> Result<(), Error> {
    let project = read_project_by_id(ws, id)?;
    if Path::new(&project.folder).is_absolute() {
        // 外部链接项目：仅解除链接，文件夹保留原处（避免跨文件系统移动）
        unlink_external(ws, &project.folder)
    } else {
        let src = ws.join(&project.folder);
        let dst = ws.join(CONFIG_DIR).join("trash").join(&project.folder);
        if dst.exists() {
            fs::remove_dir_all(&dst)?;
        }
        fs::rename(&src, &dst).map_err(|e| Error::Io(format!("删除项目失败: {e}")))?;
        Ok(())
    }
}

// ---------------------------------------------------------------------------
// 回收站
// ---------------------------------------------------------------------------

pub fn trash_entries(ws: &Path) -> Result<Vec<TrashEntry>, Error> {
    let trash = ws.join(CONFIG_DIR).join("trash");
    let mut out = Vec::new();
    if !trash.is_dir() {
        return Ok(out);
    }
    for entry in fs::read_dir(&trash)? {
        let dir = entry?.path();
        if !dir.is_dir() {
            continue;
        }
        if let Ok(project) = read_project_file(&dir.join(PROJECT_FILE)) {
            let attachments = dir.join("attachments");
            let attach_count = if attachments.is_dir() {
                fs::read_dir(&attachments).map(|rd| rd.count()).unwrap_or(0)
            } else {
                0
            };
            out.push(TrashEntry {
                folder: project.folder.clone(),
                meta: project.meta,
                attach_count,
            });
        }
    }
    out.sort_by(|a, b| a.meta.name.cmp(&b.meta.name));
    Ok(out)
}

pub fn restore_project(ws: &Path, folder: &str) -> Result<Project, Error> {
    let trash = ws.join(CONFIG_DIR).join("trash");
    let src = trash.join(folder);
    if !src.is_dir() {
        return Err(Error::NotFound(format!("回收站中未找到: {folder}")));
    }
    let mut dest = ws.join(folder);
    let mut n = 2;
    while dest.join(PROJECT_FILE).exists() {
        dest = ws.join(format!("{folder}-{n}"));
        n += 1;
    }
    fs::rename(&src, &dest).map_err(|e| Error::Io(format!("恢复项目失败: {e}")))?;
    let mut project = read_project_file(&dest.join(PROJECT_FILE))?;
    project.folder = dest
        .file_name()
        .map(|x| x.to_string_lossy().to_string())
        .unwrap_or_else(|| folder.to_string());
    project.meta.status = ProjectStatus::Active;
    write_project_file(ws, &project)?;
    Ok(project)
}

pub fn purge_project(ws: &Path, folder: &str) -> Result<(), Error> {
    let trash = ws.join(CONFIG_DIR).join("trash").join(folder);
    if trash.is_dir() {
        fs::remove_dir_all(&trash)?;
    } else {
        return Err(Error::NotFound(format!("回收站中未找到: {folder}")));
    }
    Ok(())
}

pub fn purge_trash(ws: &Path) -> Result<usize, Error> {
    let trash = ws.join(CONFIG_DIR).join("trash");
    let mut count = 0;
    if trash.is_dir() {
        for entry in fs::read_dir(&trash)? {
            let p = entry?.path();
            if p.is_dir() {
                fs::remove_dir_all(&p)?;
                count += 1;
            }
        }
    }
    Ok(count)
}

// ---------------------------------------------------------------------------
// 时间快照 / Time Capsule
// ---------------------------------------------------------------------------

fn snapshot_dir(ws: &Path) -> PathBuf {
    ws.join(CONFIG_DIR).join("backups")
}

fn snapshot_time_str(dt: DateTime<Utc>) -> String {
    dt.format("%Y%m%d-%H%M%S").to_string()
}

fn snapshot_display(ts: &str) -> String {
    NaiveDateTime::parse_from_str(ts, "%Y%m%d-%H%M%S")
        .map(|t| t.format("%Y-%m-%d %H:%M").to_string())
        .unwrap_or_else(|_| ts.to_string())
}

/// 保存项目当前版本为快照（旧版本），随后按「30 天 / 每项目最多 100 份」清理。
pub fn save_snapshot(ws: &Path, project: &Project) -> Result<(), Error> {
    let dir = snapshot_dir(ws);
    fs::create_dir_all(&dir)?;
    let name = format!("backup-{}-{}.md", folder_key(&project.folder), snapshot_time_str(Utc::now()));
    let content = frontmatter::project_to_file_content(&project.meta, &project.body)?;
    fs::write(dir.join(&name), content)?;
    prune_snapshots(ws, &project.folder, 30, 100);
    Ok(())
}

fn prune_snapshots(ws: &Path, folder: &str, keep_days: i64, max_per_project: usize) {
    let dir = snapshot_dir(ws);
    let prefix = format!("backup-{}-", folder_key(folder));
    let cutoff = Utc::now() - chrono::Duration::days(keep_days);
    let Ok(entries) = fs::read_dir(&dir) else { return };
    let mut keep: Vec<(String, PathBuf)> = Vec::new();
    for entry in entries.flatten() {
        let path = entry.path();
        let Some(file_name) = path.as_path().file_name().map(|n| n.to_string_lossy().to_string()) else {
            continue;
        };
        if let Some(ts) = file_name
            .strip_prefix(&prefix)
            .and_then(|s| s.strip_suffix(".md"))
        {
            let is_old = NaiveDateTime::parse_from_str(ts, "%Y%m%d-%H%M%S")
                .map(|t| DateTime::<Utc>::from_naive_utc_and_offset(t, Utc) < cutoff)
                .unwrap_or(true);
            if is_old {
                let _ = fs::remove_file(&path);
            } else {
                keep.push((file_name, path));
            }
        }
    }
    keep.sort();
    let remove_count = keep.len().saturating_sub(max_per_project);
    if remove_count > 0 {
        for (_, old_path) in keep.into_iter().take(remove_count) {
            let _ = fs::remove_file(&old_path);
        }
    }
}

pub fn list_snapshots(ws: &Path, project_id: &str) -> Result<Vec<SnapshotInfo>, Error> {
    let project = read_project_by_id(ws, project_id)?;
    let dir = snapshot_dir(ws);
    let prefix = format!("backup-{}-", folder_key(&project.folder));
    let mut out = Vec::new();
    if dir.is_dir() {
        for entry in fs::read_dir(&dir)? {
            let entry = entry?;
            let file_name = entry.file_name().to_string_lossy().to_string();
            if let Some(ts) = file_name
                .strip_prefix(&prefix)
                .and_then(|s| s.strip_suffix(".md"))
            {
                let summary = read_snapshot_summary(&entry.path());
                let size = entry.metadata().map(|m| m.len()).unwrap_or(0);
                out.push(SnapshotInfo {
                    timestamp: ts.to_string(),
                    time: snapshot_display(ts),
                    size,
                    summary,
                });
            }
        }
    }
    out.sort_by(|a, b| b.timestamp.cmp(&a.timestamp));
    Ok(out)
}

fn read_snapshot_summary(path: &Path) -> String {
    let Ok(content) = fs::read_to_string(path) else {
        return String::new();
    };
    let Ok((meta, body)) = frontmatter::parse_front_matter(&content) else {
        return String::new();
    };
    if !meta.name.is_empty() {
        return meta.name;
    }
    body.split_whitespace().take(12).collect::<Vec<_>>().join(" ")
}

fn snapshot_path_for(ws: &Path, project: &Project, timestamp: &str) -> Result<PathBuf, Error> {
    let p = snapshot_dir(ws).join(format!("backup-{}-{}.md", folder_key(&project.folder), timestamp));
    if p.is_file() {
        Ok(p)
    } else {
        Err(Error::NotFound(format!("未找到快照: {timestamp}")))
    }
}

/// 读取某个快照的完整内容（仅作预览，不写入）。
pub fn read_snapshot(ws: &Path, project_id: &str, timestamp: &str) -> Result<Project, Error> {
    let project = read_project_by_id(ws, project_id)?;
    let path = snapshot_path_for(ws, &project, timestamp)?;
    let mut snap = read_project_file(&path)?;
    snap.folder = project.folder.clone();
    Ok(snap)
}

/// 把某个快照恢复为项目当前版本（保留 id / 创建时间 / 目录）。
pub fn restore_snapshot(ws: &Path, project_id: &str, timestamp: &str) -> Result<Project, Error> {
    let current = read_project_by_id(ws, project_id)?;
    let mut snap = read_snapshot(ws, project_id, timestamp)?;
    snap.meta.id = current.meta.id.clone();
    snap.meta.created_at = current.meta.created_at.clone();
    snap.folder = current.folder.clone();
    save_project(ws, &snap)
}

// ---------------------------------------------------------------------------
// 附件
// ---------------------------------------------------------------------------

pub fn list_attachments(ws: &Path, project_id: &str) -> Result<Vec<AttachmentInfo>, Error> {
    let project = read_project_by_id(ws, project_id)?;
    let dir = project_dir(ws, &project.folder).join("attachments");
    let mut out = Vec::new();
    if dir.is_dir() {
        for entry in fs::read_dir(&dir)? {
            let entry = entry?;
            let p = entry.path();
            if !p.is_file() {
                continue;
            }
            let meta = p.metadata()?;
            out.push(AttachmentInfo {
                name: entry.file_name().to_string_lossy().to_string(),
                size: meta.len(),
                modified: meta
                    .modified()
                    .map(|t| {
                        let dt: DateTime<Utc> = SystemTime::from(t).into();
                        dt.to_rfc3339()
                    })
                    .unwrap_or_default(),
            });
        }
    }
    out.sort_by(|a, b| a.name.cmp(&b.name));
    Ok(out)
}

pub fn generate_summary(ws: &Path) -> Result<String, Error> {
    let projects = list_projects(ws)?;
    let mut lines = vec![
        "# 汇总视图".to_string(),
        String::new(),
        format!("> 自动生成于 {} UTC", Utc::now().format("%Y-%m-%d %H:%M")),
        String::new(),
        format!("共 {} 个项目", projects.len()),
        String::new(),
        "| 项目 | 负责人 | 状态 | 优先级 | 进度 | 截止日期 |".to_string(),
        "|------|--------|------|--------|------|----------|".to_string(),
    ];
    for p in projects {
        let m = &p.meta;
        lines.push(format!(
            "| {} | {} | {} | {} | {} | {} |",
            m.name,
            m.owner.clone().unwrap_or_else(|| "-".into()),
            m.status_label(),
            m.priority.clone().unwrap_or_else(|| "-".into()),
            m.progress.map(|x| format!("{x}%")).unwrap_or_else(|| "-".into()),
            m.deadline.clone().unwrap_or_else(|| "-".into()),
        ));
    }
    let content = lines.join("\n");
    fs::write(ws.join(SUMMARY_FILE), &content)?;
    Ok(content)
}

// ---------------------------------------------------------------------------
// 同步状态索引（Phase 3 基石, `.localflow/sync-status.json`）
// ---------------------------------------------------------------------------

struct Fnv(u64);

impl Fnv {
    fn new() -> Self {
        Fnv(0xcbf29ce484222325)
    }
    fn update(&mut self, bytes: &[u8]) {
        for &b in bytes {
            self.0 ^= b as u64;
            self.0 = self.0.wrapping_mul(0x100000001b3);
        }
    }
    fn hex(&self) -> String {
        format!("{:016x}", self.0)
    }
}

/// 项目内容指纹：project.md + tasks/ 下所有 md 文件（FNV-1a 哈希，跨运行确定性一致）。
pub fn project_content_hash(ws: &Path, folder: &str) -> Result<String, Error> {
    let mut hasher = Fnv::new();
    let project_dir = project_dir(ws, folder);
    if let Ok(content) = fs::read_to_string(project_dir.join(PROJECT_FILE)) {
        hasher.update(content.as_bytes());
    }
    if let Ok(rd) = fs::read_dir(project_dir.join("tasks")) {
        let mut files: Vec<PathBuf> = rd
            .filter_map(|e| e.ok().map(|e| e.path()))
            .filter(|p| p.extension().map_or(false, |x| x == "md"))
            .collect();
        files.sort();
        for f in files {
            if let Ok(content) = fs::read_to_string(&f) {
                if let Some(name) = f.file_name() {
                    hasher.update(name.to_string_lossy().as_bytes());
                }
                hasher.update(content.as_bytes());
            }
        }
    }
    Ok(hasher.hex())
}

pub fn sync_status_path(ws: &Path) -> PathBuf {
    ws.join(CONFIG_DIR).join(SYNC_STATUS_FILE)
}

pub fn read_sync_status(ws: &Path) -> SyncStatusFile {
    let path = sync_status_path(ws);
    fs::read_to_string(&path)
        .ok()
        .and_then(|s| serde_json::from_str(&s).ok())
        .unwrap_or_default()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn tmp_root() -> std::path::PathBuf {
        std::env::temp_dir().join(format!("vpf-ws-test-{}", Uuid::new_v4().simple()))
    }

    fn ws_ctx() -> std::path::PathBuf {
        let ws = tmp_root().join("workspace");
        init_dirs(&ws).unwrap();
        ws
    }

    fn ext_dir(root: &Path, name: &str) -> PathBuf {
        let dir = root.join("external").join(name);
        fs::create_dir_all(&dir).unwrap();
        dir
    }

    #[test]
    fn link_unlink_roundtrip() {
        let root = tmp_root();
        let ws = ws_ctx();
        let ext = ext_dir(&root, "我的资料库");

        let project = link_external_dir(&ws, &ext, None).unwrap();
        assert!(ext.join("project.md").is_file());
        assert!(std::path::Path::new(&project.folder).is_absolute());

        let summaries = list_projects(&ws).unwrap();
        let found = summaries.iter().find(|s| s.meta.id == project.meta.id).expect("外部项目应出现在列表");
        assert_eq!(found.folder, ext.to_string_lossy());

        let round = read_project_by_id(&ws, &project.meta.id).unwrap();
        assert_eq!(round.folder, ext.to_string_lossy());

        unlink_external(&ws, &project.folder).unwrap();
        assert!(!list_projects(&ws).unwrap().iter().any(|s| s.meta.id == project.meta.id));
        assert!(ext.join("project.md").is_file(), "解除链接不应删除文件夹内容");
    }

    #[test]
    fn delete_external_only_unlinks() {
        let root = tmp_root();
        let ws = ws_ctx();
        let ext = ext_dir(&root, "档案");

        let project = link_external_dir(&ws, &ext, None).unwrap();
        delete_project(&ws, &project.meta.id).unwrap();
        assert!(!list_projects(&ws).unwrap().iter().any(|s| s.meta.id == project.meta.id));
        assert!(ext.is_dir(), "删除外部项目不应移动/删除外部文件夹");
        assert!(load_linked_dirs(&ws).is_empty());
    }

    #[test]
    fn save_roundtrip_writes_external() {
        let root = tmp_root();
        let ws = ws_ctx();
        let ext = ext_dir(&root, "共享目录");

        let mut project = link_external_dir(&ws, &ext, None).unwrap();
        project.meta.name = "改名".to_string();
        project.body = "## 新正文".to_string();
        let saved = save_project(&ws, &project).unwrap();
        assert_eq!(saved.meta.name, "改名");

        let content = fs::read_to_string(ext.join("project.md")).unwrap();
        assert!(content.contains("改名"));
        assert!(content.contains("## 新正文"));

        assert_eq!(read_project_by_id(&ws, &project.meta.id).unwrap().meta.name, "改名");
    }

    #[test]
    fn folder_key_stability() {
        assert_eq!(folder_key("alpha"), "alpha");
        assert_eq!(folder_key("beta"), "beta");
        let abs = "/home/user/我的 项目";
        assert_ne!(folder_key(abs), abs);
        assert_eq!(folder_key(abs), folder_key(abs));
        assert_ne!(folder_key("/home/user/我的 项目"), folder_key("/home/user/我的 项目2"));
    }

    #[test]
    fn reject_ws_internal_link() {
        let root = tmp_root();
        let ws = ws_ctx();
        let internal = ws.join("projects").join("xx");
        fs::create_dir_all(&internal).unwrap();
        let err = link_external_dir(&ws, &internal, None).unwrap_err();
        assert!(err.to_string().contains("工作区"), "内部目录应被拒绝, got: {err}");
    }
}

/// 重建/刷新同步状态索引并落盘，返回最新索引。
pub fn refresh_sync_status(ws: &Path) -> Result<SyncStatusFile, Error> {
    let projects = list_projects(ws)?;
    let mut entries = Vec::with_capacity(projects.len());
    for p in projects {
        let m = &p.meta;
        let hash = project_content_hash(ws, &p.folder).unwrap_or_default();
        entries.push(SyncStatusEntry {
            id: m.id.clone(),
            name: m.name.clone(),
            folder: p.folder,
            version: m.version,
            status: m.status_label(),
            updated_at: m.updated_at.clone(),
            hash,
            project_count: 1,
            task_count: p.task_count,
        });
    }
    entries.sort_by(|a, b| b.updated_at.cmp(&a.updated_at));
    let file = SyncStatusFile {
        version: "0.1".into(),
        indexed_at: Utc::now().to_rfc3339(),
        projects: entries,
    };
    let json = serde_json::to_string_pretty(&file)?;
    fs::write(sync_status_path(ws), json)?;
    Ok(file)
}

/// 对照索引检测被文件系统外部修改的项目（描述返回首个变更文件）。
pub fn detect_external_changes(ws: &Path) -> Result<Vec<ExternalChangeInfo>, Error> {
    let index = read_sync_status(ws);
    if index.projects.is_empty() {
        return Ok(Vec::new());
    }
    let mut out = Vec::new();
    for entry in index.projects {
        let current = match project_content_hash(ws, &entry.folder) {
            Ok(h) => h,
            Err(_) => continue,
        };
        if current != entry.hash {
            let project = read_project_by_id(ws, &entry.id).ok();
            out.push(ExternalChangeInfo {
                project_id: entry.id.clone(),
                name: project.as_ref().map(|p| p.meta.name.clone()).unwrap_or(entry.name),
                file: if project.is_some() { PROJECT_FILE.to_string() } else { "已删除".into() },
                folder: entry.folder.clone(),
            });
        }
    }
    Ok(out)
}
