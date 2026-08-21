use std::fs;
use tempfile::TempDir;
use vinepalmaflow_lib::frontmatter;
use vinepalmaflow_lib::models::{ProjectMeta, ProjectStatus};
use vinepalmaflow_lib::workspace;

#[test]
fn frontmatter_roundtrip_preserves_fields() {
    let meta = ProjectMeta {
        id: "proj_20260818_001".into(),
        name: "产品重构 v2.0".into(),
        status: ProjectStatus::Active,
        created_at: "2026-08-18".into(),
        updated_at: "2026-08-18T10:00:00Z".into(),
        version: 1,
        owner: Some("ChengmuSu".into()),
        deadline: Some("2026-09-15".into()),
        priority: Some("P0".into()),
        progress: Some(35),
        tags: Some(vec!["技术债".into(), "Q3目标".into()]),
        parent_id: None,
        sync_devices: None,
        template_id: Some("blank".into()),
        custom_fields: Some(serde_yaml::to_value(
            serde_json::json!({"budget": 50000, "department": "研发部"}),
        )
        .unwrap()),
    };
    let body = "## 项目目标\n重构核心交易模块。\n\n## 关键里程碑\n- [ ] 灰度发布\n";

    let file = frontmatter::project_to_file_content(&meta, body).unwrap();
    let (parsed, parsed_body) = frontmatter::parse_front_matter(&file).unwrap();

    assert_eq!(parsed.id, meta.id);
    assert_eq!(parsed.name, meta.name);
    assert_eq!(parsed.status, ProjectStatus::Active);
    assert_eq!(parsed.priority.as_deref(), Some("P0"));
    assert_eq!(parsed.progress, Some(35));
    assert_eq!(parsed.tags, meta.tags);
    assert_eq!(parsed.custom_fields, meta.custom_fields);
    assert_eq!(parsed_body, format!("# {}\n\n{body}", meta.name));
    assert!(file.starts_with("---\n"));
}

#[test]
fn frontmatter_rejects_missing_marker() {
    let err = frontmatter::parse_front_matter("no front matter here").unwrap_err();
    assert!(err.to_string().contains("Front Matter"));
}

#[test]
fn workspace_crud_roundtrip() {
    let tmp = TempDir::new().unwrap();
    workspace::init_dirs(tmp.path()).unwrap();

    let meta = ProjectMeta {
        id: String::new(),
        name: "测试项目/产品 v1".into(),
        status: ProjectStatus::Active,
        created_at: String::new(),
        updated_at: String::new(),
        version: 0,
        owner: Some("张三".into()),
        deadline: None,
        priority: Some("P1".into()),
        progress: Some(10),
        tags: Some(vec!["测试".into()]),
        parent_id: None,
        sync_devices: None,
        template_id: Some("agile-sprint".into()),
        custom_fields: None,
    };

    let created = workspace::create_project(tmp.path(), meta, "## 目标\n".into()).unwrap();
    assert!(!created.meta.id.is_empty());
    assert!(!created.meta.created_at.is_empty());
    assert_eq!(created.meta.version, 1);
    assert!(created.folder.contains("测试项目-产品-v1") || created.folder.contains("ceshi"));
    assert!(tmp.path().join(&created.folder).join("project.md").is_file());
    assert!(tmp.path().join(&created.folder).join("tasks").is_dir());

    let read_back = workspace::read_project_by_id(tmp.path(), &created.meta.id).unwrap();
    assert_eq!(read_back.meta.name, "测试项目/产品 v1");
    assert_eq!(read_back.body, "# 测试项目/产品 v1\n\n## 目标\n");
    assert_eq!(read_back.meta.owner.as_deref(), Some("张三"));

    let saved = workspace::save_project(tmp.path(), &read_back).unwrap();
    assert!(!saved.meta.updated_at.is_empty());
    assert_eq!(saved.meta.name, read_back.meta.name);

    let summaries = workspace::list_projects(tmp.path()).unwrap();
    assert_eq!(summaries.len(), 1);
    assert_eq!(summaries[0].meta.priority.as_deref(), Some("P1"));

    workspace::delete_project(tmp.path(), &created.meta.id).unwrap();
    let after = workspace::list_projects(tmp.path()).unwrap();
    assert!(after.is_empty());

    let summary = workspace::generate_summary(tmp.path()).unwrap();
    assert!(summary.contains("# 汇总视图"));
}

#[test]
fn duplicate_names_get_unique_folders() {
    let tmp = TempDir::new().unwrap();
    workspace::init_dirs(tmp.path()).unwrap();
    let meta = ProjectMeta {
        id: String::new(),
        name: "同名字段".into(),
        status: ProjectStatus::Active,
        created_at: String::new(),
        updated_at: String::new(),
        version: 0,
        owner: None,
        deadline: None,
        priority: None,
        progress: None,
        tags: None,
        parent_id: None,
        sync_devices: None,
        template_id: None,
        custom_fields: None,
    };
    let a = workspace::create_project(tmp.path(), meta.clone(), String::new()).unwrap();
    let b = workspace::create_project(tmp.path(), meta.clone(), String::new()).unwrap();
    assert_ne!(a.folder, b.folder);
    assert_ne!(a.meta.id, b.meta.id);
    let _ = fs::read_dir(tmp.path());
}

// ---------------------------------------------------------------------------
// Phase 2: export / import tests
// ---------------------------------------------------------------------------

use vinepalmaflow_lib::export;
use vinepalmaflow_lib::import;

fn sample_project(name: &str) -> ProjectMeta {
    let mut custom = serde_yaml::Mapping::new();
    let task = serde_yaml::to_value(serde_json::json!([
        {"name": "需求评审", "assignee": "张三", "status": "已完成", "points": 3, "deadline": "2026-08-20"},
        {"name": "接口设计", "assignee": "李四", "status": "进行中", "points": 5, "deadline": "2026-08-25"}
    ])).unwrap();
    custom.insert(serde_yaml::Value::String("tasks".into()), task);
    ProjectMeta {
        id: format!("proj_test_{}", uuid::Uuid::new_v4().simple()),
        name: name.into(),
        status: ProjectStatus::Active,
        created_at: "2026-08-18".into(),
        updated_at: "2026-08-18T10:00:00Z".into(),
        version: 1,
        owner: Some("ChengmuSu".into()),
        deadline: Some("2026-09-15".into()),
        priority: Some("P0".into()),
        progress: Some(60),
        tags: Some(vec!["测试".into()]),
        parent_id: None,
        sync_devices: None,
        template_id: Some("agile-sprint".into()),
        custom_fields: Some(serde_yaml::Value::Mapping(custom)),
    }
}

#[test]
fn export_xlsx_and_import_back() {
    let tmp = TempDir::new().unwrap();
    let dest = tmp.path().join("out");
    std::fs::create_dir_all(&dest).unwrap();
    let project = vinepalmaflow_lib::models::Project {
        meta: sample_project("Excel 往返测试"),
        body: "## 项目目标\n验证。\n".into(),
        folder: "test-folder".into(),
    };

    let path = export::export_project_xlsx(&project, &dest.join("roundtrip.xlsx"), true).unwrap();
    assert!(path.exists());

    let ws2 = TempDir::new().unwrap();
    workspace::init_dirs(ws2.path()).unwrap();
    let imported = import::import_xlsx(ws2.path(), &path, import::ImportStrategy::Rename).unwrap();
    assert_eq!(imported.meta.name, "Excel 往返测试");
    assert_eq!(imported.meta.owner.as_deref(), Some("ChengmuSu"));
    assert_eq!(imported.meta.priority.as_deref(), Some("P0"));
    assert!(imported.meta.custom_fields.is_some());

    let tasks = export::extract_tasks(&imported);
    assert_eq!(tasks.len(), 2);
    assert!(tasks.iter().any(|t| t.name.contains("需求评审")));
    assert!(tasks.iter().any(|t| t.name.contains("接口设计")));
}

#[test]
fn export_md_csv_json_and_import_md() {
    let tmp = TempDir::new().unwrap();
    let dest = tmp.path().join("out");
    std::fs::create_dir_all(&dest).unwrap();
    let project = vinepalmaflow_lib::models::Project {
        meta: sample_project("MD 往返测试"),
        body: "## 关键里程碑\n- [ ] 灰度发布\n- [x] 调研\n".into(),
        folder: "test-folder".into(),
    };

    let md = export::export_project_md(&project, &dest.join("roundtrip.md")).unwrap();
    let csv = export::export_project_csv(&project, &dest.join("roundtrip.csv"), ',').unwrap();
    let json = export::export_project_json(&project, &dest.join("roundtrip.json")).unwrap();
    assert!(md.exists() && csv.exists() && json.exists());

    let ws2 = TempDir::new().unwrap();
    workspace::init_dirs(ws2.path()).unwrap();
    let imported = import::import_md_file(ws2.path(), &md, import::ImportStrategy::Rename).unwrap();
    assert_eq!(imported.meta.name, "MD 往返测试");
    assert_eq!(imported.meta.tags, Some(vec!["测试".to_string()]));
    assert_eq!(imported.body, "# MD 往返测试\n\n## 关键里程碑\n- [ ] 灰度发布\n- [x] 调研\n");

    let json_val: serde_json::Value = serde_json::from_str(&std::fs::read_to_string(&json).unwrap()).unwrap();
    assert_eq!(json_val["meta"]["priority"], "P0");
    assert_eq!(json_val["tasks"].as_array().unwrap().len(), 2);
}

#[test]
fn export_html_print_friendly() {
    let tmp = TempDir::new().unwrap();
    let dest = tmp.path().join("print.html");
    let project = vinepalmaflow_lib::models::Project {
        meta: sample_project("HTML 测试 <项目>"),
        body: "## 关键里程碑\n- [ ] 开发落地\n\n| 字段 | 值 |\n|------|----|\n| 说明 | 打印测试 |\n".into(),
        folder: "test-html".into(),
    };

    let path = export::export_project_html(&project, &dest).unwrap();
    assert!(path.exists());
    let content = std::fs::read_to_string(&path).unwrap();
    assert!(content.contains("<html"));
    assert!(content.contains(&"HTML 测试 &lt;项目&gt;".to_string()), "应转义特殊字符");
    assert!(content.contains("任务明细"));
    assert!(content.contains("<table>"), "正文 Markdown 表格应被渲染");
    assert!(content.contains("项目正文"));
}

#[test]
fn export_all_markdown_generates_summary() {
    let ws = TempDir::new().unwrap();
    workspace::init_dirs(ws.path()).unwrap();
    let meta = sample_project("汇总项目 A");
    let project = workspace::create_project(ws.path(), meta, "## 目标\n".into()).unwrap();
    let _ = project;

    let dest = TempDir::new().unwrap().path().join("all");
    let paths = export::export_all_markdown(ws.path(), &dest).unwrap();
    assert!(paths.len() >= 2);
    assert!(dest.join("汇总视图.md").is_file());
}

#[test]
fn change_log_records_and_prunes() {
    let old = vinepalmaflow_lib::models::Project {
        meta: sample_project("变更记录测试"),
        body: "旧正文".into(),
        folder: "test-change".into(),
    };
    let mut new = old.clone();
    new.meta.name = "变更记录测试 v2".into();
    new.meta.progress = Some(80);
    new.body = "新正文".into();

    let changes = vinepalmaflow_lib::change_log::diff_meta(&old, &new);
    assert!(changes.iter().any(|c| c.field == "name"));
    assert!(changes.iter().any(|c| c.field == "progress"));
    assert!(changes.iter().any(|c| c.field == "正文"));

    // append to log (writes under ~/LocalFlowWorkspace; tolerate if unavailable)
    let _ = vinepalmaflow_lib::change_log::append_changes(&new, changes.clone());
    let loaded = vinepalmaflow_lib::change_log::load_changes_since(&new, 30);
    assert!(!loaded.is_empty());
}

#[test]
fn template_package_roundtrip() {
    use std::io::Write;

    // build a .localflow-template zip on the fly
    let pkg_dir = TempDir::new().unwrap();
    let pkg_path = pkg_dir.path().join("sprint-tsk.localflow-template");
    {
        let file = std::fs::File::create(&pkg_path).unwrap();
        let mut zw = zip::ZipWriter::new(file);
        let opts = zip::write::SimpleFileOptions::default().compression_method(zip::CompressionMethod::Stored);
        zw.start_file("manifest.yaml", opts).unwrap();
        zw.write_all("template_id: \"sprint-tsk\"\nname: \"冲刺任务模板\"\ndescription: \"按冲刺管理任务\"\nmode: standard\nicon: \"🏃\"\n".as_bytes())
            .unwrap();
        zw.start_file("fields.yaml", opts).unwrap();
        zw.write_all("- id: sprint\n  label: 冲刺\n  type: text\n  prompt: \"所属冲刺编号\"\n".as_bytes())
            .unwrap();
        zw.finish().unwrap();
    }

    let ws = TempDir::new().unwrap();
    workspace::init_dirs(ws.path()).unwrap();
    let tpl = vinepalmaflow_lib::import::import_template_package(ws.path(), &pkg_path).unwrap();
    assert_eq!(tpl.template_id, "sprint-tsk");
    assert_eq!(tpl.fields.len(), 1);
    assert_eq!(tpl.fields[0].id, "sprint");

    let custom = vinepalmaflow_lib::templates::load_custom_templates(ws.path());
    assert_eq!(custom.len(), 1);
    assert_eq!(custom[0].template_id, "sprint-tsk");
}
