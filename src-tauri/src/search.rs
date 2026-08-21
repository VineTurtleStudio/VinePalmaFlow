use crate::models::{ProjectSummary, SearchResult};
use crate::workspace;
use crate::Error;
use std::fs;
use std::path::{Path, PathBuf};

fn md_files_in(dir: &Path) -> Vec<PathBuf> {
    let Ok(rd) = fs::read_dir(dir) else {
        return Vec::new();
    };
    let mut files: Vec<PathBuf> = rd
        .filter_map(|e| e.ok().map(|e| e.path()))
        .filter(|p| p.is_file() && p.extension().map_or(false, |x| x == "md"))
        .collect();
    files.sort();
    files
}

fn search_file(
    path: &Path,
    summary: &ProjectSummary,
    rel: &str,
    q: &str,
    limit: usize,
    out: &mut Vec<SearchResult>,
) {
    let Ok(content) = fs::read_to_string(path) else {
        return;
    };
    for (i, line) in content.lines().enumerate() {
        if !line.to_lowercase().contains(q) {
            continue;
        }
        out.push(SearchResult {
            project_id: summary.meta.id.clone(),
            project_name: summary.meta.name.clone(),
            folder: summary.folder.clone(),
            file: rel.to_string(),
            line: (i + 1) as u32,
            snippet: line.trim().chars().take(200).collect(),
        });
        if out.len() >= limit {
            return;
        }
    }
}

/// 全工作区搜索（project.md + tasks/*.md），大小写不敏感。
pub fn search_all(ws: &Path, query: &str, limit: usize) -> Result<Vec<SearchResult>, Error> {
    let q = query.trim().to_lowercase();
    if q.len() < 2 {
        return Ok(Vec::new());
    }
    let projects = workspace::list_projects(ws)?;
    let mut out = Vec::new();
    for s in projects {
        let dir = ws.join(&s.folder);
        search_file(&dir.join(workspace::PROJECT_FILE), &s, workspace::PROJECT_FILE, &q, limit, &mut out);
        if out.len() >= limit {
            break;
        }
        let tasks_dir = dir.join("tasks");
        if tasks_dir.is_dir() {
            for f in md_files_in(&tasks_dir) {
                let rel = format!(
                    "tasks/{}",
                    f.file_name().map(|n| n.to_string_lossy().to_string()).unwrap_or_default()
                );
                search_file(&f, &s, &rel, &q, limit, &mut out);
                if out.len() >= limit {
                    break;
                }
            }
        }
        if out.len() >= limit {
            break;
        }
    }
    out.truncate(limit);
    Ok(out)
}