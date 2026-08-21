use crate::models::{Project, ProjectMeta, ProjectStatus, Template, TemplateField};
use crate::{Error, export, frontmatter, templates, workspace};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::{Path, PathBuf};

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum ImportStrategy {
    Overwrite,
    Rename,
    Merge,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ImportPreview {
    pub kind: String,
    pub source: String,
    pub name: String,
    pub file_count: usize,
    pub conflicts: Vec<ConflictInfo>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ConflictInfo {
    pub name: String,
    pub existing_id: Option<String>,
    pub exists: bool,
}

pub fn import_md_file(ws: &Path, src: &Path, strategy: ImportStrategy) -> Result<Project, Error> {
    let content = std::fs::read_to_string(src)
        .map_err(|e| Error::Io(format!("读取 {} 失败: {e}", src.display())))?;
    let (mut meta, body) = frontmatter::parse_front_matter(&content)?;
    resolve_conflict(ws, &mut meta, strategy)?;
    ensure_valid_meta(&mut meta);
    if meta.id.is_empty() {
        meta.id = new_id();
    }
    workspace::create_project_file_at(ws, meta, body, Some(src))
}

pub fn import_md_folder(ws: &Path, src_dir: &Path, strategy: ImportStrategy) -> Result<Vec<Project>, Error> {
    let mut imported = Vec::new();
    let mut md_files: Vec<PathBuf> = std::fs::read_dir(src_dir)?
        .filter_map(|e| e.ok().map(|e| e.path()))
        .filter(|p| p.is_file() && p.extension().map_or(false, |x| x.to_string_lossy().eq_ignore_ascii_case("md")))
        .collect();
    md_files.sort();
    for f in md_files {
        match import_md_file(ws, &f, strategy) {
            Ok(p) => imported.push(p),
            Err(e) => {
                if !matches!(e, Error::Parse(_)) {
                    return Err(e);
                }
            }
        }
    }
    Ok(imported)
}

pub fn import_xlsx(ws: &Path, src: &Path, strategy: ImportStrategy) -> Result<Project, Error> {
    let sheets = export::read_xlsx(src)?;
    let (mut meta, body) = project_from_sheets(&sheets)?;
    resolve_conflict(ws, &mut meta, strategy)?;
    ensure_valid_meta(&mut meta);
    if meta.id.is_empty() {
        meta.id = new_id();
    }
    workspace::create_project_file_at(ws, meta, body, Some(src))
}

pub fn import_template_package(ws: &Path, package: &Path) -> Result<Template, Error> {
    FileUnzip::new(package, ws)?.install_template()
}

struct FileUnzip {
    archive: zip::ZipArchive<std::fs::File>,
    dest_root: PathBuf,
}

impl FileUnzip {
    fn new(package: &Path, ws: &Path) -> Result<Self, Error> {
        let file = std::fs::File::open(package)
            .map_err(|e| Error::Io(format!("无法打开模板包: {e}")))?;
        let archive =
            zip::ZipArchive::new(file).map_err(|e| Error::Parse(format!("无效的模板包: {e}")))?;
        Ok(Self {
            archive,
            dest_root: ws.join(".localflow").join("templates"),
        })
    }

    fn read_text(&mut self, name: &str) -> Result<String, Error> {
        let mut f = self
            .archive
            .by_name(name)
            .map_err(|e| Error::Parse(format!("模板包缺少 {name}: {e}")))?;
        let mut s = String::new();
        use std::io::Read;
        f.read_to_string(&mut s)
            .map_err(|e| Error::Parse(format!("读取 {name} 失败: {e}")))?;
        Ok(s)
    }

    fn install_template(mut self) -> Result<Template, Error> {
        let manifest_yaml = self.read_text("manifest.yaml")?;
        let manifest: serde_yaml::Value = serde_yaml::from_str(&manifest_yaml)
            .map_err(|e| Error::Parse(format!("manifest.yaml 解析失败: {e}")))?;
        let template_id = manifest
            .get("template_id")
            .and_then(|v| v.as_str())
            .ok_or_else(|| Error::Parse("manifest.yaml 缺少 template_id".into()))?
            .to_string();
        let name = manifest
            .get("name")
            .and_then(|v| v.as_str())
            .ok_or_else(|| Error::Parse("manifest.yaml 缺少 name".into()))?
            .to_string();
        let description = manifest
            .get("description")
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .to_string();
        let icon = manifest
            .get("icon")
            .and_then(|v| v.as_str())
            .unwrap_or("📋")
            .to_string();
        let mode = manifest
            .get("mode")
            .and_then(|v| v.as_str())
            .unwrap_or("standard")
            .to_string();

        let mut template = if let Ok(fields_yaml) = self.read_text("fields.yaml") {
            let fields: Vec<TemplateField> = serde_yaml::from_str(&fields_yaml)
                .map_err(|e| Error::Parse(format!("fields.yaml 解析失败: {e}")))?;
            Template {
                template_id,
                name,
                description,
                icon,
                mode,
                fields,
                views: Vec::new(),
                fields_order: Vec::new(),
                export_presets: Vec::new(),
            }
        } else {
            let t = templates::get_template(&template_id)
                .ok_or_else(|| Error::Parse("模板包未包含 fields.yaml".into()))?;
            Template {
                template_id,
                name,
                description,
                icon,
                mode,
                ..t
            }
        };
        template.fields_order.push("placeholder".into());
        template.fields_order.clear();
        template.fields_order = template.fields.iter().map(|f| f.id.clone()).collect();
        template.views = vec![crate::models::TemplateView {
            name: "卡片视图".into(),
            view_type: "card".to_string(),
            group_by: None,
            sort_by: None,
        }];

        let tpl_dir = self.dest_root.join(&template.template_id);
        std::fs::create_dir_all(&tpl_dir)?;
        std::fs::write(
            tpl_dir.join("manifest.yaml"),
            format!(
                "template_id: \"{}\"\nname: \"{}\"\ndescription: \"{}\"\nmode: {}\nicon: \"{}\"\n",
                template.template_id, template.name, template.description, template.mode, template.icon
            ),
        )?;
        std::fs::write(
            tpl_dir.join("fields.yaml"),
            serde_yaml::to_string(&template.fields).map_err(|e| Error::Parse(e.to_string()))?,
        )?;
        if let Ok(export_presets) = self.read_text("export-presets.yaml") {
            std::fs::write(tpl_dir.join("export-presets.yaml"), &export_presets)?;
            if let Ok(parsed) =
                serde_yaml::from_str::<Vec<crate::models::ExportPreset>>(&export_presets)
            {
                template.export_presets = parsed;
            }
        }
        Ok(template)
    }
}

fn project_from_sheets(sheets: &[(String, Vec<Vec<String>>)]) -> Result<(ProjectMeta, String), Error> {
    if let Some((meta, body)) = from_metadata_sheet(sheets)? {
        return Ok((meta, body));
    }

    let overview = sheets
        .iter()
        .find(|(name, _)| name.contains("概览") || name.contains("Overview"))
        .map(|(_, rows)| rows)
        .ok_or_else(|| Error::Parse("Excel 缺少「项目概览」工作表".into()))?;

    let mut meta = ProjectMeta::default();
    meta.status = ProjectStatus::Active;
    meta.version = 2;

    let mut extended: HashMap<String, String> = HashMap::new();
    for row in overview.iter().skip(2) {
        if row.len() < 2 {
            continue;
        }
        let key = row[0].trim().to_string();
        let value = row[1].trim().to_string();
        if key.is_empty() {
            continue;
        }
        map_overview_key(&mut meta, &key, &value, &mut extended);
    }
    if meta.name.is_empty() {
        return Err(Error::Parse("「项目概览」中缺少项目名称".into()));
    }

    let mut body = format!("# {}\n\n", meta.name);
    if let Some((_, rows)) = sheets.iter().find(|(name, _)| name.contains("任务")) {
        let tasks = rows_from_sheet(rows);
        if let Some(ref tasks) = tasks {
            let mut m = serde_yaml::Mapping::new();
            m.insert(
                serde_yaml::Value::String("tasks".into()),
                serde_yaml::to_value(tasks).unwrap(),
            );
            meta.custom_fields = Some(serde_yaml::Value::Mapping(m));
            body.push_str("## 关键里程碑\n");
            for t in tasks.iter() {
                if let Some(serde_yaml::Value::String(n)) = t.get("name") {
                    body.push_str(&format!("- [ ] {n}\n"));
                }
            }
            body.push('\n');
        }
    }
    body.push_str("## 项目目标\n由 Excel 导入。\n\n## 风险与阻塞项\n\n## 会议纪要\n\n## 备注\n");

    if !extended.is_empty() {
        let mut custom = meta.custom_fields.take().unwrap_or_else(|| serde_yaml::Value::Mapping(Default::default()));
        if let Some(map) = custom.as_mapping_mut() {
            for (k, v) in extended {
                map.insert(
                    serde_yaml::Value::String(format!("ext_{k}")),
                    serde_yaml::Value::String(v),
                );
            }
        }
        meta.custom_fields = Some(custom);
    }
    Ok((meta, body))
}

/// 若 Excel 含「元数据」Sheet，则直接还原完整的 YAML + 正文，避免字段丢失。
fn from_metadata_sheet(sheets: &[(String, Vec<Vec<String>>)]) -> Result<Option<(ProjectMeta, String)>, Error> {
    let Some((_, rows)) = sheets.iter().find(|(name, _)| name.contains("元数据") || name.contains("Metadata")) else {
        return Ok(None);
    };
    let mut yaml: Option<String> = None;
    let mut body: Option<String> = None;
    for row in rows {
        if row.len() < 2 {
            continue;
        }
        match row[0].trim() {
            "YAML Front Matter" => yaml = Some(row[1].clone()),
            "正文 Markdown" => body = Some(row[1].clone()),
            _ => {}
        }
    }
    let Some(yaml) = yaml else { return Ok(None) };
    let content = format!("---\n{yaml}\n---\n");
    let (mut meta, _) = frontmatter::parse_front_matter(&content)?;
    ensure_valid_meta(&mut meta);
    Ok(Some((meta, body.unwrap_or_default())))
}

fn rows_from_sheet(rows: &[Vec<String>]) -> Option<Vec<serde_yaml::Value>> {
    if rows.len() < 2 {
        return None;
    }
    let header: Vec<String> = rows[0]
        .iter()
        .enumerate()
        .map(|(i, h)| if h.trim().is_empty() { format!("col_{i}") } else { h.trim().to_string() })
        .collect();
    let mut tasks = Vec::new();
    for row in rows.iter().skip(1) {
        if row.iter().all(|c| c.trim().is_empty()) {
            continue;
        }
        let mut item = serde_yaml::Mapping::new();
        for (i, cell) in row.iter().enumerate() {
            let key = header.get(i).cloned().unwrap_or_default();
            if key.is_empty() || cell.trim().is_empty() {
                continue;
            }
            item.insert(serde_yaml::Value::String(normalize_task_key(&key)), serde_yaml::Value::String(cell.trim().to_string()));
        }
        tasks.push(serde_yaml::Value::Mapping(item));
    }
    if tasks.is_empty() {
        None
    } else {
        Some(tasks)
    }
}

fn normalize_task_key(key: &str) -> String {
    let k = key.trim().to_string();
    match k.as_str() {
        "id" | "任务ID" | "任务id" | "Task ID" => "id".into(),
        "任务名称" | "名称" | "标题" | "name" | "title" | "任务名" => "name".into(),
        "负责人" | "assignee" | "经办人" => "assignee".into(),
        "截止日期" | "deadline" | "日期" | "due" | "结束日期" => "deadline".into(),
        "状态" | "status" | "阶段" => "status".into(),
        "优先级" | "priority" => "priority".into(),
        "故事点" | "points" | "story_points" => "points".into(),
        "备注" | "备注说明" | "备注/说明" | "remark" | "notes" | "说明" => "remark".into(),
        _ => k,
    }
}

fn normalize_status(s: &str) -> String {
    match s {
        "已完成" | "完成" | "done" | "已发布" => "active".into(),
        "已归档" | "archived" => "archived".into(),
        _ => "active".into(),
    }
}

fn map_overview_key(
    meta: &mut ProjectMeta,
    r#abstract: &str,
    value: &str,
    extended: &mut HashMap<String, String>,
) {
    let key = r#abstract.to_string();
    if key.contains("项目名称") {
        meta.name = value.to_string();
    } else if key.contains("负责人") {
        meta.owner = Some(value.to_string());
    } else if key.contains("创建日期") {
        meta.created_at = value.to_string();
    } else if key.contains("截止日期") || key.contains("结束日期") {
        meta.deadline = Some(value.to_string());
    } else if key.contains("优先级") {
        meta.priority = Some(value.to_string());
    } else if key.contains("进度") || key.contains("完成进度") {
        let digits: String = value.chars().filter(|c| c.is_ascii_digit()).collect();
        meta.progress = digits.parse::<u32>().ok();
    } else if key.contains("状态") {
        meta.status = if value.contains("归档") { ProjectStatus::Archived } else { ProjectStatus::Active };
        let _ = normalize_status(value);
    } else if key.contains("标签") {
        meta.tags = Some(value.split(',').map(|s| s.trim().to_string()).filter(|s| !s.is_empty()).collect());
    } else if key.contains("模板") {
        meta.template_id = crate::templates::find_template_id(value);
    } else {
        extended.insert(key, value.to_string());
    }
}

fn resolve_conflict(ws: &Path, meta: &mut ProjectMeta, strategy: ImportStrategy) -> Result<(), Error> {
    let existing = workspace::find_by_name(ws, &meta.name);
    match strategy {
        ImportStrategy::Overwrite => {
            if let Some(id) = existing {
                workspace::delete_project(ws, &id)?;
            }
        }
        ImportStrategy::Rename => {
            if existing.is_some() {
                meta.name = format!("{}（导入）", meta.name);
            }
        }
        ImportStrategy::Merge => {
            if let Some(id) = existing {
                let old = workspace::read_project_by_id(ws, &id)?;
                merge_into(meta, &old);
            }
        }
    }
    Ok(())
}

fn merge_into(incoming: &mut ProjectMeta, existing: &Project) {
    if incoming.created_at.is_empty() {
        incoming.created_at = existing.meta.created_at.clone();
    }
    incoming.id = existing.meta.id.clone();
    let incoming_custom = incoming.custom_fields.take().unwrap_or_default();
    let mut merged = existing.meta.custom_fields.clone().unwrap_or_default();
    if let Some(map) = merged.as_mapping_mut() {
        if let Some(imap) = incoming_custom.as_mapping() {
            for (k, v) in imap {
                map.insert(k.clone(), v.clone());
            }
        }
    }
    incoming.custom_fields = Some(merged);
}

fn ensure_valid_meta(meta: &mut ProjectMeta) {
    if meta.created_at.is_empty() {
        meta.created_at = chrono::Utc::now().format("%Y-%m-%d").to_string();
    }
    if meta.version == 0 {
        meta.version = 1;
    }
    meta.updated_at = chrono::Utc::now().format("%Y-%m-%dT%H:%M:%SZ").to_string();
    if meta.name.is_empty() {
        meta.name = "未命名项目".into();
    }
}

fn new_id() -> String {
    format!(
        "proj_{}_{}",
        chrono::Utc::now().format("%Y%m%d"),
        &uuid::Uuid::new_v4().simple().to_string()[..8]
    )
}

pub fn preview_file(ws: &Path, src: &Path) -> Result<ImportPreview, Error> {
    let name = src
        .file_name()
        .map(|s| s.to_string_lossy().to_string())
        .unwrap_or_else(|| "未命名".into());
    if src.is_dir() {
        let mut md_files: Vec<PathBuf> = std::fs::read_dir(src)?
            .filter_map(|e| e.ok().map(|e| e.path()))
            .filter(|p| p.is_file() && p.extension().map_or(false, |x| x.to_string_lossy().eq_ignore_ascii_case("md")))
            .collect();
        md_files.sort();
        let mut conflicts = Vec::new();
        for f in &md_files {
            if let Ok(content) = std::fs::read_to_string(f) {
                if let Ok((meta, _)) = frontmatter::parse_front_matter(&content) {
                    let existing = workspace::find_by_name(ws, &meta.name);
                    conflicts.push(ConflictInfo {
                        name: meta.name,
                        existing_id: existing.clone(),
                        exists: existing.is_some(),
                    });
                }
            }
        }
        return Ok(ImportPreview {
            kind: "folder".into(),
            source: src.display().to_string(),
            name,
            file_count: md_files.len(),
            conflicts,
        });
    }

    let ext = src.extension().map(|e| e.to_string_lossy().to_lowercase()).unwrap_or_default();
    match ext.as_str() {
        "xlsx" => {
            let sheets = export::read_xlsx(src)?;
            let (meta, _) = project_from_sheets(&sheets)?;
            let existing = workspace::find_by_name(ws, &meta.name);
            Ok(ImportPreview {
                kind: "xlsx".into(),
                source: src.display().to_string(),
                name,
                file_count: 1,
                conflicts: vec![ConflictInfo {
                    name: meta.name,
                    existing_id: existing.clone(),
                    exists: existing.is_some(),
                }],
            })
        }
        "localflow-template" | "zip" => Ok(ImportPreview {
            kind: "template".into(),
            source: src.display().to_string(),
            name,
            file_count: 1,
            conflicts: Vec::new(),
        }),
        _ if ext == "md" => {
            let content =
                std::fs::read_to_string(src).map_err(|e| Error::Io(e.to_string()))?;
            let (meta, _) = frontmatter::parse_front_matter(&content)?;
            let existing = workspace::find_by_name(ws, &meta.name);
            Ok(ImportPreview {
                kind: "md".into(),
                source: src.display().to_string(),
                name,
                file_count: 1,
                conflicts: vec![ConflictInfo {
                    name: meta.name,
                    existing_id: existing.clone(),
                    exists: existing.is_some(),
                }],
            })
        }
        _ => Err(Error::Parse(format!("不支持的文件类型: {ext}"))),
    }
}