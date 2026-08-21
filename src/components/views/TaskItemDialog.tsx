import { useState } from "react";
import { defaultForField } from "../../lib/projectFields";
import type { TemplateField } from "../../types";
import { FieldRenderer } from "../fields/FieldRenderer";

export function TaskItemDialog({
  field,
  item,
  preset,
  onSave,
  onDelete,
  onClose,
}: {
  field: TemplateField;
  item: Record<string, unknown> | null;
  preset?: Record<string, unknown>;
  onSave: (item: Record<string, unknown>) => void;
  onDelete?: () => void;
  onClose: () => void;
}) {
  const itemFields = field.item_template ?? [];
  const [draft, setDraft] = useState<Record<string, unknown>>(() => {
    const base: Record<string, unknown> = {};
    for (const f of itemFields) {
      const v = item?.[f.id];
      base[f.id] = v === undefined || v === null ? defaultForField(f) : v;
    }
    return { ...base, ...preset };
  });

  if (itemFields.length === 0) return null;

  const update = (id: string, value: unknown) => setDraft((d) => ({ ...d, [id]: value }));

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-6 backdrop-blur-[2px]"
      onClick={onClose}
    >
      <div
        className="w-full max-w-xl rounded-xl border border-base-200 bg-white shadow-2xl dark:border-base-700 dark:bg-base-800"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-base-200 px-5 py-3.5 dark:border-base-700">
          <h3 className="text-sm font-semibold text-base-800 dark:text-base-100">
            {item ? `编辑${field.label}条目` : `添加${field.label}条目`}
          </h3>
          <button
            onClick={onClose}
            className="text-base-400 hover:text-base-600 dark:hover:text-base-200"
          >
            ✕
          </button>
        </div>

        <div className="max-h-[60vh] space-y-4 overflow-y-auto p-5">
          {itemFields.map((f) => (
            <label key={f.id} className="block">
              <span className="mb-1.5 block text-xs font-medium text-base-500 dark:text-base-400">
                {f.label}
                {f.required && <span className="text-red-500"> *</span>}
              </span>
              <FieldRenderer field={f} value={draft[f.id]} onChange={(v) => update(f.id, v)} />
            </label>
          ))}
        </div>

        <div className="flex items-center justify-between gap-2 border-t border-base-200 px-5 py-3.5 dark:border-base-700">
          {onDelete ? (
            <button
              onClick={() => {
                onDelete();
                onClose();
              }}
              className="rounded-lg border border-red-200 px-3 py-1.5 text-xs text-red-600 hover:bg-red-50 dark:border-red-800 dark:hover:bg-red-900/20"
              title="删除该条目"
            >
              🗑 删除
            </button>
          ) : (
            <span />
          )}
          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              className="rounded-lg px-3 py-1.5 text-xs text-base-500 hover:bg-base-100 dark:text-base-400 dark:hover:bg-base-700"
            >
              取消
            </button>
            <button
              onClick={() => {
                onSave(draft);
                onClose();
              }}
              className="rounded-lg bg-brand-600 px-4 py-1.5 text-xs font-medium text-white hover:bg-brand-700"
            >
              保存
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
