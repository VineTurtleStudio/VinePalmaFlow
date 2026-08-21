import { useEffect, useMemo, useRef, useState } from "react";
import { api } from "../api";
import { useStore } from "../store";
import { buildMeta, starterBody } from "./NewProjectDialog";
import { SummaryDialog } from "./SummaryDialog";
import { SettingsDialog } from "./SettingsDialog";
import { HelpDialog } from "./HelpDialog";
import { SyncDialog } from "./SyncDialog";

interface PaletteItem {
  key: string;
  icon: string;
  label: string;
  sub?: string;
  run: () => void;
}

export function CommandPalette({ onClose }: { onClose: () => void }) {
  const [query, setQuery] = useState("");
  const [showSettings, setShowSettings] = useState(false);
  const [showSummary, setShowSummary] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [showSync, setShowSync] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const selectProject = useStore((s) => s.selectProject);
  const createProject = useStore((s) => s.createProject);
  const setMode = useStore((s) => s.setMode);
  const mode = useStore((s) => s.mode);
  const projects = useStore((s) => s.projects);
  const templates = useStore((s) => s.templates);

  const items = useMemo<PaletteItem[]>(() => {
    const list: PaletteItem[] = [];
    for (const p of projects) {
      if (p.meta.status === "deleted") continue;
      list.push({
        key: `p-${p.meta.id}`,
        icon: "📂",
        label: p.meta.name,
        sub: [
          p.meta.status === "archived" ? "已归档" : "",
          p.meta.owner ?? "",
          (p.meta.tags ?? []).join(" · "),
        ]
          .filter(Boolean)
          .join(" · ") || "项目",
        run: () => selectProject(p.meta.id),
      });
    }
    for (const t of templates) {
      list.push({
        key: `t-${t.template_id}`,
        icon: t.icon,
        label: t.name,
        sub: `新建项目 · ${t.description}`,
        run: () => createProject(buildMeta(t, t.name), starterBody(t.name)),
      });
    }
    list.push(
      {
        key: "mode",
        icon: "🎛️",
        label: `切换到${mode === "standard" ? "专业模式" : "普通模式"}`,
        sub: "YAML Front Matter 编辑器",
        run: () => setMode(mode === "standard" ? "pro" : "standard"),
      },
      {
        key: "folder",
        icon: "📂",
        label: "打开工作区文件夹",
        sub: "在文件管理器中查看全部项目",
        run: () => void api.openWorkspaceFolder(),
      },
      {
        key: "summary",
        icon: "📊",
        label: "查看汇总视图",
        sub: "自动生成的虚拟仪表盘",
        run: () => setShowSummary(true),
      },
      {
        key: "sync",
        icon: "🔄",
        label: "局域网同步",
        sub: "与已信任设备增量同步，解决冲突",
        run: () => setShowSync(true),
      },
      {
        key: "settings",
        icon: "⚙️",
        label: "设置",
        sub: "主题、工作区目录…",
        run: () => setShowSettings(true),
      },
      {
        key: "help",
        icon: "💡",
        label: "帮助中心",
        sub: "快速上手、快捷键、常见问题",
        run: () => setShowHelp(true),
      },
    );
    return list;
  }, [projects, templates, mode, selectProject, createProject, setMode]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return items;
    return items.filter((it) => `${it.label} ${it.sub ?? ""}`.toLowerCase().includes(q));
  }, [items, query]);

  useEffect(() => {
    setHighlight(0);
  }, [query]);

  const execute = (it: PaletteItem) => {
    if (it.key === "summary" || it.key === "settings" || it.key === "sync") {
      it.run();
    } else {
      onClose();
      it.run();
    }
  };

  return (
    <>
      <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/35 p-6 pt-[15vh] backdrop-blur-[2px]" onClick={onClose}>
        <div
          className="w-full max-w-xl overflow-hidden rounded-xl border border-base-200 bg-white shadow-2xl dark:border-base-700 dark:bg-base-800"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-center gap-2.5 border-b border-base-200 px-4 py-3 dark:border-base-700">
            <span className="text-base-400">⌕</span>
            <input
              ref={inputRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "ArrowDown") {
                  e.preventDefault();
                  setHighlight((h) => Math.min(h + 1, filtered.length - 1));
                } else if (e.key === "ArrowUp") {
                  e.preventDefault();
                  setHighlight((h) => Math.max(h - 1, 0));
                } else if (e.key === "Enter") {
                  e.preventDefault();
                  const it = filtered[highlight];
                  if (it) execute(it);
                } else if (e.key === "Escape") {
                  onClose();
                }
              }}
              placeholder="搜索项目、模板或输入命令…  (Esc 关闭)"
              className="flex-1 bg-transparent text-sm text-base-800 outline-none placeholder:text-base-400 dark:text-base-100"
            />
            <kbd className="rounded border border-base-200 px-1.5 py-0.5 text-[10px] text-base-400 dark:border-base-700 dark:text-base-500">
              Ctrl/⌘ K
            </kbd>
          </div>
          {showSummary && <SummaryDialog onClose={() => setShowSummary(false)} />}
          <div className="max-h-72 min-h-16 overflow-y-auto p-1.5">
            {filtered.length === 0 && (
              <p className="px-3 py-6 text-center text-sm text-base-400">没有匹配「{query}」的结果</p>
            )}
            {filtered.map((it, i) => (
              <button
                key={it.key}
                onMouseEnter={() => setHighlight(i)}
                onClick={() => execute(it)}
                className={`flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left transition-colors ${
                  i === highlight ? "bg-brand-50 dark:bg-brand-900/30" : ""
                }`}
              >
                <span className="text-base">{it.icon}</span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm text-base-800 dark:text-base-100">{it.label}</span>
                  {it.sub && <span className="block truncate text-[11px] text-base-400 dark:text-base-500">{it.sub}</span>}
                </span>
                <span className={`text-base-300 ${i === highlight ? "text-brand-500" : ""}`}>⏎</span>
              </button>
            ))}
          </div>
        </div>
      </div>
      {showSettings && <SettingsDialog onClose={() => setShowSettings(false)} />}
      {showHelp && <HelpDialog onClose={() => setShowHelp(false)} />}
      {showSync && <SyncDialog onClose={() => setShowSync(false)} />}
    </>
  );
}