import { invoke } from "@tauri-apps/api/core";
import type { AppConfig, AttachmentInfo, ChangeEntry, DeviceInfo, ExternalChangeInfo, ImportPreview, ImportStrategy, PairSession, Project, ProjectMeta, ProjectSummary, SearchResult, SnapshotInfo, SyncConflict, SyncStatusFile, SyncSummary, Template, TrashEntry } from "./types";

export interface TaskFileInfo {
  name: string;
  meta: ProjectMeta;
  body: string;
}

export const api = {
  initWorkspace: () => invoke<string>("init_workspace"),
  setWorkspace: (path: string) => invoke<string>("set_workspace", { path }),
  chooseWorkspace: () => invoke<string>("choose_workspace"),
  listProjects: () => invoke<ProjectSummary[]>("list_projects"),
  createProject: (meta: ProjectMeta, body: string) => invoke<Project>("create_project", { meta, body }),
  createExampleProject: () => invoke<Project>("create_example_project"),
  readProject: (id: string) => invoke<Project>("read_project", { id }),
  saveProject: (project: Project) => invoke<Project>("save_project", { project }),
  cloneProject: (id: string) => invoke<Project>("clone_project", { id }),
  setProjectStatus: (id: string, status: "active" | "archived" | "deleted") =>
    invoke<Project>("set_project_status", { id, status }),
  deleteProject: (id: string) => invoke<void>("delete_project", { id }),
  linkExternalFolder: () => invoke<Project>("link_external_folder"),
  unlinkProject: (id: string) => invoke<void>("unlink_project", { id }),
  listTrash: () => invoke<TrashEntry[]>("list_trash"),
  restoreProject: (folder: string) => invoke<Project>("restore_project", { folder }),
  purgeProject: (folder: string) => invoke<void>("purge_project", { folder }),
  purgeTrash: () => invoke<number>("purge_trash"),
  listAttachments: (projectId: string) => invoke<AttachmentInfo[]>("list_attachments", { projectId }),
  addAttachment: (projectId: string) => invoke<AttachmentInfo[]>("add_attachment", { projectId }),
  openAttachment: (projectId: string, name: string) => invoke<void>("open_attachment", { projectId, name }),
  deleteAttachment: (projectId: string, name: string) => invoke<void>("delete_attachment", { projectId, name }),
  getTemplates: () => invoke<Template[]>("get_templates"),
  listTaskFiles: (projectId: string) => invoke<TaskFileInfo[]>("list_task_files", { projectId }),
  saveTaskFile: (projectId: string, name: string, meta: ProjectMeta, body: string) =>
    invoke<TaskFileInfo>("save_task_file", { projectId, name, meta, body }),
  deleteTaskFile: (projectId: string, name: string) =>
    invoke<void>("delete_task_file", { projectId, name }),
  renderMarkdown: (md: string) => invoke<string>("render_markdown", { md }),
  parseYamlMeta: (yaml: string) => invoke<ProjectMeta>("parse_yaml_meta", { yaml }),
  buildYaml: (meta: ProjectMeta) => invoke<string>("build_yml", { meta }),
  loadConfig: () => invoke<AppConfig>("load_config"),
  saveConfig: (config: AppConfig) => invoke<AppConfig>("save_config", { config }),
  exportProject: (id: string, format: "md" | "xlsx" | "csv" | "json", includeHistory: boolean) =>
    invoke<string>("export_project", { id, format, includeHistory }),
  exportProjectPreset: (id: string, presetIndex: number, includeHistory: boolean) =>
    invoke<string>("export_project_preset", { id, presetIndex, includeHistory }),
  exportProjectHtml: (id: string) => invoke<string>("export_project_html", { id }),
  exportAllMarkdown: () => invoke<string[]>("export_all_markdown"),
  refreshSummary: () => invoke<string>("refresh_summary"),
  importFromDialog: () => invoke<ImportPreview>("import_from_dialog"),
  importFolderFromDialog: () => invoke<ImportPreview>("import_folder_from_dialog"),
  importFromPath: (path: string) => invoke<ImportPreview>("import_from_path", { path }),
  importCommit: (path: string, strategy: ImportStrategy) => invoke<Project[]>("import_commit", { path, strategy }),
  readSummary: () => invoke<string>("read_summary"),
  listSnapshots: (projectId: string) => invoke<SnapshotInfo[]>("list_snapshots", { projectId }),
  readSnapshot: (projectId: string, timestamp: string) => invoke<Project>("read_snapshot", { projectId, timestamp }),
  restoreSnapshot: (projectId: string, timestamp: string) => invoke<Project>("restore_snapshot", { projectId, timestamp }),
  loadProjectChanges: (projectId: string, days?: number) =>
    invoke<ChangeEntry[]>("load_project_changes", { projectId, days }),
  openWorkspaceFolder: () => invoke<void>("open_workspace_folder"),
  openProjectFolder: (projectId: string) => invoke<void>("open_project_folder", { projectId }),
  getSyncStatus: () => invoke<SyncStatusFile>("get_sync_status"),
  refreshSyncStatus: () => invoke<SyncStatusFile>("refresh_sync_status"),
  detectExternalChanges: () => invoke<ExternalChangeInfo[]>("detect_external_changes"),
  searchAll: (query: string, limit?: number) => invoke<SearchResult[]>("search_all", { query, limit }),
  getDeviceInfo: () => invoke<DeviceInfo>("get_device_info"),
  setDeviceName: (name: string) => invoke<DeviceInfo>("set_device_name", { name }),
  listDevices: () => invoke<DeviceInfo[]>("list_devices"),
  trustDevice: (id: string, name?: string) => invoke<void>("trust_device", { id, name }),
  untrustDevice: (id: string) => invoke<void>("untrust_device", { id }),
  beginPair: (deviceId: string) => invoke<PairSession>("begin_pair", { deviceId }),
  submitPairCode: (deviceId: string, code: string) => invoke<PairSession>("submit_pair_code", { deviceId, code }),
  pairSessions: () => invoke<PairSession[]>("pair_sessions"),
  dismissPair: (deviceId: string) => invoke<void>("dismiss_pair", { deviceId }),
  syncAll: () => invoke<SyncSummary>("sync_all"),
  syncWithDevice: (deviceId: string) => invoke<SyncSummary>("sync_with_device", { deviceId }),
  listSyncConflicts: () => invoke<SyncConflict[]>("list_sync_conflicts"),
  resolveSyncConflict: (id: string, choice: "mine" | "theirs") =>
    invoke<void>("resolve_sync_conflict", { id, choice }),
  clearSyncConflicts: () => invoke<void>("clear_sync_conflicts"),
};

export async function invokeStr(fn: () => Promise<string>): Promise<string | undefined> {
  try {
    return await fn();
  } catch (e) {
    console.error(e);
    return undefined;
  }
}