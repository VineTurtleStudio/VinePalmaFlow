import { useEffect, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import { flushPending, useStore } from "./store";
import type { SyncSummary } from "./types";
import { TopBar } from "./components/TopBar";
import { Sidebar } from "./components/Sidebar";
import { StandardEditor } from "./components/StandardEditor";
import { ProEditor } from "./components/ProEditor";
import { CommandPalette } from "./components/CommandPalette";
import { SearchDialog } from "./components/SearchDialog";
import { OnboardingDialog } from "./components/OnboardingDialog";
import { buildMeta, starterBody } from "./components/NewProjectDialog";

export default function App() {
  const booted = useStore((s) => s.booted);
  const boot = useStore((s) => s.boot);
  const mode = useStore((s) => s.mode);
  const currentProject = useStore((s) => s.currentProject);
  const loadingProject = useStore((s) => s.loadingProject);
  const notification = useStore((s) => s.notification);
  const clearNotification = useStore((s) => s.clearNotification);
  const projects = useStore((s) => s.projects);
  const [showPalette, setShowPalette] = useState(false);
  const [showSearch, setShowSearch] = useState(false);
  const [showOnboarding, setShowOnboarding] = useState(false);

  useEffect(() => {
    boot();
  }, [boot]);

  useEffect(() => {
    if (booted && !localStorage.getItem("vpf-onboarded")) {
      setShowOnboarding(true);
    }
  }, [booted]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        flushPending.run();
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setShowPalette((v) => !v);
      }
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === "f") {
        e.preventDefault();
        setShowSearch((v) => !v);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    if (!notification) return;
    const t = setTimeout(() => clearNotification(), 3500);
    return () => clearTimeout(t);
  }, [notification, clearNotification]);

  useEffect(() => {
    const unlisten = listen<SyncSummary>("sync-auto-complete", (e) => {
      const s = e.payload;
      void useStore.getState().refreshProjects();
      const parts: string[] = [];
      if (s.devices > 0) parts.push(`已同步 ${s.devices} 台设备`);
      if (s.pushed > 0) parts.push(`推送 ${s.pushed} 个`);
      if (s.pulled > 0) parts.push(`拉取 ${s.pulled} 个`);
      if (s.merged > 0) parts.push(`自动合并 ${s.merged} 个文件`);
      if (s.conflicted > 0) parts.push(`${s.conflicted} 个冲突待处理`);
      if (parts.length > 0) useStore.getState().notify(`自动同步完成：${parts.join(" · ")}`);
    });
    return () => {
      void unlisten.then((fn) => fn());
    };
  }, []);

  return (
    <div className={`app-transition flex h-full flex-col bg-white text-base-800 dark:bg-base-900 dark:text-base-100 ${currentProject ? "app-ready" : ""}`}>
      <TopBar />

      <div className="flex min-h-0 flex-1">
        <Sidebar />
        <main className="flex min-w-0 flex-1 flex-col">
          {!booted ? (
            <BootScreen />
          ) : currentProject ? (
            loadingProject ? (
              <BootScreen />
            ) : mode === "pro" ? (
              <ProEditor />
            ) : (
              <StandardEditor />
            )
          ) : (
            <Welcome projectsCount={projects.length} />
          )}
        </main>
      </div>

      {notification && (
        <div
          className={`fixed bottom-4 right-4 z-50 rounded-lg border px-4 py-2.5 text-sm shadow-lg ${
            notification.kind === "error"
              ? "border-red-200 bg-red-50 text-red-700 dark:border-red-800 dark:bg-red-900/60 dark:text-red-200"
              : "border-brand-200 bg-brand-50 text-brand-700 dark:border-brand-800 dark:bg-brand-900/60 dark:text-brand-200"
          }`}
        >
          {notification.message}
        </div>
      )}

      {showPalette && <CommandPalette onClose={() => setShowPalette(false)} />}
      {showSearch && (
        <SearchDialog
          onClose={() => setShowSearch(false)}
          onOpenProject={(id) => void useStore.getState().selectProject(id)}
        />
      )}
      {showOnboarding && <OnboardingDialog onClose={() => setShowOnboarding(false)} />}
    </div>
  );
}

function BootScreen() {
  return (
    <div className="flex flex-1 items-center justify-center">
      <div className="text-center">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-brand-600 text-2xl text-white">
          🌿
        </div>
        <p className="mt-3 text-sm text-base-400">VinePalmaFlow 正在启动…</p>
      </div>
    </div>
  );
}

function Welcome({ projectsCount }: { projectsCount: number }) {
  const templates = useStore((s) => s.templates);
  const createProject = useStore((s) => s.createProject);
  const selectProject = useStore((s) => s.selectProject);
  const projects = useStore((s) => s.projects);
  const quickCreate = async (templateId: string) => {
    const t = templates.find((x) => x.template_id === templateId);
    if (!t) return;
    const meta = buildMeta(t, t.name);
    await createProject(meta, starterBody(t.name));
  };
  const recent = [...projects]
    .sort((a, b) => (b.meta.updated_at ?? "").localeCompare(a.meta.updated_at ?? ""))
    .slice(0, 5);
  return (
    <div className="flex-1 overflow-y-auto">
      <div className="flex min-h-full items-center justify-center p-8">
        <div className="w-full max-w-2xl">
          <h1 className="text-center text-2xl font-semibold text-base-800 dark:text-base-100">
            欢迎使用 VinePalmaFlow 🌿
          </h1>
          <p className="mt-2 text-center text-sm text-base-500 dark:text-base-400">
            {projectsCount > 0
              ? `工作区已有 ${projectsCount} 个项目。选择左侧项目继续，或使用内置模板快速开始。`
              : "纯本地存储 · 零账号 · 数据永远留在你的设备上。"}
          </p>

          {recent.length > 0 && (
            <div className="mt-8">
              <h2 className="mb-2 text-center text-xs font-semibold uppercase tracking-wide text-base-400 dark:text-base-500">
                最近打开
              </h2>
              <div className="space-y-1.5">
                {recent.map((p) => (
                  <button
                    key={p.meta.id}
                    onClick={() => selectProject(p.meta.id)}
                    className="group flex w-full items-center gap-3 rounded-xl border border-base-200 bg-base-50 px-4 py-2.5 text-left transition-colors hover:border-brand-400 hover:bg-brand-50/50 dark:border-base-700 dark:bg-base-800/50 dark:hover:border-brand-600 dark:hover:bg-brand-900/20"
                  >
                    <span className="text-lg">📂</span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium text-base-700 group-hover:text-brand-700 dark:text-base-200 dark:group-hover:text-brand-300">
                        {p.meta.name}
                      </span>
                      <span className="block text-xs text-base-400 dark:text-base-500">
                        {p.meta.updated_at ? `更新于 ${p.meta.updated_at.slice(0, 16).replace("T", " ")}` : p.meta.status}
                      </span>
                    </span>
                    <span className="text-base-300 group-hover:text-brand-500 dark:text-base-600">→</span>
                  </button>
                ))}
              </div>
              {projects.length > recent.length && (
                <p className="mt-2 text-center text-xs text-base-300 dark:text-base-600">
                  更多项目请从左侧「进行中 / 已归档」列表中选择
                </p>
              )}
            </div>
          )}

          <div className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-3">
            {templates.slice(0, 6).map((t) => (
              <button
                key={t.template_id}
                onClick={() => quickCreate(t.template_id)}
                className="group rounded-xl border border-base-200 bg-base-50 p-4 text-left transition-colors hover:border-brand-400 hover:bg-brand-50/50 dark:border-base-700 dark:bg-base-800/50 dark:hover:border-brand-600 dark:hover:bg-brand-900/20"
              >
                <div className="text-xl">{t.icon}</div>
                <div className="mt-2 text-sm font-medium text-base-700 group-hover:text-brand-700 dark:text-base-200 dark:group-hover:text-brand-300">
                  {t.name}
                </div>
                <p className="mt-1 line-clamp-2 text-xs text-base-400 dark:text-base-500">{t.description}</p>
              </button>
            ))}
          </div>
          <p className="mt-6 text-center text-xs text-base-300 dark:text-base-600">
            点击左上角「新建项目」或右上角 🎛️ 切换专业模式
          </p>
        </div>
      </div>
    </div>
  );
}