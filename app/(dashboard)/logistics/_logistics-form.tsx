"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { LOGISTICS_GROUPS } from "@/lib/logistics-fields";
import { updateCustomerData } from "./actions";
import { saveProductLineDetails, type LineDetail } from "./_product-lines-actions";
import { REFERRAL_PARTNERS, computeLogistics, findPartner, type LineTotals } from "@/lib/logistics-calc";
import { TimePicker, UrnPicker, urnServiceName, type UrnProduct } from "../_pickers";

const hk = (n: number) => `HK$${n.toLocaleString("en-US", { maximumFractionDigits: 2 })}`;

const input = "mt-1 w-full rounded-lg border border-[var(--line)] bg-white px-3 py-2 text-sm";
const readonly = "mt-1 w-full rounded-lg border border-[var(--line)] bg-[var(--head)] px-3 py-2 text-sm font-medium tabular-nums";

// 客戶資料（Excel 欄位）：所有單號共用同一表格；未有客戶資料時保存即建立。
// 分 6 組（主人及寵物、接送、火化、費用、骨灰龕、紀念品），預設收起，按組名展開；
// 收起的組別仍保留已修改的內容，最後按「儲存修改」一次過保存全部。
// 金額欄：已保存的數與單據即時計算不同時提示（例如開單後再加產品）
const COMPARE = new Set(["package_price", "memorial_addon_price", "other_surcharge", "deposit_received"]);
const differs = (a: string, b: string) => { const x = Number(String(a).replace(/[$,\s]/g, "")), y = Number(String(b).replace(/[$,\s]/g, "")); return Number.isFinite(x) && Number.isFinite(y) ? Math.abs(x - y) > 0.005 : a.trim() !== b.trim(); };

export type MemorialItem = LineDetail & { name: string; quantity: number };
// 整張單的舊 Excel 紀念品欄（有每件紀念品資料後，只在已有數值時顯示）
const LEGACY_MEMORIAL = new Set(["delivered_to_supplier_on", "supplier_returned_on", "memorial_cost"]);

export function LogisticsForm({ invoice, initial, exists, isAdmin, autoKeys = [], derived = {}, lines = null, memorialItems = [], urnProducts = [] }: { invoice: string; initial: Record<string, string>; exists: boolean; isAdmin: boolean; autoKeys?: string[]; derived?: Record<string, string>; lines?: LineTotals | null; memorialItems?: MemorialItem[]; urnProducts?: UrnProduct[] }) {
  const auto = new Set(autoKeys);
  const router = useRouter();
  const [values, setValues] = useState<Record<string, string>>(initial);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  const stale = (k: string) => COMPARE.has(k) && !auto.has(k) && !!derived[k] && !!(values[k] || "").trim() && differs(values[k] || "", derived[k]);
  const staleCount = Object.keys(derived).filter(stale).length;
  const groups = LOGISTICS_GROUPS.map((g) => ({ ...g, fields: g.fields.filter((f) => (!f.adminOnly || isAdmin) && !f.hidden) }));
  const [closed, setClosed] = useState<Set<string>>(() => new Set(groups.map((g) => g.title)));
  const [saved, setSaved] = useState<Record<string, string>>(initial);
  const changed = (k: string) => (values[k] || "") !== (saved[k] || "");
  const changedCount = groups.reduce((n, g) => n + g.fields.filter((f) => changed(f.key)).length, 0);
  // 自動填入（淡黃色）的值：按「採用自動填入」才保存，否則保留資料庫原有（空白）值
  const [acceptAuto, setAcceptAuto] = useState(false);
  // 每件紀念品的成本資料（與客戶資料一起保存）
  const [items, setItems] = useState<MemorialItem[]>(memorialItems);
  const [savedItems, setSavedItems] = useState<MemorialItem[]>(memorialItems);
  // 產品表格加減紀念品後（頁面重新載入），卡片跟隨最新紀念品
  const itemsKey = memorialItems.map((x) => x.id).join(",");
  const [shownKey, setShownKey] = useState(itemsKey);
  if (shownKey !== itemsKey) { setShownKey(itemsKey); setItems(memorialItems); setSavedItems(memorialItems); }
  const itemChanged = (it: MemorialItem) => JSON.stringify(it) !== JSON.stringify(savedItems.find((x) => x.id === it.id));
  const changedItems = items.filter(itemChanged);
  const setItem = (id: string, patch: Partial<MemorialItem>) => setItems((list) => list.map((x) => (x.id === id ? { ...x, ...patch } : x)));
  // 紀念品成本：有每件紀念品時按目前輸入加總
  const itemCosts = items.filter((x) => x.cost.trim() !== "");
  const calc = computeLogistics(values, lines ? { ...lines, cost: itemCosts.reduce((n, x) => n + (Number(x.cost) || 0), 0), costCount: itemCosts.length } : null);
  // 計算欄（只顯示，不會保存）：放在「費用與付款」組最前
  const calcFields: { label: string; value: string }[] = [
    { label: "發票總額", value: hk(calc.invoiceTotal) },
    { label: "尚欠", value: hk(calc.balanceDue) },
    { label: `轉介費${calc.referral.partner ? `（${calc.referral.partner}）` : ""}`, value: calc.referral.fee == null ? "—" : `${hk(calc.referral.fee)}${calc.referral.payable && calc.referral.fee ? "（應付）" : ""}` },
    { label: "司機費", value: hk(calc.driverCost.value) },
    ...(isAdmin ? [{ label: "毛利", value: hk(calc.grossProfit) }] : []),
  ];

  function save() {
    setMsg(null);
    start(async () => {
      // 只送出真正修改的欄位；未修改的欄位維持已存值，不會被重寫
      const payload = Object.fromEntries(Object.entries(values).filter(([k, v]) => (v || "") !== (initial[k] || "") || (acceptAuto && auto.has(k) && (v || "") !== "")));
      if (exists && !Object.keys(payload).length && !changedItems.length) return setMsg({ ok: true, text: "沒有修改，未有保存。" });
      const res = Object.keys(payload).length || !exists ? await updateCustomerData(invoice, payload) : {};
      if (res.error) return setMsg({ ok: false, text: res.error });
      if (changedItems.length) {
        const r2 = await saveProductLineDetails(Number(invoice), changedItems.map(({ id, vendor, delivered_to_vendor_on, vendor_returned_on, completed_on, cost, remarks }) => ({ id, vendor, delivered_to_vendor_on, vendor_returned_on, completed_on, cost, remarks })));
        if (r2.error) return setMsg({ ok: false, text: r2.error });
        setSavedItems(items);
      }
      setSaved(values);
      setMsg(res.warning ? { ok: false, text: `已保存。${res.warning}` } : { ok: true, text: `已保存（${Object.keys(payload).length + changedItems.length} 項）。` });
      router.refresh();
    });
  }
  const toggle = (t: string) => setClosed((s) => { const n = new Set(s); if (n.has(t)) n.delete(t); else n.add(t); return n; });
  const allClosed = closed.size === groups.length;

  return (
    <section className="mb-6">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <h2 className="text-lg font-semibold">編輯客戶資料（Excel 欄位）</h2>
        {!exists && <span className="text-sm text-[var(--soft)]">此單號未有客戶資料，保存後建立</span>}
        <button type="button" onClick={() => setClosed(allClosed ? new Set() : new Set(groups.map((g) => g.title)))} className="ml-auto text-sm text-[var(--gold)] hover:underline">{allClosed ? "全部展開" : "全部收起"}</button>
      </div>
      <nav className="mb-3 flex flex-wrap gap-2" aria-label="客戶資料分組">
        {groups.map((g, i) => (
          <a key={g.title} href={`#lg-${i + 1}`} onClick={() => setClosed((s) => { const n = new Set(s); n.delete(g.title); return n; })} className="rounded-full border border-[var(--line)] bg-white px-3 py-1 text-xs hover:border-[var(--gold)]">
            {i + 1}. {g.title}
          </a>
        ))}
      </nav>
      {staleCount > 0 && <p className="mb-3 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">有 {staleCount} 個金額與單據最新計算不同（例如開單後加減了產品），請在「費用與付款」核對，按「用單據金額」更新後儲存。</p>}
      {autoKeys.length > 0 && (
        <p className="mb-3 flex flex-wrap items-center gap-2 text-xs text-[var(--soft)]">
          <span><span className="mr-1 inline-block h-3 w-3 rounded border border-amber-300 bg-amber-50 align-middle" />淡黃色欄位按單據資料自動填入（{autoKeys.length} 項），只作參考；修改後或按「採用自動填入」才會保存。</span>
          <label className="flex items-center gap-1 text-[var(--ink)]"><input type="checkbox" checked={acceptAuto} onChange={(e) => setAcceptAuto(e.target.checked)} />採用自動填入</label>
        </p>
      )}
      <div className="space-y-3">
        {groups.map((group, i) => {
          const open = !closed.has(group.title);
          const filled = group.fields.filter((f) => (values[f.key] || "").trim() !== "").length;
          const edited = group.fields.filter((f) => changed(f.key)).length;
          return (
            <div key={group.title} id={`lg-${i + 1}`} className="scroll-mt-20 rounded-2xl border border-[var(--line)] bg-white">
              <button type="button" onClick={() => toggle(group.title)} aria-expanded={open} className="flex w-full items-center gap-2 px-4 py-3 text-left">
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-[var(--gold)] text-xs font-semibold text-white">{i + 1}</span>
                <span className="font-semibold">{group.title}</span>
                <span className="text-xs text-[var(--soft)]">已填 {filled}／{group.fields.length}</span>
                {group.fields.some((f) => stale(f.key)) && <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs text-amber-800">金額待核對</span>}
                {edited > 0 && <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs text-amber-800">已修改 {edited} 項</span>}
                <span className="ml-auto text-[var(--soft)]">{open ? "▾" : "▸"}</span>
              </button>
              {open && (
                <div className="grid gap-3 border-t border-[var(--line)] px-4 pb-4 pt-3 sm:grid-cols-2 lg:grid-cols-4">
                  {group.title === "費用與付款" && calcFields.map((c) => (
                    <div key={c.label} className="text-sm">
                      {c.label}
                      <div className={readonly}>{c.value}</div>
                    </div>
                  ))}
                  {group.title === "紀念品及成本" && items.map((it, n) => (
                    <div key={it.id} className="rounded-xl border border-[var(--line)] bg-[var(--card)] p-3 sm:col-span-2 lg:col-span-4">
                      <p className="mb-2 text-sm font-semibold">紀念品 {n + 1}：{it.name}{it.quantity !== 1 ? ` × ${it.quantity}` : ""}{itemChanged(it) && <span className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-normal text-amber-800">已修改</span>}</p>
                      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                        <label className="text-sm">供應商<input value={it.vendor} onChange={(e) => setItem(it.id, { vendor: e.target.value })} maxLength={120} className={input} /></label>
                        <label className="text-sm">交供應商日期<input type="date" value={it.delivered_to_vendor_on} onChange={(e) => setItem(it.id, { delivered_to_vendor_on: e.target.value })} className={input} /></label>
                        <label className="text-sm">供應商交回日期<input type="date" value={it.vendor_returned_on} onChange={(e) => setItem(it.id, { vendor_returned_on: e.target.value })} className={input} /></label>
                        <label className="text-sm">完成日期<input type="date" value={it.completed_on} onChange={(e) => setItem(it.id, { completed_on: e.target.value })} className={input} /></label>
                        <label className="text-sm">成本<input value={it.cost} onChange={(e) => setItem(it.id, { cost: e.target.value.replace(/[^\d.]/g, "") })} inputMode="decimal" className={input} /></label>
                        <label className="text-sm sm:col-span-1 lg:col-span-3">備註<input value={it.remarks} onChange={(e) => setItem(it.id, { remarks: e.target.value })} maxLength={2000} className={input} /></label>
                      </div>
                    </div>
                  ))}
                  {group.title === "紀念品及成本" && items.length > 0 && (
                    <div className="text-sm">紀念品成本合計<div className={readonly}>{hk(calc.memorialCost.value)}</div></div>
                  )}
                  {group.fields.filter((f) => !(group.title === "紀念品及成本" && items.length > 0 && LEGACY_MEMORIAL.has(f.key) && !(initial[f.key] || "").trim())).map((f) => (
                    <label key={f.key} className={"text-sm" + (f.type === "textarea" ? " sm:col-span-2 lg:col-span-4" : f.key === "urn" ? " sm:col-span-2" : "")}>
                      {f.label}
                      {f.key === "ceremony_time" ? (
                        <div className="mt-1"><TimePicker value={values[f.key] || ""} onChange={(val) => setValues((v) => ({ ...v, [f.key]: val }))} className={input.replace("mt-1 ", "") + (auto.has(f.key) && values[f.key] === initial[f.key] ? " !bg-amber-50" : "")} /></div>
                      ) : f.key === "urn" ? (
                        <div className="mt-1">
                          <UrnPicker value={values[f.key] || ""} onChange={(val) => setValues((v) => ({ ...v, [f.key]: val }))} products={urnProducts} className={input.replace("mt-1 ", "") + (auto.has(f.key) && values[f.key] === initial[f.key] ? " !bg-amber-50" : "")} />
                          {urnServiceName(values[f.key] || "", urnProducts) && <span className="mt-1 block text-xs text-[var(--soft)]">{urnServiceName(values[f.key] || "", urnProducts)}</span>}
                        </div>
                      ) : f.key === "referral" ? (
                        // 轉介夥伴：對照表選項；舊資料的其他文字保留為選項，不會自動改寫
                        <select value={values[f.key] || ""} onChange={(e) => setValues((v) => ({ ...v, [f.key]: e.target.value }))} className={input + (auto.has(f.key) && values[f.key] === initial[f.key] ? " !bg-amber-50" : "")}>
                          <option value="">（沒有轉介）</option>
                          {REFERRAL_PARTNERS.map((p) => <option key={p.key} value={p.key}>{p.key}{p.payable ? "" : "（不收費）"}</option>)}
                          {values[f.key] && !findPartner(values[f.key]) && <option value={values[f.key]}>{values[f.key]}（對照表以外，不計費）</option>}
                          {values[f.key] && findPartner(values[f.key]) && findPartner(values[f.key])?.key !== values[f.key] && <option value={values[f.key]}>{values[f.key]}</option>}
                        </select>
                      ) : f.type === "textarea" ? (
                        <textarea value={values[f.key] || ""} onChange={(e) => setValues((v) => ({ ...v, [f.key]: e.target.value }))} rows={2} maxLength={2000} className={input + (auto.has(f.key) && values[f.key] === initial[f.key] ? " !bg-amber-50" : "")} />
                      ) : (
                        <input
                          type={f.type === "date" ? "date" : f.type === "url" ? "url" : "text"}
                          inputMode={f.type === "number" ? "decimal" : undefined}
                          value={values[f.key] || ""}
                          onChange={(e) => setValues((v) => {
                            const next = { ...v, [f.key]: e.target.value };
                            // 告別日期跟火化日期（告別日期空白或原本相同時）
                            if (f.key === "ceremony_or_order_date" && (!v.shower_date || v.shower_date === v.ceremony_or_order_date)) next.shower_date = e.target.value;
                            return next;
                          })}
                          maxLength={300}
                          className={input + (auto.has(f.key) && values[f.key] === initial[f.key] ? " !bg-amber-50" : "")}
                        />
                      )}
                      {stale(f.key) && (
                        <span className="mt-1 block text-xs text-amber-800">
                          單據計算：{derived[f.key]}
                          <button type="button" onClick={() => setValues((v) => ({ ...v, [f.key]: derived[f.key] }))} className="ml-2 text-[var(--gold)] underline">用單據金額</button>
                        </span>
                      )}
                    </label>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
      <div className="sticky bottom-0 mt-3 flex flex-wrap items-center gap-3 rounded-2xl border border-[var(--line)] bg-[var(--head)] px-4 py-3">
        <button type="button" onClick={save} disabled={pending} className="rounded-lg bg-[var(--gold)] px-4 py-2 text-sm text-white hover:opacity-90 disabled:opacity-50">{pending ? "保存中…" : "儲存修改"}</button>
        {changedCount + changedItems.length > 0 && !pending && <span className="text-sm text-amber-800">共 {changedCount + changedItems.length} 項未保存（包括已收起的組別）</span>}
        {msg && <span role="status" className={"text-sm " + (msg.ok ? "text-green-700" : "text-red-700")}>{msg.text}</span>}
      </div>
    </section>
  );
}
