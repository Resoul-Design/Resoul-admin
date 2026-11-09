"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { syncAll } from "./_sync-all-actions";

// 頁頂「全部同步」掣：完成後顯示結果並重新整理頁面
export function SyncAllButton() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  function run() {
    setMsg(null);
    start(async () => {
      const r = await syncAll();
      setMsg(r.error ? { ok: false, text: r.error } : { ok: !r.manual, text: r.summary || "已同步。" });
      router.refresh();
      window.setTimeout(() => setMsg(null), 12000);
    });
  }

  return (
    <div className="relative shrink-0">
      <button type="button" onClick={run} disabled={pending} title="由 Shopify 同步最新資料並修正不一致" className="rounded-lg border border-[var(--line)] bg-white px-3 py-1.5 text-sm hover:bg-[var(--cream)] disabled:opacity-60">
        {pending ? "同步中…" : <>⟳<span className="hidden sm:inline"> 全部同步</span></>}
      </button>
      {msg && (
        <div role="status" className={"fixed inset-x-4 top-16 z-50 mx-auto max-w-sm rounded-xl border px-3 py-2 text-center text-sm shadow-lg sm:absolute sm:inset-x-auto sm:right-0 sm:top-full sm:mt-2 sm:w-72 sm:max-w-none sm:text-left " + (msg.ok ? "border-green-200 bg-green-50 text-green-800" : "border-amber-200 bg-amber-50 text-amber-800")}>
          {msg.text}
        </div>
      )}
    </div>
  );
}
