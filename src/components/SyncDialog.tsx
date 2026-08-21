import { useEffect, useState } from "react";
import { api } from "../api";
import { useStore } from "../store";
import type { DeviceInfo, SyncConflict, SyncSummary } from "../types";

function summaryText(s: SyncSummary): string {
  const parts = [`已同步 ${s.devices} 台设备`];
  if (s.pushed > 0) parts.push(`推送 ${s.pushed} 个`);
  if (s.pulled > 0) parts.push(`拉取 ${s.pulled} 个`);
  if (s.merged > 0) parts.push(`自动合并 ${s.merged} 个文件`);
  if (s.conflicted > 0) parts.push(`${s.conflicted} 个冲突`);
  return parts.join(" · ");
}

export function SyncDialog({ onClose }: { onClose: () => void }) {
  const notify = useStore((s) => s.notify);
  const [devices, setDevices] = useState<DeviceInfo[]>([]);
  const [conflicts, setConflicts] = useState<SyncConflict[]>([]);
  const [busy, setBusy] = useState(false);
  const [syncingId, setSyncingId] = useState<string | null>(null);

  const load = async () => {
    try {
      const [d, c] = await Promise.all([api.listDevices(), api.listSyncConflicts()]);
      setDevices(d);
      setConflicts(c);
    } catch (e) {
      notify(String(e), "error");
    }
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const runSync = async (id?: string) => {
    if (id) setSyncingId(id);
    else setBusy(true);
    try {
      const s = id ? await api.syncWithDevice(id) : await api.syncAll();
      notify(`同步完成：${summaryText(s)}`);
      await useStore.getState().refreshProjects();
      await load();
    } catch (e) {
      notify(String(e), "error");
    } finally {
      setSyncingId(null);
      setBusy(false);
    }
  };

  const resolve = async (c: SyncConflict, choice: "mine" | "theirs") => {
    try {
      await api.resolveSyncConflict(c.id, choice);
      notify(choice === "theirs" ? "已采用对方版本" : "已保留本地版本");
      await load();
    } catch (e) {
      notify(String(e), "error");
    }
  };

  const peers = devices.filter((d) => d.trusted);
  const online = peers.filter((d) => d.online);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-6 backdrop-blur-[2px]" onClick={onClose}>
      <div
        className="flex max-h-[86vh] w-full max-w-2xl flex-col overflow-hidden rounded-xl border border-base-200 bg-white shadow-2xl dark:border-base-700 dark:bg-base-800"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-base-200 px-5 py-4 dark:border-base-700">
          <div className="flex items-center gap-2">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-brand-100 text-sm dark:bg-brand-900/50">
              🔄
            </span>
            <h2 className="text-base font-semibold text-base-800 dark:text-base-100">局域网同步</h2>
          </div>
          <button onClick={onClose} className="text-base-400 hover:text-base-600 dark:hover:text-base-200">
            ✕
          </button>
        </div>

        <div className="flex-1 space-y-5 overflow-y-auto p-5">
          <section>
            <div className="mb-2 flex items-center justify-between">
              <h3 className="text-xs font-semibold text-base-500 dark:text-base-400">设备（{online.length}/{peers.length} 在线）</h3>
              <button
                onClick={() => void runSync()}
                disabled={busy || online.length === 0}
                className="rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-brand-700 disabled:opacity-50"
              >
                {busy ? "同步中…" : "全部同步"}
              </button>
            </div>
            {peers.length === 0 ? (
              <p className="rounded-xl border border-dashed border-base-200 px-3 py-4 text-center text-xs text-base-400 dark:border-base-700">
                还没有信任的设备。请到「设置 → 局域网设备」先配对。
              </p>
            ) : (
              <div className="space-y-1.5">
                {peers.map((d) => (
                  <div
                    key={d.id}
                    className="flex items-center justify-between gap-2 rounded-xl border border-base-200 bg-base-50 px-3 py-2 dark:border-base-700 dark:bg-base-900/40"
                  >
                    <div className="flex min-w-0 items-center gap-2 text-xs">
                      <span className={`h-2 w-2 shrink-0 rounded-full ${d.online ? "bg-emerald-500" : "bg-base-200 dark:bg-base-600"}`} />
                      <span className="truncate font-medium text-base-700 dark:text-base-200">{d.name}</span>
                      <span className="truncate text-base-400 dark:text-base-500">{d.addr}</span>
                    </div>
                    <button
                      onClick={() => void runSync(d.id)}
                      disabled={syncingId === d.id || !d.online}
                      className="shrink-0 rounded-lg border border-brand-300 px-2.5 py-1 text-[10px] text-brand-600 hover:bg-brand-50 disabled:opacity-50 dark:border-brand-700 dark:text-brand-300 dark:hover:bg-brand-900/40"
                    >
                      {syncingId === d.id ? "同步中…" : d.online ? "同步" : "离线"}
                    </button>
                  </div>
                ))}
              </div>
            )}
          </section>

          <section>
            <div className="mb-2 flex items-center justify-between">
              <h3 className="text-xs font-semibold text-base-500 dark:text-base-400">
                待解决冲突（{conflicts.length}）
              </h3>
              {conflicts.length > 0 && (
                <button
                  onClick={async () => {
                    await api.clearSyncConflicts();
                    await load();
                  }}
                  className="text-[10px] text-base-400 hover:text-red-500"
                >
                  清空列表
                </button>
              )}
            </div>
            {conflicts.length === 0 ? (
              <p className="rounded-xl border border-dashed border-base-200 px-3 py-4 text-center text-xs text-base-400 dark:border-base-700">
                {busy ? "正在检查…" : "暂无冲突，所有更改已自动同步。"}
              </p>
            ) : (
              <div className="space-y-2">
                {conflicts.map((c) => (
                  <div key={c.id} className="rounded-xl border border-amber-300 bg-amber-50/60 p-3 dark:border-amber-700 dark:bg-amber-900/20">
                    <div className="flex items-center justify-between gap-2">
                      <div className="min-w-0">
                        <span className="truncate text-xs font-semibold text-base-700 dark:text-base-200">{c.project_name}</span>
                        <span className="ml-1.5 truncate text-[10px] text-base-400 dark:text-base-500">
                          {c.file} · 同字段双方都修改且不同
                        </span>
                      </div>
                      <span className="shrink-0 text-[9px] font-medium text-amber-600 dark:text-amber-400">⚠ 冲突</span>
                    </div>
                    <div className="mt-2 grid grid-cols-2 gap-2">
                      <div className="rounded-lg border border-base-200 bg-white p-2 dark:border-base-700 dark:bg-base-800/60">
                        <div className="mb-1 text-[9px] font-medium text-base-400 dark:text-base-500">📄 本地版本</div>
                        <p className="line-clamp-3 whitespace-pre-wrap break-words text-[10px] text-base-600 dark:text-base-300">
                          {c.mine.slice(0, 160)}{c.mine.length > 160 ? "…" : ""}
                        </p>
                        <button
                          onClick={() => void resolve(c, "mine")}
                          className="mt-1.5 rounded border border-brand-300 px-1.5 py-0.5 text-[10px] text-brand-600 hover:bg-brand-50 dark:border-brand-700 dark:text-brand-300"
                        >
                          保留本地
                        </button>
                      </div>
                      <div className="rounded-lg border border-base-200 bg-white p-2 dark:border-base-700 dark:bg-base-800/60">
                        <div className="mb-1 text-[9px] font-medium text-base-400 dark:text-base-500">📥 对方版本</div>
                        <p className="line-clamp-3 whitespace-pre-wrap break-words text-[10px] text-base-600 dark:text-base-300">
                          {c.theirs.slice(0, 160)}{c.theirs.length > 160 ? "…" : ""}
                        </p>
                        <button
                          onClick={() => void resolve(c, "theirs")}
                          className="mt-1.5 rounded border border-brand-300 px-1.5 py-0.5 text-[10px] text-brand-600 hover:bg-brand-50 dark:border-brand-700 dark:text-brand-300"
                        >
                          采用对方
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>

        <div className="flex justify-end border-t border-base-200 px-5 py-3.5 dark:border-base-700">
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