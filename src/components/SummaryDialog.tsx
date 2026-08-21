import { useCallback, useEffect, useState } from "react";
import { api } from "../api";
import { useStore } from "../store";

export function SummaryDialog({ onClose }: { onClose: () => void }) {
  const notify = useStore((s) => s.notify);
  const runBusy = useStore((s) => s.runBusy);
  const [md, setMd] = useState("");
  const [html, setHtml] = useState("");
  const [refreshing, setRefreshing] = useState(false);

  const render = useCallback(
    (content: string) => {
      setMd(content);
      api.renderMarkdown(content).then(setHtml).catch((e) => notify(String(e), "error"));
    },
    [notify],
  );

  const load = useCallback(async (fresh = false) => {
    try {
      const content = fresh ? await api.refreshSummary() : await api.readSummary();
      render(content);
    } catch (e) {
      notify(`加载汇总视图失败: ${e}`, "error");
    }
  }, [render, notify]);

  useEffect(() => {
    load();
  }, [load]);

  const refresh = async () => {
    setRefreshing(true);
    await runBusy(() => api.refreshSummary().then((s) => {
      render(s);
      return s;
    }));
    setRefreshing(false);
    notify("汇总视图已重新生成");
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
              📊
            </span>
            <h2 className="text-base font-semibold text-base-800 dark:text-base-100">工作区汇总视图</h2>
            <span className="text-xs text-base-400 dark:text-base-500">保存在工作区根目录的汇总视图.md</span>
          </div>
          <div className="flex items-center gap-1.5">
            <button
              onClick={refresh}
              disabled={refreshing}
              className="rounded-lg border border-base-200 px-3 py-1 text-xs text-base-600 hover:border-brand-400 hover:text-brand-600 disabled:opacity-50 dark:border-base-700 dark:text-base-300"
            >
              {refreshing ? "刷新中…" : "↻ 重新生成"}
            </button>
            <button onClick={onClose} className="text-base-400 hover:text-base-600 dark:hover:text-base-200">
              ✕
            </button>
          </div>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-5">
          {md ? (
            <div className="markdown-body rounded-xl border border-base-200 bg-white p-5 dark:border-base-700 dark:bg-base-800" dangerouslySetInnerHTML={{ __html: html }} />
          ) : (
            <p className="py-8 text-center text-sm text-base-400">加载中…</p>
          )}
        </div>
        <div className="flex items-center justify-between border-t border-base-200 px-5 py-3.5 dark:border-base-700">
          <p className="text-xs text-base-400 dark:text-base-500">
            汇总视图随项目保存自动更新，导出全部项目时也会一并生成该文件。
          </p>
          <button
            onClick={onClose}
            className="rounded-lg bg-brand-600 px-5 py-1.5 text-xs font-medium text-white hover:bg-brand-700"
          >
            关闭
          </button>
        </div>
      </div>
    </div>
  );
}