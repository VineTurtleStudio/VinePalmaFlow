import { useMemo, useState } from "react";
import { useStore } from "../../store";
import { getFieldValue } from "../../lib/projectFields";
import type { Project, Template, TemplateField, ViewType } from "../../types";
import { TaskItemDialog } from "./TaskItemDialog";

interface ItemDialogState {
  index: number | null;
  item: Record<string, unknown> | null;
  preset: Record<string, unknown>;
}

const PALETTE = [
  "border-brand-300 bg-brand-50/70 dark:border-brand-700 dark:bg-brand-900/20",
  "border-sky-300 bg-sky-50/70 dark:border-sky-700 dark:bg-sky-900/20",
  "border-amber-300 bg-amber-50/70 dark:border-amber-700 dark:bg-amber-900/20",
  "border-violet-300 bg-violet-50/70 dark:border-violet-700 dark:bg-violet-900/20",
  "border-rose-300 bg-rose-50/70 dark:border-rose-700 dark:bg-rose-900/20",
  "border-emerald-300 bg-emerald-50/70 dark:border-emerald-700 dark:bg-emerald-900/20",
];

interface ListMeta {
  field: TemplateField;
  items: Record<string, unknown>[];
}

function primaryList(template: Template | undefined, project: Project): ListMeta | null {
  if (!template) return null;
  const listField = template.fields.find((f) => f.type === "list");
  if (!listField) return null;
  const items = (getFieldValue(project.meta, listField.id) as Record<string, unknown>[]) ?? ([] as Record<string, unknown>[]);
  return { field: listField, items };
}

function resolveGroupBy(groupBy: string | undefined, meta: ListMeta | null) {
  if (!meta) return { listFieldId: null, itemFieldId: null };
  if (groupBy) {
    const [listFieldId, itemFieldId] = groupBy.split(".");
    if (listFieldId && itemFieldId) return { listFieldId, itemFieldId };
  }
  const statusField = meta.field.item_template?.find((f) => f.id === "status" || f.id === "stage");
  return { listFieldId: meta.field.id, itemFieldId: statusField?.id ?? null };
}

function displayName(item: Record<string, unknown>): string {
  return (
    String(item.name ?? item.title ?? item.task_name ?? item.client_name ?? item.objective ?? item.chapter ?? "未命名")
  );
}

function ItemTags({ item, itemField }: { item: Record<string, unknown>; itemField?: TemplateField }) {
  const vs = (itemField?.item_template ?? []).filter((f) => f.type === "select");
  return (
    <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
      {vs.map((f) => {
        const v = item[f.id];
        if (v === undefined || v === null || v === "") return null;
        return (
          <span key={f.id} className="rounded bg-base-100 px-1.5 py-0.5 text-[10px] text-base-500 dark:bg-base-700 dark:text-base-300">
            {f.label}: {String(v)}
          </span>
        );
      })}
      {item.points !== undefined && item.points !== null && Number(item.points) > 0 && (
        <span className="rounded bg-brand-50 px-1.5 py-0.5 text-[10px] text-brand-600 dark:bg-brand-900/40 dark:text-brand-300">
          {String(item.points)} 点
        </span>
      )}
    </div>
  );
}

export function KanbanView({
  project,
  template,
  onItemsChange,
}: {
  project: Project;
  template?: Template;
  onItemsChange?: (listFieldId: string, items: Record<string, unknown>[]) => void;
}) {
  const meta = useMemo(() => primaryList(template, project), [template, project]);
  const viewDef = template?.views.find((v) => v.type === "kanban");
  const { itemFieldId } = resolveGroupBy(viewDef?.group_by, meta);
  const groupFieldId = itemFieldId ?? "status";
  const [dragFrom, setDragFrom] = useState<number | null>(null);
  const [overCol, setOverCol] = useState<string | null>(null);
  const [overCard, setOverCard] = useState<number | null>(null);
  const [dialog, setDialog] = useState<ItemDialogState | null>(null);

  const optionValues = useMemo(() => {
    const writerSub = new Set<string>();
    if (meta) {
      for (const it of meta.items) {
        const v = it[groupFieldId];
        if (v !== undefined && v !== null && v !== "") writerSub.add(String(v));
      }
    }
    const f = meta?.field.item_template?.find((x) => x.id === groupFieldId);
    const opts = f?.options ?? [];
    const merged = [...new Set([...opts, ...writerSub])];
    return merged.length ? merged : ["待办", "进行中", "已完成"];
  }, [meta, groupFieldId]);

  if (!meta) return <EmptyView hint="该项目没有列表字段，请先在表单中添加条目，或切换为「卡片视图」。" />;

  const { field, items } = meta;

  const drop = (targetGlobal: number | null, col: string) => {
    if (dragFrom === null || !onItemsChange) return;
    if (targetGlobal !== null && targetGlobal === dragFrom) return;
    const item = items[dragFrom];
    if (!item) return;
    const next = [...items];
    const matching = item[groupFieldId] === undefined || item[groupFieldId] === null || String(item[groupFieldId]) === col;
    if (targetGlobal === null && matching) return;
    const rest = next.filter((_, i) => i !== dragFrom);
    const moving = { ...item, [groupFieldId]: col };
    let insertAt = rest.length;
    if (targetGlobal !== null) {
      const targetIndex = targetGlobal > dragFrom ? targetGlobal - 1 : targetGlobal;
      insertAt = Math.min(targetIndex, rest.length);
    } else {
      const positions: number[] = [];
      rest.forEach((it, i) => {
        if (it[groupFieldId] !== undefined && it[groupFieldId] !== null && String(it[groupFieldId]) === col) positions.push(i);
      });
      if (positions.length > 0) insertAt = positions[positions.length - 1] + 1;
    }
    rest.splice(insertAt, 0, moving);
    setDragFrom(null);
    setOverCol(null);
    setOverCard(null);
    onItemsChange(field.id, rest);
  };

  return (
    <>
      <div className="flex h-full gap-3 overflow-x-auto p-5">
        {optionValues.map((col, i) => {
          const itemsInCol = items
            .map((it, idx) => ({ it, idx }))
            .filter(({ it }) => String(it[groupFieldId] ?? "") === col);
          return (
            <div
              key={col}
              onDragOver={(e) => {
                e.preventDefault();
                e.dataTransfer.dropEffect = "move";
                setOverCol(col);
              }}
              onDragLeave={() => {
                setOverCol((c) => (c === col ? null : c));
                setOverCard(null);
              }}
              onDrop={(e) => {
                e.preventDefault();
                drop(null, col);
              }}
              className={`flex w-64 shrink-0 flex-col rounded-xl border transition-colors ${
                overCol === col
                  ? "border-brand-400 bg-brand-50/80 dark:border-brand-600 dark:bg-brand-900/30"
                  : "border-base-200 bg-base-50/80 dark:border-base-700 dark:bg-base-800/50"
              }`}
            >
              <div className="flex items-center gap-2 px-3 py-2.5">
                <span className={`h-2.5 w-2.5 rounded-full ${PALETTE[i % PALETTE.length].split(" ")[0].replace("border-", "bg-")}`} />
                <span className="text-xs font-medium text-base-700 dark:text-base-200">{col}</span>
                <span className="ml-auto rounded-full bg-base-200 px-1.5 text-[10px] text-base-500 dark:bg-base-700 dark:text-base-300">
                  {itemsInCol.length}
                </span>
              </div>
              <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto px-2 pb-2">
                {itemsInCol.map(({ it, idx }) => (
                  <KanbanCard
                    key={idx}
                    item={it}
                    globalIndex={idx}
                    dragging={dragFrom === idx}
                    highlight={overCard === idx}
                    onDragStart={() => setDragFrom(idx)}
                    onOver={() => setOverCard(idx)}
                    onOverLeave={() => setOverCard((c) => (c === idx ? null : c))}
                    onDrop={() => drop(idx, col)}
                    onClick={() => setDialog({ index: idx, item: it, preset: {} })}
                  />
                ))}
                {itemsInCol.length === 0 && (
                  <div className="flex flex-1 items-center justify-center rounded-lg border border-dashed border-base-300 py-6 text-[10px] text-base-300 dark:border-base-700 dark:text-base-600">
                    拖放卡片到这里
                  </div>
                )}
              </div>
              <button
                onClick={() => setDialog({ index: null, item: null, preset: { [groupFieldId]: col } })}
                className="m-2 rounded-lg border border-dashed border-base-300 py-1.5 text-[10px] text-base-400 hover:border-brand-400 hover:text-brand-600 dark:border-base-700 dark:text-base-400 dark:hover:border-brand-600 dark:hover:text-brand-300"
                title={`在「${col}」中新建一条任务`}
              >
                ＋ 添加任务
              </button>
            </div>
          );
        })}
      </div>
      {dialog && (
        <TaskItemDialog
          field={field}
          item={dialog.item}
          preset={dialog.preset}
          onSave={(saved) => {
            if (!onItemsChange) return;
            if (dialog.index === null) {
              onItemsChange(field.id, [...items, saved]);
            } else {
              const next = items.slice();
              next[dialog.index] = saved;
              onItemsChange(field.id, next);
            }
          }}
          onDelete={
            dialog.index === null || !onItemsChange
              ? undefined
              : () => onItemsChange(field.id, items.filter((_, i) => i !== dialog.index))
          }
          onClose={() => setDialog(null)}
        />
      )}
    </>
  );
}

function KanbanCard({
  item,
  globalIndex,
  dragging,
  highlight,
  onDragStart,
  onOver,
  onOverLeave,
  onDrop,
  onClick,
}: {
  item: Record<string, unknown>;
  globalIndex: number;
  dragging: boolean;
  highlight: boolean;
  onDragStart: () => void;
  onOver: () => void;
  onOverLeave: () => void;
  onDrop: () => void;
  onClick: () => void;
}) {
  return (
    <div
      draggable
      onDragStart={(e) => {
        e.dataTransfer.effectAllowed = "move";
        e.dataTransfer.setData("text/plain", String(globalIndex));
        onDragStart();
      }}
      onDragEnd={() => onOverLeave()}
      onDragOver={(e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = "move";
        onOver();
      }}
      onDrop={(e) => {
        e.preventDefault();
        e.stopPropagation();
        onDrop();
      }}
      onClick={onClick}
      title="点击编辑该任务"
      className={`cursor-pointer rounded-lg border border-base-200 bg-white p-2.5 shadow-sm transition-all dark:border-base-700 dark:bg-base-800 ${
        dragging ? "rotate-2 opacity-40" : ""
      } ${highlight ? "border-dashed border-brand-500 ring-2 ring-brand-100 dark:ring-brand-900" : "hover:border-brand-300 dark:hover:border-brand-600"}`}
    >
      <div className="text-sm font-medium text-base-800 dark:text-base-100">{displayName(item)}</div>
      {item.assignee !== undefined && item.assignee !== null && item.assignee !== "" && (
        <div className="mt-1 text-xs text-base-500 dark:text-base-400">👤 {String(item.assignee)}</div>
      )}
      {item.deadline !== undefined && item.deadline !== null && item.deadline !== "" && (
        <div className="text-xs text-base-400 dark:text-base-500">📅 {String(item.deadline)}</div>
      )}
      <ItemTags item={item} />
    </div>
  );
}

export function ListView({
  project,
  template,
  onItemsChange,
}: {
  project: Project;
  template?: Template;
  onItemsChange?: (listFieldId: string, items: Record<string, unknown>[]) => void;
}) {
  const meta = useMemo(() => primaryList(template, project), [template, project]);
  const itemFields = meta?.field.item_template ?? [];
  const viewDef = template?.views.find((v) => v.type === "list");
  const { itemFieldId } = resolveGroupBy(viewDef?.group_by, meta);
  const [dialog, setDialog] = useState<ItemDialogState | null>(null);

  if (!meta) return <EmptyView hint="该项目没有列表字段，请在表单中添加条目。" />;

  const { field, items } = meta;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center justify-between border-b border-base-200 px-5 py-2.5 dark:border-base-700">
        <p className="text-xs text-base-400 dark:text-base-500">
          {field.label} · {items.length} 条，点击行可编辑
        </p>
        <button
          onClick={() => setDialog({ index: null, item: null, preset: {} })}
          className="rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-brand-700"
        >
          ＋ 添加任务
        </button>
      </div>
      <div className="flex-1 overflow-auto p-5 pt-3">
        {items.length === 0 ? (
          <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-base-300 py-14 text-center dark:border-base-700">
            <div className="text-3xl">🗂</div>
            <p className="text-sm text-base-500 dark:text-base-400">暂无任务</p>
            <p className="text-xs text-base-400 dark:text-base-500">点击右上角「添加任务」创建第一条。</p>
          </div>
        ) : (
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-base-200 text-left text-xs text-base-500 dark:border-base-700 dark:text-base-400">
                <th className="px-3 py-2 font-medium">名称</th>
                {itemFields.map((f) => (
                  <th key={f.id} className="px-3 py-2 font-medium">
                    {f.label}
                  </th>
                ))}
                {meta.field.id !== itemFieldId && <th className="px-3 py-2 font-medium">分组</th>}
              </tr>
            </thead>
            <tbody>
              {items.map((it, i) => (
                <tr
                  key={i}
                  onClick={() => setDialog({ index: i, item: it, preset: {} })}
                  className="cursor-pointer border-b border-base-100 hover:bg-brand-50/40 dark:border-base-800 dark:hover:bg-brand-900/20"
                  title="点击编辑该任务"
                >
                  <td className="px-3 py-2 font-medium text-base-800 dark:text-base-100">{displayName(it)}</td>
                  {itemFields.map((f) => (
                    <td key={f.id} className="px-3 py-2 text-base-600 dark:text-base-300">
                      {renderCell(f, it[f.id])}
                    </td>
                  ))}
                  {meta.field.id !== itemFieldId && itemFieldId && (
                    <td className="px-3 py-2 text-base-500 dark:text-base-400">{String(it[itemFieldId] ?? "-")}</td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      {dialog && (
        <TaskItemDialog
          field={field}
          item={dialog.item}
          preset={dialog.preset}
          onSave={(saved) => {
            if (!onItemsChange) return;
            if (dialog.index === null) {
              onItemsChange(field.id, [...items, saved]);
            } else {
              const next = items.slice();
              next[dialog.index] = saved;
              onItemsChange(field.id, next);
            }
          }}
          onDelete={
            dialog.index === null || !onItemsChange
              ? undefined
              : () => onItemsChange(field.id, items.filter((_, i) => i !== dialog.index))
          }
          onClose={() => setDialog(null)}
        />
      )}
    </div>
  );
}

function renderCell(f: TemplateField, v: unknown) {
  if (v === undefined || v === null || v === "") return <span className="text-base-300 dark:text-base-600">-</span>;
  if (f.type === "number") return <span className="font-mono text-xs">{String(v)}</span>;
  return <span>{String(v)}</span>;
}

export function CardView({
  project,
  template,
  onItemsChange,
}: {
  project: Project;
  template?: Template;
  onItemsChange?: (listFieldId: string, items: Record<string, unknown>[]) => void;
}) {
  const meta = useMemo(() => primaryList(template, project), [template, project]);
  const itemFields = meta?.field.item_template ?? [];
  const [dialog, setDialog] = useState<ItemDialogState | null>(null);

  return (
    <div className="h-full overflow-y-auto p-5">
      <div className="mb-4 flex items-center justify-between">
        <p className="text-xs text-base-400 dark:text-base-500">
          {meta ? `${meta.field.label} · ${meta.items.length} 条，点击卡片可编辑` : "暂无任务列表"}
        </p>
        {meta && (
          <button
            onClick={() => setDialog({ index: null, item: null, preset: {} })}
            className="rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-brand-700"
          >
            ＋ 添加条目
          </button>
        )}
      </div>
      {meta && meta.items.length > 0 ? (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
          {meta.items.map((it, i) => (
            <div
              key={i}
              onClick={() => setDialog({ index: i, item: it, preset: {} })}
              title="点击编辑该条目"
              className="cursor-pointer rounded-xl border border-base-200 bg-white p-3.5 shadow-sm transition-shadow hover:border-brand-300 hover:shadow dark:border-base-700 dark:bg-base-800 dark:hover:border-brand-600"
            >
              <div className="flex items-start justify-between gap-2">
                <h4 className="text-sm font-medium text-base-800 dark:text-base-100">{displayName(it)}</h4>
                <span className="shrink-0 rounded bg-base-100 px-1.5 py-0.5 text-[10px] text-base-500 dark:bg-base-700 dark:text-base-300">
                  {String(i + 1).padStart(2, "0")}
                </span>
              </div>
              <div className="mt-2 space-y-1">
                {itemFields.map((f) => {
                  if (f.id === "name" || f.id === "title" || f.id === "task_name" || f.id === "client_name") return null;
                  const v = it[f.id];
                  if (v === undefined || v === null || v === "") return null;
                  return (
                    <div key={f.id} className="flex items-center gap-2 text-xs">
                      <span className="w-16 shrink-0 text-base-400 dark:text-base-500">{f.label}</span>
                      <span className="truncate text-base-600 dark:text-base-300">{String(v)}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <EmptyView hint={meta ? "暂无条目。点击右上角「添加条目」创建第一个。" : "该项目没有列表字段，请在「表单」页签中添加条目。"} />
      )}
      <div className="mt-6">
        <h3 className="mb-2 text-xs font-medium uppercase tracking-wide text-base-400 dark:text-base-500">项目概览</h3>
        <ProjectMetaCard project={project} />
      </div>
      {dialog && meta && (
        <TaskItemDialog
          field={meta.field}
          item={dialog.item}
          preset={dialog.preset}
          onSave={(saved) => {
            if (!onItemsChange) return;
            if (dialog.index === null) {
              onItemsChange(meta.field.id, [...meta.items, saved]);
            } else {
              const next = meta.items.slice();
              next[dialog.index] = saved;
              onItemsChange(meta.field.id, next);
            }
          }}
          onDelete={
            dialog.index === null || !onItemsChange
              ? undefined
              : () => onItemsChange(meta.field.id, meta.items.filter((_, i) => i !== dialog.index))
          }
          onClose={() => setDialog(null)}
        />
      )}
    </div>
  );
}

function ProjectMetaCard({ project }: { project: Project }) {
  const m = project.meta;
  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
      <MetaCell label="负责人" value={m.owner ?? "—"} />
      <MetaCell label="状态" value={m.status === "active" ? "进行中" : m.status === "archived" ? "已归档" : "已删除"} />
      <MetaCell label="截止日期" value={m.deadline ?? "—"} />
      <MetaCell
        label="进度"
        value={m.progress !== undefined ? `${m.progress}%` : "—"}
      />
    </div>
  );
}

function MetaCell({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-base-200 bg-base-50 px-3 py-2 dark:border-base-700 dark:bg-base-800/50">
      <div className="text-[10px] uppercase tracking-wide text-base-400 dark:text-base-500">{label}</div>
      <div className="mt-0.5 truncate text-sm text-base-700 dark:text-base-200">
        {label === "进度" && value !== "—" ? <ProgressInline value={parseInt(value)} /> : value}
      </div>
    </div>
  );
}

function ProgressInline({ value }: { value: number }) {
  return (
    <span className="flex items-center gap-2">
      <span className="h-1.5 w-16 overflow-hidden rounded-full bg-base-200 dark:bg-base-700">
        <span className="block h-full rounded-full bg-brand-500" style={{ width: `${value}%` }} />
      </span>
      {value}%
    </span>
  );
}

function EmptyView({ hint }: { hint: string }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-2 p-8 text-center">
      <div className="text-3xl">🗂</div>
      <p className="text-sm text-base-500 dark:text-base-400">{hint}</p>
    </div>
  );
}

export function ProjectView({
  view,
  onItemsChange,
}: {
  view: ViewType;
  onItemsChange?: (listFieldId: string, items: Record<string, unknown>[]) => void;
}) {
  const project = useStore((s) => s.currentProject);
  const templates = useStore((s) => s.templates);
  const template = useMemo(
    () => templates.find((t) => t.template_id === project?.meta.template_id),
    [templates, project?.meta.template_id],
  );
  if (!project) return null;
  if (view === "kanban") return <KanbanView project={project} template={template} onItemsChange={onItemsChange} />;
  if (view === "list") return <ListView project={project} template={template} onItemsChange={onItemsChange} />;
  return <CardView project={project} template={template} onItemsChange={onItemsChange} />;
}