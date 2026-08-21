import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { flushPending, useStore } from "../store";
import { api } from "../api";
import { getFieldValue, isMetaField, setFieldValue } from "../lib/projectFields";import { FieldRenderer } from "./fields/FieldRenderer";
import { PriorityBadge, ProgressBar, StatusBadge } from "./Badges";
import { ProjectView } from "./views/ProjectViews";
import { TaskFilesView } from "./TaskFilesView";
import { AttachmentsView } from "./AttachmentsView";
import { HistoryDialog } from "./HistoryDialog";
import type { Template, TemplateField } from "../types";

export function StandardEditor() {
  const project = useStore((s) => s.currentProject);
  const templates = useStore((s) => s.templates);
  const applyPatch = useStore((s) => s.applyPatch);
  const saveCurrent = useStore((s) => s.saveCurrent);
  const selectProject = useStore((s) => s.selectProject);
  const deleteProject = useStore((s) => s.deleteProject);
  const externalChanges = useStore((s) => s.externalChanges);
  const clearExternalChange = useStore((s) => s.clearExternalChange);
  const [tab, setTab] = useState<"form" | "kanban" | "list" | "card" | "body" | "tasks" | "attachments">("form");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [saveState, setSaveState] = useState<"saved" | "pending">("saved");

  const saveTimer = useRef<number | undefined>(undefined);
  const pendingRef = useRef(false);
  useEffect(() => {
    registerFlush();
    return () => {
      flushPending.clear();
      window.clearTimeout(saveTimer.current);
      if (pendingRef.current) {
        pendingRef.current = false;
        saveCurrent();
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [saveCurrent]);
  const registerFlush = () => {
    flushPending.set(() => {
      if (!pendingRef.current) return Promise.resolve();
      pendingRef.current = false;
      if (saveTimer.current) window.clearTimeout(saveTimer.current);
      return saveCurrent();
    });
  };
  const scheduleSave = useCallback(() => {
    pendingRef.current = true;
    setSaveState("pending");
    if (saveTimer.current) window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(() => {
      saveCurrent().then(() => {
        pendingRef.current = false;
        setSaveState("saved");
      });
    }, 800);
    registerFlush();
  }, [saveCurrent]);

  const template: Template | undefined = useMemo(
    () => templates.find((t) => t.template_id === project?.meta.template_id),
    [templates, project?.meta.template_id],
  );

  if (!project) return null;
  const { meta } = project;

  const fields: TemplateField[] = template?.fields ?? genericFields;
  const hasListField = fields.some((f) => f.type === "list");
  const effectiveTab: "form" | "kanban" | "list" | "card" | "body" | "tasks" | "attachments" =
    (tab === "kanban" || tab === "list") && !hasListField ? "form" : tab;

  const setValue = (fieldId: string, value: unknown) => {
    applyPatch((p) => ({
      ...p,
      meta: setFieldValue(p.meta, fieldId, value),
    }));
    scheduleSave();
  };

  const knownCustomIds = new Set(fields.filter((f) => !isMetaField(f.id)).map((f) => f.id));
  const extendedKeys = Object.keys(meta.custom_fields ?? {}).filter((k) => !knownCustomIds.has(k));

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-start gap-3 border-b border-base-200 px-6 py-4 dark:border-base-700">
        <div className="flex min-w-0 flex-1 flex-col gap-2">
          <input
            value={meta.name}
            onChange={(e) => {
              setValue("name", e.target.value);
            }}
            className="border-none bg-transparent text-xl font-semibold text-base-800 outline-none placeholder:text-base-300 dark:text-base-100"
            placeholder="项目名称"
          />
          <div className="flex flex-wrap items-center gap-2 text-xs text-base-500 dark:text-base-400">
            <span>
              {template ? `${template.icon} ${template.name}` : "📄 项目"}
            </span>
            <span>·</span>
            <span>创建于 {meta.created_at}</span>
            {meta.updated_at && <span>· 更新于 {meta.updated_at.slice(0, 16).replace("T", " ")}</span>}
            <PriorityBadge priority={meta.priority} />
          </div>
          <ProgressBar value={meta.progress} />
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {externalChanges.some((c) => c.project_id === meta.id) && (
            <button
              onClick={async () => {
                const reloadProject = useStore.getState().reloadProject;
                await reloadProject();
                clearExternalChange(meta.id);
              }}
              className="rounded-md border border-amber-300 bg-amber-50 px-2 py-1 text-xs font-medium text-amber-700 hover:bg-amber-100 dark:border-amber-700 dark:bg-amber-900/30 dark:text-amber-300"
              title="项目文件被其他程序修改，点击重新载入最新内容"
            >
              ⚠ 外部修改 · 重新载入
            </button>
          )}
          <span className={`text-xs ${saveState === "saved" ? "text-base-400 dark:text-base-500" : "text-amber-500"}`}>
            {saveState === "saved" ? "已自动保存 ✓" : "正在保存…"}
          </span>
          <StatusBadge status={meta.status} />
          <button
            onClick={() => setShowHistory(true)}
            className="rounded-md px-2 py-1 text-xs text-base-400 hover:bg-base-100 hover:text-base-700 dark:hover:bg-base-800 dark:hover:text-base-200"
            title="历史版本：时间快照与变更记录"
          >
            🕐 历史
          </button>
          <button
            onClick={() => selectProject(null)}
            className="rounded-md px-2 py-1 text-xs text-base-400 hover:bg-base-100 hover:text-base-600 dark:hover:bg-base-800 dark:hover:text-base-200"
            title="关闭当前项目，返回首页（不会删除项目）"
          >
            ✕ 关闭
          </button>
          <button
            onClick={() => setConfirmDelete(true)}
            className="rounded-md px-2 py-1 text-xs text-base-400 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-900/20"
            title="删除项目（移入回收站）"
          >
            🗑
          </button>
        </div>
      </div>

      <div className="flex items-center gap-1 border-b border-base-200 px-6 pt-2 dark:border-base-700">
        <TabBtn active={effectiveTab === "form"} onClick={() => setTab("form")}>
          表单
        </TabBtn>
        {hasListField && (
          <TabBtn active={effectiveTab === "kanban"} onClick={() => setTab("kanban")}>
            看板
          </TabBtn>
        )}
        {hasListField && (
          <TabBtn active={effectiveTab === "list"} onClick={() => setTab("list")}>
            列表
          </TabBtn>
        )}
        <TabBtn active={effectiveTab === "card"} onClick={() => setTab("card")}>
          卡片
        </TabBtn>
        <TabBtn active={effectiveTab === "body"} onClick={() => setTab("body")}>
          正文 Markdown
        </TabBtn>
        <TabBtn active={effectiveTab === "tasks"} onClick={() => setTab("tasks")}>
          任务文件
        </TabBtn>
        <TabBtn active={effectiveTab === "attachments"} onClick={() => setTab("attachments")}>
          附件
        </TabBtn>
      </div>

      <div className="min-h-0 flex-1">
        {effectiveTab === "attachments" ? (
          <AttachmentsView projectId={meta.id} />
        ) : effectiveTab === "tasks" ? (
          <TaskFilesView projectId={meta.id} />
        ) : effectiveTab === "form" || effectiveTab === "body" ? (
          <div className="h-full overflow-y-auto px-6 py-4">
            {effectiveTab === "form" ? (
          <div className="mx-auto max-w-3xl space-y-5">
            {template?.template_id === "blank" && (
              <div className="rounded-xl border border-brand-200 bg-brand-50 p-4 text-xs leading-relaxed text-brand-800 dark:border-brand-800 dark:bg-brand-900/30 dark:text-brand-200">
                <div className="mb-1 font-semibold">💡 空白项目使用提示</div>
                <ul className="list-inside list-disc space-y-1">
                  <li>上方各字段可自由填写：负责人、截止日期、优先级、进度、标签等。</li>
                  <li>正文区域支持 Markdown，可写目标、里程碑、会议纪要等长内容。</li>
                  <li>「卡片」页签可预览项目概览；如需看板/列表视图，可在专业模式中为模板添加列表字段。</li>
                </ul>
              </div>
            )}
            {fields.map((f) => {
              if (f.type === "list") {
                return (
                  <section key={f.id} className="rounded-xl border border-base-200 p-4 dark:border-base-700">
                    <h3 className="mb-3 text-sm font-medium text-base-700 dark:text-base-200">{f.label}</h3>
                    <FieldRenderer field={f} value={getFieldValue(meta, f.id)} onChange={(v) => setValue(f.id, v)} />
                  </section>
                );
              }
              return (
                <label key={f.id} className="block">
                  <span className="mb-1.5 block text-xs font-medium text-base-500 dark:text-base-400">
                    {f.label}
                    {f.required && <span className="text-red-500"> *</span>}
                  </span>
                  <FieldRenderer field={f} value={getFieldValue(meta, f.id)} onChange={(v) => setValue(f.id, v)} />
                </label>
              );
            })}

            {extendedKeys.length > 0 && (
              <section className="rounded-xl border border-base-200 p-4 dark:border-base-700">
                <details>
                  <summary className="cursor-pointer text-sm font-medium text-base-700 dark:text-base-200">
                    扩展属性（专业模式字段，只读）{extendedKeys.length}
                  </summary>
                  <div className="mt-2 space-y-1.5">
                    {extendedKeys.map((k) => (
                      <div key={k} className="flex gap-2 text-xs">
                        <span className="w-36 shrink-0 truncate font-mono text-base-500">{k}</span>
                        <span className="flex-1 truncate text-base-700 dark:text-base-200">
                          {renderReadonly(meta.custom_fields?.[k])}
                        </span>
                      </div>
                    ))}
                  </div>
                </details>
              </section>
            )}
          </div>
        ) : effectiveTab === "body" ? (
          <BodyEditor body={project.body} onSave={(body) => {
            applyPatch((p) => ({ ...p, body }));
            scheduleSave();
          }} />
        ) : (
          <div className="h-full">
            <ProjectView
              view={effectiveTab}
              onItemsChange={(listFieldId, items) => {
                applyPatch((p) => ({
                  ...p,
                  meta: setFieldValue(p.meta, listFieldId, items),
                }));
                scheduleSave();
              }}
            />
          </div>
        )}
          </div>
        ) : (
          <div className="h-full">
            <ProjectView
              view={effectiveTab}
              onItemsChange={(listFieldId, items) => {
                applyPatch((p) => ({
                  ...p,
                  meta: setFieldValue(p.meta, listFieldId, items),
                }));
                scheduleSave();
              }}
            />
          </div>
        )}
      </div>

      {showHistory && <HistoryDialog projectId={meta.id} onClose={() => setShowHistory(false)} />}
      {confirmDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-6" onClick={() => setConfirmDelete(false)}>
          <div
            className="w-80 rounded-xl border border-base-200 bg-white p-5 shadow-2xl dark:border-base-700 dark:bg-base-800"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-sm font-semibold text-base-800 dark:text-base-100">确认删除？</h3>
            <p className="mt-2 text-xs text-base-500 dark:text-base-400">
              项目「{meta.name}」将移入本地回收站，不会上传到任何服务器。
            </p>
            <div className="mt-4 flex justify-end gap-2">
              <button
                onClick={() => setConfirmDelete(false)}
                className="rounded-lg px-3 py-1.5 text-xs text-base-500 hover:bg-base-100 dark:hover:bg-base-700"
              >
                取消
              </button>
              <button
                onClick={async () => {
                  setConfirmDelete(false);
                  await deleteProject(meta.id);
                  selectProject(null);
                }}
                className="rounded-lg bg-red-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-red-700"
              >
                删除
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function TabBtn({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`-mb-px rounded-t-lg border-b-2 px-3 py-2 text-xs font-medium transition-colors ${
        active
          ? "border-brand-500 text-brand-700 dark:text-brand-300"
          : "border-transparent text-base-500 hover:text-base-700 dark:text-base-400 dark:hover:text-base-200"
      }`}
    >
      {children}
    </button>
  );
}

function BodyEditor({ body, onSave }: { body: string; onSave: (body: string) => void }) {
  const [html, setHtml] = useState("");
  const [editing, setEditing] = useState(true);

  useEffect(() => {
    let alive = true;
    if (!editing) {
      markdownRenderer(body).then((h) => alive && setHtml(h));
    }
    return () => {
      alive = false;
    };
  }, [body, editing]);

  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-2 flex items-center justify-between">
        <p className="text-xs text-base-400 dark:text-base-500">
          正文使用 Markdown，支持 GFM 任务列表 - [ ] / - [x]
        </p>
        <div className="flex gap-1 rounded-lg bg-base-100 p-0.5 dark:bg-base-800">
          {(["edit", "preview"] as const).map((m) => (
            <button
              key={m}
              onClick={() => {
                setEditing(m === "edit");
                if (editing === false && m === "edit") onSave(body);
              }}
              className={`rounded-md px-2 py-0.5 text-xs ${
                (editing && m === "edit") || (!editing && m === "preview")
                  ? "bg-white text-base-800 shadow-sm dark:bg-base-700 dark:text-base-100"
                  : "text-base-500 dark:text-base-400"
              }`}
            >
              {m === "edit" ? "编辑" : "预览"}
            </button>
          ))}
        </div>
      </div>
      {editing ? (
        <textarea
          value={body}
          onChange={(e) => onSave(e.target.value)}
          className="h-96 w-full resize-y rounded-xl border border-base-200 bg-white p-4 font-mono text-sm text-base-800 outline-none focus:border-brand-400 dark:border-base-700 dark:bg-base-800 dark:text-base-100"
        />
      ) : (
        <div className="markdown-body min-h-48 rounded-xl border border-base-200 bg-white p-4 dark:border-base-700 dark:bg-base-800" dangerouslySetInnerHTML={{ __html: html }} />
      )}
    </div>
  );
}

const markdownRenderer = (md: string) => api.renderMarkdown(md);

function renderReadonly(value: unknown): string {
  if (value === null || value === undefined) return "-";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

const genericFields: TemplateField[] = [
  { id: "owner", type: "string", label: "负责人", required: false },
  { id: "deadline", type: "date", label: "截止日期", required: false },
  { id: "status", type: "select", label: "状态", required: false, options: [] },
  { id: "priority", type: "select", label: "优先级", required: false, options: ["P0", "P1", "P2", "P3"] },
  { id: "progress", type: "number", label: "进度 (%)", required: false },
  { id: "tags", type: "tags", label: "标签", required: false },
  { id: "description", type: "textarea", label: "描述", required: false },
];