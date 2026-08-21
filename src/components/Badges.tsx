import type { ProjectStatus } from "../types";
import { PRIORITY_COLORS, STATUS_COLORS, STATUS_LABELS } from "../lib/projectFields";

export function StatusBadge({ status }: { status: ProjectStatus }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_COLORS[status]}`}
    >
      {STATUS_LABELS[status]}
    </span>
  );
}

export function PriorityBadge({ priority }: { priority?: string }) {
  if (!priority) return null;
  const color = PRIORITY_COLORS[priority] ?? PRIORITY_COLORS.P3;
  return (
    <span className={`inline-flex items-center rounded px-1.5 py-0.5 text-xs font-semibold ${color}`}>
      {priority}
    </span>
  );
}

export function ProgressBar({ value }: { value?: number }) {
  const v = Math.min(100, Math.max(0, value ?? 0));
  return (
    <div className="flex items-center gap-2 text-xs text-base-500 dark:text-base-400">
      <div className="h-1.5 w-24 overflow-hidden rounded-full bg-base-200 dark:bg-base-700">
        <div
          className="h-full rounded-full bg-brand-500 transition-all"
          style={{ width: `${v}%` }}
        />
      </div>
      <span>{v}%</span>
    </div>
  );
}

export function Tag({ children }: { children: string }) {
  return (
    <span className="rounded bg-brand-50 px-1.5 py-0.5 text-xs text-brand-700 dark:bg-brand-900/40 dark:text-brand-300">
      #{children}
    </span>
  );
}