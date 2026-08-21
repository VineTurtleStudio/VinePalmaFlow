import { useMemo, useState } from "react";
import { useStore } from "../store";
import { defaultForField, isMetaField } from "../lib/projectFields";
import type { ProjectMeta, Template } from "../types";
import { DatePicker } from "./fields/DatePicker";

export function NewProjectDialog({ onClose }: { onClose: () => void }) {
  const templates = useStore((s) => s.templates);
  const createProject = useStore((s) => s.createProject);
  const [selectedId, setSelectedId] = useState("blank");
  const [name, setName] = useState("");
  const [owner, setOwner] = useState("");
  const [deadline, setDeadline] = useState("");
  const [priority, setPriority] = useState("P2");
  const [busy, setBusy] = useState(false);

  const selected = useMemo(
    () => templates.find((t) => t.template_id === selectedId) ?? templates[0],
    [templates, selectedId],
  );

  if (!selected) return null;

  const submit = async () => {
    if (!name.trim()) return;
    setBusy(true);
    const meta = buildMeta(selected, name.trim(), owner, deadline, priority);
    await createProject(meta, starterBody(name.trim()));
    setBusy(false);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-6" onClick={onClose}>
      <div
        className="flex max-h-[82vh] w-[720px] flex-col rounded-xl border border-base-200 bg-white shadow-2xl dark:border-base-700 dark:bg-base-800"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-base-200 px-5 py-3 dark:border-base-700">
          <h2 className="text-sm font-semibold text-base-800 dark:text-base-100">新建项目</h2>
          <button onClick={onClose} className="text-base-400 hover:text-base-600 dark:hover:text-base-200">
            ✕
          </button>
        </div>

        <div className="flex flex-1 flex-col gap-4 overflow-y-auto p-5">
          <div>
            <label className="mb-1.5 block text-xs font-medium text-base-500 dark:text-base-400">
              选择模板
            </label>
            <div className="grid grid-cols-4 gap-2">
              {templates.map((t) => (
                <button
                  key={t.template_id}
                  onClick={() => {
                    setSelectedId(t.template_id);
                    if (!name) setName(t.name);
                  }}
                  className={`rounded-lg border p-2.5 text-left transition-colors ${
                    selectedId === t.template_id
                      ? "border-brand-500 bg-brand-50 dark:bg-brand-900/30"
                      : "border-base-200 hover:border-brand-300 dark:border-base-700 dark:hover:border-brand-500/60"
                  }`}
                >
                  <div className="text-lg">{t.icon}</div>
                  <div className="mt-1 truncate text-xs font-medium text-base-700 dark:text-base-200">
                    {t.name}
                  </div>
                </button>
              ))}
            </div>
            <p className="mt-2 text-xs text-base-400 dark:text-base-500">{selected.description}</p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Field label="项目名称 *">
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                autoFocus
                className="input"
                placeholder="例如：产品重构 v2.0"
              />
            </Field>
            <Field label="负责人">
              <input
                value={owner}
                onChange={(e) => setOwner(e.target.value)}
                className="input"
                placeholder="谁负责这个项目？"
              />
            </Field>
            <Field label="截止日期">
              <DatePicker value={deadline} onChange={setDeadline} className="input" />
            </Field>
            <Field label="优先级">
              <select
                value={priority}
                onChange={(e) => setPriority(e.target.value)}
                className="input"
              >
                {["P0", "P1", "P2", "P3"].map((p) => (
                  <option key={p} value={p}>
                    {p} · {p === "P0" ? "最高" : p === "P1" ? "高" : p === "P2" ? "中" : "低"}
                  </option>
                ))}
              </select>
            </Field>
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-base-200 px-5 py-3 dark:border-base-700">
          <button
            onClick={onClose}
            className="rounded-lg px-3 py-1.5 text-xs text-base-500 hover:bg-base-100 dark:text-base-400 dark:hover:bg-base-700"
          >
            取消
          </button>
          <button
            onClick={submit}
            disabled={!name.trim() || busy}
            className="rounded-lg bg-brand-600 px-4 py-1.5 text-xs font-medium text-white hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {busy ? "创建中..." : "创建项目"}
          </button>
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-base-500 dark:text-base-400">{label}</span>
      {children}
    </label>
  );
}

function buildMeta(
  template: Template,
  name: string,
  owner = "",
  deadline = "",
  priority = "P2",
): ProjectMeta {
  const meta: ProjectMeta = {
    id: "",
    name,
    status: "active",
    created_at: "",
    updated_at: "",
    version: 1,
    template_id: template.template_id,
  };
  const custom: Record<string, unknown> = {};
  for (const f of template.fields) {
    const value = defaultForField(f);
    if (isMetaField(f.id)) {
      switch (f.id) {
        case "name":
          break;
        case "owner":
          if (owner) meta.owner = owner;
          break;
        case "deadline":
          if (deadline) meta.deadline = deadline;
          break;
        case "priority":
          meta.priority = priority;
          break;
        case "progress":
          meta.progress = 0;
          break;
        case "tags":
          meta.tags = [];
          break;
        case "status":
          meta.status = "active";
          break;
      }
    } else {
      custom[f.id] = value;
    }
  }
  if (owner) meta.owner = owner;
  if (deadline) meta.deadline = deadline;
  meta.custom_fields = Object.keys(custom).length ? custom : null;
  return meta;
}

export { buildMeta };

export function starterBody(name: string): string {
  return `## 项目目标
描述 ${name} 的目标…

## 关键里程碑
- [ ] 里程碑一
- [ ] 里程碑二

## 风险与阻塞项

## 会议纪要

## 备注
`;
}