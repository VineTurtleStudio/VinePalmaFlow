import { useState } from "react";
import { api } from "../api";
import { useStore } from "../store";

export function OnboardingDialog({ onClose }: { onClose: () => void }) {
  const setMode = useStore((s) => s.setMode);
  const selectProject = useStore((s) => s.selectProject);
  const mode = useStore((s) => s.mode);
  const notify = useStore((s) => s.notify);
  const [creating, setCreating] = useState(false);

  const finish = () => {
    localStorage.setItem("vpf-onboarded", "1");
    onClose();
  };

  const createExample = async () => {
    setCreating(true);
    try {
      const project = await api.createExampleProject();
      localStorage.setItem("vpf-onboarded", "1");
      await selectProject(project.meta.id);
      onClose();
    } catch (e) {
      notify(String(e), "error");
      setCreating(false);
    }
  };

  const steps = [
    {
      icon: "📋",
      title: "1 · 选模板",
      desc: "从 8 套内置模板挑一个：OKR、迭代看板、内容排期…一键创建项目。",
    },
    {
      icon: "✏️",
      title: "2 · 填内容",
      desc: "表单、看板、列表自由切换，拖拽任务即改状态，所有数据自动保存为 Markdown。",
    },
    {
      icon: "📤",
      title: "3 · 导出",
      desc: "一键导出 Excel 周报 / Markdown 完整版，或通过「发送给同事」在局域网同步。",
    },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-6 backdrop-blur-[2px]">
      <div className="flex max-h-[90vh] w-full max-w-lg flex-col overflow-y-auto rounded-2xl border border-base-200 bg-white shadow-2xl dark:border-base-700 dark:bg-base-800">
        <div className="border-b border-base-200 px-6 py-5 dark:border-base-700">
          <div className="flex items-center gap-3">
            <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-brand-600 text-2xl text-white">
              🌿
            </span>
            <div>
              <h1 className="text-lg font-semibold text-base-800 dark:text-base-100">欢迎使用 VinePalmaFlow</h1>
              <p className="text-xs text-base-400">纯本地 · 零账号 · 数据永远留在你的设备上</p>
            </div>
          </div>
        </div>

        <div className="flex-1 space-y-6 px-6 py-5">
          <div>
            <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-base-400 dark:text-base-500">
              三步开始
            </h2>
            <div className="grid grid-cols-3 gap-2">
              {steps.map((s) => (
                <div
                  key={s.title}
                  className="rounded-xl border border-base-200 bg-base-50 p-3 dark:border-base-700 dark:bg-base-900/40"
                >
                  <div className="text-xl">{s.icon}</div>
                  <div className="mt-1.5 text-xs font-semibold text-base-700 dark:text-base-200">{s.title}</div>
                  <div className="mt-1 text-[10px] leading-relaxed text-base-400 dark:text-base-500">{s.desc}</div>
                </div>
              ))}
            </div>
          </div>

          <div>
            <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-base-400 dark:text-base-500">
              选择使用模式
            </h2>
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => void setMode("standard")}
                className={`rounded-xl border p-3 text-left transition-colors ${
                  mode === "standard"
                    ? "border-brand-500 bg-brand-50 dark:bg-brand-900/30"
                    : "border-base-200 hover:border-brand-400 dark:border-base-700"
                }`}
              >
                <div className="text-sm font-semibold text-base-700 dark:text-base-200">普通模式（推荐）</div>
                <div className="mt-1 text-[10px] leading-relaxed text-base-400">
                  表单向导 + 看板，三步完成项目，无需任何技术背景。
                </div>
              </button>
              <button
                onClick={() => void setMode("pro")}
                className={`rounded-xl border p-3 text-left transition-colors ${
                  mode === "pro"
                    ? "border-brand-500 bg-brand-50 dark:bg-brand-900/30"
                    : "border-base-200 hover:border-brand-400 dark:border-base-700"
                }`}
              >
                <div className="text-sm font-semibold text-base-700 dark:text-base-200">专业模式</div>
                <div className="mt-1 text-[10px] leading-relaxed text-base-400">
                  YAML + Markdown 双栏编辑，字段完全自定义，适合开发者与高级用户。
                </div>
              </button>
            </div>
          </div>

          <div className="rounded-xl border border-dashed border-base-300 p-3 text-[11px] leading-relaxed text-base-500 dark:border-base-600 dark:text-base-400">
            💡 想要立刻看看效果？创建一个<strong>示例项目</strong>，包含待办 / 进行中 / 已完成任务，可直接体验看板拖拽、导出与汇总视图。
          </div>
        </div>

        <div className="flex items-center justify-between gap-2 border-t border-base-200 px-6 py-4 dark:border-base-700">
          <button
            onClick={finish}
            className="rounded-lg border border-base-200 px-3 py-2 text-xs text-base-500 hover:border-brand-400 dark:border-base-700 dark:text-base-400"
          >
            稍后再说
          </button>
          <button
            onClick={() => void createExample()}
            disabled={creating}
            className="rounded-lg bg-brand-600 px-4 py-2 text-xs font-medium text-white hover:bg-brand-700 disabled:opacity-50"
          >
            {creating ? "正在创建…" : "🚀 创建示例项目并开始"}
          </button>
        </div>
      </div>
    </div>
  );
}
