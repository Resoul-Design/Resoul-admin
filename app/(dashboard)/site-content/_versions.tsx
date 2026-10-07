"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { restoreSiteContentVersion } from "./actions";

export type VersionInfo = { id: number; saved_at: string; saved_by: string | null };

const fmt = (iso: string) =>
  new Date(iso).toLocaleString("zh-HK", { timeZone: "Asia/Hong_Kong", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false });

// 版本記錄：列出之前儲存的版本，可還原（還原前現時內容會再存入記錄）
export function VersionHistory({ versions }: { versions: VersionInfo[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState("");
  const [pending, start] = useTransition();
  if (!versions.length) return null;
  return (
    <div className="relative">
      <button type="button" onClick={() => setOpen((v) => !v)} className="text-xs text-[var(--gold)] hover:underline">
        版本記錄（{versions.length}）{open ? "▴" : "▾"}
      </button>
      {open && (
        <div className="absolute right-0 z-20 mt-2 w-72 rounded-xl border border-[var(--line)] bg-[var(--card)] p-2 shadow-lg">
          <ul className="max-h-72 space-y-1 overflow-y-auto">
            {versions.map((v) => (
              <li key={v.id} className="flex items-center justify-between gap-2 rounded-lg px-2 py-1.5 text-xs hover:bg-[var(--cream)]">
                <span>
                  {fmt(v.saved_at)}
                  {v.saved_by ? <span className="text-[var(--soft)]">（{v.saved_by}）</span> : null}
                </span>
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => {
                    if (!window.confirm(`還原為 ${fmt(v.saved_at)} 的版本？網站約一分鐘內更新；現時內容會保留在版本記錄。`)) return;
                    start(async () => {
                      setError("");
                      const res = await restoreSiteContentVersion(v.id);
                      if (res.error) setError(res.error);
                      else {
                        setOpen(false);
                        router.refresh();
                      }
                    });
                  }}
                  className="shrink-0 text-[var(--gold)] hover:underline disabled:opacity-50"
                >
                  還原
                </button>
              </li>
            ))}
          </ul>
          {error && <p className="mt-2 px-2 text-xs text-red-700" role="alert">{error}</p>}
        </div>
      )}
    </div>
  );
}
