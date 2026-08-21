use crate::models::{
    AppConfig, AttachmentInfo, ExternalChangeInfo, Project, ProjectMeta, ProjectStatus, ProjectSummary, SearchResult, SyncConflict, SyncStatusFile, SyncSummary, Template, TrashEntry,
};
use crate::{change_log, export, import, net, search, sync, templates, workspace, Error};
use pulldown_cmark::{html, Options, Parser};
use std::fs;
use std::path::PathBuf;
use tauri::AppHandle;
use tauri_plugin_dialog::DialogExt;
use tauri_plugin_opener::OpenerExt;

fn ws() -> Result<PathBuf, Error> {
    workspace::workspace_path()
}

/// 在异步线程池中执行重 IO，避免阻塞响应事件循环
async fn block<F, T>(f: F) -> Result<T, Error>
where
    F: FnOnce() -> Result<T, Error> + Send + 'static,
    T: Send + 'static,
{
    tauri::async_runtime::spawn_blocking(f)
        .await
        .map_err(|e| Error::Io(format!("任务执行失败: {e}")))?
}

#[tauri::command]
pub fn init_workspace() -> Result<String, Error> {
    let path = ws()?;
    Ok(path.to_string_lossy().to_string())
}

#[tauri::command]
pub fn set_workspace(path: String) -> Result<String, Error> {
    let p = PathBuf::from(&path);
    let wp = workspace::set_active_workspace(&p)?;
    workspace::init_dirs(&wp)?;
    Ok(wp.to_string_lossy().to_string())
}

#[tauri::command]
pub async fn choose_workspace(app: AppHandle) -> Result<String, Error> {
    let p = pick_folder(app, "选择工作区文件夹").await?;
    let wp = workspace::set_active_workspace(&p)?;
    workspace::init_dirs(&wp)?;
    Ok(wp.to_string_lossy().to_string())
}

#[tauri::command]
pub fn list_projects() -> Result<Vec<ProjectSummary>, Error> {
    workspace::list_projects(&ws()?)
}

#[tauri::command]
pub fn create_project(meta: ProjectMeta, body: String) -> Result<Project, Error> {
    let ws = ws()?;
    let p = workspace::create_project(&ws, meta, body)?;
    let _ = workspace::refresh_sync_status(&ws);
    Ok(p)
}

fn yaml_str(s: &str) -> serde_yaml::Value {
    serde_yaml::Value::String(s.to_string())
}

fn yaml_num(n: u32) -> serde_yaml::Value {
    serde_yaml::Value::Number(serde_yaml::Number::from(n))
}

fn yaml_obj(pairs: Vec<(&str, serde_yaml::Value)>) -> serde_yaml::Value {
    let mut m = serde_yaml::Mapping::new();
    for (k, v) in pairs {
        m.insert(serde_yaml::Value::String(k.to_string()), v);
    }
    serde_yaml::Value::Mapping(m)
}

#[tauri::command]
pub fn create_example_project() -> Result<Project, Error> {
    let ws = ws()?;
    let tasks = vec![
        ("用户访谈与需求梳理", "我", "已完成", 3, "2026-08-20"),
        ("体验地图评审", "我", "已完成", 5, "2026-08-25"),
        ("核心界面原型设计", "我", "进行中", 8, "2026-09-05"),
        ("技术方案与排期", "我", "进行中", 5, "2026-09-10"),
        ("开发落地 Sprint 1", "我", "待办", 13, "2026-10-01"),
        ("首批用户内测与反馈收集", "我", "待办", 5, "2026-10-15"),
    ];
    let tasks_value = serde_yaml::Value::Sequence(
        tasks
            .iter()
            .map(|(name, assignee, status, points, deadline)| {
                yaml_obj(vec![
                    ("name", yaml_str(name)),
                    ("assignee", yaml_str(assignee)),
                    ("status", yaml_str(status)),
                    ("points", yaml_num(*points)),
                    ("deadline", yaml_str(deadline)),
                ])
            })
            .collect(),
    );
    let custom_fields = yaml_obj(vec![
        ("sprint_name", yaml_str("2026 Q3 · 新产品迭代 Sprint 1")),
        (
            "sprint_goal",
            yaml_str("交付新版最小可用产品（MVP），完成首批真实用户试用。"),
        ),
        ("story_points", yaml_num(39)),
        ("status", yaml_str("进行中")),
        ("tasks", tasks_value),
    ]);
    let meta = ProjectMeta {
        id: String::new(),
        name: "示例项目 · 新产品迭代".to_string(),
        status: ProjectStatus::Active,
        created_at: String::new(),
        updated_at: String::new(),
        version: 1,
        owner: Some("我".to_string()),
        deadline: Some("2026-10-31".to_string()),
        priority: Some("P1".to_string()),
        progress: Some(45),
        tags: Some(vec!["示例".to_string(), "入门".to_string()]),
        parent_id: None,
        sync_devices: None,
        template_id: Some("agile-sprint".to_string()),
        custom_fields: Some(custom_fields),
    };
    let body = r#"# 示例项目 · 新产品迭代

## 项目目标
通过一个最小可用产品验证核心假设：用户愿意为「纯本地项目管理」付费。

## 关键里程碑
- [x] 用户访谈与需求梳理
- [ ] 核心界面原型设计（进行中）
- [ ] 开发落地 Sprint 1
- [ ] 首批用户内测与反馈收集

## 风险与阻塞项
- 团队对数据隐私方案的理解差异
- 内测用户招募需要时间

## 会议纪要
- 2026-08-20：确认 MVP 范围，锁定 6 项核心任务。

## 备注
这是为你准备的示例项目，可以自由修改、删除，或把它当作模板复制出真实项目。
"#.to_string();
    let p = workspace::create_project(&ws, meta, body)?;
    let _ = workspace::generate_summary(&ws);
    let _ = workspace::refresh_sync_status(&ws);
    Ok(p)
}

#[tauri::command]
pub fn read_project(id: String) -> Result<Project, Error> {
    workspace::read_project_by_id(&ws()?, &id)
}

#[tauri::command]
pub fn clone_project(id: String) -> Result<Project, Error> {
    let ws = ws()?;
    let project = workspace::read_project_by_id(&ws, &id)?;
    let mut new_meta = project.meta.clone();
    new_meta.id = workspace::new_project_id();
    new_meta.name = format!("{}（副本）", project.meta.name);
    new_meta.created_at = chrono::Utc::now().format("%Y-%m-%d").to_string();
    new_meta.updated_at = chrono::Utc::now().format("%Y-%m-%dT%H:%M:%SZ").to_string();
    new_meta.version = 1;
    new_meta.status = ProjectStatus::Active;
    new_meta.parent_id = Some(project.meta.id.clone());
    let source_folder = workspace::project_dir(&ws, &project.folder);
    let created = workspace::create_project_file_at(&ws, new_meta, project.body.clone(), Some(&source_folder))?;
    let _ = workspace::generate_summary(&ws);
    let _ = workspace::refresh_sync_status(&ws);
    Ok(created)
}

#[tauri::command]
pub fn set_project_status(id: String, status: String) -> Result<Project, Error> {
    let ws = ws()?;
    let mut project = workspace::read_project_by_id(&ws, &id)?;
    project.meta.status = match status.as_str() {
        "archived" => ProjectStatus::Archived,
        "deleted" => ProjectStatus::Deleted,
        _ => ProjectStatus::Active,
    };
    let saved = workspace::save_project(&ws, &project)?;
    let _ = workspace::generate_summary(&ws);
    let _ = workspace::refresh_sync_status(&ws);
    Ok(saved)
}

#[tauri::command]
pub fn save_project(project: Project) -> Result<Project, Error> {
    let ws = ws()?;
    let old = workspace::read_project_by_id(&ws, &project.meta.id);
    let saved = workspace::save_project(&ws, &project)?;
    if let Ok(old) = old {
        let changes = change_log::diff_meta(&old, &saved);
        let _ = change_log::append_changes(&saved, changes);
        let _ = workspace::save_snapshot(&ws, &old);
        let _ = workspace::generate_summary(&ws);
    }
    let _ = workspace::refresh_sync_status(&ws);
    Ok(saved)
}

#[tauri::command]
pub fn get_sync_status() -> Result<SyncStatusFile, Error> {
    let ws = ws()?;
    let status = workspace::read_sync_status(&ws);
    if status.projects.is_empty() {
        workspace::refresh_sync_status(&ws)
    } else {
        Ok(status)
    }
}

#[tauri::command]
pub fn refresh_sync_status() -> Result<SyncStatusFile, Error> {
    workspace::refresh_sync_status(&ws()?)
}

#[tauri::command]
pub fn detect_external_changes() -> Result<Vec<ExternalChangeInfo>, Error> {
    workspace::detect_external_changes(&ws()?)
}

#[tauri::command]
pub fn search_all(query: String, limit: Option<usize>) -> Result<Vec<SearchResult>, Error> {
    let ws = ws()?;
    search::search_all(&ws, &query, limit.unwrap_or(50))
}

#[tauri::command]
pub fn get_device_info() -> Result<crate::models::DeviceInfo, Error> {
    Ok(net::self_device_info())
}

#[tauri::command]
pub fn set_device_name(net_state: tauri::State<net::NetState>, name: String) -> Result<crate::models::DeviceInfo, Error> {
    net::rename_device(&net_state, name)
}

#[tauri::command]
pub fn list_devices(net_state: tauri::State<net::NetState>) -> Result<Vec<crate::models::DeviceInfo>, Error> {
    Ok(net::list_devices(&net_state))
}

#[tauri::command]
pub fn sync_all(net_state: tauri::State<net::NetState>) -> Result<SyncSummary, Error> {
    Ok(net::sync_all(net_state.inner()))
}

#[tauri::command]
pub fn sync_with_device(net_state: tauri::State<net::NetState>, device_id: String) -> Result<SyncSummary, Error> {
    let net_state = net_state.inner();
    let devices = net::list_devices(net_state);
    let dev = devices
        .into_iter()
        .find(|d| d.id == device_id)
        .ok_or_else(|| Error::NotFound("设备未发现，请刷新设备列表".into()))?;
    net::sync_with_device(net_state, &dev)
}

#[tauri::command]
pub fn list_sync_conflicts() -> Result<Vec<SyncConflict>, Error> {
    Ok(sync::read_conflicts(&ws()?))
}

#[tauri::command]
pub fn resolve_sync_conflict(id: String, choice: String) -> Result<(), Error> {
    sync::resolve_conflict(&ws()?, &id, &choice)
}

#[tauri::command]
pub fn clear_sync_conflicts() -> Result<(), Error> {
    sync::clear_conflicts(&ws()?);
    Ok(())
}

#[tauri::command]
pub fn trust_device(id: String, name: Option<String>) -> Result<(), Error> {
    net::trust_device(&id, name)
}

#[tauri::command]
pub fn untrust_device(id: String) -> Result<(), Error> {
    net::untrust_device(&id)
}

#[tauri::command]
pub async fn begin_pair(net_state: tauri::State<'_, net::NetState>, device_id: String) -> Result<crate::models::PairSession, Error> {
    let net_state = net_state.inner();
    let sess = net::begin_pair(net_state, &device_id)?;
    Ok(sess)
}

#[tauri::command]
pub async fn submit_pair_code(net_state: tauri::State<'_, net::NetState>, device_id: String, code: String) -> Result<crate::models::PairSession, Error> {
    let net_state = net_state.inner();
    let sess = net::submit_pair_code(net_state, &device_id, &code)?;
    Ok(sess)
}

#[tauri::command]
pub fn pair_sessions(net_state: tauri::State<'_, net::NetState>) -> Result<Vec<crate::models::PairSession>, Error> {
    Ok(net::pair_sessions(net_state.inner()))
}

#[tauri::command]
pub fn dismiss_pair(net_state: tauri::State<'_, net::NetState>, device_id: String) -> Result<(), Error> {
    net::dismiss_pair(net_state.inner(), &device_id);
    Ok(())
}

#[tauri::command]
pub fn read_summary() -> Result<String, Error> {
    let ws = ws()?;
    let path = ws.join(workspace::SUMMARY_FILE);
    if path.is_file() {
        fs::read_to_string(&path).map_err(Into::into)
    } else {
        workspace::generate_summary(&ws)
    }
}

#[tauri::command]
pub fn list_snapshots(project_id: String) -> Result<Vec<crate::models::SnapshotInfo>, Error> {
    workspace::list_snapshots(&ws()?, &project_id)
}

#[tauri::command]
pub fn read_snapshot(project_id: String, timestamp: String) -> Result<Project, Error> {
    workspace::read_snapshot(&ws()?, &project_id, &timestamp)
}

#[tauri::command]
pub fn restore_snapshot(project_id: String, timestamp: String) -> Result<Project, Error> {
    let ws = ws()?;
    let restored = workspace::restore_snapshot(&ws, &project_id, &timestamp)?;
    let _ = workspace::generate_summary(&ws);
    let _ = workspace::refresh_sync_status(&ws);
    let _ = change_log::append_changes(&restored, vec![change_log::ChangeEntry {
        at: chrono::Utc::now().to_rfc3339(),
        field: "快照恢复".into(),
        old: format!("恢复自 {timestamp}"),
        new: "当前版本".into(),
    }]);
    Ok(restored)
}

#[tauri::command]
pub fn load_project_changes(
    project_id: String,
    days: Option<u32>,
) -> Result<Vec<change_log::ChangeEntry>, Error> {
    let project = workspace::read_project_by_id(&ws()?, &project_id)?;
    Ok(change_log::load_changes_since(&project, days.unwrap_or(30)))
}

#[tauri::command]
pub fn open_workspace_folder(app: AppHandle) -> Result<(), Error> {
    let path = ws()?;
    app.opener()
        .open_path(path.to_string_lossy().to_string(), None::<&str>)
        .map_err(|e| Error::Io(format!("打开工作区目录失败: {e}")))?;
    Ok(())
}

#[tauri::command]
pub fn open_project_folder(app: AppHandle, project_id: String) -> Result<(), Error> {
    let ws = ws()?;
    let project = workspace::read_project_by_id(&ws, &project_id)?;
    let path = workspace::project_dir(&ws, &project.folder);
    app.opener()
        .open_path(path.to_string_lossy().to_string(), None::<&str>)
        .map_err(|e| Error::Io(format!("打开项目目录失败: {e}")))?;
    Ok(())
}

#[tauri::command]
pub fn delete_project(id: String) -> Result<(), Error> {
    let ws = ws()?;
    workspace::delete_project(&ws, &id)?;
    let _ = workspace::refresh_sync_status(&ws);
    Ok(())
}

#[tauri::command]
pub async fn link_external_folder(app: AppHandle) -> Result<Project, Error> {
    let path = pick_folder(app, "选择要链接的外部文件夹").await?;
    let ws = ws()?;
    let project = workspace::link_external_dir(&ws, &path, None)?;
    let _ = workspace::refresh_sync_status(&ws);
    Ok(project)
}

#[tauri::command]
pub fn unlink_project(id: String) -> Result<(), Error> {
    let ws = ws()?;
    let project = workspace::read_project_by_id(&ws, &id)?;
    if !std::path::Path::new(&project.folder).is_absolute() {
        return Err(Error::Config("这是工作区内的项目，请使用「删除」操作".into()));
    }
    workspace::unlink_external(&ws, &project.folder)?;
    let _ = workspace::refresh_sync_status(&ws);
    Ok(())
}

#[tauri::command]
pub fn list_trash() -> Result<Vec<TrashEntry>, Error> {
    workspace::trash_entries(&ws()?)
}

#[tauri::command]
pub fn restore_project(folder: String) -> Result<Project, Error> {
    let ws = ws()?;
    let p = workspace::restore_project(&ws, &folder)?;
    let _ = workspace::refresh_sync_status(&ws);
    Ok(p)
}

#[tauri::command]
pub fn purge_project(folder: String) -> Result<(), Error> {
    workspace::purge_project(&ws()?, &folder)
}

#[tauri::command]
pub fn purge_trash() -> Result<usize, Error> {
    workspace::purge_trash(&ws()?)
}

#[tauri::command]
pub fn list_attachments(project_id: String) -> Result<Vec<AttachmentInfo>, Error> {
    workspace::list_attachments(&ws()?, &project_id)
}

fn safe_attach_name(name: &str) -> Result<String, Error> {
    let n = PathBuf::from(name);
    if n.components().count() != 1 || name.is_empty() {
        return Err(Error::Config(format!("非法的附件文件名: {name}")));
    }
    Ok(name.to_string())
}

#[tauri::command]
pub async fn add_attachment(
    app: AppHandle,
    project_id: String,
) -> Result<Vec<AttachmentInfo>, Error> {
    let path = pick_open_path(app, "选择要添加的附件", &["*"], "所有文件").await?;
    let ws = ws()?;
    block(move || {
        let project = workspace::read_project_by_id(&ws, &project_id)?;
        let dir = workspace::project_dir(&ws, &project.folder).join("attachments");
        fs::create_dir_all(&dir)?;
        let file_name = path
            .file_name()
            .ok_or_else(|| Error::Config("无法识别文件名".into()))?;
        let dest = dir.join(file_name);
        if dest.exists() {
            return Err(Error::Config(format!(
                "附件已存在: {}",
                file_name.to_string_lossy()
            )));
        }
        fs::copy(&path, &dest)?;
        workspace::list_attachments(&ws, &project_id)
    })
    .await
}

#[tauri::command]
pub fn open_attachment(app: AppHandle, project_id: String, name: String) -> Result<(), Error> {
    let name = safe_attach_name(&name)?;
    let ws = ws()?;
    let project = workspace::read_project_by_id(&ws, &project_id)?;
    let path = workspace::project_dir(&ws, &project.folder).join("attachments").join(&name);
    if !path.is_file() {
        return Err(Error::NotFound(format!("附件不存在: {name}")));
    }
    app.opener()
        .open_path(path.to_string_lossy().to_string(), None::<&str>)
        .map_err(|e| Error::Io(format!("打开附件失败: {e}")))?;
    Ok(())
}

#[tauri::command]
pub fn delete_attachment(project_id: String, name: String) -> Result<(), Error> {
    let name = safe_attach_name(&name)?;
    let ws = ws()?;
    let project = workspace::read_project_by_id(&ws, &project_id)?;
    let path = workspace::project_dir(&ws, &project.folder).join("attachments").join(&name);
    if path.is_file() {
        fs::remove_file(&path)?;
    } else {
        return Err(Error::NotFound(format!("附件不存在: {name}")));
    }
    Ok(())
}

#[tauri::command]
pub fn get_templates() -> Vec<Template> {
    let mut list = templates::builtin_templates();
    if let Ok(ws) = ws() {
        list.extend(templates::load_custom_templates(&ws));
    }
    list
}

#[tauri::command]
pub fn list_task_files(project_id: String) -> Result<Vec<TaskFileInfo>, Error> {
    let project = workspace::read_project_by_id(&ws()?, &project_id)?;
    let tasks_dir = workspace::project_dir(&ws()?, &project.folder).join("tasks");
    let mut out = Vec::new();
    if tasks_dir.is_dir() {
        let mut entries: Vec<PathBuf> = fs::read_dir(&tasks_dir)?
            .filter_map(|e| e.ok().map(|e| e.path()))
            .filter(|p| p.extension().map_or(false, |x| x == "md"))
            .collect();
        entries.sort();
        for p in entries {
            let content = fs::read_to_string(&p).unwrap_or_default();
            let (meta, body) = crate::frontmatter::parse_front_matter(&content).unwrap_or_default();
            out.push(TaskFileInfo {
                name: p.file_name().unwrap().to_string_lossy().to_string(),
                meta,
                body,
            });
        }
    }
    Ok(out)
}

#[tauri::command]
pub fn save_task_file(
    project_id: String,
    name: String,
    meta: ProjectMeta,
    body: String,
) -> Result<TaskFileInfo, Error> {
    let project = workspace::read_project_by_id(&ws()?, &project_id)?;
    let tasks_dir = workspace::project_dir(&ws()?, &project.folder).join("tasks");
    fs::create_dir_all(&tasks_dir)?;
    let base = sanitize_task_base(&name);
    let path = tasks_dir.join(format!("{base}.md"));
    let content = crate::frontmatter::project_to_file_content(&meta, &body)?;
    fs::write(&path, content)?;
    let _ = workspace::generate_summary(&ws()?);
    let _ = workspace::refresh_sync_status(&ws()?);
    Ok(TaskFileInfo {
        name: format!("{base}.md"),
        meta,
        body,
    })
}

#[tauri::command]
pub fn delete_task_file(project_id: String, name: String) -> Result<(), Error> {
    let project = workspace::read_project_by_id(&ws()?, &project_id)?;
    let tasks_dir = workspace::project_dir(&ws()?, &project.folder).join("tasks");
    let path = tasks_dir.join(&name);
    if path.is_file() {
        fs::remove_file(&path)?;
    }
    let _ = workspace::generate_summary(&ws()?);
    let _ = workspace::refresh_sync_status(&ws()?);
    Ok(())
}

fn sanitize_task_base(name: &str) -> String {
    let trimmed = name.trim().trim_end_matches(".md");
    if trimmed.is_empty()
        || trimmed.contains('/')
        || trimmed.contains('\\')
        || trimmed.contains("..")
    {
        safe_task_name(trimmed)
    } else {
        trimmed.to_string()
    }
}

fn safe_task_name(name: &str) -> String {
    let trimmed = name.trim().trim_end_matches(".md");
    let slug: String = trimmed
        .chars()
        .map(|c| if c.is_alphanumeric() || c == '-' || c == '_' { c } else { '-' })
        .collect();
    let slug = slug.trim_matches('-').to_string();
    if slug.is_empty() {
        "task".to_string()
    } else {
        slug
    }
}

#[tauri::command]
pub fn parse_yaml_meta(yaml: String) -> Result<ProjectMeta, Error> {
    let value: serde_yaml::Value =
        serde_yaml::from_str(&yaml).map_err(|e| Error::Parse(e.to_string()))?;
    let meta: ProjectMeta =
        serde_yaml::from_value(value).map_err(|e| Error::Parse(e.to_string()))?;
    Ok(meta)
}

#[tauri::command]
pub fn build_yml(meta: ProjectMeta) -> Result<String, Error> {
    crate::frontmatter::build_front_matter(&meta)
}

#[tauri::command]
pub fn render_markdown(md: String) -> Result<String, Error> {
    let mut options = Options::all();
    options.insert(Options::ENABLE_TABLES);
    options.insert(Options::ENABLE_STRIKETHROUGH);
    options.insert(Options::ENABLE_TASKLISTS);
    options.insert(Options::ENABLE_HEADING_ATTRIBUTES);
    let parser = Parser::new_ext(&md, options);
    let mut out = String::new();
    html::push_html(&mut out, parser);
    Ok(out)
}

#[tauri::command]
pub fn load_config() -> Result<AppConfig, Error> {
    let path = config_file()?;
    if path.is_file() {
        let content = fs::read_to_string(&path)?;
        serde_yaml::from_str(&content).map_err(|e| Error::Parse(e.to_string()))
    } else {
        Ok(AppConfig::default())
    }
}

#[tauri::command]
pub fn save_config(config: AppConfig) -> Result<AppConfig, Error> {
    let path = config_file()?;
    let yaml = serde_yaml::to_string(&config).map_err(|e| Error::Parse(e.to_string()))?;
    fs::write(path, yaml)?;
    Ok(config)
}

fn config_file() -> Result<PathBuf, Error> {
    let path = ws()?.join(workspace::CONFIG_DIR).join("config.yaml");
    Ok(path)
}

// ---------------------------------------------------------------------------
// Export / Import commands
// ---------------------------------------------------------------------------

async fn pick_save_path(app: AppHandle, title: &str, filename: &str, extensions: &[&str], filter_name: &str) -> Result<PathBuf, Error> {
    let mut builder = app
        .dialog()
        .file()
        .set_title(title)
        .set_file_name(filename);
    builder = builder.add_filter(filter_name, extensions);
    let (tx, mut rx) = tauri::async_runtime::channel(1);
    builder.save_file(move |fp| {
        let _ = tx.try_send(fp);
    });
    match rx.recv().await {
        Some(Some(fp)) => fp.into_path().map_err(|e| Error::Config(e.to_string())),
        _ => Err(Error::Config("用户取消了导出".into())),
    }
}

async fn pick_open_path(app: AppHandle, title: &str, extensions: &[&str], filter_name: &str) -> Result<PathBuf, Error> {
    let builder = app
        .dialog()
        .file()
        .set_title(title)
        .add_filter(filter_name, extensions)
        .add_filter("所有文件", &["*"]);
    let (tx, mut rx) = tauri::async_runtime::channel(1);
    builder.pick_file(move |fp| {
        let _ = tx.try_send(fp);
    });
    match rx.recv().await {
        Some(Some(fp)) => fp.into_path().map_err(|e| Error::Config(e.to_string())),
        _ => Err(Error::Config("用户取消了选择".into())),
    }
}

async fn pick_folder(app: AppHandle, title: &str) -> Result<PathBuf, Error> {
    let (tx, mut rx) = tauri::async_runtime::channel(1);
    app.dialog().file().set_title(title).pick_folder(move |fp| {
        let _ = tx.try_send(fp);
    });
    match rx.recv().await {
        Some(Some(fp)) => fp.into_path().map_err(|e| Error::Config(e.to_string())),
        _ => Err(Error::Config("用户取消了选择".into())),
    }
}

#[tauri::command]
pub async fn export_project(app: AppHandle, id: String, format: String, include_history: bool) -> Result<PathBuf, Error> {
    let project = workspace::read_project_by_id(&ws()?, &id)?;
    let (title, filename, extensions, filter_name) = match format.as_str() {
        "md" => ("导出 Markdown", format!("{}.md", export_safe(&project.meta.name)), vec!["md"], "Markdown"),
        "xlsx" => ("导出 Excel", format!("{}.xlsx", export_safe(&project.meta.name)), vec!["xlsx"], "Excel"),
        "csv" => ("导出 CSV", format!("{}.csv", export_safe(&project.meta.name)), vec!["csv"], "CSV"),
        "json" => ("导出 JSON", format!("{}.json", export_safe(&project.meta.name)), vec!["json"], "JSON"),
        _ => return Err(Error::Config(format!("未知导出格式: {format}"))),
    };
    let dest = pick_save_path(app, title, &filename, &extensions, filter_name).await?;
    let dest = ensure_ext(dest, &format);
    let fmt = format.clone();
    let proj = project.clone();
    let d = dest.clone();
    block(move || match fmt.as_str() {
        "md" => export::export_project_md(&proj, &d),
        "xlsx" => export::export_project_xlsx(&proj, &d, include_history),
        "csv" => export::export_project_csv(&proj, &d, ','),
        "json" => export::export_project_json(&proj, &d),
        _ => Err(Error::Config("未知导出格式".into())),
    })
    .await?;
    if format == "xlsx" {
        let backup_dir = ws()?.join(workspace::CONFIG_DIR).join("backups");
        fs::create_dir_all(&backup_dir)?;
        let ts = chrono::Utc::now().format("%Y%m%d-%H%M%S");
        let backup_name = format!("{}_{}.xlsx", export_safe(&project.meta.name), ts);
        let backup_path = backup_dir.join(backup_name);
        fs::copy(&dest, &backup_path).ok();
    }
    Ok(dest)
}

fn ensure_ext(mut path: PathBuf, format: &str) -> PathBuf {
    let has = path
        .extension()
        .map(|e| e.to_string_lossy().eq_ignore_ascii_case(format))
        .unwrap_or(false);
    if !has {
        path.set_extension(format);
    }
    path
}

fn export_safe(name: &str) -> String {
    name.chars()
        .map(|c| if c.is_alphanumeric() || c == '-' || c == '_' { c } else { '_' })
        .collect()
}

#[tauri::command]
pub async fn export_project_html(app: AppHandle, id: String) -> Result<PathBuf, Error> {
    let project = workspace::read_project_by_id(&ws()?, &id)?;
    let dest = pick_save_path(
        app.clone(),
        "导出打印友好版",
        &format!("{}.html", export_safe(&project.meta.name)),
        &["html"],
        "HTML",
    )
    .await?;
    let dest = ensure_ext(dest, "html");
    let proj = project.clone();
    let d = dest.clone();
    let saved = block(move || export::export_project_html(&proj, &d)).await?;
    app.opener()
        .open_path(dest.to_string_lossy().to_string(), None::<&str>)
        .map_err(|e| Error::Io(format!("打开导出文件失败: {e}")))?;
    Ok(saved)
}

#[tauri::command]
pub async fn export_all_markdown(app: AppHandle) -> Result<Vec<PathBuf>, Error> {
    let dest = pick_folder(app, "选择导出文件夹").await?;
    let ws = ws()?;
    block(move || export::export_all_markdown(&ws, &dest)).await
}

fn find_template(template_id: &str) -> Option<Template> {
    templates::get_template(template_id).or_else(|| {
        let ws = ws().ok()?;
        templates::load_custom_templates(&ws)
            .into_iter()
            .find(|t| t.template_id == template_id)
    })
}

#[tauri::command]
pub async fn export_project_preset(
    app: AppHandle,
    id: String,
    preset_index: usize,
    include_history: bool,
) -> Result<PathBuf, Error> {
    let project = workspace::read_project_by_id(&ws()?, &id)?;
    let template_id = project
        .meta
        .template_id
        .clone()
        .ok_or_else(|| Error::Config("该项目未关联模板".into()))?;
    let template = find_template(&template_id)
        .ok_or_else(|| Error::Config(format!("找不到模板: {template_id}")))?;
    let preset = template
        .export_presets
        .get(preset_index)
        .ok_or_else(|| Error::Config(format!("模板缺少导出预设 #{preset_index}")))?;
    let format = preset.format.clone();
    let (title, filename, extensions, filter_name) = match format.as_str() {
        "md" => (
            format!("导出预设 · {}", preset.name),
            format!("{}.md", export_safe(&project.meta.name)),
            vec!["md"],
            "Markdown",
        ),
        "xlsx" => (
            format!("导出预设 · {}", preset.name),
            format!("{}.xlsx", export_safe(&project.meta.name)),
            vec!["xlsx"],
            "Excel",
        ),
        "csv" => (
            format!("导出预设 · {}", preset.name),
            format!("{}.csv", export_safe(&project.meta.name)),
            vec!["csv"],
            "CSV",
        ),
        "json" => (
            format!("导出预设 · {}", preset.name),
            format!("{}.json", export_safe(&project.meta.name)),
            vec!["json"],
            "JSON",
        ),
        _ => return Err(Error::Config(format!("预设使用了未知导出格式: {format}"))),
    };
    let dest = pick_save_path(app, &title, &filename, &extensions, filter_name).await?;
    let dest = ensure_ext(dest, &format);
    let columns = preset.columns.clone();
    let fmt = format.clone();
    let proj = project.clone();
    let d = dest.clone();
    block(move || match fmt.as_str() {
        "md" => export::export_project_md(&proj, &d),
        "xlsx" => export::export_project_xlsx_preset(&proj, &d, include_history, &columns),
        "csv" => export::export_project_csv_preset(&proj, &d, ',', &columns),
        "json" => export::export_project_json(&proj, &d),
        _ => Err(Error::Config("未知导出格式".into())),
    })
    .await
}

#[tauri::command]
pub fn refresh_summary() -> Result<String, Error> {
    workspace::generate_summary(&ws()?)
}

#[tauri::command]
pub async fn import_from_dialog(app: AppHandle) -> Result<import::ImportPreview, Error> {
    let path = pick_open_path(
        app,
        "选择要导入的文件",
        &["md", "xlsx", "localflow-template"],
        "支持文件",
    )
    .await?;
    let ws = ws()?;
    block(move || import::preview_file(&ws, &path)).await
}

#[tauri::command]
pub async fn import_folder_from_dialog(app: AppHandle) -> Result<import::ImportPreview, Error> {
    let path = pick_folder(app, "选择包含 Markdown 项目的文件夹").await?;
    let ws = ws()?;
    block(move || import::preview_file(&ws, &path)).await
}

#[tauri::command]
pub fn import_from_path(path: String) -> Result<import::ImportPreview, Error> {
    let p = PathBuf::from(&path);
    if !p.exists() {
        return Err(Error::NotFound(format!("路径不存在: {path}")));
    }
    import::preview_file(&ws()?, &p)
}

#[tauri::command]
pub async fn import_commit(path: String, strategy: String) -> Result<Vec<Project>, Error> {
    let p = PathBuf::from(path);
    let ws = ws()?;
    let strategy = match strategy.as_str() {
        "overwrite" => import::ImportStrategy::Overwrite,
        "rename" => import::ImportStrategy::Rename,
        "merge" => import::ImportStrategy::Merge,
        _ => return Err(Error::Config(format!("未知导入策略: {strategy}"))),
    };
    let result = block(move || {
        let result = if p.is_dir() {
            import::import_md_folder(&ws, &p, strategy)?
        } else {
            let ext = p.extension().map(|e| e.to_string_lossy().to_lowercase()).unwrap_or_default();
            match ext.as_str() {
                "md" => vec![import::import_md_file(&ws, &p, strategy)?],
                "xlsx" => vec![import::import_xlsx(&ws, &p, strategy)?],
                "localflow-template" | "zip" => {
                    import::import_template_package(&ws, &p)?;
                    Vec::new()
                }
                _ => return Err(Error::Config(format!("不支持的文件类型: {ext}"))),
            }
        };
        let _ = workspace::generate_summary(&ws);
        let _ = workspace::refresh_sync_status(&ws);
        Ok(result)
    })
    .await?;
    Ok(result)
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize, Default)]
pub struct TaskFileInfo {
    pub name: String,
    pub meta: ProjectMeta,
    pub body: String,
}
