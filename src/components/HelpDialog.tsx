import { useState } from "react";

const SECTIONS = [
  {
    id: "start",
    icon: "🚀",
    title: "快速上手",
    body: (
      <ol className="list-decimal space-y-1.5 pl-4">
        <li>点击左上角「＋ 新建项目」或在欢迎页选择模板，一键创建项目。</li>
        <li>在表单里填写名称、负责人、截止日期等字段；看板/列表/卡片视图随时切换，拖拽任务即可改状态。</li>
        <li>所有内容自动保存为本地 Markdown，随时在「工作区汇总视图」查看全局进度。</li>
        <li>需要交付时，点右上角「导出」生成 Excel 周报或 Markdown 完整版。</li>
      </ol>
    ),
  },
  {
    id: "mode",
    icon: "🎛️",
    title: "两种模式",
    body: (
      <ul className="space-y-1.5">
        <li><strong>普通模式（推荐）</strong>：表单向导，字段固定，看板 + 列表 + 卡片三视图，三步完成项目。</li>
        <li><strong>专业模式</strong>：左侧编辑 YAML Front Matter + Markdown，右侧实时预览，字段完全自定义，数据 100% 透明。</li>
        <li>同一份数据两种模式随时切换，互不干扰、不丢信息。</li>
      </ul>
    ),
  },
  {
    id: "shortcuts",
    icon: "⌨️",
    title: "快捷键",
    body: (
      <ul className="space-y-1.5">
        <li><kbd>Ctrl/Cmd + K</kbd> — 命令面板（跳转项目 / 新建 / 切换模式 / 打开设置）</li>
        <li><kbd>Ctrl/Cmd + Shift + F</kbd> — 全局搜索（项目与任务全文）</li>
        <li><kbd>Ctrl/Cmd + S</kbd> — 手动保存（通常自动保存，无需手动）</li>
        <li>🕐 历史按钮 — 打开版本历史（自动每日快照，可预览与恢复）</li>
      </ul>
    ),
  },
  {
    id: "data",
    icon: "📁",
    title: "数据存在哪里？",
    body: (
      <ul className="space-y-1.5">
        <li>工作区目录内每个项目一个文件夹：<code>project.md</code>（主文件）、<code>tasks/</code>（子任务）、<code>attachments/</code>（附件）。</li>
        <li>每个项目都是标准 Markdown + YAML Front Matter，可用任意编辑器打开，人可读、可迁移。</li>
        <li>版本快照与同步索引存放在工作区 <code>.localflow/</code> 目录，损坏不影响你的项目文件。</li>
      </ul>
    ),
  },
  {
    id: "import-export",
    icon: "🔁",
    title: "导入 / 导出",
    body: (
      <ul className="space-y-1.5">
        <li><strong>导出</strong>：Excel（含条件格式、进度数据条）、Markdown、CSV、JSON，可配置导出预设。</li>
        <li><strong>导入</strong>：LocalFlow Markdown、Excel、Markdown 文件夹、模板包（.localflow-template）。</li>
        <li>同名项目冲突时可选「覆盖 / 重命名 / 合并」，合并自动按最新修改时间取优。</li>
      </ul>
    ),
  },
  {
    id: "lan",
    icon: "🌐",
    title: "局域网协作",
    body: (
      <ul className="space-y-1.5">
        <li>进入「设置 → 局域网设备」，应用会自动广播并发现同一 Wi-Fi 下的其他设备。</li>
        <li>点击「配对」，两台设备屏幕各自显示 6 位配对码，互相核对输入后即建立信任。</li>
        <li>数据只在局域网内传输，不上云、无需账号。</li>
      </ul>
    ),
  },
  {
    id: "faq",
    icon: "❓",
    title: "常见问题",
    body: (
      <ul className="space-y-1.5">
        <li><strong>数据会丢失吗？</strong> 每次保存都会自动生成版本快照（保留 30 天 / 100 份），可在「历史」中随时找回。</li>
        <li><strong>能离线用吗？</strong> 完全可以，一切读写都在本地文件，断网不影响任何功能。</li>
        <li><strong>如何更换工作区目录？</strong> 设置 → 更换目录。</li>
        <li><strong>如何分享给同事？</strong> 同一局域网内配对信任后即建立自动同步：应用启动或受信设备上线时会自动双向增量同步（含三向合并与冲突解决），也可在「同步」面板手动执行；离线时可用导出 Markdown 文件交付。</li>
      </ul>
    ),
  },
];

export function HelpDialog({ onClose }: { onClose: () => void }) {
  const [active, setActive] = useState(SECTIONS[0].id);
  const current = SECTIONS.find((s) => s.id === active) ?? SECTIONS[0];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-6 backdrop-blur-[2px]" onClick={onClose}>
      <div
        className="flex h-[80vh] w-full max-w-3xl flex-col overflow-hidden rounded-xl border border-base-200 bg-white shadow-2xl dark:border-base-700 dark:bg-base-800"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-base-200 px-5 py-4 dark:border-base-700">
          <div className="flex items-center gap-2">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-brand-100 text-sm dark:bg-brand-900/50">
              💡
            </span>
            <h2 className="text-base font-semibold text-base-800 dark:text-base-100">帮助中心</h2>
          </div>
          <button onClick={onClose} className="text-base-400 hover:text-base-600 dark:hover:text-base-200">
            ✕
          </button>
        </div>

        <div className="flex min-h-0 flex-1">
          <nav className="w-44 shrink-0 overflow-y-auto border-r border-base-200 p-2 dark:border-base-700">
            {SECTIONS.map((s) => (
              <button
                key={s.id}
                onClick={() => setActive(s.id)}
                className={`flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-xs transition-colors ${
                  active === s.id
                    ? "bg-brand-50 font-medium text-brand-700 dark:bg-brand-900/40 dark:text-brand-300"
                    : "text-base-500 hover:bg-base-50 dark:text-base-400 dark:hover:bg-base-700/40"
                }`}
              >
                <span>{s.icon}</span>
                <span>{s.title}</span>
              </button>
            ))}
          </nav>
          <div className="min-w-0 flex-1 overflow-y-auto p-5">
            <h3 className="mb-3 text-sm font-semibold text-base-800 dark:text-base-100">
              {current.icon} {current.title}
            </h3>
            <div className="text-xs leading-relaxed text-base-600 dark:text-base-300 [&_kbd]:rounded [&_kbd]:border [&_kbd]:border-base-200 [&_kbd]:bg-base-50 [&_kbd]:px-1 [&_kbd]:py-0.5 [&_kbd]:font-mono [&_kbd]:text-[10px] dark:[&_kbd]:border-base-600 [&_kbd]:dark:bg-base-900 [&_code]:rounded [&_code]:bg-base-100 [&_code]:px-1 [&_code]:py-0.5 [&_code]:font-mono [&_code]:text-[10px] dark:[&_code]:bg-base-700">
              {current.body}
            </div>
          </div>
        </div>

        <div className="flex justify-end border-t border-base-200 px-5 py-3.5 dark:border-base-700">
          <button
            onClick={onClose}
            className="rounded-lg bg-brand-600 px-5 py-1.5 text-xs font-medium text-white hover:bg-brand-700"
          >
            知道了
          </button>
        </div>
      </div>
    </div>
  );
}
