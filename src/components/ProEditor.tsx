import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "../api";
import { flushPending, useStore } from "../store";
import { HistoryDialog } from "./HistoryDialog";
import type { ProjectMeta } from "../types";

export function ProEditor() {
  const project = useStore((s) => s.currentProject);
  const setMode = useStore((s) => s.setMode);
  const selectProject = useStore((s) => s.selectProject);
  const notify = useStore((s) => s.notify);

  const [yaml, setYaml] = useState("");
  const [body, setBody] = useState("");
  const [html, setHtml] = useState("");
  const [saved, setSaved] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showHistory, setShowHistory] = useState(false);

  const saveTimer = useRef<number | undefined>(undefined);
  const lastGood = useRef<{ yaml: string; body: string } | null>(null);
  const dirtyRef = useRef(false);
  const latest = useRef({ yaml: "", body: "" });
  latest.current = { yaml, body };
  const projectRef = useRef(project);
  projectRef.current = project;

  useEffect(() => {
    if (!project) return;
    api
      .buildYaml(project.meta)
      .then((yml) => {
        setYaml(yml);
        setBody(project.body);
        lastGood.current = { yaml: yml, body: project.body };
        setSaved(true);
      })
      .catch((e) => notify(`加载失败: ${e}`, "error"));
  }, [project?.meta.id]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => () => window.clearTimeout(saveTimer.current), []);

  const doSave = async () => {
    const proj = projectRef.current;
    if (!proj) return;
    const folder = proj.folder;
    const { yaml: ymlText, body: bodyText } = latest.current;
    try {
      const parsed = await api.parseYamlMeta(ymlText);
      const merged: ProjectMeta = {
        ...parsed,
        id: proj.meta.id,
        created_at: proj.meta.created_at,
        version: proj.meta.version,
      };
      const savedProject = await api.saveProject({ meta: merged, body: bodyText, folder });
      const yml = await api.buildYaml(savedProject.meta);
      setYaml(yml);
      lastGood.current = { yaml: yml, body: bodyText };
      setError(null);
      setSaved(true);
      useStore.setState({ currentProject: savedProject });
    } catch (e) {
      setError(String(e));
      setSaved(true);
    }
  };

  const schedule = useCallback(() => {
    dirtyRef.current = true;
    setSaved(false);
    if (saveTimer.current) window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(() => {
      dirtyRef.current = false;
      doSave();
    }, 800);
    registerFlush();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const registerFlush = () => {
    flushPending.set(() => {
      if (!dirtyRef.current) return Promise.resolve();
      dirtyRef.current = false;
      if (saveTimer.current) window.clearTimeout(saveTimer.current);
      return doSave();
    });
  };

  useEffect(() => {
    registerFlush();
    return () => {
      flushPending.clear();
      window.clearTimeout(saveTimer.current);
      if (dirtyRef.current) {
        dirtyRef.current = false;
        doSave();
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onYamlChange = (v: string) => {
    setYaml(v);
    schedule();
  };
  const onBodyChange = (v: string) => {
    setBody(v);
    schedule();
  };

  useEffect(() => {
    if (!body) return;
    let alive = true;
    const t = window.setTimeout(() => {
      api.renderMarkdown(body).then((h) => alive && setHtml(h)).catch(() => undefined);
    }, 300);
    return () => {
      alive = false;
      window.clearTimeout(t);
    };
  }, [body]);

  if (!project) return null;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-center justify-between border-b border-base-200 px-5 py-2 dark:border-base-700">
        <div className="flex items-center gap-2">
          <span className="rounded bg-brand-100 px-2 py-0.5 text-xs font-semibold text-brand-700 dark:bg-brand-900/50 dark:text-brand-300">
            专业模式
          </span>
          <span className="text-xs text-base-400 dark:text-base-500">YAML Front Matter + Markdown · 数据完全透明</span>
        </div>
        <div className="flex items-center gap-3">
          {error ? (
            <span className="text-xs text-red-500">{error}</span>
          ) : (
            <span className={`text-xs ${saved ? "text-base-400 dark:text-base-500" : "text-amber-500"}`}>
              {saved ? "已保存 ✓" : "编辑中…自动保存"}
            </span>
          )}
          <button
            onClick={() => setShowHistory(true)}
            className="rounded-md px-2.5 py-1 text-xs text-base-400 hover:bg-base-100 hover:text-base-600 dark:hover:bg-base-800 dark:hover:text-base-200"
            title="历史版本：时间快照与变更记录"
          >
            🕐 历史
          </button>
          <button
            onClick={() => setMode("standard")}
            className="rounded-md bg-base-100 px-2.5 py-1 text-xs text-base-600 hover:bg-base-200 dark:bg-base-800 dark:text-base-300 dark:hover:bg-base-700"
          >
            返回普通模式
          </button>
          <button
            onClick={() => selectProject(null)}
            className="rounded-md px-2.5 py-1 text-xs text-base-400 hover:bg-base-100 hover:text-base-600 dark:hover:bg-base-800 dark:hover:text-base-200"
            title="关闭当前项目，返回首页（不会删除项目）"
          >
            ✕ 关闭
          </button>
        </div>
      </div>

      <div className="grid min-h-0 flex-1 grid-cols-2">
        <div className="flex min-h-0 flex-col border-r border-base-200 dark:border-base-700">
          <div className="flex h-9 shrink-0 items-center border-b border-base-200 bg-base-50 px-4 text-xs font-medium text-base-500 dark:border-base-700 dark:bg-base-900/60 dark:text-base-400">
            <span className="font-mono text-brand-600 dark:text-brand-400">---</span> Front Matter（YAML）
          </div>
          <textarea
            value={yaml}
            onChange={(e) => onYamlChange(e.target.value)}
            spellCheck={false}
            className="min-h-0 flex-1 resize-none bg-base-50 p-4 font-mono text-[13px] leading-relaxed text-base-800 outline-none dark:bg-base-900/60 dark:text-base-100"
          />
          <div className="flex h-9 shrink-0 items-center border-y border-base-200 bg-base-50 px-4 text-xs font-medium text-base-500 dark:border-base-700 dark:bg-base-900/60 dark:text-base-400">
            Markdown 正文
          </div>
          <textarea
            value={body}
            onChange={(e) => onBodyChange(e.target.value)}
            spellCheck={false}
            className="min-h-0 flex-1 resize-none bg-base-50 p-4 font-mono text-[13px] leading-relaxed text-base-800 outline-none dark:bg-base-900/60 dark:text-base-100"
          />
        </div>

        <div className="flex min-h-0 flex-col">
          <div className="flex h-9 shrink-0 items-center border-b border-base-200 bg-base-50 px-4 text-xs font-medium text-base-500 dark:border-base-700 dark:bg-base-900/60 dark:text-base-400">
            实时预览
          </div>
          <div
            className="markdown-body min-h-0 flex-1 overflow-y-auto bg-white p-6 dark:bg-base-800"
            dangerouslySetInnerHTML={{ __html: html }}
          />
        </div>
      </div>
      {showHistory && project && (
        <HistoryDialog projectId={project.meta.id} onClose={() => setShowHistory(false)} />
      )}
    </div>
  );
}