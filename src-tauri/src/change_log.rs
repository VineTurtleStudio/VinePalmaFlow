use crate::models::Project;
use crate::Error;
use chrono::{Duration, Utc};
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChangeEntry {
    pub at: String,
    pub field: String,
    pub old: String,
    pub new: String,
}

#[derive(Debug, Default, Serialize, Deserialize)]
struct LogFile {
    project_id: String,
    changes: Vec<ChangeEntry>,
}

fn log_path(project: &Project) -> Result<std::path::PathBuf, Error> {
    let ws = crate::workspace::workspace_path()?;
    Ok(ws.join(".localflow").join("sync-log").join(format!("{}.json", crate::workspace::folder_key(&project.folder))))
}

pub fn append_changes(project: &Project, changes: Vec<ChangeEntry>) -> Result<(), Error> {
    if changes.is_empty() {
        return Ok(());
    }
    let path = log_path(project)?;
    let mut log: LogFile = if path.is_file() {
        let content = std::fs::read_to_string(&path)?;
        serde_json::from_str(&content).unwrap_or_default()
    } else {
        LogFile::default()
    };
    log.project_id = project.meta.id.clone();
    log.changes.extend(changes);
    let cutoff = Utc::now() - Duration::days(30);
    log.changes.retain(|c| parse_at(&c.at).map(|t| t >= cutoff).unwrap_or(true));
    if log.changes.len() > 2000 {
        let start = log.changes.len() - 2000;
        log.changes.drain(..start);
    }
    let json = serde_json::to_string_pretty(&log)?;
    std::fs::write(&path, json)?;
    Ok(())
}

pub fn load_changes_since(project: &Project, days: u32) -> Vec<ChangeEntry> {
    let Ok(path) = log_path(project) else {
        return Vec::new();
    };
    let Ok(content) = std::fs::read_to_string(&path) else {
        return Vec::new();
    };
    let Ok(log): Result<LogFile, _> = serde_json::from_str(&content) else {
        return Vec::new();
    };
    let cutoff = Utc::now() - Duration::days(days as i64);
    log.changes
        .into_iter()
        .filter(|c| parse_at(&c.at).map(|t| t >= cutoff).unwrap_or(true))
        .collect()
}

fn parse_at(s: &str) -> Option<chrono::DateTime<chrono::Utc>> {
    if let Ok(t) = chrono::DateTime::parse_from_rfc3339(s) {
        return Some(t.with_timezone(&Utc));
    }
    None
}

pub fn diff_meta(old: &Project, new: &Project) -> Vec<ChangeEntry> {
    let now = Utc::now().to_rfc3339();
    let old_meta = &old.meta;
    let new_meta = &new.meta;
    let mut out = Vec::new();
    let fields: &[(&str, fn(&crate::models::ProjectMeta) -> Option<String>)] = &[
        ("name", |m| Some(m.name.clone())),
        ("owner", |m| m.owner.clone()),
        ("deadline", |m| m.deadline.clone()),
        ("priority", |m| m.priority.clone()),
        ("progress", |m| m.progress.map(|p| p.to_string())),
        ("status", |m| Some(m.status_label())),
    ];
    for (field, getter) in fields {
        let a = getter(old_meta).unwrap_or_default();
        let b = getter(new_meta).unwrap_or_default();
        if a != b {
            out.push(ChangeEntry { at: now.clone(), field: field.to_string(), old: a, new: b });
        }
    }
    if old.body != new.body {
        out.push(ChangeEntry {
            at: now.clone(),
            field: "正文".into(),
            old: "…".into(),
            new: "…".into(),
        });
    }
    out
}