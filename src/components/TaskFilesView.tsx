import { useCallback, useEffect, useRef, useState } from "react";
import { api, type TaskFileInfo } from "../api";
import { useStore } from "../store";
import type { ProjectMeta } from "../types";

const BLANK_TASK_META: ProjectMeta = {
  id: "",
  name: "",
  status: "active",
  created_at: "",
  updated_at: "",
  version: 1,
};

function checklistStats(body: string): { done: number; total: number } {
  let done = 0;
  let total = 0;
  for (const line of body.split("\n")) {
    const t = line.trim();
    if (t.startsWith("- [x]") || t.startsWith("- [X]")) done += 1;
    if (t.startsWith("- [ ]")) total += 1;
  }
  return { done, total: done + total };
}

export function TaskFilesView({ projectId }: { projectId: string }) {
  const notify = useStore((s) => s.notify);
  const refreshProjects = useStore((s) => s.refreshProjects);
  const [files, setFiles] = useState<TaskFileInfo[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const list = await api.listTaskFiles(projectId);
      setFiles(list);
      setSelected((cur) => (cur && list.some((f) => f.name === cur) ? cur : (list[0]?.name ?? null)));
    } catch (e) {
      notify(`加载任务失败: ${e}`, "error");
    } finally {
      setLoading(false);
    }
  }, [projectId, notify]);

  useEffect(() => {
    setLoading(true);
    load();
  }, [load]);

  const current = files.find((f) => f.name === selected) ?? null;

  const createTask = async () => {
    const base = `task-${files.length + 1}`;
    try {
      const created = await api.saveTaskFile(projectId, base, { ...BLANK_TASK_META, name: base }, "");
      setFiles((prev) => [...prev, created]);
      setSelected(created.name);
      refreshProjects();
      notify(`已创建任务文件 ${created.name}`);
    } catch (e) {
      notify(`创建失败: ${e}`, "error");
    }
  };

  const deleteTask = async (name: string) => {
    if (!window.confirm(`确认删除任务文件「${name}」？`)) return;
    try {
      await api.deleteTaskFile(projectId, name);
      setFiles((prev) => prev.filter((f) => f.name !== name));
      refreshProjects();
      notify("任务文件已删除");
    } catch (e) {
      notify(`删除失败: ${e}`, "error");
    }
  };

  const renameTask = async (oldName: string, newBase: string) => {
    const base = newBase.trim().replace(/\.md$/i, "");
    if (!base || base === oldName.replace(/\.md$/i, "")) return;
    if (files.some((f) => f.name === `${base}.md`)) {
      notify("已存在同名任务文件", "error");
      return;
    }
    const src = files.find((f) => f.name === oldName);
    if (!src) return;
    try {
      const oldBase = oldName.replace(/\.md$/i, "");
      const newMeta = src.meta.name === oldBase ? { ...src.meta, name: base } : src.meta;
      const saved = await api.saveTaskFile(projectId, base, newMeta, src.body);
      if (base !== oldName.replace(/\.md$/i, "")) {
        await api.deleteTaskFile(projectId, oldName);
      }
      setFiles((prev) =>
        prev
          .filter((f) => f.name !== oldName)
          .concat(saved)
          .sort((a, b) => a.name.localeCompare(b.name)),
      );
      setSelected(saved.name);
      refreshProjects();
      notify(`已重命名为 ${saved.name}`);
    } catch (e) {
      notify(`重命名失败: ${e}`, "error");
    }
  };

  if (loading) {
    return (
      <div className="flex flex-1 items-center justify-center text-sm text-base-400">正在加载任务文件…</div>
    );
  }

  return (
    <div className="flex h-full min-h-0">
      <div className="flex w-56 shrink-0 flex-col border-r border-base-200 dark:border-base-700">
        <div className="flex items-center justify-between px-3 py-2">
          <span className="text-xs font-medium text-base-500 dark:text-base-400">
            任务文件 ({files.length})
          </span>
          <button
            onClick={createTask}
            className="rounded-md bg-brand-600 px-2 py-0.5 text-xs font-medium text-white hover:bg-brand-700"
            title="新建任务文件"
          >
            ＋ 新建
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-2">
          {files.length === 0 && (
            <p className="px-2 py-4 text-xs text-base-400 dark:text-base-500">
              暂无任务文件。点击「新建」创建第一个任务，每个任务对应 tasks/ 目录下的一个 .md 文件。
            </p>
          )}
          {files.map((f) => {
            const st = checklistStats(f.body);
            return (
              <div
                key={f.name}
                onClick={() => setSelected(f.name)}
                className={`group mb-1 cursor-pointer rounded-lg px-2.5 py-2 text-left ${
                  selected === f.name
                    ? "bg-brand-100 dark:bg-brand-900/40"
                    : "hover:bg-base-100 dark:hover:bg-base-800/60"
                }`}
              >
                <div className="flex items-center gap-1.5">
                  <span className="truncate text-xs font-medium text-base-700 dark:text-base-200">
                    {f.meta.name || f.name.replace(/\.md$/, "")}
                  </span>
                  {st.total > 0 && (
                    <span className={`shrink-0 text-[10px] ${st.done === st.total ? "text-emerald-600 dark:text-emerald-400" : "text-base-400 dark:text-base-500"}`}>
                      {st.done}/{st.total}
                    </span>
                  )}
                </div>
                <div className="mt-0.5 flex items-center justify-between">
                  <span className="truncate text-[10px] text-base-400 dark:text-base-500">{f.name}</span>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      deleteTask(f.name);
                    }}
                    className="invisible text-[10px] text-base-400 hover:text-red-500 group-hover:visible"
                    title="删除"
                  >
                    ✕
                  </button>
                </div>
                {st.total > 0 && (
                  <div className="mt-1 h-1 overflow-hidden rounded-full bg-base-200 dark:bg-base-700">
                    <div
                      className={`h-full rounded-full ${st.done === st.total ? "bg-emerald-500" : "bg-brand-500"}`}
                      style={{ width: `${Math.round((st.done / st.total) * 100)}%` }}
                    />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
      <div className="min-w-0 flex-1">
        {current ? (
          <TaskEditor
            key={current.name}
            file={current}
            projectId={projectId}
            onSaved={(f) => setFiles((prev) => prev.map((x) => (x.name === f.name ? f : x)))}
            onRename={(newBase) => renameTask(current.name, newBase)}
          />
        ) : (
          <div className="flex h-full items-center justify-center text-sm text-base-400">选择或新建一个任务文件</div>
        )}
      </div>
    </div>
  );
}

function TaskEditor({
  file,
  projectId,
  onSaved,
  onRename,
}: {
  file: TaskFileInfo;
  projectId: string;
  onSaved: (f: TaskFileInfo) => void;
  onRename: (newBase: string) => void;
}) {
  const notify = useStore((s) => s.notify);
  const [yaml, setYaml] = useState("");
  const [body, setBody] = useState("");
  const [name, setName] = useState(file.name.replace(/\.md$/i, ""));
  const [saving, setSaving] = useState(false);
  const timer = useRef<number | undefined>(undefined);

  useEffect(() => {
    setName(file.name.replace(/\.md$/i, ""));
    api
      .buildYaml(file.meta)
      .then(setYaml)
      .catch(() => undefined);
    setBody(file.body);
  }, [file]);

  useEffect(() => () => window.clearTimeout(timer.current), []);

  const commitRename = () => {
    if (name.trim() === file.name.replace(/\.md$/i, "")) return;
    const base = name.trim();
    if (!base) {
      setName(file.name.replace(/\.md$/i, ""));
      return;
    }
    onRename(base);
  };

  const doSave = async (silent = false) => {
    try {
      const parsed = await api.parseYamlMeta(yaml);
      const merged: ProjectMeta = {
        ...BLANK_TASK_META,
        ...parsed,
        id: file.meta.id || parsed.id,
        name: parsed.name || file.meta.name || file.name.replace(/\.md$/, ""),
      };
      const saved = await api.saveTaskFile(projectId, file.name, merged, body);
      onSaved(saved);
      if (!silent) notify("任务文件已保存");
    } catch (e) {
      notify(`保存失败: ${e}`, "error");
    }
  };

  const schedule = () => {
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => doSave(true), 800);
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center justify-between gap-3 border-b border-base-200 px-4 py-2 dark:border-base-700">
        <div className="flex min-w-0 items-center gap-2">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            onBlur={commitRename}
            onKeyDown={(e) => {
              if (e.key === "Enter") (e.target as HTMLInputElement).blur();
            }}
            spellCheck={false}
            title="编辑名称后回车或失焦可重命名任务文件"
            className="w-56 truncate rounded-md border border-transparent bg-transparent px-1.5 py-0.5 font-mono text-xs text-base-700 outline-none hover:border-base-200 focus:border-brand-400 focus:bg-white dark:text-base-200 dark:focus:bg-base-800"
          />
          <span className="text-[10px] text-base-300 dark:text-base-600">.md</span>
        </div>
        <button
          onClick={() => {
            setSaving(true);
            doSave(false).finally(() => setSaving(false));
          }}
          disabled={saving}
          className="shrink-0 rounded-lg bg-brand-600 px-3 py-1 text-xs font-medium text-white hover:bg-brand-700 disabled:opacity-50"
        >
          {saving ? "保存中…" : "保存"}
        </button>
      </div>
      <div className="grid min-h-0 flex-1 grid-cols-2">
        <div className="flex min-h-0 flex-col border-r border-base-200 dark:border-base-700">
          <div className="flex h-9 shrink-0 items-center border-b border-base-200 bg-base-50 px-4 text-xs font-medium text-base-500 dark:border-base-700 dark:bg-base-900/60 dark:text-base-400">
            YAML Front Matter
          </div>
          <textarea
            value={yaml}
            onChange={(e) => {
              setYaml(e.target.value);
              schedule();
            }}
            spellCheck={false}
            className="min-h-0 flex-1 resize-none bg-base-50 p-4 font-mono text-[13px] leading-relaxed text-base-800 outline-none dark:bg-base-900/60 dark:text-base-100"
          />
        </div>
        <div className="flex min-h-0 flex-col">
          <div className="flex h-9 shrink-0 items-center border-b border-base-200 bg-base-50 px-4 text-xs font-medium text-base-500 dark:border-base-700 dark:bg-base-900/60 dark:text-base-400">
            任务内容 Markdown
          </div>
          <textarea
            value={body}
            onChange={(e) => {
              setBody(e.target.value);
              schedule();
            }}
            spellCheck={false}
            className="min-h-0 flex-1 resize-none bg-base-50 p-4 font-mono text-[13px] leading-relaxed text-base-800 outline-none dark:bg-base-900/60 dark:text-base-100"
          />
        </div>
      </div>
    </div>
  );
}
