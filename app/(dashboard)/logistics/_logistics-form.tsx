"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { LOGISTICS_GROUPS, type LogisticsField } from "@/lib/logistics-fields";
import { updateCustomerData } from "./actions";
import { saveProductLineDetails, type LineDetail } from "./_product-lines-actions";
import { REFERRAL_PARTNERS, computeLogistics, findPartner, type LineTotals, type ReferralPartner, type ShopifySummary } from "@/lib/logistics-calc";
import { DateOrPending, PackagePicker, TimePicker, UrnPicker, type PackageProduct, type UrnProduct } from "../_pickers";
import { LOGISTICS_STATUSES } from "@/lib/logistics-status";
import { canonicalDriver } from "@/lib/driver-names";
import { urnCost } from "@/lib/urn-costs";

const hk = (n: number) => `HK$${n.toLocaleString("en-US", { maximumFractionDigits: 2 })}`;

const input = "mt-1 w-full rounded-lg border border-[var(--line)] bg-white px-3 py-2 text-sm";
const readonly = "mt-1 w-full rounded-lg border border-[var(--line)] bg-[var(--head)] px-3 py-2 text-sm font-medium tabular-nums";

// 客戶資料（Excel 欄位）：所有單號共用同一表格；未有客戶資料時保存即建立。
// 分 6 組（主人及寵物、接送、火化、費用、骨灰龕、紀念品），預設收起，按組名展開；
// 收起的組別仍保留已修改的內容，最後按「儲存修改」一次過保存全部。
// 金額欄：已保存的數與單據即時計算不同時提示（例如開單後再加產品）
const COMPARE = new Set(["package_price", "memorial_addon_price", "other_surcharge", "package_code"]);
const differs = (a: string, b: string) => { const x = Number(String(a).replace(/[$,\s]/g, "")), y = Number(String(b).replace(/[$,\s]/g, "")); return Number.isFinite(x) && Number.isFinite(y) ? Math.abs(x - y) > 0.005 : a.trim() !== b.trim(); };

export type MemorialItem = LineDetail & { name: string; quantity: number; urn?: boolean };
// 整張單的舊 Excel 紀念品欄（有每件紀念品資料後不再顯示，以每件紀念品為準）
const LEGACY_MEMORIAL = new Set(["memorial_supplier", "delivered_to_supplier_on", "supplier_returned_on"]);

export function LogisticsForm({ invoice, initial, exists, isAdmin, autoKeys = [], derived = {}, lines = null, memorialItems = [], urnProducts = [], packageProducts = [], shopify = null, drivers = [], driverFees = {}, urnCosts, partners = REFERRAL_PARTNERS }: { invoice: string; initial: Record<string, string>; exists: boolean; isAdmin: boolean; autoKeys?: string[]; derived?: Record<string, string>; lines?: LineTotals | null; memorialItems?: MemorialItem[]; urnProducts?: UrnProduct[]; packageProducts?: PackageProduct[]; shopify?: ShopifySummary | null; drivers?: string[]; driverFees?: Record<string, number>; urnCosts?: Record<string, number>; partners?: ReferralPartner[] }) {
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
  // 骨灰龕產品行（產品代碼 URN…）的成本計入骨灰龕成本，不計入紀念品成本
  const itemCosts = items.filter((x) => x.cost.trim() !== "");
  const keepsakeCost = itemCosts.filter((x) => !x.urn).reduce((n, x) => n + (Number(x.cost) || 0), 0);
  const urnItemCost = itemCosts.filter((x) => x.urn).reduce((n, x) => n + (Number(x.cost) || 0), 0);
  const tableUrnCost = values.urn ? urnCost(values.urn, urnCosts) : null;
  const calc = computeLogistics(values, lines ? { ...lines, cost: keepsakeCost, costCount: itemCosts.length } : null, shopify, {
    // 司機費：改了司機或未有已存值時，按司機的標準收費；骨灰龕成本：改了骨灰龕或未有已存值時，按成本表
    driverCost: values.driver && (values.driver !== initial.driver || !(initial.driver_or_gogovan_cost || "").trim()) ? driverFees[canonicalDriver(values.driver)] ?? null : null,
    urnCost: values.urn && (values.urn !== initial.urn || !(initial.urn_cost || "").trim()) && tableUrnCost != null ? tableUrnCost : tableUrnCost == null && urnItemCost > 0 && !(initial.urn_cost || "").trim() ? urnItemCost : null,
    partners,
  });
  // 「費用與付款」：收入、收款、成本及利潤三段；計算欄只顯示，不會保存
  type FeeItem = { kind: "calc"; label: string; value: string; strong?: boolean } | { kind: "field"; key: string };
  const fld = (key: string): FeeItem => ({ kind: "field", key });
  const feeSections: { title: string; items: FeeItem[] }[] = [
    { title: "收入", items: [fld("package_price"), { kind: "calc", label: "紀念品加購", value: hk(calc.memorial.value) }, fld("back_to_nature_price"), fld("urn_storage_rental_price"), fld("other_surcharge"), { kind: "calc", label: "發票總額", value: hk(calc.invoiceTotal), strong: true }] },
    { title: "收款", items: [{ kind: "calc", label: "已收訂金", value: hk(calc.depositPaid) }, { kind: "calc", label: "接送訂金抵扣", value: hk(calc.credit) }, { kind: "calc", label: "折扣金額", value: hk(calc.discount) }, fld("discount_code"), { kind: "calc", label: "尚欠", value: hk(calc.balanceDue), strong: true }] },
    { title: "成本及利潤", items: [
      // 紀念品成本：有每件紀念品成本時按「5. 紀念品」加總，否則可直接填寫
      calc.memorialCost.from === "lines" ? { kind: "calc", label: "紀念品成本（不含骨灰龕）", value: hk(calc.memorialCost.value) } : fld("memorial_cost"),
      { kind: "calc", label: "骨灰龕成本", value: hk(calc.urnCost) },
      { kind: "calc", label: "司機／GoGoVan 費用", value: hk(calc.driverCost.value) },
      fld("delivery_cost_to_customer"), fld("commission"), fld("other_cost"), fld("other_cost_note"), fld("referral"),
      { kind: "calc", label: `轉介費${calc.referral.partner ? `（${calc.referral.partner}）` : ""}`, value: calc.referral.fee == null ? "—" : `${hk(calc.referral.fee)}${calc.referral.payable && calc.referral.fee ? "（應付）" : ""}` },
      ...(isAdmin ? [{ kind: "calc" as const, label: "毛利", value: hk(calc.grossProfit), strong: true }] : []),
    ] },
  ];
  const feeFields = groups.find((g) => g.title === "費用與付款")?.fields || [];
  const fieldOf = (key: string) => feeFields.find((f) => f.key === key);

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

  const fieldEl = (f: LogisticsField) => (
                    <label key={f.key} className={"text-sm" + (f.type === "textarea" ? " sm:col-span-2 lg:col-span-4" : f.key === "urn" || f.key === "package_name" ? " sm:col-span-2" : "")}>
                      {f.label}
                      {f.key === "driver" ? (
                        <select value={values[f.key] || ""} onChange={(e) => setValues((v) => ({ ...v, [f.key]: e.target.value }))} className={input + (auto.has(f.key) && values[f.key] === initial[f.key] ? " !bg-amber-50" : "")}>
                          <option value="">（未選擇）</option>
                          {drivers.map((d) => <option key={d}>{d}</option>)}
                          {values[f.key] && !drivers.includes(values[f.key]) && <option value={values[f.key]}>{values[f.key]}</option>}
                        </select>
                      ) : f.key === "package_name" ? (
                        <div className="mt-1"><PackagePicker name={values.package_name || ""} code={values.package_code || ""} products={packageProducts} onChange={(p) => setValues((v) => ({ ...v, package_name: p.name, package_code: p.code, ...(p.price && !(v.package_price || "").trim() ? { package_price: String(Number(p.price)) } : {}) }))} className={input.replace("mt-1 ", "") + (auto.has(f.key) && values[f.key] === initial[f.key] ? " !bg-amber-50" : "")} /></div>
                      ) : f.key === "row_status" ? (
                        <select value={values[f.key] || ""} onChange={(e) => setValues((v) => ({ ...v, [f.key]: e.target.value }))} className={input + (auto.has(f.key) && values[f.key] === initial[f.key] ? " !bg-amber-50" : "")}>
                          <option value="">（未選擇）</option>
                          {LOGISTICS_STATUSES.map((s) => <option key={s.key} value={s.key}>{s.label}（{s.key}）</option>)}
                          {values[f.key] && !LOGISTICS_STATUSES.some((s) => s.key === values[f.key]) && <option value={values[f.key]}>{values[f.key]}</option>}
                        </select>
                      ) : f.key === "urn_pickup_status" ? (
                        <div className="mt-1"><DateOrPending value={values[f.key] || ""} onChange={(val) => setValues((v) => ({ ...v, [f.key]: val }))} className={input.replace("mt-1 ", "") + (auto.has(f.key) && values[f.key] === initial[f.key] ? " !bg-amber-50" : "")} /></div>
                      ) : f.key === "ceremony_time" || f.key === "arrival_time" ? (
                        <div className="mt-1"><TimePicker value={values[f.key] || ""} onChange={(val) => setValues((v) => ({ ...v, [f.key]: val }))} className={input.replace("mt-1 ", "") + (auto.has(f.key) && values[f.key] === initial[f.key] ? " !bg-amber-50" : "")} /></div>
                      ) : f.key === "urn" ? (
                        <div className="mt-1">
                          <UrnPicker value={values[f.key] || ""} onChange={(val) => setValues((v) => ({ ...v, [f.key]: val }))} products={urnProducts} className={input.replace("mt-1 ", "") + (auto.has(f.key) && values[f.key] === initial[f.key] ? " !bg-amber-50" : "")} />
                        </div>
                      ) : f.key === "referral" ? (
                        // 轉介夥伴：對照表選項；舊資料的其他文字保留為選項，不會自動改寫
                        <select value={values[f.key] || ""} onChange={(e) => setValues((v) => ({ ...v, [f.key]: e.target.value }))} className={input + (auto.has(f.key) && values[f.key] === initial[f.key] ? " !bg-amber-50" : "")}>
                          <option value="">（沒有轉介）</option>
                          {partners.map((p) => <option key={p.key} value={p.key}>{p.key}{p.payable ? "" : "（不收費）"}</option>)}
                          {values[f.key] && !findPartner(values[f.key], partners) && <option value={values[f.key]}>{values[f.key]}（對照表以外，不計費）</option>}
                          {values[f.key] && findPartner(values[f.key], partners) && findPartner(values[f.key], partners)?.key !== values[f.key] && <option value={values[f.key]}>{values[f.key]}</option>}
                        </select>
                      ) : f.type === "textarea" ? (
                        <textarea value={values[f.key] || ""} onChange={(e) => setValues((v) => ({ ...v, [f.key]: e.target.value }))} rows={2} maxLength={20000} className={input + (auto.has(f.key) && values[f.key] === initial[f.key] ? " !bg-amber-50" : "")} />
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
  );

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
                  {group.title === "費用與付款" && feeSections.map((sec) => (
                    <div key={sec.title} className="contents">
                      <p className="border-b border-[var(--line)] pb-1 pt-2 text-sm font-semibold text-[var(--soft)] sm:col-span-2 lg:col-span-4">{sec.title}</p>
                      {sec.items.map((x) => x.kind === "calc"
                        ? <div key={x.label} className="text-sm">{x.label}<div className={readonly + (x.strong ? " font-semibold" : "")}>{x.value}</div></div>
                        : fieldOf(x.key) ? fieldEl(fieldOf(x.key)!) : null)}
                    </div>
                  ))}
                  {group.title === "紀念品" && items.map((it, n) => (
                    <div key={it.id} className="rounded-xl border border-[var(--line)] bg-[var(--card)] p-3 sm:col-span-2 lg:col-span-4">
                      <p className="mb-2 text-sm font-semibold">{it.urn ? "骨灰龕" : "紀念品"} {n + 1}：{it.name}{it.quantity !== 1 ? ` × ${it.quantity}` : ""}{itemChanged(it) && <span className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-normal text-amber-800">已修改</span>}</p>
                      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                        <label className="text-sm">供應商<input value={it.vendor} onChange={(e) => setItem(it.id, { vendor: e.target.value })} maxLength={120} className={input} /></label>
                        <label className="text-sm">交供應商日期<input type="date" value={it.delivered_to_vendor_on} onChange={(e) => setItem(it.id, { delivered_to_vendor_on: e.target.value })} className={input} /></label>
                        <label className="text-sm">供應商交回日期<input type="date" value={it.vendor_returned_on} onChange={(e) => setItem(it.id, { vendor_returned_on: e.target.value })} className={input} /></label>
                        <label className="text-sm">完成日期<input type="date" value={it.completed_on} onChange={(e) => setItem(it.id, { completed_on: e.target.value })} className={input} /></label>
                        <label className="text-sm">成本<input value={it.cost} onChange={(e) => setItem(it.id, { cost: e.target.value.replace(/[^\d.]/g, "") })} inputMode="decimal" className={input} /></label>
                        <label className="text-sm sm:col-span-1 lg:col-span-3">備註<input value={it.remarks} onChange={(e) => setItem(it.id, { remarks: e.target.value })} maxLength={20000} className={input} /></label>
                      </div>
                    </div>
                  ))}
                  {group.title !== "費用與付款" && group.fields.filter((f) => f.key !== "package_code" && !(group.title === "紀念品" && items.length > 0 && LEGACY_MEMORIAL.has(f.key))).map((f) => fieldEl(f))}
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
