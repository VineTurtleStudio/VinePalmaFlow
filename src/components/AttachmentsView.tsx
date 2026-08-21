import { useCallback, useEffect, useState } from "react";
import { api } from "../api";
import { useStore } from "../store";
import type { AttachmentInfo } from "../types";

function formatSize(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${bytes} B`;
}

function iconFor(name: string): string {
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  if (["png", "jpg", "jpeg", "gif", "webp", "svg"].includes(ext)) return "🖼";
  if (["pdf"].includes(ext)) return "📕";
  if (["xlsx", "xls", "csv"].includes(ext)) return "📊";
  if (["doc", "docx", "txt", "md"].includes(ext)) return "📄";
  if (["zip", "rar", "7z", "tar", "gz"].includes(ext)) return "🗜";
  return "📎";
}

export function AttachmentsView({ projectId }: { projectId: string }) {
  const notify = useStore((s) => s.notify);
  const runBusy = useStore((s) => s.runBusy);
  const [files, setFiles] = useState<AttachmentInfo[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      setFiles(await api.listAttachments(projectId));
    } catch (e) {
      notify(`加载附件失败: ${e}`, "error");
    } finally {
      setLoading(false);
    }
  }, [projectId, notify]);

  useEffect(() => {
    setLoading(true);
    load();
  }, [load]);

  const add = async () => {
    try {
      const list = await runBusy(() => api.addAttachment(projectId));
      if (list) {
        setFiles(list);
        notify("附件已添加");
      }
    } catch (e) {
      if (!String(e).includes("取消")) notify(String(e), "error");
    }
  };

  const remove = async (name: string) => {
    if (!window.confirm(`删除附件「${name}」？此操作不可恢复。`)) return;
    try {
      await api.deleteAttachment(projectId, name);
      setFiles((prev) => prev.filter((f) => f.name !== name));
      notify("附件已删除");
    } catch (e) {
      notify(`删除失败: ${e}`, "error");
    }
  };

  if (loading) {
    return <div className="flex flex-1 items-center justify-center text-sm text-base-400">正在加载附件…</div>;
  }

  return (
    <div className="mx-auto max-w-3xl px-6 py-5">
      <div className="mb-3 flex items-center justify-between gap-3">
        <p className="text-xs text-base-500 dark:text-base-400">
          附件保存在项目目录的 <code className="font-mono">attachments/</code> 文件夹中，双击可打开。
        </p>
        <div className="flex shrink-0 items-center gap-1.5">
          <button
            onClick={async () => {
              try {
                await runBusy(() => api.openProjectFolder(projectId).then(() => true));
              } catch (e) {
                notify(String(e), "error");
              }
            }}
            className="rounded-lg border border-base-200 px-3 py-1.5 text-xs text-base-600 hover:border-brand-400 hover:text-brand-600 dark:border-base-700 dark:text-base-300"
            title="在文件管理器中打开项目目录"
          >
            📂 打开目录
          </button>
          <button
            onClick={add}
            className="rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-brand-700"
          >
            ＋ 添加附件
          </button>
        </div>
      </div>
      {files.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-base-300 py-14 text-center dark:border-base-700">
          <div className="text-3xl">📎</div>
          <p className="text-sm text-base-500 dark:text-base-400">暂无附件</p>
          <p className="text-xs text-base-400 dark:text-base-500">点击右上角「添加附件」上传文档、图片、压缩包等。</p>
        </div>
      ) : (
        <ul className="divide-y divide-base-100 rounded-xl border border-base-200 dark:divide-base-800 dark:border-base-700">
          {files.map((f) => (
            <li
              key={f.name}
              onDoubleClick={() => api.openAttachment(projectId, f.name).catch((e) => notify(String(e), "error"))}
              className="group flex cursor-pointer items-center gap-3 px-4 py-2.5 hover:bg-base-50 dark:hover:bg-base-800/50"
              title={`双击打开 · 修改于 ${f.modified.slice(0, 16).replace("T", " ")}`}
            >
              <span className="text-xl">{iconFor(f.name)}</span>
              <span className="min-w-0 flex-1 truncate text-sm text-base-700 dark:text-base-200">{f.name}</span>
              <span className="shrink-0 text-xs text-base-400 dark:text-base-500">{formatSize(f.size)}</span>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  api.openAttachment(projectId, f.name).catch((err) => notify(String(err), "error"));
                }}
                className="rounded px-1.5 py-0.5 text-xs text-base-400 hover:bg-base-100 hover:text-brand-600 dark:hover:bg-base-700"
                title="打开"
              >
                打开
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  remove(f.name);
                }}
                className="rounded px-1.5 py-0.5 text-xs text-base-400 hover:bg-red-50 hover:text-red-500 dark:hover:bg-red-900/20"
                title="删除"
              >
                ✕
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
