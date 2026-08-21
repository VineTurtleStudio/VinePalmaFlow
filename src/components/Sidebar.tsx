import { useMemo, useState } from "react";
import { useStore } from "../store";
import { StatusBadge, Tag } from "./Badges";
import { NewProjectDialog } from "./NewProjectDialog";
import { SummaryDialog } from "./SummaryDialog";
import { HelpDialog } from "./HelpDialog";
import { SettingsDialog } from "./SettingsDialog";
import { SyncDialog } from "./SyncDialog";
import type { ProjectSummary, TrashEntry } from "../types";

const isExternal = (folder: string) => folder.startsWith("/") || /^[A-Za-z]:[\\/]/.test(folder);

export function Sidebar() {
  const projects = useStore((s) => s.projects);
  const currentProject = useStore((s) => s.currentProject);
  const selectProject = useStore((s) => s.selectProject);
  const trash = useStore((s) => s.trash);
  const restoreProject = useStore((s) => s.restoreProject);
  const purgeProject = useStore((s) => s.purgeProject);
  const purgeTrash = useStore((s) => s.purgeTrash);
  const [query, setQuery] = useState("");
  const [showNew, setShowNew] = useState(false);
  const [showSummary, setShowSummary] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showSync, setShowSync] = useState(false);

  const byRecent = useMemo(
    () =>
      [...projects].sort((a, b) =>
        (b.meta.updated_at ?? "").localeCompare(a.meta.updated_at ?? ""),
      ),
    [projects],
  );

  const filtered = useMemo(() => {
    const source = byRecent;
    if (!query.trim()) return source;
    const q = query.toLowerCase();
    return source.filter((p) => {
      const m = p.meta;
      return (
        m.name.toLowerCase().includes(q) ||
        (m.owner ?? "").toLowerCase().includes(q) ||
        (m.tags ?? []).some((t) => t.toLowerCase().includes(q))
      );
    });
  }, [byRecent, query]);

  const active = projects.filter((p) => p.meta.status === "active");
  const archived = projects.filter((p) => p.meta.status === "archived");

  return (
    <aside className="flex w-64 shrink-0 flex-col border-r border-base-200 bg-base-50 dark:border-base-800 dark:bg-base-900/50">
      <div className="flex items-center gap-2 p-3 pb-0">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="搜索项目 / 标签..."
          className="w-full rounded-lg border border-base-200 bg-white px-3 py-1.5 text-sm text-base-800 outline-none placeholder:text-base-400 focus:border-brand-400 dark:border-base-700 dark:bg-base-800 dark:text-base-100"
        />
      </div>

      <div className="px-3 pt-3">
        <button
          onClick={() => setShowNew(true)}
          className="flex w-full items-center justify-center gap-1.5 rounded-lg bg-brand-600 px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-brand-700"
        >
          <span className="text-base leading-none">＋</span> 新建项目
        </button>
      </div>

      <nav className="mt-3 flex-1 overflow-y-auto px-2 pb-4">
        <ProjectGroup
          title={`进行中 (${active.length})`}
          projects={filtered.filter((p) => p.meta.status === "active")}
          currentId={currentProject?.meta.id}
          onSelect={(id) => selectProject(id)}
        />
        {archived.length > 0 && (
          <ProjectGroup
            title={`已归档 (${archived.length})`}
            projects={filtered.filter((p) => p.meta.status === "archived")}
            currentId={currentProject?.meta.id}
            onSelect={(id) => selectProject(id)}
          />
        )}
        {trash.length > 0 && (
          <TrashGroup
            entries={trash}
            onRestore={(folder) => restoreProject(folder)}
            onPurge={(folder) => {
              if (window.confirm(`彻底删除「${trash.find((t) => t.folder === folder)?.meta.name ?? folder}」？此操作不可恢复。`)) {
                purgeProject(folder);
              }
            }}
            onPurgeAll={() => {
              if (window.confirm(`清空回收站？将彻底删除 ${trash.length} 个项目，此操作不可恢复。`)) {
                purgeTrash();
              }
            }}
          />
        )}
      </nav>

      <footer className="border-t border-base-200 p-3 dark:border-base-800">
        <button
          onClick={() => setShowSummary(true)}
          className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-base-200 px-3 py-1.5 text-xs text-base-500 hover:border-brand-400 hover:text-brand-600 dark:border-base-700 dark:text-base-400"
        >
          📊 工作区汇总视图
        </button>
        <div className="mt-2 flex gap-2">
          <button
            onClick={() => setShowSync(true)}
            className="flex flex-1 items-center justify-center gap-1 rounded-lg border border-base-200 px-2 py-1.5 text-xs text-base-500 hover:border-brand-400 hover:text-brand-600 dark:border-base-700 dark:text-base-400"
          >
            🔄 同步
          </button>
          <button
            onClick={() => setShowHelp(true)}
            className="flex flex-1 items-center justify-center gap-1 rounded-lg border border-base-200 px-2 py-1.5 text-xs text-base-500 hover:border-brand-400 hover:text-brand-600 dark:border-base-700 dark:text-base-400"
          >
            💡 帮助中心
          </button>
          <button
            onClick={() => setShowSettings(true)}
            className="flex flex-1 items-center justify-center gap-1 rounded-lg border border-base-200 px-2 py-1.5 text-xs text-base-500 hover:border-brand-400 hover:text-brand-600 dark:border-base-700 dark:text-base-400"
          >
            ⚙️ 设置
          </button>
        </div>
        <p className="mt-2 text-center text-xs text-base-400 dark:text-base-500">
          📦 纯本地存储 · 数据永不离开设备
        </p>
      </footer>

      {showNew && <NewProjectDialog onClose={() => setShowNew(false)} />}
      {showSummary && <SummaryDialog onClose={() => setShowSummary(false)} />}
      {showHelp && <HelpDialog onClose={() => setShowHelp(false)} />}
      {showSettings && <SettingsDialog onClose={() => setShowSettings(false)} />}
      {showSync && <SyncDialog onClose={() => setShowSync(false)} />}
    </aside>
  );
}

function TrashGroup({
  entries,
  onRestore,
  onPurge,
  onPurgeAll,
}: {
  entries: TrashEntry[];
  onRestore: (folder: string) => void;
  onPurge: (folder: string) => void;
  onPurgeAll: () => void;
}) {
  return (
    <div className="mt-3">
      <div className="flex items-center justify-between px-2 pb-1">
        <h3 className="text-xs font-medium text-base-400 dark:text-base-500">回收站 ({entries.length})</h3>
        <button
          onClick={onPurgeAll}
          className="text-[10px] text-base-400 hover:text-red-500 dark:text-base-500"
          title="清空回收站"
        >
          清空
        </button>
      </div>
      <ul className="space-y-0.5">
        {entries.map((e) => (
          <li
            key={e.folder}
            className="group rounded-lg px-2 py-1.5 text-left hover:bg-base-100 dark:hover:bg-base-800/60"
          >
            <div className="flex items-center gap-1.5">
              <span className="text-sm">🗑</span>
              <span className="min-w-0 flex-1 truncate text-sm text-base-500 dark:text-base-400">
                {e.meta.name}
              </span>
            </div>
            <div className="mt-1 flex items-center gap-1.5 pl-6">
              <button
                onClick={() => onRestore(e.folder)}
                className="rounded bg-brand-50 px-1.5 py-0.5 text-[10px] text-brand-700 hover:bg-brand-100 dark:bg-brand-900/40 dark:text-brand-300"
              >
                ↺ 恢复
              </button>
              {e.attach_count > 0 && (
                <span className="text-[10px] text-base-400" title="附件数">📎 {e.attach_count}</span>
              )}
              <button
                onClick={() => onPurge(e.folder)}
                className="ml-auto text-[10px] text-base-400 hover:text-red-500"
                title="彻底删除"
              >
                ✕
              </button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

function ProjectGroup({
  title,
  projects,
  currentId,
  onSelect,
}: {
  title: string;
  projects: ProjectSummary[];
  currentId?: string;
  onSelect: (id: string) => void;
}) {
  const templateIcon = useStore((s) => s.templates);
  return (
    <div className="mt-2">
      <h3 className="px-2 pb-1 text-xs font-medium text-base-400 dark:text-base-500">{title}</h3>
      {projects.length === 0 && <p className="px-2 py-1 text-xs text-base-300 dark:text-base-600">暂无</p>}
      <ul className="space-y-0.5">
        {projects.map((p) => {
          const tpl = templateIcon.find((t) => t.template_id === p.meta.template_id);
          const selected = p.meta.id === currentId;
          return (
            <li key={p.meta.id} className="group relative">
              <button
                onClick={() => onSelect(p.meta.id)}
                className={`w-full rounded-lg px-2 py-1.5 pr-8 text-left transition-colors ${
                  selected
                    ? "bg-brand-100 dark:bg-brand-900/40"
                    : "hover:bg-base-100 dark:hover:bg-base-800/60"
                }`}
              >
                <div className="flex items-center gap-1.5">
                  <span className="text-sm">{tpl?.icon ?? "📄"}</span>
                  <span className="min-w-0 flex-1 truncate text-sm text-base-800 dark:text-base-100">
                    {p.meta.name}
                  </span>
                  {isExternal(p.folder) && (
                    <span
                      className="shrink-0 rounded bg-base-100 px-1 text-[9px] text-base-500 dark:bg-base-800 dark:text-base-400"
                      title={`外部项目：${p.folder}`}
                    >
                      🔗
                    </span>
                  )}
                </div>
                <div className="mt-1 flex items-center gap-1.5 pl-6">
                  <StatusBadge status={p.meta.status} />
                  {p.meta.priority && <span className="text-xs text-base-400 dark:text-base-500">{p.meta.priority}</span>}
                  {p.task_count > 0 && (
                    <span className="text-[10px] text-base-400 dark:text-base-500" title="任务文件数">
                      📋 {p.task_count}
                    </span>
                  )}
                  <span className="ml-auto text-[10px] text-base-300 dark:text-base-600">
                    {p.meta.progress !== undefined ? `${p.meta.progress}%` : ""}
                  </span>
                </div>
                {p.meta.tags && p.meta.tags.length > 0 && (
                  <div className="mt-1 flex flex-wrap gap-1 pl-6">
                    {p.meta.tags.slice(0, 3).map((t) => (
                      <Tag key={t}>{t}</Tag>
                    ))}
                  </div>
                )}
              </button>
              <ProjectMenu project={p} />
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function ProjectMenu({ project }: { project: ProjectSummary }) {
  const [open, setOpen] = useState(false);
  const cloneProject = useStore((s) => s.cloneProject);
  const setProjectStatus = useStore((s) => s.setProjectStatus);
  const deleteProject = useStore((s) => s.deleteProject);
  const unlinkProject = useStore((s) => s.unlinkProject);
  const m = project.meta;
  return (
    <>
      <button
        onClick={(e) => {
          e.stopPropagation();
          setOpen((v) => !v);
        }}
        className="absolute right-1.5 top-1.5 z-[5] flex h-5 w-5 items-center justify-center rounded text-base-300 opacity-0 transition-opacity hover:bg-base-200 hover:text-base-600 group-hover:opacity-100 focus:opacity-100 dark:text-base-500 dark:hover:bg-base-700 dark:hover:text-base-200"
        title="项目操作"
      >
        ⋯
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-8 z-20 w-40 rounded-xl border border-base-200 bg-white p-1 shadow-xl dark:border-base-700 dark:bg-base-800">
            <MenuItem
              onClick={() => {
                setOpen(false);
                cloneProject(m.id);
              }}
            >
              ⧉ 克隆项目
            </MenuItem>
            <MenuItem
              onClick={() => {
                setOpen(false);
                setProjectStatus(m.id, m.status === "archived" ? "active" : "archived");
              }}
            >
              {m.status === "archived" ? "↩ 取消归档" : "🗂 归档项目"}
            </MenuItem>
            <div className="my-1 h-px bg-base-100 dark:bg-base-700" />
            {isExternal(project.folder) ? (
              <MenuItem
                danger
                onClick={() => {
                  setOpen(false);
                  if (window.confirm(`解除对「${m.name}」的链接？外部文件夹内容不会改变。`))
                    unlinkProject(m.id);
                }}
              >
                ⛓ 解除链接
              </MenuItem>
            ) : (
              <MenuItem
                danger
                onClick={() => {
                  setOpen(false);
                  if (window.confirm(`将项目「${m.name}」移入回收站？`)) deleteProject(m.id);
                }}
              >
                🗑 删除
              </MenuItem>
            )}
          </div>
        </>
      )}
    </>
  );
}

function MenuItem({
  children,
  onClick,
  danger,
}: {
  children: React.ReactNode;
  onClick: () => void;
  danger?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-xs ${
        danger
          ? "text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-900/20"
          : "text-base-700 hover:bg-base-50 dark:text-base-200 dark:hover:bg-base-700"
      }`}
    >
      {children}
    </button>
  );
}