import { useCallback, useEffect, useState } from "react";
import { api } from "../api";
import { flushPending, useStore } from "../store";
import type { ChangeEntry, Project, SnapshotInfo } from "../types";

function formatSize(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${bytes} B`;
}

export function HistoryDialog({
  projectId,
  onClose,
}: {
  projectId: string;
  onClose: () => void;
}) {
  const notify = useStore((s) => s.notify);
  const runBusy = useStore((s) => s.runBusy);
  const restoreSnapshot = useStore((s) => s.restoreSnapshot);
  const [tab, setTab] = useState<"snapshots" | "changes">("snapshots");
  const [snapshots, setSnapshots] = useState<SnapshotInfo[] | null>(null);
  const [changes, setChanges] = useState<ChangeEntry[] | null>(null);
  const [previewKey, setPreviewKey] = useState<string | null>(null);
  const [preview, setPreview] = useState<Project | null>(null);

  const load = useCallback(async () => {
    try {
      const [snaps, chans] = await Promise.all([
        api.listSnapshots(projectId),
        api.loadProjectChanges(projectId, 30),
      ]);
      setSnapshots(snaps);
      setChanges(chans);
    } catch (e) {
      notify(`加载历史失败: ${e}`, "error");
    }
  }, [projectId, notify]);

  useEffect(() => {
    load();
  }, [load]);

  const doRestore = async (s: SnapshotInfo) => {
    if (!window.confirm(`将项目恢复到 ${s.time} 时的版本？当前版本会被保留为新的快照。`)) return;
    await flushPending.run();
    const restored = await restoreSnapshot(projectId, s.timestamp);
    if (restored) {
      setPreviewKey(null);
      setPreview(null);
      load();
    }
  };

  const showPreview = async (s: SnapshotInfo) => {
    if (previewKey === s.timestamp) {
      setPreviewKey(null);
      setPreview(null);
      return;
    }
    try {
      const p = await runBusy(() => api.readSnapshot(projectId, s.timestamp));
      if (p) {
        setPreviewKey(s.timestamp);
        setPreview(p);
      }
    } catch (e) {
      notify(String(e), "error");
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-6 backdrop-blur-[2px]" onClick={onClose}>
      <div
        className="flex max-h-[86vh] w-full max-w-3xl flex-col overflow-hidden rounded-xl border border-base-200 bg-white shadow-2xl dark:border-base-700 dark:bg-base-800"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-base-200 px-5 py-4 dark:border-base-700">
          <div className="flex items-center gap-2">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-brand-100 text-sm dark:bg-brand-900/50">
              🕐
            </span>
            <h2 className="text-base font-semibold text-base-800 dark:text-base-100">历史版本</h2>
            <span className="text-xs text-base-400 dark:text-base-500">每次保存自动留存快照，保留 30 天</span>
          </div>
          <button onClick={onClose} className="text-base-400 hover:text-base-600 dark:hover:text-base-200">
            ✕
          </button>
        </div>

        <div className="flex gap-1 border-b border-base-200 px-5 py-2 dark:border-base-700">
          {(
            [
              ["snapshots", "📸 时间快照"],
              ["changes", "📝 变更记录"],
            ] as [typeof tab, string][]
          ).map(([k, label]) => (
            <button
              key={k}
              onClick={() => setTab(k)}
              className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                tab === k
                  ? "bg-brand-100 text-brand-700 dark:bg-brand-900/40 dark:text-brand-300"
                  : "text-base-500 hover:text-base-700 dark:text-base-400 dark:hover:text-base-200"
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-5">
          {tab === "snapshots" ? (
            <div className="space-y-3">
              <p className="text-xs text-base-400 dark:text-base-500">
                共 {snapshots?.length ?? 0} 个快照 · 点击「预览」可查看该版本内容，恢复前请确认。
              </p>
              {snapshots === null ? (
                <p className="py-8 text-center text-sm text-base-400">加载中…</p>
              ) : snapshots.length === 0 ? (
                <p className="py-8 text-center text-sm text-base-400">
                  暂无快照。对项目做一次编辑并保存后，这里会出现可恢复的历史版本。
                </p>
              ) : (
                <ul className="divide-y divide-base-100 rounded-xl border border-base-200 dark:divide-base-800 dark:border-base-700">
                  {snapshots.map((s) => (
                    <li key={s.timestamp} className={`px-4 py-2.5 ${previewKey === s.timestamp ? "bg-brand-50/60 dark:bg-brand-900/20" : ""}`}>
                      <div className="flex items-center gap-2">
                        <span className="text-sm text-base-700 dark:text-base-200">{s.time}</span>
                        <span className="text-xs text-base-400 dark:text-base-500">{formatSize(s.size)}</span>
                        <div className="ml-auto flex items-center gap-1.5">
                          <button
                            onClick={() => showPreview(s)}
                            className="rounded px-2 py-1 text-xs text-base-400 hover:bg-base-100 hover:text-brand-600 dark:hover:bg-base-700"
                          >
                            {previewKey === s.timestamp ? "隐藏" : "预览"}
                          </button>
                          <button
                            onClick={() => doRestore(s)}
                            className="rounded bg-brand-50 px-2 py-1 text-xs text-brand-700 hover:bg-brand-100 dark:bg-brand-900/40 dark:text-brand-300"
                          >
                            ↺ 恢复此版本
                          </button>
                        </div>
                      </div>
                      {s.summary && <p className="mt-0.5 truncate text-xs text-base-400 dark:text-base-500">{s.summary}</p>}
                      {previewKey === s.timestamp && preview && (
                        <div className="mt-2 space-y-1.5 rounded-lg bg-base-50 p-3 text-xs dark:bg-base-900/40">
                          <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
                            {fieldRows(preview).map(([label, value], i) => (
                              <div key={i} className="flex gap-2">
                                <span className="w-16 shrink-0 text-base-400">{label}</span>
                                <span className="min-w-0 flex-1 truncate text-base-700 dark:text-base-200">{value}</span>
                              </div>
                            ))}
                          </div>
                          <details>
                            <summary className="cursor-pointer text-xs text-base-400 hover:text-base-600">正文预览</summary>
                            <pre className="mt-1 max-h-48 overflow-y-auto whitespace-pre-wrap break-words rounded bg-white p-2 font-mono text-[11px] text-base-600 dark:bg-base-800 dark:text-base-300">
                              {preview.body || "（空）"}
                            </pre>
                          </details>
                        </div>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ) : (
            <div>
              {changes === null ? (
                <p className="py-8 text-center text-sm text-base-400">加载中…</p>
              ) : changes.length === 0 ? (
                <p className="py-8 text-center text-sm text-base-400">近 30 天没有字段变更记录。</p>
              ) : (
                <ul className="divide-y divide-base-100 rounded-xl border border-base-200 dark:divide-base-800 dark:border-base-700">
                  {changes.map((c, i) => (
                    <li key={i} className="px-4 py-2 text-xs">
                      <div className="flex items-center gap-2">
                        <span className="text-base-400 dark:text-base-500">{c.at.slice(0, 16).replace("T", " ")}</span>
                        <span className="rounded bg-base-100 px-1.5 py-0.5 font-medium text-base-600 dark:bg-base-700 dark:text-base-300">
                          {c.field}
                        </span>
                      </div>
                      <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-base-600 dark:text-base-300">
                        <span className="line-through decoration-red-400/60">{c.old || "—"}</span>
                        <span className="text-base-300 dark:text-base-600">→</span>
                        <span className="text-emerald-600 dark:text-emerald-400">{c.new || "—"}</span>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function fieldRows(p: Project): [string, string][] {
  const m = p.meta;
  return [
    ["名称", m.name],
    ["负责人", m.owner ?? "-"],
    ["状态", m.status],
    ["优先级", m.priority ?? "-"],
    ["进度", m.progress !== undefined ? `${m.progress}%` : "-"],
    ["截止日期", m.deadline ?? "-"],
  ];
}