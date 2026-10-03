"use client";

import { WHATSAPP_CONFIRM } from "./_testing-notice";
import { isBackdropPress } from "./_modal";
import { useActionState, useEffect, useMemo, useState } from "react";
import type { DraftCatalogProduct } from "@/lib/catalog";
import { TIME_SLOTS, whatsappLink } from "@/lib/deposit-followup";
import {
  createBookingOrder,
  sendBookingInvoice,
  type BookingInvoiceState,
  type BookingOrderMode,
  type BookingOrderState,
} from "./_booking-order-actions";

const input = "mt-1 w-full rounded-lg border border-[var(--line)] bg-white px-3 py-1.5 text-sm outline-none focus:border-[var(--gold)]";
const label = "block text-xs text-[var(--soft)]";
const btn = "rounded-lg border border-[var(--line)] px-3 py-2 text-sm hover:bg-[var(--cream)] disabled:opacity-50";

const variantName = (title: string) => (title === "Default Title" ? "標準款" : title);
const hkd = (value: string | number) => `HK$${Number(value || 0).toLocaleString("en-HK")}`;

// 「＋ 新增訂單」（火化預約／接送服務）：建立預約記錄＋Shopify 付款連結
export function NewBookingOrder({
  mode,
  products,
  catalogError,
  staffName,
}: {
  mode: BookingOrderMode;
  products: DraftCatalogProduct[];
  catalogError: string;
  staffName: string;
}) {
  const [open, setOpen] = useState(false);
  const [formKey, setFormKey] = useState(0);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <div className="shrink-0">
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-lg bg-[var(--gold)] px-4 py-2 text-sm font-medium text-white hover:opacity-90"
      >
        ＋ 新增訂單
      </button>
      {open && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-black/45 p-3 sm:p-6" onMouseDown={(e) => isBackdropPress(e) && setOpen(false)}>
          <div className="flex min-h-full items-start justify-center sm:items-center">
            <div role="dialog" aria-modal="true" aria-label="新增訂單" className="w-full max-w-4xl rounded-xl border border-[var(--line)] bg-[var(--card)] p-4 shadow-xl sm:p-5">
              <div className="mb-3 flex items-center justify-between gap-3">
                <h2 className="text-lg font-semibold">{mode === "deposit" ? "新增接送訂金訂單" : "新增火化預約訂單"}</h2>
                <button type="button" onClick={() => setOpen(false)} aria-label="關閉" className="text-xl leading-none text-[var(--soft)] hover:text-[var(--ink)]">✕</button>
              </div>
              <BookingOrderForm
                key={formKey}
                mode={mode}
                products={products}
                catalogError={catalogError}
                staffName={staffName}
                onCreateAnother={() => setFormKey((v) => v + 1)}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function BookingOrderForm({
  mode,
  products,
  catalogError,
  staffName,
  onCreateAnother,
}: {
  mode: BookingOrderMode;
  products: DraftCatalogProduct[];
  catalogError: string;
  staffName: string;
  onCreateAnother: () => void;
}) {
  const [productId, setProductId] = useState(products[0]?.id || "");
  const product = products.find((p) => p.id === productId) || products[0];
  const [variantId, setVariantId] = useState(products[0]?.variants[0]?.id || "");
  const variant = useMemo(() => product?.variants.find((v) => v.id === variantId) || product?.variants[0], [product, variantId]);
  const [state, createAction, creating] = useActionState(createBookingOrder, {} as BookingOrderState);
  const [invoiceState, invoiceAction, sending] = useActionState(sendBookingInvoice, {} as BookingInvoiceState);
  const [copied, setCopied] = useState(false);

  function chooseProduct(id: string) {
    setProductId(id);
    setVariantId(products.find((p) => p.id === id)?.variants[0]?.id || "");
  }

  const created = state.created;
  if (created) {
    const who = /^[A-Za-z]/.test(staffName) ? ` ${staffName}` : staffName;
    const waText = `${created.ownerName}你好，我係 Resoul 嘅${who}。多謝你預約${created.productLabel}，專案編號係 ${created.projectNo}。請用以下連結完成付款（${hkd(created.amount)}）：\n${created.invoiceUrl}\n如有任何疑問，隨時搵我就得。`;
    const wa = whatsappLink(created.contact, waText);
    return (
      <section aria-live="polite" className="text-sm">
        <div className="rounded-xl bg-[var(--head)] px-4 py-3">
          <div className="font-medium">已建立 · {created.draftName}</div>
          <div className="mt-1 text-[var(--soft)]">{created.ownerName} · {created.productLabel} · {hkd(created.amount)}</div>
          <div className="mt-1 text-xs text-[var(--soft)]">專案編號 {created.projectNo} · 付款參考 {created.paymentRef}</div>
          <div className="mt-2 text-xs text-[var(--soft)]">預約已加入列表（待付款）；客人付款後會自動標記為已付款。</div>
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          {wa && <a href={wa} target="_blank" rel="noopener noreferrer" onClick={(e) => { if (WHATSAPP_CONFIRM && !window.confirm(WHATSAPP_CONFIRM)) e.preventDefault(); }} className={btn + " text-green-700"}>💬 WhatsApp 傳付款連結</a>}
          <button
            type="button"
            className={btn}
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(created.invoiceUrl);
                setCopied(true);
              } catch {
                window.prompt("複製付款連結：", created.invoiceUrl);
              }
            }}
          >
            {copied ? "已複製付款連結" : "複製付款連結"}
          </button>
          <a href={created.invoiceUrl} target="_blank" rel="noopener noreferrer" className={btn}>開啟付款頁 ↗</a>
          {created.email && (
            <form
              action={invoiceAction}
              onSubmit={(e) => {
                if (!window.confirm(`確認由 Shopify 把付款連結寄到 ${created.email}？`)) e.preventDefault();
              }}
            >
              <input type="hidden" name="mode" value={mode} />
              <input type="hidden" name="draftId" value={created.draftId} />
              <button type="submit" disabled={sending || invoiceState.sent} className={btn}>
                {invoiceState.sent ? "已寄付款電郵" : sending ? "寄送中…" : "寄付款連結電郵"}
              </button>
            </form>
          )}
          <a href={created.adminUrl} target="_blank" rel="noopener noreferrer" className={btn}>Shopify 草稿 ↗</a>
          <button type="button" onClick={onCreateAnother} className={btn}>新增另一張</button>
        </div>
        {invoiceState.error && <p className="mt-3 text-red-700" role="alert">{invoiceState.error}</p>}
        <p className="mt-3 text-xs text-[var(--soft)]">「WhatsApp 傳付款連結」只會開啟預填訊息草稿，須由同事檢查後自行按傳送。</p>
      </section>
    );
  }

  return (
    <form action={createAction} className="space-y-3 text-sm">
      <input type="hidden" name="mode" value={mode} />
      {catalogError && <p className="text-red-700" role="alert">{catalogError}</p>}
      {state.error && <p className="text-red-700" role="alert">{state.error}</p>}

      <div className="grid gap-x-3 gap-y-2.5 sm:grid-cols-2 lg:grid-cols-3">
        <label className={label}>產品
          <select value={product?.id || ""} onChange={(e) => chooseProduct(e.target.value)} disabled={!products.length} className={input}>
            {products.map((p) => <option key={p.id} value={p.id}>{p.title}</option>)}
          </select>
        </label>
        <label className={label}>{mode === "cremation" ? "體重／款式" : "款式"}
          <select name="variantId" value={variant?.id || ""} onChange={(e) => setVariantId(e.target.value)} disabled={!product} className={input}>
            {(product?.variants || []).map((v) => (
              <option key={v.id} value={v.id}>{variantName(v.title)}{v.price ? ` · ${hkd(v.price)}` : ""}</option>
            ))}
          </select>
        </label>
        <div className={label}>收費（以 Shopify 付款頁為準）
          <div className="mt-1 rounded-lg bg-[var(--head)] px-3 py-1.5 text-sm font-semibold text-[var(--ink)]">{variant?.price ? hkd(variant.price) : "—"}</div>
        </div>

        <label className={label}>主人稱呼 *<input required name="ownerName" maxLength={100} placeholder="例如：陳小姐" className={input} /></label>
        <label className={label}>電話 / WhatsApp *<input required name="contact" maxLength={40} placeholder="8 位香港電話" className={input} /></label>
        <label className={label}>電郵（選填）<input type="email" name="email" maxLength={254} placeholder="可由 Shopify 寄付款連結" className={input} /></label>

        <label className={label}>毛孩名字<input name="petName" maxLength={100} className={input} /></label>
        <label className={label}>種類<input name="petType" maxLength={80} placeholder="例如：貓、狗" className={input} /></label>
        <label className={label}>專案編號（回訪客人）<input name="projectNo" maxLength={40} placeholder="新客人留空自動產生" className={input} /></label>

        <label className={label}>希望日期<input type="date" name="serviceDate" className={input} /></label>
        <label className={label}>希望時段
          <select name="serviceTime" defaultValue="" className={input}>
            <option value="">待確認</option>
            {TIME_SLOTS.map((s) => <option key={s.zh} value={s.zh}>{s.label}</option>)}
          </select>
        </label>
        <label className={label}>接送地址<input name="address" maxLength={300} className={input} /></label>

        <label className={label + " sm:col-span-2 lg:col-span-3"}>內部備註（選填）<textarea name="note" maxLength={1000} rows={2} className={input} /></label>
      </div>

      <div className="flex justify-end">
        <button type="submit" disabled={creating || !variant} className="rounded-lg bg-[var(--gold)] px-4 py-2 font-medium text-white hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50">
          {creating ? "建立中…" : "建立訂單及付款連結"}
        </button>
      </div>
    </form>
  );
}
