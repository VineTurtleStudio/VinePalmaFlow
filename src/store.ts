import { create } from "zustand";
import { api } from "./api";
import { activeTheme, applyThemeStyle, isDarkPalette } from "./lib/theme";
import type {
  AppConfig,
  ExternalChangeInfo,
  Project,
  ProjectMeta,
  ProjectSummary,
  SyncStatusFile,
  Template,
  ThemeConfig,
  TrashEntry,
  UiMode,
} from "./types";

export type Theme = "dark" | "light";
export type ViewType = "kanban" | "list" | "card";
export type ViewSelection = ViewType | "pro";

/** 编辑器注册的“切换项目前先落盘”回调，避免防抖窗口内的编辑丢失 */
let pendingFlush: (() => Promise<void>) | null = null;
export const flushPending = {
  set(fn: () => Promise<void>) {
    pendingFlush = fn;
  },
  clear() {
    pendingFlush = null;
  },
  async run() {
    const fn = pendingFlush;
    pendingFlush = null;
    if (fn) {
      try {
        await fn();
      } catch (e) {
        console.error("切换项目前保存失败", e);
      }
    }
  },
};

interface AppState {
  booted: boolean;
  mode: UiMode;
  themeConfig: ThemeConfig;
  workspacePath?: string;
  projects: ProjectSummary[];
  trash: TrashEntry[];
  templates: Template[];
  currentProject: Project | null;
  view: ViewType;
  syncStatus: SyncStatusFile | null;
  externalChanges: ExternalChangeInfo[];
  loadingProject: boolean;
  busy: boolean;
  notification: { message: string; kind: "info" | "error" } | null;

  boot: () => Promise<void>;
  selectProject: (id: string | null) => Promise<void>;
  reloadProject: () => Promise<void>;
  refreshProjects: () => Promise<void>;
  refreshTemplates: () => Promise<void>;
  refreshTrash: () => Promise<void>;
  createProject: (meta: ProjectMeta, body: string) => Promise<Project | null>;
  cloneProject: (id: string) => Promise<Project | null>;
  setProjectStatus: (id: string, status: "active" | "archived" | "deleted") => Promise<void>;
  deleteProject: (id: string) => Promise<void>;
  linkExternalFolder: () => Promise<Project | null>;
  unlinkProject: (id: string) => Promise<void>;
  restoreProject: (folder: string) => Promise<void>;
  purgeProject: (folder: string) => Promise<void>;
  purgeTrash: () => Promise<void>;
  restoreSnapshot: (projectId: string, timestamp: string) => Promise<Project | null>;
  switchWorkspace: () => Promise<void>;
  applyPatch: (patch: (p: Project) => Project) => void;
  saveCurrent: () => Promise<void>;
  setMode: (mode: UiMode) => void;
  setThemeConfig: (config: ThemeConfig) => Promise<void>;
  setView: (view: ViewType) => void;
  refreshSyncIndex: () => Promise<void>;
  checkExternalChanges: () => Promise<void>;
  clearExternalChange: (projectId: string) => void;
  notify: (message: string, kind?: "info" | "error") => void;
  clearNotification: () => void;
  runBusy: <T>(fn: () => Promise<T>) => Promise<T | undefined>;
}

const savedTheme = (): ThemeConfig => {
  try {
    const t = localStorage.getItem("vpf-theme");
    return t === "light" ? { mode: "preset", preset_id: "classic-light" } : { mode: "preset", preset_id: "classic-dark" };
  } catch {
    return { mode: "preset", preset_id: "classic-dark" };
  }
};

export const useStore = create<AppState>((set, get) => ({
  booted: false,
  mode: "standard",
  themeConfig: savedTheme(),
  projects: [],
  trash: [],
  templates: [],
  currentProject: null,
  view: "card",
  syncStatus: null,
  externalChanges: [],
  loadingProject: false,
  busy: false,
  notification: null,

  boot: async () => {
    try {
      const cfg = await api.loadConfig();
      const mode: UiMode = cfg.mode === "pro" ? "pro" : "standard";
      const path = await api.initWorkspace();
      const templates = await api.getTemplates();
      const projects = await api.listProjects();
      const trash = await api.listTrash();
      const themeConfig: ThemeConfig = cfg.theme_config ?? {
        mode: cfg.theme === "light" ? "preset" : "preset",
        preset_id: cfg.theme === "light" ? "classic-light" : "classic-dark",
      };
      set({ workspacePath: path, templates, mode, themeConfig, trash });
      await applyTheme(themeConfig);

      if (cfg.last_project_id) {
        const found = projects.find((p) => p.meta.id === cfg.last_project_id);
        if (found) {
          await get().selectProject(found.meta.id);
        }
      }
      await persistConfig({ ...cfg, mode, workspace_path: path, last_project_id: cfg.last_project_id });
      await get().refreshSyncIndex();
      await get().checkExternalChanges();
      set({ booted: true, projects });
    } catch (e) {
      get().notify(`初始化失败: ${e}`, "error");
      set({ booted: true });
    }
  },

  selectProject: async (id) => {
    if (id === null) {
      await flushPending.run();
      set({ currentProject: null, view: "card" });
      return;
    }
    await flushPending.run();
    if (get().currentProject?.meta.id === id) return;
    set({ loadingProject: true });
    try {
      const project = await api.readProject(id);
      set({ currentProject: project, loadingProject: false });
      const cfg = await api.loadConfig();
      await persistConfig({ ...cfg, last_project_id: id });
    } catch (e) {
      get().notify(`加载项目失败: ${e}`, "error");
      set({ loadingProject: false });
    }
  },

  reloadProject: async () => {
    const id = get().currentProject?.meta.id;
    if (!id) return;
    await flushPending.run();
    set({ loadingProject: true });
    try {
      const project = await api.readProject(id);
      set({ currentProject: project, loadingProject: false });
      get().refreshSyncIndex();
    } catch (e) {
      get().notify(`重新载入项目失败: ${e}`, "error");
      set({ loadingProject: false });
    }
  },

  refreshProjects: async () => {
    try {
      const projects = await api.listProjects();
      set({ projects });
    } catch (e) {
      get().notify(`刷新列表失败: ${e}`, "error");
    }
  },

  refreshTemplates: async () => {
    try {
      const templates = await api.getTemplates();
      set({ templates });
    } catch (e) {
      get().notify(`刷新模板失败: ${e}`, "error");
    }
  },

  refreshTrash: async () => {
    try {
      const trash = await api.listTrash();
      set({ trash });
    } catch (e) {
      get().notify(`加载回收站失败: ${e}`, "error");
    }
  },

  createProject: async (meta, body) => {
    try {
      const project = await api.createProject(meta, body);
      await get().refreshProjects();
      await get().selectProject(project.meta.id);
      get().notify(`项目「${project.meta.name}」已创建`);
      return project;
    } catch (e) {
      get().notify(`创建失败: ${e}`, "error");
      return null;
    }
  },

  cloneProject: async (id) => {
    try {
      const project = await api.cloneProject(id);
      await get().refreshProjects();
      await get().selectProject(project.meta.id);
      get().notify(`已克隆为「${project.meta.name}」`);
      return project;
    } catch (e) {
      get().notify(`克隆失败: ${e}`, "error");
      return null;
    }
  },

  setProjectStatus: async (id, status) => {
    try {
      const project = await api.setProjectStatus(id, status);
      if (get().currentProject?.meta.id === id) set({ currentProject: project });
      await get().refreshProjects();
      get().notify(project.meta.status === "archived" ? `已归档「${project.meta.name}」` : project.meta.status === "deleted" ? "已标记删除" : "已恢复为进行中");
    } catch (e) {
      get().notify(`更新状态失败: ${e}`, "error");
    }
  },

  deleteProject: async (id) => {
    try {
      await api.deleteProject(id);
      if (get().currentProject?.meta.id === id) {
        set({ currentProject: null });
      }
      get().notify("项目已删除（可随时从回收站恢复）");
      await get().refreshProjects();
      await get().refreshTrash();
    } catch (e) {
      get().notify(`删除失败: ${e}`, "error");
    }
  },

  linkExternalFolder: async () => {
    try {
      const project = await api.linkExternalFolder();
      if (project) {
        get().notify(`已链接外部项目「${project.meta.name}」`);
        await get().refreshProjects();
        await get().refreshSyncIndex();
        await get().selectProject(project.meta.id);
      }
      return project;
    } catch (e) {
      get().notify(`链接失败: ${e}`, "error");
      return null;
    }
  },

  unlinkProject: async (id) => {
    try {
      await api.unlinkProject(id);
      if (get().currentProject?.meta.id === id) {
        set({ currentProject: null });
      }
      get().notify("已解除链接，外部文件夹内容未改动");
      await get().refreshProjects();
      await get().refreshSyncIndex();
    } catch (e) {
      get().notify(`解除链接失败: ${e}`, "error");
    }
  },

  restoreProject: async (folder) => {
    try {
      const project = await api.restoreProject(folder);
      await get().refreshProjects();
      await get().refreshTrash();
      get().notify(`已恢复项目「${project.meta.name}」`);
      await get().selectProject(project.meta.id);
    } catch (e) {
      get().notify(`恢复失败: ${e}`, "error");
    }
  },

  purgeProject: async (folder) => {
    try {
      await api.purgeProject(folder);
      await get().refreshTrash();
      get().notify("已从回收站彻底删除");
    } catch (e) {
      get().notify(`删除失败: ${e}`, "error");
    }
  },

  purgeTrash: async () => {
    try {
      const n = await api.purgeTrash();
      await get().refreshTrash();
      get().notify(`已清空回收站（${n} 个项目被彻底删除）`);
    } catch (e) {
      get().notify(`清空失败: ${e}`, "error");
    }
  },

  restoreSnapshot: async (projectId, timestamp) => {
    try {
      const project = await api.restoreSnapshot(projectId, timestamp);
      set({ currentProject: project });
      await get().refreshProjects();
      get().notify(`已恢复到快照 ${timestamp}`);
      return project;
    } catch (e) {
      get().notify(`恢复快照失败: ${e}`, "error");
      return null;
    }
  },

  switchWorkspace: async () => {
    await flushPending.run();
    set({ booted: false, currentProject: null });
    try {
      const path = await api.chooseWorkspace();
      const templates = await api.getTemplates();
      const projects = await api.listProjects();
      const trash = await api.listTrash();
      const cfg = await api.loadConfig().catch(() => null);
      const base: AppConfig = cfg ?? { mode: "standard", theme: "dark" };
      await persistConfig({ ...base, mode: get().mode, workspace_path: path, last_project_id: null });
      await get().refreshSyncIndex();
      await get().checkExternalChanges();
      set({ workspacePath: path, templates, projects, trash, view: "card", booted: true });
      get().notify(`已切换工作区：${path}`);
    } catch (e) {
      get().notify(`切换工作区失败: ${e}`, "error");
      set({ booted: true });
    }
  },

  applyPatch: (patch) => {
    const cur = get().currentProject;
    if (!cur) return;
    set({ currentProject: patch(cur) });
  },

  saveCurrent: async () => {
    const cur = get().currentProject;
    if (!cur) return;
    try {
      const saved = await api.saveProject(cur);
      set({ currentProject: saved });
      get().refreshSyncIndex();
    } catch (e) {
      get().notify(`保存失败: ${e}`, "error");
    }
  },

  setMode: async (mode) => {
    set({ mode });
    const cfg = await api.loadConfig().catch(() => ({ mode, theme: "dark" } as AppConfig));
    await persistConfig({ ...cfg, mode });
  },

  setThemeConfig: async (config) => {
    set({ themeConfig: config });
    localStorage.setItem("vpf-theme", config.mode);
    await applyTheme(config);
    const cfg = await api.loadConfig().catch(() => null);
    if (cfg) {
      const theme = config.mode === "custom" && config.custom && isDarkPalette(config.custom) ? "dark" : "light";
      await persistConfig({ ...cfg, theme, theme_config: config });
    }
  },

  setView: (view) => set({ view }),

  refreshSyncIndex: async () => {
    try {
      const syncStatus = await api.refreshSyncStatus();
      set({ syncStatus });
    } catch (e) {
      console.error("刷新同步索引失败", e);
    }
  },

  checkExternalChanges: async () => {
    try {
      const externalChanges = await api.detectExternalChanges();
      set({ externalChanges });
    } catch (e) {
      console.error("检测外部变更失败", e);
    }
  },

  clearExternalChange: (projectId) =>
    set((s) => ({ externalChanges: s.externalChanges.filter((c) => c.project_id !== projectId) })),

  notify: (message, kind = "info") => set({ notification: { message, kind } }),
  clearNotification: () => set({ notification: null }),

  runBusy: async (fn) => {
    if (get().busy) {
      get().notify("已有操作正在进行，请稍候", "error");
      return undefined;
    }
    set({ busy: true });
    try {
      return await fn();
    } finally {
      set({ busy: false });
    }
  },
}));

async function applyTheme(config: ThemeConfig) {
  const { preset, isDark } = activeTheme(config);
  applyThemeStyle(preset.palette, isDark);
}

async function persistConfig(cfg: AppConfig) {
  try {
    await api.saveConfig(cfg);
  } catch (e) {
    console.error("保存配置失败", e);
  }
}