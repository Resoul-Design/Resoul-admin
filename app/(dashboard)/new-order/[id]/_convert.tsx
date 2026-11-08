"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { convertToCremation } from "./_convert-actions";

// 紀念品／其他單含火化方案：轉為火化預約
export function ConvertToCremation({ id }: { id: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  return (
    <div className="mb-4 rounded-2xl border border-amber-300 bg-amber-50 p-4 text-sm">
      <p className="text-amber-900">此單包含火化方案，但仍是紀念品／其他單，火化預約列表未有記錄。轉為火化預約後可排期及更新進度（單號、專案編號及付款連結不變）。</p>
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <button type="button" disabled={pending} onClick={() => { if (!window.confirm("確定轉為火化預約？")) return; start(async () => { setMsg(null); const r = await convertToCremation(id); setMsg(r.error ? { ok: false, text: r.error } : { ok: true, text: r.done || "已轉換。" }); router.refresh(); }); }} className="rounded-lg bg-[var(--gold)] px-4 py-2 text-white hover:opacity-90 disabled:opacity-50">{pending ? "轉換中…" : "轉為火化預約"}</button>
        {msg && <span role="status" className={msg.ok ? "text-green-700" : "text-red-700"}>{msg.text}</span>}
      </div>
    </div>
  );
}
