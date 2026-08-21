import { useState } from "react";
import { api } from "../api";
import { useStore } from "../store";
import type { ImportPreview, ImportStrategy } from "../types";

export function ImportDialog({
  initialPreview = null,
  onClose,
}: {
  initialPreview?: ImportPreview | null;
  onClose: () => void;
}) {
  const refreshProjects = useStore((s) => s.refreshProjects);
  const refreshTemplates = useStore((s) => s.refreshTemplates);
  const selectProject = useStore((s) => s.selectProject);
  const notify = useStore((s) => s.notify);
  const [preview, setPreview] = useState<ImportPreview | null>(initialPreview);
  const [strategy, setStrategy] = useState<ImportStrategy>("rename");
  const [busy, setBusy] = useState(false);

  const hasConflicts = preview?.conflicts.some((c) => c.exists) ?? false;

  const startPick = async () => {
    try {
      const p = await api.importFromDialog();
      setPreview(p);
    } catch (e) {
      if (!String(e).includes("取消")) notify(String(e), "error");
    }
  };

  const commit = async () => {
    if (!preview) return;
    setBusy(true);
    try {
      const imported = await api.importCommit(preview.source, strategy);
      await refreshProjects();
      await refreshTemplates();
      notify(`导入完成：${imported.length} 个项目${imported.length ? "" : "（模板已注册）"}`);
      onClose();
      if (imported.length >= 1) {
        await selectProject(imported[0].meta.id);
      }
    } catch (e) {
      notify(`导入失败: ${e}`, "error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-6" onClick={onClose}>
      <div
        className="w-[560px] rounded-xl border border-base-200 bg-white shadow-2xl dark:border-base-700 dark:bg-base-800"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-base-200 px-5 py-3 dark:border-base-700">
          <h2 className="text-sm font-semibold text-base-800 dark:text-base-100">导入数据</h2>
          <button onClick={onClose} className="text-base-400 hover:text-base-600 dark:hover:text-base-200">
            ✕
          </button>
        </div>

        <div className="p-5">
          {!preview ? (
            <div className="flex flex-col items-center gap-3 py-6 text-center">
              <div className="text-3xl">📥</div>
              <p className="text-sm text-base-500 dark:text-base-400">
                支持导入：LocalFlow Markdown (.md)、Excel (.xlsx)、
                <br />
                Markdown 文件夹、模板包 (.localflow-template)
              </p>
              <button
                onClick={startPick}
                className="rounded-lg bg-brand-600 px-4 py-1.5 text-xs font-medium text-white hover:bg-brand-700"
              >
                选择文件或文件夹
              </button>
            </div>
          ) : (
            <div className="space-y-4">
              <PreviewInfo preview={preview} />

              {preview.kind === "template" ? (
                <p className="rounded-lg bg-brand-50 px-3 py-2 text-xs text-brand-700 dark:bg-brand-900/40 dark:text-brand-300">
                  模板包将注册为自定义模板，可在「新建项目」中选择。
                </p>
              ) : (
                <>
                  {hasConflicts && (
                    <div>
                      <label className="mb-1.5 block text-xs font-medium text-base-500 dark:text-base-400">
                        发现同名项目，如何处理？
                      </label>
                      <div className="grid grid-cols-3 gap-2">
                        {(
                          [
                            { v: "overwrite", label: "覆盖", desc: "删除现有项目" },
                            { v: "rename", label: "重命名", desc: "导入为新副本" },
                            { v: "merge", label: "合并", desc: "字段合并" },
                          ] as { v: ImportStrategy; label: string; desc: string }[]
                        ).map((o) => (
                          <button
                            key={o.v}
                            onClick={() => setStrategy(o.v)}
                            className={`rounded-lg border p-2.5 text-left transition-colors ${
                              strategy === o.v
                                ? "border-brand-500 bg-brand-50 dark:bg-brand-900/30"
                                : "border-base-200 hover:border-brand-300 dark:border-base-700"
                            }`}
                          >
                            <div className="text-xs font-medium text-base-700 dark:text-base-200">{o.label}</div>
                            <div className="mt-0.5 text-[10px] text-base-400">{o.desc}</div>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                  {preview.conflicts.length > 0 && (
                    <div className="max-h-28 overflow-y-auto rounded-lg border border-base-200 p-2 text-xs text-base-500 dark:border-base-700 dark:text-base-400">
                      {preview.conflicts.map((c) => (
                        <div key={c.name} className="flex items-center justify-between py-0.5">
                          <span className="truncate">{c.name}</span>
                          <span className={c.exists ? "text-amber-500" : "text-emerald-500"}>
                            {c.exists ? "存在同名" : "新增"}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </>
              )}
            </div>
          )}
        </div>

        {preview && (
          <div className="flex items-center justify-end gap-2 border-t border-base-200 px-5 py-3 dark:border-base-700">
            <button
              onClick={() => setPreview(null)}
              className="rounded-lg px-3 py-1.5 text-xs text-base-500 hover:bg-base-100 dark:text-base-400 dark:hover:bg-base-700"
            >
              重新选择
            </button>
            <button
              onClick={commit}
              disabled={busy}
              className="rounded-lg bg-brand-600 px-4 py-1.5 text-xs font-medium text-white hover:bg-brand-700 disabled:opacity-50"
            >
              {busy ? "导入中..." : "确认导入"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function PreviewInfo({ preview }: { preview: ImportPreview }) {
  const kindLabel: Record<string, string> = {
    md: "Markdown 文件",
    xlsx: "Excel 文件",
    folder: "Markdown 文件夹",
    template: "模板包",
  };
  return (
    <div className="rounded-xl border border-base-200 bg-base-50 p-4 dark:border-base-700 dark:bg-base-900/40">
      <div className="flex items-center gap-3">
        <span className="text-2xl">{preview.kind === "template" ? "🧩" : "📦"}</span>
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-medium text-base-800 dark:text-base-100">
            {preview.name}
          </div>
          <div className="text-xs text-base-400 dark:text-base-500">
            {kindLabel[preview.kind]}
            {preview.kind === "folder" && ` · ${preview.file_count} 个 .md 文件`}
          </div>
        </div>
      </div>
      {preview.kind !== "template" && preview.conflicts.length > 0 && (
        <div className="mt-3 border-t border-base-200 pt-2 text-xs text-base-500 dark:border-base-700 dark:text-base-400">
          识别到项目：{preview.conflicts.map((c) => c.name).join("、")}
        </div>
      )}
    </div>
  );
}