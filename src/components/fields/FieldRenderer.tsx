import { useState } from "react";
import { defaultForField } from "../../lib/projectFields";
import type { TemplateField } from "../../types";
import { DatePicker } from "./DatePicker";

export function FieldRenderer({
  field,
  value,
  onChange,
  dense = false,
}: {
  field: TemplateField;
  value: unknown;
  onChange: (value: unknown) => void;
  dense?: boolean;
}) {
  const cls = inputCls(dense);
  if (field.id === "status") {
    const statusOptions = [
      { value: "active", label: "进行中" },
      { value: "archived", label: "已归档" },
      { value: "deleted", label: "已删除" },
    ];
    return (
      <select value={(value as string) ?? "active"} onChange={(e) => onChange(e.target.value)} className={cls}>
        {statusOptions.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    );
  }
  switch (field.type) {
    case "select":
      return (
        <select value={(value as string) ?? ""} onChange={(e) => onChange(e.target.value)} className={cls}>
          {(field.options ?? []).map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </select>
      );
    case "number":
      return (
        <input
          type="number"
          value={value === undefined || value === null ? "" : String(value)}
          min={field.id === "progress" ? 0 : undefined}
          max={field.id === "progress" ? 100 : undefined}
          onChange={(e) => onChange(e.target.value === "" ? "" : Number(e.target.value))}
          className={cls}
        />
      );
    case "date":
      return <DatePicker value={(value as string) ?? ""} onChange={onChange} className={cls} />;
    case "textarea":
    case "text":
      return (
        <textarea
          value={(value as string) ?? ""}
          onChange={(e) => onChange(e.target.value)}
          rows={dense ? 2 : 4}
          placeholder={field.placeholder}
          className={`${cls} resize-y`}
        />
      );
    case "tags":
      return <TagsInput value={(value as string[]) ?? []} onChange={onChange} />;
    case "list":
      return (
        <ListEditor field={field} value={(value as Record<string, unknown>[]) ?? []} onChange={onChange} dense={dense} />
      );
    default:
      return (
        <input
          type="text"
          value={(value as string) ?? ""}
          onChange={(e) => onChange(e.target.value)}
          placeholder={field.placeholder}
          className={cls}
        />
      );
  }
}

export function inputCls(dense = false): string {
  if (dense) {
    return "w-full rounded-lg border border-base-200 bg-white px-2 py-1 text-sm text-base-800 outline-none placeholder:text-base-400 focus:border-brand-400 focus:ring-1 focus:ring-brand-400/40 dark:border-base-700 dark:bg-base-800 dark:text-base-100";
  }
  return "w-full rounded-lg border border-base-200 bg-white px-3 py-1.5 text-sm text-base-800 outline-none placeholder:text-base-400 focus:border-brand-400 focus:ring-1 focus:ring-brand-400/40 dark:border-base-700 dark:bg-base-800 dark:text-base-100";
}

function TagsInput({ value, onChange }: { value: string[]; onChange: (v: string[]) => void }) {
  const [draft, setDraft] = useState("");
  const remove = (tag: string) => onChange(value.filter((t) => t !== tag));
  const commit = () => {
    const t = draft.trim();
    if (t && !value.includes(t)) onChange([...value, t]);
    setDraft("");
  };
  return (
    <div className="flex flex-wrap items-center gap-1.5 rounded-lg border border-base-200 bg-white px-2 py-1.5 dark:border-base-700 dark:bg-base-800">
      {value.map((t) => (
        <span key={t} className="flex items-center gap-1 rounded bg-brand-50 px-1.5 py-0.5 text-xs text-brand-700 dark:bg-brand-900/40 dark:text-brand-300">
          #{t}
          <button onClick={() => remove(t)} className="text-brand-400 hover:text-brand-600">
            ×
          </button>
        </span>
      ))}
      <input
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === ",") {
            e.preventDefault();
            commit();
          } else if (e.key === "Backspace" && !draft && value.length) {
            onChange(value.slice(0, -1));
          }
        }}
        onBlur={commit}
        placeholder="输入标签后回车"
        className="min-w-24 flex-1 bg-transparent text-sm text-base-800 outline-none placeholder:text-base-400 dark:text-base-100"
      />
    </div>
  );
}

function ListEditor({
  field,
  value,
  onChange,
  dense,
}: {
  field: TemplateField;
  value: Record<string, unknown>[];
  onChange: (v: Record<string, unknown>[]) => void;
  dense: boolean;
}) {
  const items = field.item_template ?? [];
  const update = (i: number, patch: Record<string, unknown>) => {
    const next = value.slice();
    next[i] = { ...(next[i] ?? {}), ...patch };
    onChange(next);
  };
  const remove = (i: number) => onChange(value.filter((_, idx) => idx !== i));
  const add = () => {
    const blank: Record<string, unknown> = {};
    for (const f of items) blank[f.id] = defaultForField(f);
    onChange([...value, blank]);
  };

  if (items.length === 0) {
    return <p className="text-xs text-base-400 dark:text-base-500">该列表缺少字段定义。</p>;
  }

  return (
    <div className="space-y-2">
      {value.length === 0 && (
        <p className="text-xs text-base-400 dark:text-base-500">暂无条目，点击下方添加。</p>
      )}
      {value.map((row, i) => (
        <div key={i} className="rounded-lg border border-base-200 bg-base-50 p-2 dark:border-base-700 dark:bg-base-900/40">
          <div className="grid gap-2 sm:grid-cols-2">
            {items.map((f) => (
              <FieldRenderer key={f.id} field={f} value={row[f.id]} onChange={(v) => update(i, { [f.id]: v })} dense />
            ))}
          </div>
          <div className="mt-1.5 flex justify-end">
            <button onClick={() => remove(i)} className="text-xs text-base-400 hover:text-red-500" title="删除该条目">
              ✕ 删除
            </button>
          </div>
        </div>
      ))}
      <button
        onClick={add}
        className="w-full rounded-lg border border-dashed border-brand-300 py-1.5 text-xs text-brand-600 hover:bg-brand-50 dark:border-brand-700 dark:text-brand-300 dark:hover:bg-brand-900/20"
      >
        ＋ 添加一条{dense ? "" : field.label}
      </button>
    </div>
  );
}