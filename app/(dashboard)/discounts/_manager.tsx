"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { DiscountCode } from "@/lib/discounts";
import { addDiscount, toggleDiscount } from "./actions";

const input = "w-full rounded-lg border border-[var(--line)] bg-white px-3 py-2 text-sm outline-none focus:border-[var(--gold)]";
const STATUS: Record<string, { label: string; cls: string }> = {
  ACTIVE: { label: "使用中", cls: "bg-green-100 text-green-800" },
  SCHEDULED: { label: "未開始", cls: "bg-blue-100 text-blue-800" },
  EXPIRED: { label: "已過期", cls: "bg-gray-200 text-gray-700" },
};
const day = (iso: string | null) => (iso ? new Date(new Date(iso).getTime() + 8 * 3600 * 1000).toISOString().slice(0, 10) : "");
const today = () => new Date(Date.now() + 8 * 3600 * 1000).toISOString().slice(0, 10);

export function DiscountManager({ codes, canEdit }: { codes: DiscountCode[]; canEdit: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [todayStr] = useState(today);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [form, setForm] = useState({ code: "", title: "", kind: "percent" as "percent" | "amount", value: "", startsAt: "", endsAt: "", usageLimit: "", minSubtotal: "", oncePerCustomer: false, combineOrder: true });
  const set = (p: Partial<typeof form>) => setForm((f) => ({ ...f, ...p }));

  function create() {
    setMsg(null);
    start(async () => {
      const r = await addDiscount({ code: form.code, title: form.title, kind: form.kind, value: Number(form.value), startsAt: form.startsAt || todayStr, endsAt: form.endsAt || null, usageLimit: Number(form.usageLimit) || null, minSubtotal: Number(form.minSubtotal) || null, oncePerCustomer: form.oncePerCustomer, combineOrder: form.combineOrder });
      if (r.error) return setMsg({ ok: false, text: r.error });
      setMsg({ ok: true, text: `已在 Shopify 建立優惠碼 ${form.code.toUpperCase()}。` });
      setForm({ code: "", title: "", kind: "percent", value: "", startsAt: "", endsAt: "", usageLimit: "", minSubtotal: "", oncePerCustomer: false, combineOrder: true });
      router.refresh();
    });
  }
  function toggle(c: DiscountCode, active: boolean) {
    if (!window.confirm(`確定${active ? "啟用" : "停用"}優惠碼 ${c.code}？`)) return;
    setMsg(null);
    start(async () => {
      const r = await toggleDiscount(c.id, c.code, active);
      setMsg(r.error ? { ok: false, text: r.error } : { ok: true, text: `已${active ? "啟用" : "停用"} ${c.code}。` });
      router.refresh();
    });
  }

  return (
    <div className="space-y-5">
      {canEdit && (
        <section className="rounded-2xl border border-[var(--line)] bg-[var(--card)] p-4">
          <h2 className="mb-3 font-medium">新增優惠碼</h2>
          <div className="grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
            <label>優惠碼<input value={form.code} onChange={(e) => set({ code: e.target.value.toUpperCase().replace(/[^A-Z0-9_-]/g, "") })} maxLength={40} className={input} placeholder="例如 WELCOME10" /></label>
            <label>名稱（內部）<input value={form.title} onChange={(e) => set({ title: e.target.value })} maxLength={100} className={input} /></label>
            <label>折扣方式<select value={form.kind} onChange={(e) => set({ kind: e.target.value as "percent" | "amount" })} className={input}><option value="percent">百分比（%）</option><option value="amount">固定金額（HK$）</option></select></label>
            <label>{form.kind === "percent" ? "折扣百分比" : "折扣金額"}<input value={form.value} onChange={(e) => set({ value: e.target.value.replace(/[^\d.]/g, "") })} inputMode="decimal" className={input} /></label>
            <label>開始日期<input type="date" value={form.startsAt || todayStr} onChange={(e) => set({ startsAt: e.target.value })} className={input} /></label>
            <label>結束日期（可留空）<input type="date" value={form.endsAt} onChange={(e) => set({ endsAt: e.target.value })} className={input} /></label>
            <label>使用次數上限（可留空）<input value={form.usageLimit} onChange={(e) => set({ usageLimit: e.target.value.replace(/\D/g, "") })} inputMode="numeric" className={input} /></label>
            <label>最低消費（可留空）<input value={form.minSubtotal} onChange={(e) => set({ minSubtotal: e.target.value.replace(/[^\d.]/g, "") })} inputMode="decimal" className={input} /></label>
            <label className="flex items-center gap-2"><input type="checkbox" checked={form.oncePerCustomer} onChange={(e) => set({ oncePerCustomer: e.target.checked })} />每位客人限用一次</label>
            <label className="flex items-center gap-2"><input type="checkbox" checked={form.combineOrder} onChange={(e) => set({ combineOrder: e.target.checked })} />可與其他訂單折扣合併</label>
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <button type="button" onClick={create} disabled={pending || !form.code || !form.value} className="rounded-lg bg-[var(--gold)] px-4 py-2 text-sm text-white disabled:opacity-50">{pending ? "處理中…" : "建立優惠碼"}</button>
            {msg && <span role="status" className={"text-sm " + (msg.ok ? "text-green-700" : "text-red-700")}>{msg.text}</span>}
          </div>
        </section>
      )}

      <div className="overflow-x-auto rounded-2xl border border-[var(--line)] bg-[var(--card)]">
        <table className="w-full min-w-[760px] text-sm">
          <thead><tr className="bg-[var(--head)] text-left text-[var(--soft)]">{["優惠碼", "內容", "狀態", "期間", "已用", "合併", ""].map((h) => <th key={h} className="px-4 py-3 font-medium">{h}</th>)}</tr></thead>
          <tbody>
            {codes.map((c) => {
              const st = STATUS[c.status] || { label: c.status || "已停用", cls: "bg-gray-200 text-gray-700" };
              return (
                <tr key={c.id} className="border-t border-[var(--line)] align-top">
                  <td className="px-4 py-3 font-medium text-[var(--gold)]">{c.code}{c.title !== c.code && <div className="text-xs font-normal text-[var(--soft)]">{c.title}</div>}</td>
                  <td className="px-4 py-3">{c.summary || "—"}</td>
                  <td className="px-4 py-3"><span className={"rounded-full px-2 py-0.5 text-xs " + st.cls}>{st.label}</span></td>
                  <td className="px-4 py-3 text-xs text-[var(--soft)]">{day(c.startsAt)}{c.endsAt ? ` 至 ${day(c.endsAt)}` : " 起"}</td>
                  <td className="px-4 py-3 tabular-nums">{c.used}{c.usageLimit ? ` / ${c.usageLimit}` : ""}</td>
                  <td className="px-4 py-3 text-xs">{c.combinesOrder ? "可" : "不可"}</td>
                  <td className="px-4 py-3 text-right">{canEdit && (c.status === "ACTIVE" || c.status === "SCHEDULED"
                    ? <button type="button" onClick={() => toggle(c, false)} disabled={pending} className="text-xs text-red-700 hover:underline">停用</button>
                    : <button type="button" onClick={() => toggle(c, true)} disabled={pending} className="text-xs text-[var(--gold)] hover:underline">啟用</button>)}</td>
                </tr>
              );
            })}
            {!codes.length && <tr><td colSpan={7} className="p-8 text-center text-[var(--soft)]">未有優惠碼。</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
