import { useEffect, useMemo, useRef, useState } from "react";
import { api } from "../api";
import type { SearchResult } from "../types";

export function SearchDialog({
  onClose,
  onOpenProject,
}: {
  onClose: () => void;
  onOpenProject: (projectId: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[] | null>(null);
  const [highlight, setHighlight] = useState(0);
  const [searching, setSearching] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounce = useRef<number | undefined>(undefined);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    window.clearTimeout(debounce.current);
    const q = query.trim();
    if (q.length < 2) {
      setResults(null);
      return;
    }
    setSearching(true);
    debounce.current = window.setTimeout(async () => {
      try {
        const list = await api.searchAll(q, 60);
        setResults(list);
        setHighlight(0);
      } catch (e) {
        setResults([]);
        console.error(e);
      } finally {
        setSearching(false);
      }
    }, 250);
    return () => window.clearTimeout(debounce.current);
  }, [query]);

  const grouped = useMemo(() => {
    if (!results) return [];
    const map = new Map<string, { name: string; items: SearchResult[] }>();
    for (const r of results) {
      const g = map.get(r.project_id) ?? { name: r.project_name, items: [] };
      g.items.push(r);
      map.set(r.project_id, g);
    }
    return [...map.values()];
  }, [results]);

  const flat = results ?? [];
  const open = (r: SearchResult) => {
    onClose();
    onOpenProject(r.project_id);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/35 p-6 pt-[12vh] backdrop-blur-[2px]" onClick={onClose}>
      <div
        className="w-full max-w-2xl overflow-hidden rounded-xl border border-base-200 bg-white shadow-2xl dark:border-base-700 dark:bg-base-800"
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
                setHighlight((h) => Math.min(h + 1, flat.length - 1));
              } else if (e.key === "ArrowUp") {
                e.preventDefault();
                setHighlight((h) => Math.max(h - 1, 0));
              } else if (e.key === "Enter") {
                e.preventDefault();
                const r = flat[highlight];
                if (r) open(r);
              } else if (e.key === "Escape") {
                onClose();
              }
            }}
            placeholder="搜索所有项目与任务文件…  (Ctrl/⌘ Shift F)"
            className="flex-1 bg-transparent text-sm text-base-800 outline-none placeholder:text-base-400 dark:text-base-100"
          />
          <kbd className="rounded border border-base-200 px-1.5 py-0.5 text-[10px] text-base-400 dark:border-base-700 dark:text-base-500">
            Esc 关闭
          </kbd>
        </div>

        <div className="max-h-[50vh] overflow-y-auto p-1.5">
          {query.trim().length < 2 ? (
            <p className="px-3 py-6 text-center text-sm text-base-400">输入至少 2 个字符开始全工作区搜索</p>
          ) : searching && results === null ? (
            <p className="px-3 py-6 text-center text-sm text-base-400">搜索中…</p>
          ) : results && results.length === 0 ? (
            <p className="px-3 py-6 text-center text-sm text-base-400">没有找到「{query}」的相关内容</p>
          ) : (
            grouped.map((g) => (
              <div key={g.name} className="mb-1">
                <div className="px-3 pb-1 pt-2 text-[10px] font-medium uppercase tracking-wide text-base-400 dark:text-base-500">
                  {g.name}
                </div>
                {g.items.map((r, localIdx) => {
                  const idx = flat.indexOf(r);
                  return (
                    <button
                      key={`${r.project_id}-${r.file}-${r.line}-${localIdx}`}
                      onMouseEnter={() => setHighlight(idx)}
                      onClick={() => open(r)}
                      className={`flex w-full items-start gap-3 rounded-lg px-3 py-2 text-left transition-colors ${
                        idx === highlight ? "bg-brand-50 dark:bg-brand-900/30" : ""
                      }`}
                    >
                      <span className="mt-0.5 shrink-0 font-mono text-[10px] text-base-400 dark:text-base-500">
                        {r.file}:{r.line}
                      </span>
                      <span className="min-w-0 flex-1 break-all font-mono text-xs leading-relaxed text-base-700 dark:text-base-200">
                        <MatchText text={r.snippet} q={query} />
                      </span>
                    </button>
                  );
                })}
              </div>
            ))
          )}
        </div>
        <div className="flex items-center justify-between border-t border-base-200 px-4 py-2.5 text-[10px] text-base-400 dark:border-base-700 dark:text-base-500">
          <span>范围：project.md + tasks/*.md（最多 60 条）</span>
          <span>↑↓ 选择 · ⏎ 打开项目</span>
        </div>
      </div>
    </div>
  );
}

function MatchText({ text, q }: { text: string; q: string }) {
  const lower = text.toLowerCase();
  const i = lower.indexOf(q.toLowerCase());
  if (i < 0) return <>{text}</>;
  return (
    <>
      {text.slice(0, i)}
      <mark className="rounded bg-amber-200 px-0.5 text-base-900 dark:bg-amber-500/40 dark:text-amber-100">
        {text.slice(i, i + q.length)}
      </mark>
      {text.slice(i + q.length)}
    </>
  );
}