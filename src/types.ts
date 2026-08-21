export type ProjectStatus = "active" | "archived" | "deleted";

export interface ProjectMeta {
  id: string;
  name: string;
  status: ProjectStatus;
  created_at: string;
  updated_at: string;
  version: number;
  owner?: string;
  deadline?: string;
  priority?: string;
  progress?: number;
  tags?: string[];
  parent_id?: string;
  sync_devices?: string[];
  template_id?: string;
  custom_fields?: Record<string, unknown> | null;
}

export interface Project {
  meta: ProjectMeta;
  body: string;
  folder: string;
}

export interface ProjectSummary {
  meta: ProjectMeta;
  folder: string;
  has_tasks_dir: boolean;
  task_count: number;
}

export interface TrashEntry {
  folder: string;
  meta: ProjectMeta;
  attach_count: number;
}

export interface AttachmentInfo {
  name: string;
  size: number;
  modified: string;
}

export type FieldType = "string" | "text" | "textarea" | "number" | "select" | "date" | "tags" | "list";

export interface TemplateField {
  id: string;
  type: FieldType;
  label: string;
  required?: boolean;
  options?: string[];
  default?: unknown;
  placeholder?: string;
  item_template?: TemplateField[];
}

export interface TemplateView {
  name: string;
  type: "kanban" | "list" | "card";
  group_by?: string;
  sort_by?: string;
}

export interface ExportPreset {
  name: string;
  format: "md" | "xlsx" | "csv" | "json";
  columns?: string[];
  template?: string | null;
}

export interface Template {
  template_id: string;
  name: string;
  description: string;
  icon: string;
  mode: string;
  fields: TemplateField[];
  views: TemplateView[];
  fields_order: string[];
  export_presets?: ExportPreset[];
}

export interface AppConfig {
  mode: "standard" | "pro";
  theme: "dark" | "light";
  workspace_path?: string | null;
  last_project_id?: string | null;
  theme_config?: ThemeConfig | null;
}

export type ThemeMode = "auto" | "preset" | "custom";

export interface ThemeColors {
  primary: string;
  secondary: string;
  accent: string;
  bg: string;
  text: string;
}

export interface ThemeConfig {
  mode: ThemeMode;
  preset_id?: string | null;
  custom?: ThemeColors | null;
}

export type UiMode = "standard" | "pro";
export type ViewType = "kanban" | "list" | "card";

export interface ConflictInfo {
  name: string;
  existing_id: string | null;
  exists: boolean;
}

export interface ImportPreview {
  kind: "md" | "xlsx" | "folder" | "template";
  source: string;
  name: string;
  file_count: number;
  conflicts: ConflictInfo[];
}

export type ImportStrategy = "overwrite" | "rename" | "merge";

export interface ChangeEntry {
  at: string;
  field: string;
  old: string;
  new: string;
}

export interface SnapshotInfo {
  timestamp: string;
  time: string;
  size: number;
  summary: string;
}

export interface SyncStatusEntry {
  id: string;
  name: string;
  folder: string;
  version: number;
  status: string;
  updated_at: string;
  hash: string;
  project_count: number;
  task_count: number;
}

export interface SyncStatusFile {
  version: string;
  indexed_at: string;
  projects: SyncStatusEntry[];
}

export interface ExternalChangeInfo {
  project_id: string;
  name: string;
  file: string;
  folder: string;
}

export interface SearchResult {
  project_id: string;
  project_name: string;
  folder: string;
  file: string;
  line: number;
  snippet: string;
}

export interface DeviceInfo {
  id: string;
  name: string;
  os: string;
  addr: string;
  port: number;
  online: boolean;
  trusted: boolean;
  last_seen: string;
}

export interface PairSession {
  device_id: string;
  device_name: string;
  device_addr: string;
  device_port: number;
  code_local: string;
  code_peer: string;
  peer_verified: boolean;
  self_verified: boolean;
  status: string;
  created_at: string;
}

export interface SyncConflict {
  id: string;
  peer_id: string;
  project_id: string;
  project_name: string;
  file: string;
  mine: string;
  theirs: string;
  base: string;
}

export interface SyncSummary {
  devices: number;
  pushed: number;
  pulled: number;
  merged: number;
  conflicted: number;
}