import { useEffect, useState } from "react";
import { useStore } from "../store";
import { api } from "../api";
import {
  CLASSIC_PRESETS,
  MONTHLY_PRESETS,
  activeTheme,
  monthId,
} from "../lib/theme";
import type { DeviceInfo, PairSession, ProjectSummary, ThemeColors, ThemeConfig, ThemeMode } from "../types";

export function SettingsDialog({ onClose }: { onClose: () => void }) {
  const setThemeConfig = useStore((s) => s.setThemeConfig);
  const themeConfig = useStore((s) => s.themeConfig);
  const notify = useStore((s) => s.notify);
  const workspacePath = useStore((s) => s.workspacePath);
  const switchWorkspace = useStore((s) => s.switchWorkspace);
  const busy = useStore((s) => s.busy);
  const [switching, setSwitching] = useState(false);
  const [mode, setMode] = useState<ThemeMode>(themeConfig.mode);
  const [custom, setCustom] = useState<ThemeColors>(
    themeConfig.custom ?? {
      primary: "#5a8c4e",
      secondary: "#f1a35c",
      accent: "#8ab06b",
      bg: "#f3f8eb",
      text: "#374d2e",
    },
  );

  const active = activeTheme(themeConfig);

  const update = (next: ThemeConfig) => {
    setThemeConfig(next);
  };

  const pickMode = (m: ThemeMode) => {
    setMode(m);
    const base: ThemeConfig = { ...themeConfig, mode: m };
    if (m === "auto") base.preset_id = monthId();
    if (m === "custom") base.custom = { ...custom };
    update(base);
  };

  const pickPreset = (id: string) => {
    setMode("preset");
    update({ ...themeConfig, mode: "preset", preset_id: id });
  };

  const pickCustomColor = (key: keyof ThemeColors, value: string) => {
    const next = { ...custom, [key]: value };
    setCustom(next);
    update({ mode: "custom", preset_id: themeConfig.preset_id, custom: next });
  };

  const reset = () => {
    const d: ThemeConfig = { mode: "auto", preset_id: monthId(), custom: undefined };
    setMode(d.mode);
    update(d);
    notify("已恢复默认主题");
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-6 backdrop-blur-[2px]" onClick={onClose}>
      <div
        className="flex max-h-[86vh] w-full max-w-[640px] flex-col overflow-hidden rounded-xl border border-base-200 bg-white shadow-2xl dark:border-base-700 dark:bg-base-800"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-base-200 px-5 py-4 dark:border-base-700">
          <div className="flex items-center gap-2">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-brand-100 text-sm dark:bg-brand-900/50">
              ⚙️
            </span>
            <h2 className="text-base font-semibold text-base-800 dark:text-base-100">设置</h2>
          </div>
          <button onClick={onClose} className="text-base-400 hover:text-base-600 dark:hover:text-base-200">
            ✕
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5">
          <div className="space-y-5">
            <section>
              <h3 className="mb-2 text-xs font-medium text-base-500 dark:text-base-400">工作区目录</h3>
              <div className="rounded-xl border border-base-200 bg-base-50 p-3 dark:border-base-700 dark:bg-base-900/40">
                <div className="flex items-center gap-2 text-xs text-base-600 dark:text-base-300">
                  <span className="shrink-0">📂</span>
                  <code className="min-w-0 flex-1 truncate font-mono text-xs">{workspacePath ?? "-"}</code>
                </div>
                <div className="mt-2 flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={async () => {
                        try {
                          await useStore.getState().runBusy(() => api.openWorkspaceFolder().then(() => true));
                        } catch (e) {
                          notify(String(e), "error");
                        }
                      }}
                      className="shrink-0 rounded-lg border border-base-200 px-3 py-1.5 text-xs text-base-600 hover:border-brand-400 hover:text-brand-600 dark:border-base-700 dark:text-base-300"
                    >
                      📂 打开目录
                    </button>
                    <button
                      onClick={async () => {
                        setSwitching(true);
                        await switchWorkspace();
                        setSwitching(false);
                      }}
                      disabled={switching || busy}
                      className="shrink-0 rounded-lg border border-base-200 px-3 py-1.5 text-xs text-base-600 hover:border-brand-400 hover:text-brand-600 disabled:opacity-50 dark:border-base-700 dark:text-base-300"
                    >
                      {switching ? "切换中…" : "更换目录…"}
                    </button>
                  </div>
                </div>
                <SyncStatusLine />
              </div>
            </section>

            <ExternalProjectsSection />

            <DevicePanel />

            <section>
              <label className="mb-2 block text-xs font-medium text-base-500 dark:text-base-400">主题模式</label>
              <div className="inline-flex gap-1 rounded-[10px] border border-base-200 bg-base-50 p-0.5 dark:border-base-700 dark:bg-base-900">
                {(
                  [
                    { v: "auto", label: "按月自动" },
                    { v: "preset", label: "预设主题" },
                    { v: "custom", label: "自定义" },
                  ] as { v: ThemeMode; label: string }[]
                ).map((o) => (
                  <button
                    key={o.v}
                    onClick={() => pickMode(o.v)}
                    className={`rounded-lg px-4 py-1.5 text-[13px] font-semibold transition-colors ${
                      mode === o.v
                        ? "bg-white text-brand-600 shadow-sm dark:bg-base-700 dark:text-brand-300"
                        : "text-base-500 hover:text-base-700 dark:text-base-400 dark:hover:text-base-200"
                    }`}
                  >
                    {o.label}
                  </button>
                ))}
              </div>
              {mode === "auto" && (
                <p className="mt-3 text-xs text-base-400 dark:text-base-500">
                  当前月份：{new Date().getMonth() + 1} 月，自动使用「{active.preset.name}」主题
                </p>
              )}
            </section>

            {mode !== "custom" && (
              <>
                <section>
                  <div className="mb-2 text-xs font-semibold text-base-500 dark:text-base-400">月度主题（随季节变化）</div>
                  <div className="grid grid-cols-4 gap-2.5">
                    {MONTHLY_PRESETS.map((p) => (
                      <PresetCard
                        key={p.id}
                        name={p.name}
                        palette={p.palette}
                        active={themeConfig.mode === "preset" && themeConfig.preset_id === p.id}
                        onClick={() => pickPreset(p.id)}
                      />
                    ))}
                  </div>
                </section>
                <section>
                  <div className="mb-2 text-xs font-semibold text-base-500 dark:text-base-400">经典主题</div>
                  <div className="grid grid-cols-2 gap-2.5">
                    {CLASSIC_PRESETS.map((p) => (
                      <PresetCard
                        key={p.id}
                        name={p.name}
                        palette={p.palette}
                        active={themeConfig.mode === "preset" && themeConfig.preset_id === p.id}
                        onClick={() => pickPreset(p.id)}
                      />
                    ))}
                  </div>
                </section>
              </>
            )}

            {mode === "custom" && (
              <section>
                <p className="mb-3 text-xs text-base-400 dark:text-base-500">
                  自定义主色、背景、强调色与文字颜色，修改实时生效。
                </p>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                  {(
                    [
                      ["primary", "主色"],
                      ["secondary", "辅助色"],
                      ["bg", "背景色"],
                      ["accent", "强调色"],
                      ["text", "文字色"],
                    ] as [keyof ThemeColors, string][]
                  ).map(([key, label]) => (
                    <label key={key} className="flex flex-col gap-1.5 text-xs text-base-500 dark:text-base-400">
                      <span>{label}</span>
                      <input
                        type="color"
                        value={custom[key]}
                        onChange={(e) => pickCustomColor(key, e.target.value)}
                        className="h-9 w-full cursor-pointer rounded-lg border border-base-200 bg-base-50 p-0.5 dark:border-base-700 dark:bg-base-900"
                      />
                      <code className="font-mono text-[11px] text-base-400 dark:text-base-500">{custom[key]}</code>
                    </label>
                  ))}
                </div>
                <button
                  onClick={() => {
                    const d = {
                      primary: "#5a8c4e",
                      secondary: "#f1a35c",
                      accent: "#8ab06b",
                      bg: "#f3f8eb",
                      text: "#374d2e",
                    };
                    setCustom(d);
                    update({ mode: "custom", preset_id: themeConfig.preset_id, custom: d });
                  }}
                  className="mt-4 rounded-lg border border-base-200 px-3 py-1.5 text-xs text-base-500 hover:border-brand-400 dark:border-base-700 dark:text-base-400"
                >
                  恢复默认配色
                </button>
              </section>
            )}
          </div>
        </div>

        <div className="flex items-center justify-between border-t border-base-200 px-5 py-3.5 dark:border-base-700">
          <button
            onClick={reset}
            className="rounded-lg border border-base-200 px-3 py-1.5 text-xs text-base-500 hover:border-brand-400 dark:border-base-700 dark:text-base-400"
          >
            恢复默认设置
          </button>
          <button
            onClick={onClose}
            className="rounded-lg bg-brand-600 px-5 py-1.5 text-xs font-medium text-white hover:bg-brand-700"
          >
            完成
          </button>
        </div>
      </div>
    </div>
  );
}

function SyncStatusLine() {
  const syncStatus = useStore((s) => s.syncStatus);
  const refreshSyncIndex = useStore((s) => s.refreshSyncIndex);
  if (!syncStatus) return null;
  return (
    <div className="mt-2 flex items-center justify-between gap-2 rounded-lg border border-base-200 bg-white/50 px-2.5 py-1.5 text-[10px] text-base-400 dark:border-base-700 dark:bg-base-900/30 dark:text-base-500">
      <span>
        同步索引 · {syncStatus.projects.length} 个项目已生成内容指纹
        <code className="ml-1 font-mono">.localflow/sync-status.json</code>
      </span>
      <button
        onClick={() => void refreshSyncIndex()}
        className="shrink-0 text-brand-600 hover:text-brand-700 dark:text-brand-400"
        title="重新生成同步状态索引"
      >
        ↻ 刷新
      </button>
    </div>
  );
}

function DevicePanel() {
  const notify = useStore((s) => s.notify);
  const [self, setSelf] = useState<DeviceInfo | null>(null);
  const [devices, setDevices] = useState<DeviceInfo[]>([]);
  const [sessions, setSessions] = useState<PairSession[]>([]);
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);

  const load = async () => {
    setBusy(true);
    try {
      const [s, d, p] = await Promise.all([api.getDeviceInfo(), api.listDevices(), api.pairSessions()]);
      setSelf(s);
      setDevices(d);
      setSessions(p);
      setName(s.name);
    } catch (e) {
      notify(String(e), "error");
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const saveName = async () => {
    try {
      const s = await api.setDeviceName(name);
      setSelf(s);
      setEditing(false);
      notify("设备名已更新");
    } catch (e) {
      notify(String(e), "error");
    }
  };

  const pair = async (d: DeviceInfo) => {
    try {
      await api.beginPair(d.id);
      notify(`已向「${d.name}」发起配对，请在两侧核对配对码`);
      void load();
    } catch (e) {
      notify(String(e), "error");
    }
  };

  const untrust = async (id: string) => {
    try {
      await api.untrustDevice(id);
      void load();
    } catch (e) {
      notify(String(e), "error");
    }
  };

  const short = (id: string) => id.slice(0, 12);

  return (
    <section>
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-xs font-semibold text-base-500 dark:text-base-400">局域网设备</h3>
        <button
          onClick={() => void load()}
          disabled={busy}
          className="text-[10px] text-brand-600 hover:text-brand-700 disabled:opacity-50 dark:text-brand-400"
        >
          {busy ? "扫描中…" : "↻ 刷新"}
        </button>
      </div>
      <div className="rounded-xl border border-base-200 bg-base-50 p-3 dark:border-base-700 dark:bg-base-900/40">
        {!self ? (
          <p className="text-xs text-base-400">正在扫描…</p>
        ) : (
          <>
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 text-xs text-base-600 dark:text-base-300">
                <span>🖥️</span>
                {editing ? (
                  <input
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && void saveName()}
                    className="w-40 rounded-md border border-base-200 bg-white px-2 py-0.5 text-xs focus:border-brand-400 focus:outline-none dark:border-base-700 dark:bg-base-800"
                  />
                ) : (
                  <span className="font-medium">{self.name}</span>
                )}
                <span className="text-base-400">本机</span>
              </div>
              {!editing ? (
                <button
                  onClick={() => setEditing(true)}
                  className="text-[10px] text-brand-600 hover:text-brand-700 dark:text-brand-400"
                >
                  改名
                </button>
              ) : (
                <div className="flex items-center gap-1.5">
                  <button onClick={() => void saveName()} className="text-[10px] text-brand-600 hover:text-brand-700">
                    保存
                  </button>
                  <button
                    onClick={() => {
                      setEditing(false);
                      setName(self.name);
                    }}
                    className="text-[10px] text-base-400"
                  >
                    取消
                  </button>
                </div>
              )}
            </div>
            <div className="mt-1 space-y-0.5 text-[10px] text-base-400 dark:text-base-500">
              <div>IP：{self.addr} · 端口 {self.port}</div>
              <div>
                设备 ID：<code className="font-mono">{self.id}</code> · {self.os}
              </div>
            </div>
            <p className="mt-1 text-[10px] text-base-400 dark:text-base-500">
              通过 mDNS（_localflow._tcp）广播发现同网段设备，配对后经【TLS 1.3 加密】通道同步——每台设备持有独立证书，同步仅信任名单内设备的证书。
            </p>
            <div className="mt-2 space-y-1.5">
              {!busy && devices.length === 0 && (
                <p className="rounded-lg border border-dashed border-base-200 px-2 py-2 text-center text-[10px] text-base-400 dark:border-base-700">
                  未发现其他设备
                </p>
              )}
              {devices.map((d) => (
                <div
                  key={d.id}
                  className="flex items-center justify-between gap-2 rounded-lg border border-base-200 bg-white px-2.5 py-1.5 dark:border-base-700 dark:bg-base-900/50"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5 text-xs text-base-700 dark:text-base-200">
                      <span
                        className={`h-2 w-2 shrink-0 rounded-full ${
                          d.online ? "bg-emerald-500" : "bg-base-200 dark:bg-base-600"
                        }`}
                      />
                      <span className="truncate font-medium">{d.name}</span>
                      {d.trusted && (
                        <span className="shrink-0 rounded bg-brand-100 px-1 text-[9px] text-brand-700 dark:bg-brand-900/60 dark:text-brand-300">
                          已信任
                        </span>
                      )}
                    </div>
                    <div className="truncate text-[10px] text-base-400">
                      {d.os} · {d.addr || "离线"} · <code className="font-mono">{short(d.id)}</code>
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    {!d.trusted ? (
                      <button
                        onClick={() => void pair(d)}
                        className="rounded border border-brand-300 px-1.5 py-0.5 text-[10px] text-brand-600 hover:bg-brand-50 dark:border-brand-700 dark:text-brand-300 dark:hover:bg-brand-900/40"
                      >
                        配对
                      </button>
                    ) : (
                      <button
                        onClick={() => void untrust(d.id)}
                        className="rounded border border-base-200 px-1.5 py-0.5 text-[10px] text-base-400 hover:text-red-500 dark:border-base-700"
                      >
                        忘记
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
            <PairSection sessions={sessions} onChanged={() => void load()} />
          </>
        )}
      </div>
    </section>
  );
}

function PairSection({ sessions, onChanged }: { sessions: PairSession[]; onChanged: () => void }) {
  const notify = useStore((s) => s.notify);
  const [inputs, setInputs] = useState<Record<string, string>>({});
  const [busyId, setBusyId] = useState<string | null>(null);

  const submit = async (s: PairSession) => {
    const code = (inputs[s.device_id] ?? "").trim();
    if (code.length !== 6) {
      notify("请输入对方设备显示的 6 位配对码", "error");
      return;
    }
    setBusyId(s.device_id);
    try {
      await api.submitPairCode(s.device_id, code);
      notify(`已核对「${s.device_name}」的配对码`);
      onChanged();
    } catch (e) {
      notify(String(e), "error");
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="mt-2 space-y-2">
      {sessions.length === 0 && (
        <p className="rounded-lg border border-dashed border-base-200 px-2 py-2 text-center text-[10px] text-base-400 dark:border-base-700">
          暂无进行中的配对
        </p>
      )}
      {sessions.map((s) => (
        <div
          key={s.device_id}
          className="rounded-lg border border-base-200 bg-white p-2 dark:border-base-700 dark:bg-base-900/50"
        >
          <div className="flex items-center justify-between gap-2 text-xs">
            <span className="truncate font-medium text-base-700 dark:text-base-200">配对 · {s.device_name}</span>
            <span
              className={`shrink-0 text-[10px] ${
                s.status === "done"
                  ? "text-emerald-600 dark:text-emerald-400"
                  : "text-brand-600 dark:text-brand-300"
              }`}
            >
              {s.status === "done" ? "✓ 配对成功" : "配对中"}
            </span>
          </div>
          <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px]">
            <span className="text-base-500 dark:text-base-400">
              本机显示
              <code className="mx-1 rounded bg-base-100 px-1.5 py-0.5 font-mono text-sm tracking-widest text-brand-700 dark:bg-base-800 dark:text-brand-300">
                {s.code_local}
              </code>
            </span>
            <span className="text-base-400 dark:text-base-500">
              对方显示
              <code className="ml-1 rounded bg-base-100 px-1.5 py-0.5 font-mono text-sm tracking-widest text-base-700 dark:bg-base-800 dark:text-base-200">
                {s.code_peer || "—"}
              </code>
            </span>
          </div>
          <div className="mt-1 flex items-center gap-1 text-[9px] text-base-400 dark:text-base-500">
            <span className={s.peer_verified ? "text-emerald-600 dark:text-emerald-400" : ""}>
              {s.peer_verified ? "对方已核对本机码 ✓" : "等待对方核对…"}
            </span>
            <span>·</span>
            <span className={s.self_verified ? "text-emerald-600 dark:text-emerald-400" : ""}>
              {s.self_verified ? "本机已核对对方码 ✓" : "待输入对方码"}
            </span>
          </div>
          <div className="mt-1.5 flex items-center gap-1.5">
            <input
              value={inputs[s.device_id] ?? ""}
              onChange={(e) =>
                setInputs((p) => ({
                  ...p,
                  [s.device_id]: e.target.value.replace(/[^0-9]/g, "").slice(0, 6),
                }))
              }
              placeholder="输入对方显示的 6 位码"
              inputMode="numeric"
              maxLength={6}
              className="w-40 rounded-md border border-base-200 bg-base-50 px-2 py-1 font-mono text-xs tracking-widest focus:border-brand-400 focus:outline-none dark:border-base-700 dark:bg-base-800"
            />
            <button
              onClick={() => void submit(s)}
              disabled={busyId === s.device_id}
              className="rounded-md bg-brand-600 px-2.5 py-1 text-[10px] text-white hover:bg-brand-700 disabled:opacity-50"
            >
              确认
            </button>
            <button
              onClick={async () => {
                await api.dismissPair(s.device_id);
                onChanged();
              }}
              className="rounded-md border border-base-200 px-2 py-1 text-[10px] text-base-400 hover:text-red-500 dark:border-base-700"
            >
              取消
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}

function PaletteDots({ palette }: { palette: ThemeColors }) {
  const colors = [palette.primary, palette.secondary, palette.bg, palette.accent, palette.text];
  return (
    <div className="flex gap-1">
      {colors.map((c, i) => (
        <span key={i} className="h-4 w-4 rounded-full border border-black/10" style={{ background: c }} title={c} />
      ))}
    </div>
  );
}

function PresetCard({
  name,
  palette,
  active,
  onClick,
}: {
  name: string;
  palette: ThemeColors;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex flex-col items-start gap-1.5 rounded-xl border p-2.5 text-left text-xs transition-colors ${
        active
          ? "border-brand-500 shadow-[0_0_0_2px_var(--color-brand-100)] dark:shadow-[0_0_0_2px_var(--color-brand-900)]"
          : "border-base-200 hover:border-brand-400 dark:border-base-700"
      }`}
    >
      <PaletteDots palette={palette} />
      <span className="text-base-700 dark:text-base-200">{name}</span>
    </button>
  );
}

function ExternalProjectsSection() {
  const notify = useStore((s) => s.notify);
  const linkExternalFolder = useStore((s) => s.linkExternalFolder);
  const unlinkProject = useStore((s) => s.unlinkProject);
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [busy, setBusy] = useState(false);

  const load = () => {
    api
      .listProjects()
      .then((list) => setProjects(list.filter((p) => p.folder.startsWith("/") || /^[A-Za-z]:[\\/]/.test(p.folder))))
      .catch((e) => notify(String(e), "error"));
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <section>
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-xs font-semibold text-base-500 dark:text-base-400">外部项目（工作区外文件夹）</h3>
        <button
          onClick={async () => {
            setBusy(true);
            try {
              await linkExternalFolder();
              load();
            } finally {
              setBusy(false);
            }
          }}
          disabled={busy}
          className="rounded-lg border border-brand-300 px-2.5 py-1 text-[10px] text-brand-600 hover:bg-brand-50 disabled:opacity-50 dark:border-brand-700 dark:text-brand-300 dark:hover:bg-brand-900/40"
        >
          {busy ? "选择中…" : "＋ 链接文件夹…"}
        </button>
      </div>
      <div className="rounded-xl border border-base-200 bg-base-50 p-3 dark:border-base-700 dark:bg-base-900/40">
        {projects.length === 0 && (
          <p className="rounded-lg border border-dashed border-base-200 px-2 py-2 text-center text-[10px] text-base-400 dark:border-base-700">
            未链接外部项目。可将工作区之外的任意文件夹纳入管理并参与局域网同步。
          </p>
        )}
        <div className="space-y-1.5">
          {projects.map((p) => (
            <div
              key={p.meta.id}
              className="flex items-center justify-between gap-2 rounded-lg border border-base-200 bg-white px-2.5 py-1.5 dark:border-base-700 dark:bg-base-900/50"
            >
              <div className="min-w-0">
                <div className="truncate text-xs font-medium text-base-700 dark:text-base-200">
                  🔗 {p.meta.name}
                </div>
                <code className="block truncate text-[10px] text-base-400">{p.folder}</code>
              </div>
              <button
                onClick={async () => {
                  await unlinkProject(p.meta.id);
                  load();
                }}
                className="shrink-0 rounded border border-base-200 px-1.5 py-0.5 text-[10px] text-base-400 hover:text-red-500 dark:border-base-700"
              >
                解除链接
              </button>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
