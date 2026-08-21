import type { ProjectMeta, TemplateField } from "../types";

const META_FIELDS = new Set(["name", "owner", "deadline", "status", "priority", "progress", "tags"]);

export function isMetaField(fieldId: string): boolean {
  return META_FIELDS.has(fieldId);
}

export function getMetaKey(fieldId: string): keyof ProjectMeta | null {
  return META_FIELDS.has(fieldId) ? (fieldId as keyof ProjectMeta) : null;
}

export function getFieldValue(meta: ProjectMeta, fieldId: string): unknown {
  const key = getMetaKey(fieldId);
  if (key) return meta[key];
  return meta.custom_fields?.[fieldId];
}

export function setFieldValue(meta: ProjectMeta, fieldId: string, value: unknown): ProjectMeta {
  const key = getMetaKey(fieldId);
  if (key) {
    const next = { ...meta };
    if (value === undefined || value === null || value === "") {
      (next as Record<string, unknown>)[key] = undefined;
    } else if (fieldId === "progress") {
      next.progress = normalizeNumber(value, 0, 100);
    } else {
      (next as unknown as Record<string, unknown>)[key] = value;
    }
    return next;
  }
  const custom = { ...(meta.custom_fields ?? {}) };
  if (value === undefined || value === null || value === "" || value === false) {
    delete custom[fieldId];
  } else {
    custom[fieldId] = value;
  }
  return { ...meta, custom_fields: Object.keys(custom).length ? custom : null };
}

export function normalizeNumber(value: unknown, min = 0, max = 100): number {
  const n = typeof value === "number" ? value : Number(value);
  if (Number.isNaN(n)) return 0;
  return Math.min(max, Math.max(min, Math.round(n)));
}

export function getListItems(meta: ProjectMeta, listFieldId: string): Record<string, unknown>[] {
  const v = getFieldValue(meta, listFieldId);
  if (Array.isArray(v)) return v as Record<string, unknown>[];
  return [];
}

export interface ListItemCallbacks {
  onUpdate: (index: number, patch: Record<string, unknown>) => void;
  onAdd: () => void;
  onRemove: (index: number) => void;
}

export const STATUS_LABELS: Record<string, string> = {
  active: "进行中",
  archived: "已归档",
  deleted: "已删除",
};

export const STATUS_COLORS: Record<string, string> = {
  active: "bg-emerald-600 text-white",
  archived: "bg-slate-400 text-white",
  deleted: "bg-red-600 text-white",
};

export const PRIORITY_COLORS: Record<string, string> = {
  P0: "bg-red-600 text-white",
  P1: "bg-orange-500 text-white",
  P2: "bg-sky-600 text-white",
  P3: "bg-slate-400 text-white",
};

export function defaultForField(field: TemplateField): unknown {
  if (field.default !== undefined) return field.default;
  switch (field.type) {
    case "select":
      return field.options?.[0] ?? "";
    case "number":
      return 0;
    case "list":
      return [];
    case "tags":
      return [];
    default:
      return "";
  }
}