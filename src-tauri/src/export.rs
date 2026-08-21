use crate::change_log;
use crate::models::Project;
use crate::{Error, workspace};
use calamine::{Data, Range, Reader, open_workbook_auto};
use chrono::{NaiveDate, Utc};
use pulldown_cmark::{Options, Parser, html};
use rust_xlsxwriter::{
    Color, ConditionalFormatCell, ConditionalFormatCellRule, Format, FormatAlign, FormatBorder,
    Workbook,
};
use std::io::{BufWriter, Write};
use std::path::{Path, PathBuf};

pub const SUMMARY_FILE: &str = "汇总视图.md";



pub fn export_project_md(project: &Project, dest: &Path) -> Result<PathBuf, Error> {
    let content = crate::frontmatter::project_to_file_content(&project.meta, &project.body)?;
    std::fs::write(dest, content)?;
    Ok(dest.to_path_buf())
}

/// 打印友好版 HTML 导出：项目概览 + 任务明细 + 渲染后的正文，可在浏览器中「另存为 PDF」。
pub fn export_project_html(project: &Project, dest: &Path) -> Result<PathBuf, Error> {
    let m = &project.meta;
    let status_text = status_cn(&m.status_label(), m.deadline.as_deref(), m.progress, false);
    let tasks = extract_tasks(project);
    let mut task_rows = String::new();
    for t in &tasks {
        task_rows.push_str(&format!(
            "<tr><td>{}</td><td>{}</td><td>{}</td><td>{}</td><td>{}</td></tr>",
            esc(&t.name),
            esc(&t.assignee),
            esc(&t.status),
            esc(&t.deadline),
            esc(&t.priority),
        ));
    }
    let body_html = markdown_to_html(&project.body);
    let doc = format!(
        r#"<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8"/>
<title>{title}</title>
<style>
  body{{font-family:system-ui,'PingFang SC','Microsoft YaHei',sans-serif;max-width:820px;margin:32px auto;padding:0 24px;color:#26301f;line-height:1.7}}
  h1{{font-size:24px}} h2{{font-size:18px;margin-top:28px;border-bottom:1px solid #e5e7eb;padding-bottom:6px}}
  h3{{font-size:15px}} table{{border-collapse:collapse;width:100%;margin:12px 0}}
  th,td{{border:1px solid #d1d5db;padding:6px 10px;font-size:13px;text-align:left}} th{{background:#f3f4f6}}
  .meta{{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin:16px 0}}
  .meta div{{border:1px solid #e5e7eb;border-radius:8px;padding:8px 12px;font-size:13px}}
  .meta b{{display:block;color:#6b7280;font-size:11px;font-weight:500}}
  ul.task-list{{list-style:none;padding-left:0}} li{{margin:2px 0}}
  blockquote{{border-left:3px solid #d1d5db;margin:8px 0;padding:2px 12px;color:#4b5563}}
  code{{background:#f3f4f6;border-radius:4px;padding:1px 5px;font-size:90%}}
  pre{{background:#f8fafc;border:1px solid #e5e7eb;border-radius:8px;padding:12px;overflow:auto}}
  @media print{{body{{margin:0;padding:0}}}}
</style>
</head>
<body>
<h1>{name}</h1>
<div class="meta">
  <div><b>负责人</b>{owner}</div>
  <div><b>状态</b>{status}</div>
  <div><b>截止日期</b>{deadline}</div>
  <div><b>进度</b>{progress}</div>
</div>
<h2>任务明细</h2>
<table>
<thead><tr><th>任务名称</th><th>负责人</th><th>状态</th><th>截止日期</th><th>优先级</th></tr></thead>
<tbody>{task_rows}</tbody>
</table>
<h2>项目正文</h2>
{body_html}
</body>
</html>"#,
        title = esc(&format!("{} · VinePalmaFlow", m.name)),
        name = esc(&m.name),
        owner = esc(m.owner.as_deref().unwrap_or("—")),
        status = esc(&status_text),
        deadline = esc(m.deadline.as_deref().unwrap_or("—")),
        progress = m
            .progress
            .map(|p| format!("{p}%"))
            .unwrap_or_else(|| "—".into()),
        task_rows = task_rows,
        body_html = body_html,
    );
    std::fs::write(dest, doc)?;
    Ok(dest.to_path_buf())
}

fn markdown_to_html(md: &str) -> String {
    let mut options = Options::all();
    options.insert(Options::ENABLE_TABLES);
    options.insert(Options::ENABLE_STRIKETHROUGH);
    options.insert(Options::ENABLE_TASKLISTS);
    options.insert(Options::ENABLE_HEADING_ATTRIBUTES);
    let parser = Parser::new_ext(md, options);
    let mut out = String::new();
    html::push_html(&mut out, parser);
    out
}

fn esc(s: &str) -> String {
    s.replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
        .replace('"', "&quot;")
}

pub fn export_project_json(project: &Project, dest: &Path) -> Result<PathBuf, Error> {
    let value = serde_json::json!({
        "format": "vinepalmaflow",
        "version": 1,
        "meta": project.meta,
        "body": project.body,
        "tasks": extract_tasks(project),
    });
    let json = serde_json::to_string_pretty(&value)?;
    std::fs::write(dest, json)?;
    Ok(dest.to_path_buf())
}

pub fn export_project_csv(project: &Project, dest: &Path, delimiter: char) -> Result<PathBuf, Error> {
    export_project_csv_with(project, dest, delimiter, None)
}

pub fn export_project_csv_preset(
    project: &Project,
    dest: &Path,
    delimiter: char,
    columns: &[String],
) -> Result<PathBuf, Error> {
    export_project_csv_with(project, dest, delimiter, Some(columns))
}

fn export_project_csv_with(
    project: &Project,
    dest: &Path,
    delimiter: char,
    columns: Option<&[String]>,
) -> Result<PathBuf, Error> {
    let fields = resolve_task_fields(columns);
    let tasks = extract_tasks(project);
    let header: Vec<String> = fields.iter().map(|f| header_for_task_field(f).to_string()).collect();
    let mut out: Vec<String> = vec![join_csv_row(&header, delimiter)];
    for t in &tasks {
        let cells: Vec<String> = fields.iter().map(|f| task_row_cell(t, f)).collect();
        out.push(join_csv_row(&cells, delimiter));
    }
    let mut writer = BufWriter::new(std::fs::File::create(dest)?);
    writer.write_all(out.join("\n").as_bytes())?;
    writer.flush()?;
    Ok(dest.to_path_buf())
}

fn join_csv_row(fields: &[String], delimiter: char) -> String {
    fields
        .iter()
        .map(|f| {
            let quoted = f.replace('"', "\"\"");
            if quoted.contains(delimiter) || quoted.contains('"') || quoted.contains('\n') {
                format!("\"{quoted}\"")
            } else {
                quoted.to_string()
            }
        })
        .collect::<Vec<_>>()
        .join(&delimiter.to_string())
}


pub fn export_project_xlsx(project: &Project, dest: &Path, include_history: bool) -> Result<PathBuf, Error> {
    export_project_xlsx_with(project, dest, include_history, None)
}

pub fn export_project_xlsx_preset(
    project: &Project,
    dest: &Path,
    include_history: bool,
    columns: &[String],
) -> Result<PathBuf, Error> {
    export_project_xlsx_with(project, dest, include_history, Some(columns))
}

fn export_project_xlsx_with(
    project: &Project,
    dest: &Path,
    include_history: bool,
    columns: Option<&[String]>,
) -> Result<PathBuf, Error> {
    let mut wb = Workbook::new();

    overview_sheet(&mut wb, project)?;
    tasks_sheet(&mut wb, project, columns)?;
    if include_history {
        history_sheet(&mut wb, project)?;
    }
    metadata_sheet(&mut wb, project)?;

    wb.save(dest)?;
    Ok(dest.to_path_buf())
}

/// 元数据 Sheet：完整 YAML Front Matter 与正文，供再次导入时零信息丢失。
fn metadata_sheet(wb: &mut Workbook, project: &Project) -> Result<(), Error> {
    let sheet = wb.add_worksheet();
    sheet.set_name("元数据").map_err(|e| Error::Io(e.to_string()))?;
    sheet.set_column_width(0, 28)?;
    sheet.set_column_width(1, 96)?;
    let yaml = crate::frontmatter::build_front_matter(&project.meta)?;
    let inner = yaml
        .trim_start_matches("---\n")
        .trim_end_matches("---\n")
        .trim();
    let rows: Vec<(&str, String)> = vec![
        ("字段", "值".into()),
        ("格式", "vinepalmaflow".into()),
        ("YAML Front Matter", inner.to_string()),
        ("正文 Markdown", project.body.clone()),
    ];
    for (i, (k, v)) in rows.iter().enumerate() {
        let r = i as u32;
        if i == 0 {
            sheet.write_string_with_format(r, 0, k.to_string(), &header_format())?;
            sheet.write_string_with_format(r, 1, v.to_string(), &header_format())?;
        } else {
            sheet.write_string(r, 0, k.to_string())?;
            sheet.write_string(r, 1, v.to_string())?;
        }
    }
    sheet.set_row_height(3, 220.0)?;
    Ok(())
}

fn header_format() -> Format {
    Format::new()
        .set_bold()
        .set_background_color(Color::RGB(0xDDEBF7))
        .set_border(FormatBorder::Thin)
        .set_font_color(Color::RGB(0x1F4E79))
        .set_align(FormatAlign::Center)
        .set_align(FormatAlign::VerticalCenter)
}

fn overview_sheet(wb: &mut Workbook, project: &Project) -> Result<(), Error> {
    let sheet = wb.add_worksheet();
    sheet.set_name("项目概览").map_err(|e| Error::Io(e.to_string()))?;
    sheet.set_column_width(0, 18)?;
    sheet.set_column_width(1, 32)?;

    let title = Format::new().set_bold().set_font_size(14.0);
    sheet.merge_range(0, 0, 0, 1, "项目概览", &title)?;

    let m = &project.meta;
    let status_text = status_cn(&m.status_label(), m.deadline.as_deref(), m.progress, false);
    let rows: Vec<(&str, String)> = vec![
        ("项目名称", m.name.clone()),
        ("负责人", m.owner.clone().unwrap_or_default()),
        ("创建日期", m.created_at.clone()),
        ("截止日期", m.deadline.clone().unwrap_or_default()),
        ("当前状态", status_text),
        ("完成进度", m.progress.map(|p| format!("{p}%")).unwrap_or_default()),
        ("优先级", m.priority.clone().unwrap_or_default()),
        ("标签", m.tags.clone().unwrap_or_default().join(", ")),
        ("模板", project_template_name(m.template_id.as_deref())),
    ];

    let mut row = 2;
    for (k, v) in &rows {
        sheet.write_string_with_format(row, 0, *k, &Format::new().set_bold())?;
        sheet.write_string(row, 1, v)?;
        row += 1;
    }

    let status_row = 6u32; // 当前状态 value row (0-based)
    let green = Format::new().set_background_color(Color::RGB(0xC6EFCE)).set_font_color(Color::RGB(0x006100));
    let yellow = Format::new().set_background_color(Color::RGB(0xFFEB9C)).set_font_color(Color::RGB(0x9C6500));
    let red = Format::new().set_background_color(Color::RGB(0xFFC7CE)).set_font_color(Color::RGB(0x9C0006));
    let ok = ConditionalFormatCell::new()
        .set_rule(ConditionalFormatCellRule::EqualTo("已完成"))
        .set_format(green);
    let warn = ConditionalFormatCell::new()
        .set_rule(ConditionalFormatCellRule::EqualTo("进行中"))
        .set_format(yellow);
    let err = ConditionalFormatCell::new()
        .set_rule(ConditionalFormatCellRule::EqualTo("已延期"))
        .set_format(red);
    sheet.add_conditional_format(status_row, 1, status_row, 1, &ok)?;
    sheet.add_conditional_format(status_row, 1, status_row, 1, &warn)?;
    sheet.add_conditional_format(status_row, 1, status_row, 1, &err)?;

    let progress_row = 7u32;
    let pct = Format::new().set_num_format("0%");
    let progress = m.progress.unwrap_or(0) as f64 / 100.0;
    sheet.write_number_with_format(progress_row, 1, progress, &pct)?;

    Ok(())
}


fn tasks_sheet(wb: &mut Workbook, project: &Project, columns: Option<&[String]>) -> Result<(), Error> {
    let sheet = wb.add_worksheet();
    sheet.set_name("任务明细").map_err(|e| Error::Io(e.to_string()))?;
    let fields = resolve_task_fields(columns);
    let headers: Vec<String> = fields.iter().map(|f| header_for_task_field(f).to_string()).collect();
    for (i, h) in headers.iter().enumerate() {
        sheet.write_string_with_format(0, i as u16, h.to_string(), &header_format())?;
        sheet.set_column_width(i as u16, 16)?;
    }
    let tasks = extract_tasks(project);
    for (i, t) in tasks.iter().enumerate() {
        let r = (i + 1) as u32;
        for (j, f) in fields.iter().enumerate() {
            let col = j as u16;
            if *f == "points" {
                sheet.write_number(r, col, t.points)?;
            } else {
                sheet.write_string(r, col, task_row_cell(t, f))?;
            }
        }
    }
    let last = tasks.len() as u32 + 1;
    if last > 1 {
        if let Some(status_col) = fields.iter().position(|f| *f == "status") {
            let green = Format::new().set_background_color(Color::RGB(0xC6EFCE)).set_font_color(Color::RGB(0x006100));
            let yellow = Format::new().set_background_color(Color::RGB(0xFFEB9C)).set_font_color(Color::RGB(0x9C6500));
            let g = ConditionalFormatCell::new()
                .set_rule(ConditionalFormatCellRule::EqualTo("已完成"))
                .set_format(green);
            let w = ConditionalFormatCell::new()
                .set_rule(ConditionalFormatCellRule::EqualTo("进行中"))
                .set_format(yellow);
            sheet.add_conditional_format(1, status_col as u16, last, status_col as u16, &g)?;
            sheet.add_conditional_format(1, status_col as u16, last, status_col as u16, &w)?;
        }
    }
    Ok(())
}

// ---------------------------------------------------------------------------
// Preset column resolution
// ---------------------------------------------------------------------------

const DEFAULT_TASK_FIELDS: [&str; 8] = ["id", "name", "assignee", "deadline", "status", "priority", "points", "remark"];

/// 将模板导出预设的列名（支持 "tasks.bar" / "clients.stage" 等点分形式）映射为任务行字段。
fn normalize_task_column(col: &str) -> Option<&'static str> {
    let c = col
        .trim()
        .split('.')
        .last()
        .unwrap_or(col.trim())
        .to_lowercase();
    match c.as_str() {
        "id" | "任务id" | "编号" | "taskid" => Some("id"),
        "name" | "title" | "任务名称" | "名称" | "任务名" | "task_name" => Some("name"),
        "assignee" | "owner" | "负责人" | "经办人" | "contact" => Some("assignee"),
        "deadline" | "due" | "due_date" | "截止日期" | "日期" | "publish_date" | "next_date" => Some("deadline"),
        "status" | "stage" | "状态" | "阶段" => Some("status"),
        "priority" | "优先级" => Some("priority"),
        "points" | "story_points" | "score" | "故事点" => Some("points"),
        "remark" | "notes" | "note" | "备注" | "说明" | "next_action" => Some("remark"),
        "tags" | "标签" => Some("tags"),
        _ => None,
    }
}

fn header_for_task_field(field: &str) -> &'static str {
    match field {
        "id" => "任务ID",
        "name" => "任务名称",
        "assignee" => "负责人",
        "deadline" => "截止日期",
        "status" => "状态",
        "priority" => "优先级",
        "points" => "故事点",
        "remark" => "备注",
        "tags" => "标签",
        _ => "其他",
    }
}

fn resolve_task_fields(columns: Option<&[String]>) -> Vec<&'static str> {
    let Some(cols) = columns else {
        return DEFAULT_TASK_FIELDS.to_vec();
    };
    let mut out: Vec<&'static str> = Vec::new();
    for c in cols {
        if let Some(f) = normalize_task_column(c) {
            if !out.contains(&f) {
                out.push(f);
            }
        }
    }
    if out.is_empty() {
        DEFAULT_TASK_FIELDS.to_vec()
    } else {
        out
    }
}

fn task_row_cell(t: &TaskRow, field: &str) -> String {
    match field {
        "id" => t.id.clone(),
        "name" => t.name.clone(),
        "assignee" => t.assignee.clone(),
        "deadline" => t.deadline.clone(),
        "status" => t.status.clone(),
        "priority" => t.priority.clone(),
        "points" => format_float(t.points),
        "remark" => t.remark.clone(),
        "tags" => t.tags.join(";"),
        _ => String::new(),
    }
}

fn history_sheet(wb: &mut Workbook, project: &Project) -> Result<(), Error> {
    let sheet = wb.add_worksheet();
    sheet.set_name("变更历史").map_err(|e| Error::Io(e.to_string()))?;
    let headers = ["时间", "字段", "旧值", "新值"];
    for (i, h) in headers.iter().enumerate() {
        sheet.write_string_with_format(0, i as u16, *h, &header_format())?;
        sheet.set_column_width(i as u16, 28)?;
    }
    let changes = change_log::load_changes_since(project, 30);
    for (i, c) in changes.iter().enumerate() {
        let r = (i + 1) as u32;
        sheet.write_string(r, 0, &c.at)?;
        sheet.write_string(r, 1, &c.field)?;
        sheet.write_string(r, 2, &c.old)?;
        sheet.write_string(r, 3, &c.new)?;
    }
    Ok(())
}

fn project_template_name(id: Option<&str>) -> String {
    match id {
        Some(id) => crate::templates::get_template_details(id).map(|(_, n)| n).unwrap_or_else(|| id.to_string()),
        None => "无".into(),
    }
}

pub fn export_all_markdown(ws: &Path, dest: &Path) -> Result<Vec<PathBuf>, Error> {
    std::fs::create_dir_all(dest)?;
    let mut paths = Vec::new();
    for summary in workspace::list_projects(ws)? {
        let project = workspace::read_project_file(&ws.join(&summary.folder).join("project.md"))?;
        let meta = &project.meta;
        let file = dest.join(format!("{}.md", safe_name(&meta.name)));
        paths.push(export_project_md(&project, &file)?);
    }
    let summary = workspace::generate_summary(ws)?;
    let sp = dest.join(SUMMARY_FILE);
    std::fs::write(&sp, summary)?;
    paths.push(sp);
    Ok(paths)
}

fn safe_name(name: &str) -> String {
    name.chars()
        .map(|c| if c.is_alphanumeric() || c == '-' || c == '_' { c } else { '_' })
        .collect()
}

// ---------------------------------------------------------------------------
// Task extraction (shared by xlsx / csv / json)
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Default, serde::Serialize)]
pub struct TaskRow {
    pub id: String,
    pub name: String,
    pub assignee: String,
    pub deadline: String,
    pub status: String,
    pub priority: String,
    pub points: f64,
    pub remark: String,
    pub tags: Vec<String>,
}

fn pick(item: &serde_yaml::Value, keys: &[&str]) -> Option<String> {
    for k in keys {
        if let Some(v) = item.get(k) {
            if let Some(s) = v.as_str() {
                let s = s.trim();
                if !s.is_empty() {
                    return Some(s.to_string());
                }
            } else if let Some(i) = v.as_i64() {
                return Some(i.to_string());
            } else if let Some(f) = v.as_f64() {
                return Some(format_float(f));
            }
        }
    }
    None
}

pub fn extract_tasks(project: &Project) -> Vec<TaskRow> {
    let mut out: Vec<TaskRow> = Vec::new();
    let custom = project.meta.custom_fields.clone().unwrap_or_default();
    let mut any_list = false;
    if let Some(cm) = custom.as_mapping() {
        for (key, val) in cm {
            if let Some(items) = val.as_sequence() {
                for item in items {
                    out.push(task_from_item(key.as_str().unwrap_or(""), item));
                }
                any_list = true;
            }
        }
    }
    if !any_list {
        for (idx, task) in parse_checklist(&project.body).into_iter().enumerate() {
            let mut t = TaskRow::default();
            t.id = format!("T{:03}", idx + 1);
            t.name = task.0;
            t.status = if task.1 { "已完成".to_string() } else { "待办".to_string() };
            out.push(t);
        }
    }
    dedup_sort(&mut out);
    out
}

fn task_from_item(list_key: &str, item: &serde_yaml::Value) -> TaskRow {
    let mut t = TaskRow::default();
    t.id = pick(item, &["id", "task_id", "编号"]).unwrap_or_default();
    t.name = pick(item, &["name", "title", "task_name", "client_name", "summary", "objective", "chapter"])
        .or_else(|| {
            if list_key.is_empty() { None } else { Some(format!("{list_key} 条目")) }
        })
        .unwrap_or_else(|| "未命名".into());
    t.assignee = pick(item, &["assignee", "owner", "contact", "requester"]).unwrap_or_default();
    t.deadline = pick(item, &["deadline", "due_date", "due", "publish_date", "next_date"]).unwrap_or_default();
    t.status = pick(item, &["status", "stage"]).unwrap_or_default();
    t.priority = pick(item, &["priority"]).unwrap_or_default();
    t.remark = pick(item, &["remark", "notes", "note", "description", "next_action"])
        .unwrap_or_default();
    if let Some(p) = pick(item, &["points", "story_points", "score"]) {
        t.points = p.parse::<f64>().unwrap_or(0.0);
    }
    if let Some(tags) = item.get("tags").and_then(|v| v.as_sequence()) {
        t.tags = tags.iter().filter_map(|v| v.as_str().map(|s| s.to_string())).collect();
    }
    if t.id.is_empty() {
        t.id = format!("T{:03}", 0);
    }
    t
}

fn dedup_sort(tasks: &mut Vec<TaskRow>) {
    let mut seen = std::collections::HashSet::new();
    let mut id = 1usize;
    for t in tasks.iter_mut() {
        if t.id.is_empty() || t.id.starts_with('T') && seen.contains(&t.id) {
            t.id = format!("T{:03}", id);
        }
        id += 1;
        seen.insert(t.id.clone());
    }
}

fn parse_checklist(body: &str) -> Vec<(String, bool)> {
    let mut out = Vec::new();
    for line in body.lines() {
        let line = line.trim();
        if line.starts_with("- [x]") || line.starts_with("- [X]") {
            out.push((line[5..].trim().to_string(), true));
        } else if line.starts_with("- [ ]") || line.starts_with("- [") {
            out.push((line[5..].trim().to_string(), false));
        }
    }
    out
}

fn status_cn(status: &str, deadline: Option<&str>, progress: Option<u32>, _is_task: bool) -> String {
    if status == "已删除" {
        return "已删除".into();
    }
    if status == "已归档" {
        return "已归档".into();
    }
    if let Some(d) = deadline {
        if let Ok(date) = NaiveDate::parse_from_str(d, "%Y-%m-%d") {
            let today = Utc::now().date_naive();
            if date < today && progress.unwrap_or(0) < 100 {
                return "已延期".into();
            }
        }
    }
    if progress == Some(100) {
        return "已完成".into();
    }
    "进行中".into()
}

// ---------------------------------------------------------------------------
// XLSX import helpers
// ---------------------------------------------------------------------------

pub fn range_to_rows(range: &Range<Data>) -> Vec<Vec<String>> {
    let mut rows = Vec::new();
    for (r, row) in range.rows().enumerate() {
        let mut cells = Vec::new();
        if row.is_empty() {
            cells.push(format!("row_{r}"));
        }
        for cell in row {
            cells.push(cell_to_string(cell));
        }
        rows.push(cells);
    }
    rows
}

pub fn cell_to_string(cell: &Data) -> String {
    match cell {
        Data::String(s) => s.to_string(),
        Data::Float(f) => format_float(*f),
        Data::Int(i) => i.to_string(),
        Data::Bool(b) => b.to_string(),
        Data::DateTime(d) => d.to_string(),
        Data::Error(e) => format!("{e}"),
        Data::Empty => String::new(),
        Data::DateTimeIso(s) | Data::DurationIso(s) => s.to_owned(),
    }
}

fn format_float(f: f64) -> String {
    if f.fract() == 0.0 {
        (f as i64).to_string()
    } else {
        f.to_string()
    }
}

pub fn read_xlsx(path: &Path) -> Result<Vec<(String, Vec<Vec<String>>)>, Error> {
    let mut wb = open_workbook_auto(path).map_err(|e| Error::Io(e.to_string()))?;
    let names: Vec<String> = wb
        .sheet_names()
        .into_iter()
        .map(|s| s.to_owned())
        .collect();
    let mut sheets = Vec::new();
    for name in names {
        let range = match wb.worksheet_range(&name) {
            Ok(r) => r,
            Err(_) => continue,
        };
        sheets.push((name, range_to_rows(&range)));
    }
    Ok(sheets)
}

