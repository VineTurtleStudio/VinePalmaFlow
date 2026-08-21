import { useEffect, useRef, useState } from "react";
import { api } from "../api";
import { useStore } from "../store";
import type { ImportPreview } from "../types";
import { ImportDialog } from "./ImportDialog";
import { SettingsDialog } from "./SettingsDialog";

export function TopBar() {
  const mode = useStore((s) => s.mode);
  const setMode = useStore((s) => s.setMode);
  const currentProject = useStore((s) => s.currentProject);
  const notify = useStore((s) => s.notify);
  const busy = useStore((s) => s.busy);
  const [showImport, setShowImport] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [initialPreview, setInitialPreview] = useState<ImportPreview | null>(null);

  return (
    <header className="flex h-12 shrink-0 items-center gap-3 border-b border-base-200 bg-base-50 px-4 dark:border-base-800 dark:bg-base-900">
      <div className="flex items-center gap-2">
        <span className="flex h-6 w-6 items-center justify-center rounded-md bg-brand-600 text-sm text-white">
          🌿
        </span>
        <span className="text-sm font-semibold text-base-800 dark:text-base-100">
          VinePalmaFlow
        </span>
      </div>

      <div className="mx-1 h-5 w-px bg-base-200 dark:bg-base-700" />

      <div className="flex-1" />

      <div className="flex items-center gap-1.5">
        {busy && (
          <span className="flex items-center gap-1.5 text-xs text-base-400 dark:text-base-500" title="正在处理…">
            <span className="h-3 w-3 animate-spin rounded-full border-2 border-brand-500 border-t-transparent" />
            处理中…
          </span>
        )}

        <ExportMenu
          projectId={currentProject?.meta.id}
          onDone={(msg) => notify(msg)}
        />

        <ImportMenu
          onFile={() => {
            setInitialPreview(null);
            setShowImport(true);
          }}
          onFolder={async () => {
            try {
              const preview = await useStore.getState().runBusy(() => api.importFolderFromDialog());
              if (preview) {
                setInitialPreview(preview);
                setShowImport(true);
              }
            } catch (e) {
              if (!String(e).includes("取消")) notify(String(e), "error");
            }
          }}
        />

        <button
          onClick={() => setShowSettings(true)}
          className="flex h-7 w-7 items-center justify-center rounded-md text-base-500 hover:bg-base-100 hover:text-base-700 dark:text-base-400 dark:hover:bg-base-800 dark:hover:text-base-200"
          title="设置（主题等功能）"
        >
          ⚙️
        </button>

        <div className="mx-1 h-5 w-px bg-base-200 dark:bg-base-700" />

        <button
          onClick={() => setMode(mode === "standard" ? "pro" : "standard")}
          className={`flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
            mode === "pro"
              ? "bg-brand-600 text-white"
              : "bg-base-100 text-base-600 hover:bg-base-200 dark:bg-base-800 dark:text-base-300 dark:hover:bg-base-700"
          }`}
          title="切换普通模式 / 专业模式"
        >
          <span>🎛️</span>
          <span>{mode === "standard" ? "专业模式" : "普通模式"}</span>
        </button>
      </div>

      {showImport && (
        <ImportDialog
          initialPreview={initialPreview}
          onClose={() => setShowImport(false)}
        />
      )}
      {showSettings && <SettingsDialog onClose={() => setShowSettings(false)} />}
    </header>
  );
}

function ImportMenu({ onFile, onFolder }: { onFile: () => void; onFolder: () => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const close = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((v) => !v)}
        className="rounded-md px-2.5 py-1 text-xs text-base-500 hover:bg-base-100 hover:text-base-700 dark:text-base-400 dark:hover:bg-base-800 dark:hover:text-base-200"
        title="导入项目 / 模板"
      >
        ⬇️ 导入
      </button>
      {open && (
        <div className="absolute right-0 top-9 z-40 w-56 rounded-xl border border-base-200 bg-white p-1.5 shadow-xl dark:border-base-700 dark:bg-base-800">
          <button
            onClick={() => {
              setOpen(false);
              onFile();
            }}
            className="flex w-full items-center gap-3 rounded-lg px-2.5 py-2 text-left hover:bg-base-50 dark:hover:bg-base-700"
          >
            <span className="text-base">📄</span>
            <div>
              <div className="text-xs font-medium text-base-700 dark:text-base-200">导入文件</div>
              <div className="text-[10px] text-base-400 dark:text-base-500">.md / .xlsx / 模板包</div>
            </div>
          </button>
          <button
            onClick={() => {
              setOpen(false);
              onFolder();
            }}
            className="flex w-full items-center gap-3 rounded-lg px-2.5 py-2 text-left hover:bg-base-50 dark:hover:bg-base-700"
          >
            <span className="text-base">📁</span>
            <div>
              <div className="text-xs font-medium text-base-700 dark:text-base-200">导入 Markdown 文件夹</div>
              <div className="text-[10px] text-base-400 dark:text-base-500">批量导入其中的 .md 项目</div>
            </div>
          </button>
        </div>
      )}
    </div>
  );
}

const EXPORT_FORMATS = [
  { key: "md", label: "Markdown (.md)", hint: "完整项目，含 YAML 元数据" },
  { key: "xlsx", label: "Excel (.xlsx)", hint: "项目概览 + 任务明细 + 变更历史" },
  { key: "csv", label: "CSV (.csv)", hint: "纯数据，任务明细" },
  { key: "json", label: "JSON (.json)", hint: "结构化数据，供脚本/API 使用" },
] as const;

const PRESET_FORMAT: Record<string, string> = {
  md: "Markdown",
  xlsx: "Excel",
  csv: "CSV",
  json: "JSON",
};

function ExportMenu({ projectId, onDone }: { projectId?: string; onDone: (msg: string) => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const templates = useStore((s) => s.templates);
  const currentProject = useStore((s) => s.currentProject);

  const presets = currentProject
    ? (templates.find((t) => t.template_id === currentProject.meta.template_id)?.export_presets ?? [])
    : [];

  useEffect(() => {
    const close = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);

  const run = async (fn: () => Promise<unknown>, msg: string) => {
    const runBusy = useStore.getState().runBusy;
    try {
      const res = await runBusy(fn);
      if (res !== undefined) onDone(msg);
    } catch (e) {
      if (!String(e).includes("取消")) onDone(String(e));
    }
    setOpen(false);
  };

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((v) => !v)}
        className="rounded-md px-2.5 py-1 text-xs text-base-500 hover:bg-base-100 hover:text-base-700 dark:text-base-400 dark:hover:bg-base-800 dark:hover:text-base-200"
        title="导出 / 工具"
      >
        ⬆️ 导出
      </button>
      {open && (
        <div className="absolute right-0 top-9 z-40 w-64 rounded-xl border border-base-200 bg-white p-1.5 shadow-xl dark:border-base-700 dark:bg-base-800">
          {presets.length > 0 && (
            <>
              <div className="px-2.5 pb-1 pt-1.5 text-[10px] font-medium uppercase tracking-wide text-brand-600 dark:text-brand-400">
                模板导出预设
              </div>
              {presets.map((p, i) => (
                <button
                  key={`${p.name}-${i}`}
                  disabled={!projectId}
                  onClick={() =>
                    projectId &&
                    run(
                      () => api.exportProjectPreset(projectId, i, true),
                      `已导出：${p.name}`,
                    )
                  }
                  className="flex w-full items-center justify-between rounded-lg px-2.5 py-2 text-left hover:bg-base-50 disabled:cursor-not-allowed disabled:opacity-40 dark:hover:bg-base-700"
                >
                  <div>
                    <div className="text-xs font-medium text-brand-700 dark:text-brand-300">{p.name}</div>
                    <div className="text-[10px] text-base-400 dark:text-base-500">
                      按模板预设 · {PRESET_FORMAT[p.format] ?? p.format}
                    </div>
                  </div>
                  <span className="text-base-300 dark:text-base-600">›</span>
                </button>
              ))}
              <div className="my-1 h-px bg-base-100 dark:bg-base-700" />
            </>
          )}
          <div className="px-2.5 pb-1 pt-1.5 text-[10px] font-medium uppercase tracking-wide text-base-400 dark:text-base-500">
            导出当前项目
          </div>
          {EXPORT_FORMATS.map((f) => (
            <button
              key={f.key}
              disabled={!projectId}
              onClick={() =>
                projectId &&
                run(
                  () => api.exportProject(projectId, f.key, true),
                  `已导出：${f.label}`,
                )
              }
              className="flex w-full items-center justify-between rounded-lg px-2.5 py-2 text-left hover:bg-base-50 disabled:cursor-not-allowed disabled:opacity-40 dark:hover:bg-base-700"
            >
              <div>
                <div className="text-xs font-medium text-base-700 dark:text-base-200">{f.label}</div>
                <div className="text-[10px] text-base-400 dark:text-base-500">{f.hint}</div>
              </div>
              <span className="text-base-300 dark:text-base-600">›</span>
            </button>
          ))}
          <button
            disabled={!projectId}
            onClick={() =>
              projectId &&
              run(
                () => api.exportProjectHtml(projectId),
                "已导出打印友好版（已在浏览器中打开，可另存为 PDF）",
              )
            }
            className="flex w-full items-center justify-between rounded-lg px-2.5 py-2 text-left hover:bg-base-50 disabled:cursor-not-allowed disabled:opacity-40 dark:hover:bg-base-700"
          >
            <div>
              <div className="text-xs font-medium text-base-700 dark:text-base-200">打印友好版 (HTML)</div>
              <div className="text-[10px] text-base-400 dark:text-base-500">浏览器打开后即可打印 / 另存为 PDF</div>
            </div>
            <span className="text-base-300 dark:text-base-600">›</span>
          </button>
          <div className="my-1 h-px bg-base-100 dark:bg-base-700" />
          <button
            onClick={() =>
              run(
                () => api.exportAllMarkdown(),
                "已导出全部项目（含汇总视图）",
              )
            }
            className="flex w-full items-center justify-between rounded-lg px-2.5 py-2 text-left hover:bg-base-50 dark:hover:bg-base-700"
          >
            <div>
              <div className="text-xs font-medium text-base-700 dark:text-base-200">全部导出为 Markdown</div>
              <div className="text-[10px] text-base-400 dark:text-base-500">含自动生成的汇总视图</div>
            </div>
            <span className="text-base-300 dark:text-base-600">›</span>
          </button>
        </div>
      )}
    </div>
  );
}