use serde::{Deserialize, Serialize};
use std::path::PathBuf;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum ProjectStatus {
    Active,
    Archived,
    Deleted,
}

impl ProjectStatus {
    pub fn label(&self) -> &'static str {
        match self {
            ProjectStatus::Active => "进行中",
            ProjectStatus::Archived => "已归档",
            ProjectStatus::Deleted => "已删除",
        }
    }
}

impl Default for ProjectStatus {
    fn default() -> Self {
        ProjectStatus::Active
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct ProjectMeta {
    pub id: String,
    pub name: String,
    #[serde(default)]
    pub status: ProjectStatus,
    pub created_at: String,
    #[serde(default)]
    pub updated_at: String,
    #[serde(default)]
    pub version: u32,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub owner: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub deadline: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub priority: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub progress: Option<u32>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub tags: Option<Vec<String>>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub parent_id: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub sync_devices: Option<Vec<String>>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub template_id: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub custom_fields: Option<serde_yaml::Value>,
}

impl ProjectMeta {
    pub fn status_label(&self) -> String {
        self.status.label().to_string()
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Project {
    pub meta: ProjectMeta,
    pub body: String,
    pub folder: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProjectSummary {
    pub meta: ProjectMeta,
    pub folder: String,
    pub has_tasks_dir: bool,
    pub task_count: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TrashEntry {
    pub folder: String,
    pub meta: ProjectMeta,
    pub attach_count: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AttachmentInfo {
    pub name: String,
    pub size: u64,
    pub modified: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SnapshotInfo {
    pub timestamp: String,
    pub time: String,
    pub size: u64,
    pub summary: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SyncStatusEntry {
    pub id: String,
    pub name: String,
    pub folder: String,
    pub version: u32,
    pub status: String,
    pub updated_at: String,
    pub hash: String,
    pub project_count: usize,
    pub task_count: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct SyncStatusFile {
    pub version: String,
    pub indexed_at: String,
    pub projects: Vec<SyncStatusEntry>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ExternalChangeInfo {
    pub project_id: String,
    pub name: String,
    pub file: String,
    pub folder: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SearchResult {
    pub project_id: String,
    pub project_name: String,
    pub folder: String,
    pub file: String,
    pub line: u32,
    pub snippet: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DeviceInfo {
    pub id: String,
    pub name: String,
    pub os: String,
    pub addr: String,
    pub port: u16,
    pub online: bool,
    pub trusted: bool,
    pub last_seen: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TrustedDevice {
    pub id: String,
    pub name: String,
    pub first_seen: String,
    pub last_seen: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PairSession {
    pub device_id: String,
    pub device_name: String,
    pub device_addr: String,
    pub device_port: u16,
    /// 本机屏幕上显示的 6 位配对码
    pub code_local: String,
    /// 对方设备屏幕上显示的 6 位配对码（待用户核对输入）
    pub code_peer: String,
    /// 对方已正确输入过我们的配对码 => 我们信任对方
    pub peer_verified: bool,
    /// 我们已正确输入对方的配对码（对方已确认）
    pub self_verified: bool,
    /// pairing | done
    pub status: String,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SyncFile {
    /// 相对项目文件夹的路径，如 "project.md" 或 "tasks/001-xxx.md"
    pub rel_path: String,
    pub content: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProjectBundle {
    pub project_id: String,
    pub name: String,
    pub updated_at: String,
    pub meta: ProjectMeta,
    pub files: Vec<SyncFile>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SyncConflict {
    pub id: String,
    pub peer_id: String,
    pub project_id: String,
    pub project_name: String,
    pub file: String,
    pub mine: String,
    pub theirs: String,
    pub base: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct SyncSummary {
    pub devices: usize,
    pub pushed: usize,
    pub pulled: usize,
    pub merged: usize,
    pub conflicted: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TemplateField {
    pub id: String,
    #[serde(rename = "type")]
    pub field_type: String,
    pub label: String,
    #[serde(default)]
    pub required: bool,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub options: Option<Vec<String>>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub default: Option<serde_yaml::Value>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub placeholder: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub item_template: Option<Vec<TemplateField>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TemplateView {
    pub name: String,
    #[serde(rename = "type")]
    pub view_type: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub group_by: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub sort_by: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ExportPreset {
    pub name: String,
    #[serde(rename = "format", default = "default_export_format")]
    pub format: String,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub columns: Vec<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub template: Option<String>,
}

fn default_export_format() -> String {
    "xlsx".to_string()
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Template {
    pub template_id: String,
    pub name: String,
    pub description: String,
    pub icon: String,
    #[serde(default)]
    pub mode: String,
    pub fields: Vec<TemplateField>,
    pub views: Vec<TemplateView>,
    #[serde(default)]
    pub fields_order: Vec<String>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub export_presets: Vec<ExportPreset>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ThemeColors {
    pub primary: String,
    pub secondary: String,
    pub accent: String,
    pub bg: String,
    pub text: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ThemeConfig {
    /// auto | preset | custom
    pub mode: String,
    /// 仅 preset：选中的预设 id
    pub preset_id: Option<String>,
    /// 仅 custom：手动自定义颜色
    pub custom: Option<ThemeColors>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AppConfig {
    pub mode: String,
    pub theme: String,
    pub workspace_path: Option<PathBuf>,
    pub last_project_id: Option<String>,
    pub theme_config: Option<ThemeConfig>,
}

impl Default for AppConfig {
    fn default() -> Self {
        Self {
            mode: "standard".to_string(),
            theme: "dark".to_string(),
            workspace_path: None,
            last_project_id: None,
            theme_config: None,
        }
    }
}
