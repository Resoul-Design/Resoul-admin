"use client";

import { useState, useTransition } from "react";
import { savePriceSettings, type PriceRowInput } from "./actions";

type Kind = "urn" | "referral" | "driver" | "product";
export type EditorRow = PriceRowInput & { name?: string; history?: string };

const input = "w-full min-w-0 rounded-lg border border-[var(--line)] bg-white px-2 py-1.5 outline-none focus:border-[var(--gold)]";
const th = "px-3 py-2 font-medium";
const td = "px-3 py-2 align-middle";
const RATE_TYPES = [
  { value: "percent", label: "按套餐價百分比" },
  { value: "fixed", label: "固定金額" },
  { value: "zero", label: "不收費" },
];

let seq = 0;
const tempKey = () => `n${++seq}`;

export function PriceEditor({ kind, title, rows: initial, canSave }: { kind: Kind; title: string; rows: EditorRow[]; canSave: boolean }) {
  const [rows, setRows] = useState(() => initial.map((r) => ({ ...r, _id: tempKey() })));
  const [msg, setMsg] = useState("");
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const set = (id: string, patch: Partial<EditorRow>) => setRows((list) => list.map((r) => (r._id === id ? { ...r, ...patch } : r)));
  const add = () => setRows((list) => [...list, { _id: tempKey(), key: "", amount: "", rateType: "percent", rate: "", aliases: "", needsPackageCode: false }]);
  const remove = (id: string) => setRows((list) => list.filter((r) => r._id !== id));
  const save = () => {
    setMsg("");
    start(async () => {
      const r = await savePriceSettings(kind, rows.map(({ key, amount, rateType, rate, aliases, needsPackageCode, vendor }) => ({ key, amount, rateType, rate, aliases, needsPackageCode, vendor })));
      setMsg(r.error ? `⚠️ ${r.error}` : `✅ ${r.done}`);
    });
  };

  const head = kind === "urn" ? ["產品代碼", "名稱", "供應商", "成本（HK$）", ""] : kind === "product" ? ["產品代碼（SKU）", "名稱", "供應商", "單位成本（HK$）", ""] : kind === "driver" ? ["司機", "標準收費（HK$）", "記錄最常見金額", ""] : ["夥伴", "其他寫法", "計算方式", "比例／金額", "須有套餐代碼", ""];

  return (
    <section className="mb-5 rounded-2xl border border-[var(--line)] bg-[var(--card)]">
      <button type="button" onClick={() => setOpen((v) => !v)} className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left">
        <span className="font-medium">{title}<span className="ml-2 text-sm font-normal text-[var(--soft)]">{rows.filter((r) => r.key).length} 項</span></span>
        <span className="text-[var(--soft)]">{open ? "▲" : "▼"}</span>
      </button>
      {open && (
        <div className="border-t border-[var(--line)] p-4">
          <div className="overflow-x-auto rounded-xl border border-[var(--line)] bg-white">
            <table className="w-full min-w-[560px] text-sm">
              <thead><tr className="bg-[var(--head)] text-left text-[var(--soft)]">{head.map((h, i) => <th key={i} className={th}>{h}</th>)}</tr></thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r._id} className="border-t border-[var(--line)]">
                    {kind === "urn" && <>
                      <td className={td}><input value={r.key} onChange={(e) => set(r._id, { key: e.target.value })} className={input} aria-label="產品代碼" /></td>
                      <td className={td + " text-[var(--soft)]"}>{r.name || "—"}</td>
                      <td className={td}><input value={r.vendor || ""} onChange={(e) => set(r._id, { vendor: e.target.value })} className={input} aria-label="供應商" /></td>
                      <td className={td}><input inputMode="decimal" value={r.amount || ""} onChange={(e) => set(r._id, { amount: e.target.value })} className={input} aria-label="成本" /></td>
                    </>}
                    {kind === "product" && <>
                      <td className={td}><input value={r.key} onChange={(e) => set(r._id, { key: e.target.value })} className={input} aria-label="產品代碼" /></td>
                      <td className={td + " text-[var(--soft)]"}>{r.name || "—"}</td>
                      <td className={td}><input value={r.vendor || ""} onChange={(e) => set(r._id, { vendor: e.target.value })} className={input} aria-label="供應商" /></td>
                      <td className={td}><input inputMode="decimal" value={r.amount || ""} onChange={(e) => set(r._id, { amount: e.target.value })} className={input} aria-label="單位成本" /></td>
                    </>}
                    {kind === "driver" && <>
                      <td className={td}><input value={r.key} onChange={(e) => set(r._id, { key: e.target.value })} className={input} aria-label="司機" /></td>
                      <td className={td}><input inputMode="decimal" value={r.amount || ""} onChange={(e) => set(r._id, { amount: e.target.value })} className={input} aria-label="標準收費" /></td>
                      <td className={td + " text-[var(--soft)]"}>{r.history ? `HK$${r.history}` : "—"}</td>
                    </>}
                    {kind === "referral" && <>
                      <td className={td}><input value={r.key} onChange={(e) => set(r._id, { key: e.target.value })} className={input} aria-label="夥伴" /></td>
                      <td className={td}><input value={r.aliases || ""} onChange={(e) => set(r._id, { aliases: e.target.value })} className={input} aria-label="其他寫法" /></td>
                      <td className={td}><select value={r.rateType || "percent"} onChange={(e) => set(r._id, { rateType: e.target.value })} className={input} aria-label="計算方式">{RATE_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}</select></td>
                      <td className={td}>{r.rateType === "zero" ? <span className="text-[var(--soft)]">—</span> : <div className="flex items-center gap-1">{r.rateType === "fixed" && <span className="text-[var(--soft)]">HK$</span>}<input inputMode="decimal" value={r.rate || ""} onChange={(e) => set(r._id, { rate: e.target.value })} className={input} aria-label="比例或金額" />{r.rateType !== "fixed" && <span className="text-[var(--soft)]">%</span>}</div>}</td>
                      <td className={td}><input type="checkbox" checked={!!r.needsPackageCode} onChange={(e) => set(r._id, { needsPackageCode: e.target.checked })} aria-label="須有套餐代碼" /></td>
                    </>}
                    <td className={td + " text-right"}>{canSave && <button type="button" onClick={() => remove(r._id)} className="text-xs text-red-700 hover:underline">刪除</button>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {canSave && (
            <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
              <button type="button" onClick={add} className="rounded-lg border border-[var(--line)] px-3 py-1.5 text-sm hover:bg-[var(--cream)]">＋ 新增</button>
              <div className="flex flex-wrap items-center gap-3">
                {msg && <span className="text-sm" role="status">{msg}</span>}
                <button type="button" onClick={save} disabled={pending} className="rounded-lg bg-[var(--gold)] px-4 py-2 text-sm text-white hover:opacity-90 disabled:opacity-50">{pending ? "保存中…" : "儲存"}</button>
              </div>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
