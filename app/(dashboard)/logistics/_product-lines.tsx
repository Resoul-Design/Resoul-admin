"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { DraftCatalogProduct } from "@/lib/catalog";
import { MEMORIAL_STATUSES, isMemorialStatus, memorialLabel } from "@/lib/memorial-status";
import type { ProductLine } from "@/lib/memorial-lines";
import { saveProductLines, type SaveLine } from "./_product-lines-actions";
import { syncInvoiceProducts } from "../new-order/actions";

type Row = {
  key: string;
  id: string | null;
  product_name: string; variant_title: string; variant_id: string | null; product_code: string; vendor: string;
  quantity: string; unit_price: string; amount: string; status: string; customer_order_date: string; completed_on: string;
  delivered_to_vendor_on: string; vendor_returned_on: string; cost: string; remarks: string;
  source: string; source_ref: string | null; to_sync: boolean; suggested: boolean; locked: boolean;
  sync_status: ProductLine["sync_status"]; sync_error: string | null; shopify_ref: string | null; invoice_url: string | null;
  status_note: string | null; extra_ref: string | null; missing: boolean;
};

const cell = "w-full rounded-md border border-[var(--line)] bg-white px-2 py-1.5 text-sm disabled:bg-[var(--head)] disabled:text-[var(--soft)]";
const hk = (n: number) => `HK$${n.toLocaleString("en-US", { maximumFractionDigits: 2 })}`;
const str = (v: unknown) => (v == null ? "" : String(v));

function toRow(l: ProductLine): Row {
  return {
    key: l.key, id: l.id, product_name: l.product_name, variant_title: str(l.variant_title), variant_id: l.variant_id, product_code: str(l.product_code), vendor: str(l.vendor),
    quantity: str(l.quantity), unit_price: str(l.unit_price), amount: str(l.amount), status: l.status, customer_order_date: str(l.customer_order_date).slice(0, 10), completed_on: str(l.completed_on).slice(0, 10),
    delivered_to_vendor_on: str(l.delivered_to_vendor_on).slice(0, 10), vendor_returned_on: str(l.vendor_returned_on).slice(0, 10), cost: str(l.cost), remarks: str(l.remarks),
    source: l.source, source_ref: l.source_ref, to_sync: ["pending", "failed"].includes(l.sync_status), suggested: !!l.suggested, locked: ["synced", "syncing"].includes(l.sync_status),
    sync_status: l.sync_status, sync_error: l.sync_error, shopify_ref: l.shopify_ref, invoice_url: l.invoice_url, status_note: l.status_note, extra_ref: l.extra_ref, missing: !!l.missing,
  };
}
const fingerprint = (rows: Row[], removed: string[]) => JSON.stringify([rows, removed]);
const newRow = (patch: Partial<Row>): Row => ({
  key: `n-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, id: null, product_name: "", variant_title: "", variant_id: null, product_code: "", vendor: "", quantity: "1", unit_price: "", amount: "",
  status: "ordered", customer_order_date: new Date(Date.now() + 8 * 3600 * 1000).toISOString().slice(0, 10), completed_on: "", delivered_to_vendor_on: "", vendor_returned_on: "", cost: "", remarks: "",
  source: "manual", source_ref: null, to_sync: true, suggested: false, locked: false, sync_status: "none", sync_error: null, shopify_ref: null, invoice_url: null, status_note: null, extra_ref: null, missing: false, ...patch,
});

// 紀念品產品表格：同一單號可有多行；按「儲存」保存，按「同步 Shopify」把新增項目加入 Shopify
export function ProductLines({ invoice, lines, catalog, catalogError, showCost, cancelled }: { invoice: number; lines: ProductLine[]; catalog: DraftCatalogProduct[]; catalogError?: string; showCost: boolean; cancelled: boolean }) {
  const router = useRouter();
  const initial = useMemo(() => lines.map(toRow), [lines]);
  const [rows, setRows] = useState<Row[]>(initial);
  const [removed, setRemoved] = useState<string[]>([]);
  const [msg, setMsg] = useState<{ ok: boolean; text: string; ref?: string; url?: string } | null>(null);
  const [pending, start] = useTransition();
  const [open, setOpen] = useState(true);
  // 保存或同步後資料更新：表格跟隨最新內容
  const [synced, setSynced] = useState(initial);
  if (synced !== initial) { setSynced(initial); setRows(initial); setRemoved([]); }

  const dirty = fingerprint(rows, removed) !== fingerprint(initial, []);
  const suggestedOnly = rows.filter((r) => r.suggested).length;
  const toSync = rows.filter((r) => r.id && r.to_sync && !r.locked).length;
  const total = rows.reduce((n, r) => n + (Number(r.amount) || 0), 0);

  // 揀選 Shopify 產品
  const types = useMemo(() => [...new Set(catalog.map((p) => p.productType))].sort((a, b) => a.localeCompare(b, "zh-Hant")), [catalog]);
  const [type, setType] = useState("");
  const inType = catalog.filter((p) => p.productType === (type || types[0]));
  const [productId, setProductId] = useState("");
  const product = inType.find((p) => p.id === productId) || inType[0];
  const [variantId, setVariantId] = useState("");
  const variant = product?.variants.find((v) => v.id === variantId) || product?.variants[0];
  const [qty, setQty] = useState("1");
  const [price, setPrice] = useState("");
  const shownPrice = price !== "" ? price : str(variant?.price ?? "");

  const set = (key: string, patch: Partial<Row>) => setRows((list) => list.map((r) => {
    if (r.key !== key) return r;
    const next = { ...r, ...patch };
    // 數量或單價改變時自動計算金額
    if (("quantity" in patch || "unit_price" in patch) && Number.isFinite(Number(next.quantity)) && next.unit_price !== "" && Number.isFinite(Number(next.unit_price))) next.amount = String(Math.round(Number(next.quantity) * Number(next.unit_price) * 100) / 100);
    return next;
  }));
  function addPicked() {
    if (!product || !variant) return;
    const q = Math.max(1, Math.min(999, Math.floor(Number(qty) || 1)));
    const p = shownPrice === "" ? "" : String(Number(shownPrice) || 0);
    setRows((list) => [...list, newRow({
      product_name: product.title, variant_title: variant.title === "Default Title" ? "" : variant.title, variant_id: variant.id, product_code: str((variant as { sku?: string | null }).sku), quantity: String(q), unit_price: p, amount: p === "" ? "" : String(Math.round(q * Number(p) * 100) / 100),
    })]);
    setQty("1"); setPrice("");
  }
  function remove(r: Row) {
    const inShopify = r.locked || r.source === "company_order";
    if (r.id && !window.confirm(`確定刪除「${r.product_name || "此行"}」？${inShopify ? "按「儲存」時會同時在 Shopify 付款連結刪除此項目（已付款的單不能刪除）。" : "按「儲存」後生效。"}`)) return;
    if (r.id) setRemoved((x) => [...x, r.id as string]);
    setRows((list) => list.filter((x) => x.key !== r.key));
  }
  const payload = (): SaveLine[] => rows.map((r) => ({
    id: r.id, product_name: r.product_name, variant_title: r.variant_title, variant_id: r.variant_id, product_code: r.product_code, vendor: r.vendor, quantity: r.quantity, unit_price: r.unit_price, amount: r.amount, status: r.status,
    customer_order_date: r.customer_order_date, completed_on: r.completed_on, delivered_to_vendor_on: r.delivered_to_vendor_on, vendor_returned_on: r.vendor_returned_on, cost: r.cost, remarks: r.remarks, source: r.source, source_ref: r.source_ref, to_sync: r.to_sync && !r.locked && !r.suggested,
  }));
  function save() {
    setMsg(null);
    start(async () => {
      const res = await saveProductLines(invoice, payload(), removed, showCost);
      if (res.error) return setMsg({ ok: false, text: res.error });
      setMsg({ ok: true, text: res.done || "已保存。" });
      router.refresh();
    });
  }
  function sync() {
    setMsg(null);
    start(async () => {
      const res = await syncInvoiceProducts(invoice);
      setMsg(res.error ? { ok: false, text: res.error, ref: res.shopifyRef, url: res.invoiceUrl } : { ok: true, text: res.done || "已同步。", ref: res.shopifyRef, url: res.invoiceUrl });
      router.refresh();
    });
  }

  return (
    <section className="mb-6" id="products">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open} className="text-lg font-semibold">{open ? "▾" : "▸"} 紀念品及產品（{rows.length} 行）</button>
        <span className="text-sm text-[var(--soft)]">合計 {hk(total)}</span>
      </div>
      {open && (
        <div className="rounded-2xl border border-[var(--line)] bg-white p-3 sm:p-4">
          {cancelled && <p className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">此單已取消，不能再同步新產品到 Shopify。</p>}
          {!cancelled && catalog.length > 0 && (
            <div className="mb-3 rounded-xl bg-[var(--head)] p-3">
              <p className="mb-2 text-sm font-medium">加產品</p>
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-[1fr_1.4fr_1.2fr_5rem_6.5rem_auto]">
                <select value={type || types[0] || ""} onChange={(e) => { setType(e.target.value); setProductId(""); setVariantId(""); setPrice(""); }} className={cell} aria-label="產品類型">{types.map((x) => <option key={x}>{x}</option>)}</select>
                <select value={product?.id || ""} onChange={(e) => { setProductId(e.target.value); setVariantId(""); setPrice(""); }} className={cell} aria-label="產品">{inType.map((p) => <option key={p.id} value={p.id}>{p.title}</option>)}</select>
                <select value={variant?.id || ""} onChange={(e) => { setVariantId(e.target.value); setPrice(""); }} className={cell} aria-label="款式">{product?.variants.map((v) => <option key={v.id} value={v.id}>{v.title === "Default Title" ? "標準" : v.title}</option>)}</select>
                <input value={qty} onChange={(e) => setQty(e.target.value.replace(/\D/g, ""))} inputMode="numeric" className={cell} aria-label="數量" placeholder="數量" />
                <input value={shownPrice} onChange={(e) => setPrice(e.target.value.replace(/[^\d.]/g, ""))} inputMode="decimal" className={cell} aria-label="單價" placeholder="單價" />
                <button type="button" onClick={addPicked} disabled={!variant} className="rounded-lg border border-[var(--gold)] px-3 py-1.5 text-sm text-[var(--gold)] hover:bg-[var(--cream)] disabled:opacity-50">加入</button>
              </div>
            </div>
          )}
          {catalogError && <p className="mb-3 text-sm text-amber-700">未能讀取 Shopify 產品清單：{catalogError}。仍可按「＋ 加一行」輸入自訂項目。</p>}
          {suggestedOnly > 0 && <p className="mb-2 text-xs text-[var(--soft)]"><span className="mr-1 inline-block h-3 w-3 rounded border border-amber-300 bg-amber-50 align-middle" />淡黃色行按此單的 Shopify／開單項目自動列出（{suggestedOnly} 行），按「儲存」才寫入表格。</p>}
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1320px] text-sm">
              <thead>
                <tr className="text-left text-xs text-[var(--soft)]">
                  {["產品名稱", "款式", "產品代碼", "供應商", "數量", "單價", "金額", "狀態", "下單日期", "完成日期", ...(showCost ? ["成本"] : []), "備註", "Shopify", ""].map((h) => <th key={h} className="px-1 py-2 font-medium">{h}</th>)}
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.key} className={"border-t border-[var(--line)] align-top " + (r.suggested ? "bg-amber-50" : r.missing ? "bg-red-50" : "")}>
                    <td className="min-w-[180px] p-1"><input value={r.product_name} disabled={r.locked} onChange={(e) => set(r.key, { product_name: e.target.value })} maxLength={300} className={cell} aria-label="產品名稱" />{r.extra_ref && <span className="text-xs text-[var(--soft)]">附加單 {r.extra_ref}</span>}</td>
                    <td className="min-w-[110px] p-1"><input value={r.variant_title} disabled={r.locked} onChange={(e) => set(r.key, { variant_title: e.target.value })} maxLength={200} className={cell} aria-label="款式" /></td>
                    <td className="w-24 p-1"><input value={r.product_code} onChange={(e) => set(r.key, { product_code: e.target.value })} maxLength={120} className={cell} aria-label="產品代碼" /></td>
                    <td className="w-24 p-1"><input value={r.vendor} onChange={(e) => set(r.key, { vendor: e.target.value })} maxLength={120} className={cell} aria-label="供應商" /></td>
                    <td className="w-16 p-1"><input value={r.quantity} disabled={r.locked} onChange={(e) => set(r.key, { quantity: e.target.value.replace(/[^\d.]/g, "") })} inputMode="decimal" className={cell} aria-label="數量" /></td>
                    <td className="w-20 p-1"><input value={r.unit_price} disabled={r.locked} onChange={(e) => set(r.key, { unit_price: e.target.value.replace(/[^\d.]/g, "") })} inputMode="decimal" className={cell} aria-label="單價" /></td>
                    <td className="w-20 p-1"><input value={r.amount} disabled={r.locked} onChange={(e) => set(r.key, { amount: e.target.value.replace(/[^\d.]/g, "") })} inputMode="decimal" className={cell} aria-label="金額" /></td>
                    <td className="w-28 p-1">
                      <select value={r.status} onChange={(e) => set(r.key, { status: e.target.value })} className={cell} aria-label="狀態">
                        {!isMemorialStatus(r.status) && <option value={r.status}>{memorialLabel(r.status)}</option>}
                        {MEMORIAL_STATUSES.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
                      </select>
                      {r.status_note && <span className="mt-0.5 block max-w-[150px] truncate text-xs text-[var(--soft)]" title={r.status_note}>{r.status_note}</span>}
                    </td>
                    <td className="w-32 p-1"><input type="date" value={r.customer_order_date} onChange={(e) => set(r.key, { customer_order_date: e.target.value })} className={cell} aria-label="下單日期" /></td>
                    <td className="w-32 p-1"><input type="date" value={r.completed_on} onChange={(e) => set(r.key, { completed_on: e.target.value })} className={cell} aria-label="完成日期" /></td>
                    {showCost && <td className="w-20 p-1"><input value={r.cost} onChange={(e) => set(r.key, { cost: e.target.value.replace(/[^\d.]/g, "") })} inputMode="decimal" className={cell} aria-label="成本" /></td>}
                    <td className="min-w-[160px] p-1"><input value={r.remarks} onChange={(e) => set(r.key, { remarks: e.target.value })} maxLength={2000} className={cell} aria-label="備註" /></td>
                    <td className="w-36 p-1 text-xs">
                      {r.missing ? (
                        <span className="text-red-700">Shopify {r.shopify_ref || ""} 已沒有此項目，可按「移除」刪走此行</span>
                      ) : r.sync_status === "synced" ? (
                        <span className="text-green-800">已同步{r.shopify_ref ? ` ${r.shopify_ref}` : ""}{r.invoice_url && <> · <a href={r.invoice_url} target="_blank" rel="noopener noreferrer" className="text-[var(--gold)] hover:underline">付款頁 ↗</a></>}</span>
                      ) : r.sync_status === "syncing" ? (
                        <span className="text-[var(--soft)]">同步中…</span>
                      ) : r.suggested || (r.id && r.source !== "manual") ? (
                        <span className="text-[var(--soft)]">{r.source === "excel" ? "Excel 記錄" : "已在單據內"}</span>
                      ) : (
                        <>
                          <label className="flex items-center gap-1"><input type="checkbox" checked={r.to_sync} onChange={(e) => set(r.key, { to_sync: e.target.checked })} />{r.to_sync ? "待同步" : "不同步"}</label>
                          {r.sync_status === "failed" && <span className="mt-1 block text-red-700" title={r.sync_error || ""}>同步失敗：{r.sync_error || "請重試"}</span>}
                        </>
                      )}
                    </td>
                    <td className="w-10 p-1 text-right">{r.suggested ? <span className="px-1 text-xs text-[var(--soft)]" title="先按「儲存」，之後可移除（會同時刪除 Shopify 項目）">—</span> : r.sync_status !== "syncing" && <button type="button" onClick={() => remove(r)} className="px-1 py-1.5 text-xs text-red-700 hover:underline">移除</button>}</td>
                  </tr>
                ))}
                {rows.length === 0 && <tr><td colSpan={showCost ? 14 : 13} className="p-6 text-center text-[var(--soft)]">未有產品。可選擇 Shopify 產品或按「＋ 加一行」。</td></tr>}
              </tbody>
            </table>
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <button type="button" onClick={() => setRows((list) => [...list, newRow({})])} className="rounded-lg border border-[var(--line)] px-3 py-2 text-sm hover:bg-[var(--cream)]">＋ 加一行</button>
            <button type="button" onClick={save} disabled={pending || (!dirty && !suggestedOnly)} className="rounded-lg bg-[var(--gold)] px-4 py-2 text-sm text-white hover:opacity-90 disabled:opacity-50">{pending ? "處理中…" : "儲存"}</button>
            {!cancelled && <button type="button" onClick={sync} disabled={pending || dirty || !toSync} title={dirty ? "請先儲存" : ""} className="rounded-lg border border-[var(--gold)] px-4 py-2 text-sm text-[var(--gold)] hover:bg-[var(--cream)] disabled:opacity-50">{pending ? "處理中…" : `同步 Shopify（${toSync} 項）`}</button>}
            {dirty && <span className="text-sm text-amber-800">有未保存的修改，保存後才可同步。</span>}
          </div>
          {msg && (
            <p role="status" className={"mt-2 text-sm " + (msg.ok ? "text-green-800" : "text-red-700")}>
              {msg.text}{msg.ref ? `（Shopify ${msg.ref}）` : ""}{msg.url && <> <a href={msg.url} target="_blank" rel="noopener noreferrer" className="text-[var(--gold)] hover:underline">開啟付款頁 ↗</a></>}
            </p>
          )}
          <p className="mt-3 text-xs text-[var(--soft)]">同步規則：未付款的單，新項目加入現有 Shopify 付款連結。已付款的單不能直接加項目，系統會用同一單號另開一條付款連結，客人只付新增項目。已同步的項目如要改名稱、數量或價錢，請在 Shopify 修改；移除項目會同時在 Shopify 付款連結刪除（已付款的單不能刪除）。</p>
        </div>
      )}
    </section>
  );
}
