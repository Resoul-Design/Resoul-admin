"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { changeInvoiceNo, retrySync } from "../actions";
import { WHATSAPP_CONFIRM } from "../../_testing-notice";

const btn = "rounded-lg border border-[var(--line)] bg-[var(--card)] px-3 py-2 text-sm hover:bg-[var(--cream)] disabled:opacity-50";

export function RetrySync({ id }: { id: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState("");
  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      <button type="button" disabled={pending} onClick={() => start(async () => { setError(""); const r = await retrySync(id); if (r.error) setError(r.error); router.refresh(); })} className={btn}>
        {pending ? "同步中…" : "重試同步"}
      </button>
      {error && <span className="text-red-700">{error}</span>}
    </span>
  );
}

export function CopyLink({ url }: { url: string }) {
  const [done, setDone] = useState(false);
  return (
    <button type="button" onClick={async () => { await navigator.clipboard.writeText(url); setDone(true); setTimeout(() => setDone(false), 1500); }} className={btn}>
      {done ? "已複製" : "複製付款連結"}
    </button>
  );
}

// 管理員人手修正單號：同一專案的所有記錄一併更新，並寫入審計記錄
export function ChangeInvoiceNo({ current }: { current: number }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState("");
  const [reason, setReason] = useState("");
  const [error, setError] = useState("");
  const [pending, start] = useTransition();
  if (!open) return <button type="button" onClick={() => setOpen(true)} className="mt-4 text-xs text-[var(--soft)] hover:underline">修改單號（管理員）</button>;
  return (
    <div className="mt-4 rounded-2xl border border-[var(--line)] bg-[var(--card)] p-4 text-sm">
      <p className="mb-2 text-[var(--soft)]">將單號 {current} 改為（同一專案的接送、火化、紀念品記錄及訂金流水會一併更新）：</p>
      <div className="flex flex-wrap gap-2">
        <input value={value} onChange={(e) => setValue(e.target.value.replace(/\D/g, ""))} inputMode="numeric" placeholder="新單號" className="w-28 rounded-lg border border-[var(--line)] bg-white px-3 py-2" />
        <input value={reason} onChange={(e) => setReason(e.target.value)} maxLength={300} placeholder="修改原因（必填）" className="min-w-0 flex-1 rounded-lg border border-[var(--line)] bg-white px-3 py-2" />
        <button
          type="button"
          disabled={pending || !value || !reason.trim()}
          onClick={() => {
            if (!window.confirm(`確定將單號 ${current} 改為 ${value}？`)) return;
            start(async () => {
              setError("");
              const r = await changeInvoiceNo(current, value, reason);
              if (r.error) return setError(r.error);
              setOpen(false);
              router.refresh();
            });
          }}
          className="rounded-lg bg-[var(--gold)] px-4 py-2 text-white hover:opacity-90 disabled:opacity-50"
        >
          {pending ? "修改中…" : "修改"}
        </button>
      </div>
      {error && <p className="mt-2 text-red-700">{error}</p>}
    </div>
  );
}

export function WhatsAppLink({ href, className }: { href: string; className: string }) {
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" onClick={(e) => { if (WHATSAPP_CONFIRM && !window.confirm(WHATSAPP_CONFIRM)) e.preventDefault(); }} className={className}>
      💬 WhatsApp 客人
    </a>
  );
}
