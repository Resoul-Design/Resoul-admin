"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { markReviewInvite } from "./_review-actions";
import { WHATSAPP_CONFIRM } from "./_testing-notice";
import { reviewMessage, type ReviewCandidate } from "@/lib/review-message";

const waLink = (phone: string, text: string) => {
  const digits = phone.replace(/\D/g, "");
  if (!digits) return null;
  return `https://wa.me/${digits.startsWith("852") ? digits : `852${digits}`}?text=${encodeURIComponent(text)}`;
};

// 總覽：服務完成後邀請評價（WhatsApp 草稿 → 標記已邀請／略過）
export function ReviewInvites({ items, staffName, reviewUrl }: { items: ReviewCandidate[]; staffName: string; reviewUrl: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState("");
  const [open, setOpen] = useState(false);
  if (!items.length) return null;
  const mark = (c: ReviewCandidate, skipped: boolean) =>
    start(async () => {
      setError("");
      const res = await markReviewInvite(c.entity, c.ref, c.phone, skipped);
      if (res.error) setError(res.error);
      else router.refresh();
    });
  const shown = open ? items : items.slice(0, 3);
  return (
    <div className="mb-6 rounded-2xl border border-[var(--line)] bg-[var(--card)] px-5 py-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-3">
          <span className="text-2xl">⭐</span>
          <div>
            <div className="font-semibold">邀請評價 <span className="text-[var(--gold)]">{items.length}</span></div>
            <div className="text-xs text-[var(--soft)]">服務完成 3 日後，可邀請客人在 Google 留下評價（同一位客人只會出現一次）。</div>
          </div>
        </div>
        {items.length > 3 && (
          <button type="button" onClick={() => setOpen((v) => !v)} className="text-sm text-[var(--gold)] hover:underline">
            {open ? "收起" : `顯示全部 ${items.length} 位`}
          </button>
        )}
      </div>
      <ul className="mt-3 space-y-2">
        {shown.map((c) => {
          const wa = waLink(c.phone, reviewMessage(c, staffName, reviewUrl));
          return (
            <li key={c.entity + c.ref} className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-[var(--head)] px-3 py-2 text-sm">
              <span className="min-w-0">
                <b>{c.owner || "—"}</b>
                <span className="text-[var(--soft)]">　{c.pet ? `毛孩：${c.pet}　·　` : ""}{c.entity === "cremation" ? "骨灰交還" : "接送完成"} {c.doneAt}</span>
              </span>
              <span className="flex shrink-0 items-center gap-2">
                {wa && (
                  <a
                    href={wa}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={(e) => { if (WHATSAPP_CONFIRM && !window.confirm(WHATSAPP_CONFIRM)) e.preventDefault(); }}
                    className="rounded-lg border border-[var(--line)] bg-white px-3 py-1.5 hover:bg-[var(--cream)]"
                  >
                    💬 WhatsApp 邀請
                  </a>
                )}
                <button type="button" disabled={pending} onClick={() => mark(c, false)} className="rounded-lg bg-[var(--gold)] px-3 py-1.5 text-white hover:opacity-90 disabled:opacity-50">已邀請</button>
                <button type="button" disabled={pending} onClick={() => mark(c, true)} className="rounded-lg px-2 py-1.5 text-[var(--soft)] hover:underline disabled:opacity-50">略過</button>
              </span>
            </li>
          );
        })}
      </ul>
      {error && <p className="mt-2 text-sm text-red-700" role="alert">{error}</p>}
    </div>
  );
}
