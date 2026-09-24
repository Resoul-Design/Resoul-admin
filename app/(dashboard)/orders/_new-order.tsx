"use client";

import { useActionState, useEffect, useMemo, useState } from "react";
import {
  createSouvenirDraftOrder,
  sendSouvenirDraftInvoice,
  type DraftInvoiceState,
  type SouvenirDraftState,
} from "./actions";

export type DraftCatalogProduct = {
  id: string;
  title: string;
  variants: { id: string; title: string; sku: string | null; price: string | null }[];
};

type SelectedLine = { variantId: string; quantity: number };

const EMPTY_DRAFT: SouvenirDraftState = {};
const EMPTY_INVOICE: DraftInvoiceState = {};

const money = (value: number, currency: string) =>
  `${currency} ${value.toLocaleString("en-HK", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export function NewSouvenirOrder({
  products,
  catalogError,
}: {
  products: DraftCatalogProduct[];
  catalogError: string;
}) {
  const [open, setOpen] = useState(false);
  const [formKey, setFormKey] = useState(0);

  useEffect(() => {
    if (!open) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [open]);

  return (
    <div className="shrink-0">
      <button
        type="button"
        onClick={() => setOpen(true)}
        disabled={!products.length && !catalogError}
        className="rounded-lg bg-[var(--gold)] px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
      >
        ＋ 新增訂單
      </button>
      {open && (
        <div
          className="fixed inset-0 z-50 overflow-y-auto bg-black/45 p-3 sm:p-6"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setOpen(false);
          }}
        >
          <div className="flex min-h-full items-start justify-center sm:items-center">
            <div role="dialog" aria-modal="true" aria-label="新增 Shopify 草稿訂單" className="my-3 w-full max-w-5xl rounded-xl border border-[var(--line)] bg-[var(--card)] p-4 shadow-xl sm:my-6 sm:p-6">
              <div className="mb-3 flex justify-end">
                <button type="button" onClick={() => setOpen(false)} aria-label="關閉新增訂單" className="rounded-lg border border-[var(--line)] px-3 py-1.5 text-sm hover:bg-[var(--cream)]">關閉</button>
              </div>
              <DraftOrderForm
                key={formKey}
                products={products}
                catalogError={catalogError}
                onCreateAnother={() => setFormKey((value) => value + 1)}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function DraftOrderForm({
  products,
  catalogError,
  onCreateAnother,
}: {
  products: DraftCatalogProduct[];
  catalogError: string;
  onCreateAnother: () => void;
}) {
  const [selectedVariantId, setSelectedVariantId] = useState(products[0]?.variants[0]?.id || "");
  const [quantity, setQuantity] = useState(1);
  const [lines, setLines] = useState<SelectedLine[]>([]);
  const [copyDone, setCopyDone] = useState(false);
  const [draftState, createAction, creating] = useActionState(createSouvenirDraftOrder, EMPTY_DRAFT);
  const [invoiceState, invoiceAction, sending] = useActionState(sendSouvenirDraftInvoice, EMPTY_INVOICE);

  const variants = useMemo(
    () => products.flatMap((product) => product.variants.map((variant) => ({ ...variant, productTitle: product.title }))),
    [products]
  );
  const variantById = useMemo(() => new Map(variants.map((variant) => [variant.id, variant])), [variants]);
  const subtotal = lines.reduce((sum, line) => {
    const price = Number(variantById.get(line.variantId)?.price || 0);
    return sum + price * line.quantity;
  }, 0);
  const currency = "HKD";

  function addLine() {
    if (!selectedVariantId || !Number.isInteger(quantity) || quantity < 1 || quantity > 99) return;
    setLines((current) => {
      const existing = current.find((line) => line.variantId === selectedVariantId);
      if (existing) {
        return current.map((line) => line.variantId === selectedVariantId
          ? { ...line, quantity: Math.min(99, line.quantity + quantity) }
          : line);
      }
      if (current.length >= 20) return current;
      return [...current, { variantId: selectedVariantId, quantity }];
    });
  }

  const draft = draftState.draft;
  if (draft) {
    return (
      <section className="mt-5 border-y border-[var(--line)] py-5" aria-live="polite">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold">草稿訂單已建立 · {draft.name}</h2>
            <p className="mt-1 text-sm text-[var(--soft)]">
              {draft.customerName} · {draft.email} · {money(Number(draft.amount), draft.currency)}
            </p>
            <p className="mt-1 text-sm text-[var(--soft)]">客人付款前不會列入正式訂單；付款後可在此同步查看。</p>
          </div>
          <a href={draft.adminUrl} target="_blank" rel="noopener noreferrer" className="rounded-lg border border-[var(--line)] px-3 py-2 text-sm hover:bg-[var(--cream)]">
            查看 Shopify 草稿 ↗
          </a>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-2">
          {draft.invoiceUrl && (
            <>
              <a href={draft.invoiceUrl} target="_blank" rel="noopener noreferrer" className="rounded-lg border border-[var(--line)] px-3 py-2 text-sm hover:bg-[var(--cream)]">
                開啟付款頁 ↗
              </a>
              <button
                type="button"
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(draft.invoiceUrl!);
                    setCopyDone(true);
                  } catch {
                    setCopyDone(false);
                  }
                }}
                className="rounded-lg border border-[var(--line)] px-3 py-2 text-sm hover:bg-[var(--cream)]"
              >
                {copyDone ? "已複製付款連結" : "複製付款連結"}
              </button>
            </>
          )}
          <form action={invoiceAction} onSubmit={(event) => {
            if (!window.confirm(`確認把 Shopify 付款連結寄到 ${draft.email}？`)) event.preventDefault();
          }}>
            <input type="hidden" name="draftId" value={draft.id} />
            <button type="submit" disabled={sending || invoiceState.sent} className="rounded-lg bg-[var(--gold)] px-3 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50">
              {invoiceState.sent ? "已寄付款連結" : sending ? "寄送中…" : "寄付款連結電郵"}
            </button>
          </form>
          <button type="button" onClick={onCreateAnother} className="rounded-lg border border-[var(--line)] px-3 py-2 text-sm hover:bg-[var(--cream)]">
            新增另一張
          </button>
        </div>
        {invoiceState.error && <p className="mt-3 text-sm text-red-700" role="alert">{invoiceState.error}</p>}
        {invoiceState.sent && <p className="mt-3 text-sm text-green-700" role="status">付款連結已由 Shopify 寄至 {draft.email}。</p>}
        {!draft.invoiceUrl && <p className="mt-3 text-sm text-amber-800">Shopify 未回傳付款頁連結，請開啟草稿確認客人資料。</p>}
      </section>
    );
  }

  return (
    <section className="mt-5 border-y border-[var(--line)] py-5" aria-labelledby="new-souvenir-order-title">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <h2 id="new-souvenir-order-title" className="text-lg font-semibold">新增 Shopify 草稿訂單</h2>
          <p className="mt-1 text-sm text-[var(--soft)]">草稿建立後不會自動寄信；你可以檢查付款頁，再選擇寄給客人。</p>
        </div>
      </div>

      {catalogError && <p className="mb-4 text-sm text-red-700" role="alert">{catalogError}</p>}
      {draftState.error && <p className="mb-4 text-sm text-red-700" role="alert">{draftState.error}</p>}

      <form action={createAction} className="space-y-5">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <label className="block text-sm">主人名稱
            <input required name="customerName" maxLength={120} className="mt-1 w-full rounded-lg border border-[var(--line)] bg-white px-3 py-2 outline-none focus:border-[var(--gold)]" />
          </label>
          <label className="block text-sm">客人電郵（付款通知）
            <input required type="email" name="email" maxLength={254} autoComplete="email" className="mt-1 w-full rounded-lg border border-[var(--line)] bg-white px-3 py-2 outline-none focus:border-[var(--gold)]" />
          </label>
          <label className="block text-sm">電話
            <input name="phone" maxLength={40} autoComplete="tel" className="mt-1 w-full rounded-lg border border-[var(--line)] bg-white px-3 py-2 outline-none focus:border-[var(--gold)]" />
          </label>
          <label className="block text-sm">專案編號（選填）
            <input name="projectNo" placeholder="RSL-260924-ABC123" className="mt-1 w-full rounded-lg border border-[var(--line)] bg-white px-3 py-2 outline-none focus:border-[var(--gold)]" />
          </label>
          <label className="block text-sm sm:col-span-2 lg:col-span-4">寵物名稱（選填）
            <input name="petName" maxLength={120} className="mt-1 w-full rounded-lg border border-[var(--line)] bg-white px-3 py-2 outline-none focus:border-[var(--gold)]" />
          </label>
        </div>

        <div>
          <h3 className="text-sm font-medium">商品</h3>
          <div className="mt-2 flex flex-wrap items-end gap-2">
            <label className="min-w-[240px] flex-1 text-sm">產品款式
              <select value={selectedVariantId} onChange={(event) => setSelectedVariantId(event.target.value)} disabled={!variants.length} className="mt-1 w-full rounded-lg border border-[var(--line)] bg-white px-3 py-2 outline-none focus:border-[var(--gold)]">
                {products.map((product) => (
                  <optgroup key={product.id} label={product.title}>
                    {product.variants.map((variant) => (
                      <option key={variant.id} value={variant.id}>
                        {variant.title === "Default Title" ? product.title : variant.title}
                        {variant.sku ? ` · ${variant.sku}` : ""}
                        {variant.price ? ` · HK$${Number(variant.price).toLocaleString("en-HK", { minimumFractionDigits: 2 })}` : ""}
                      </option>
                    ))}
                  </optgroup>
                ))}
              </select>
            </label>
            <label className="w-24 text-sm">數量
              <input type="number" min={1} max={99} value={quantity} onChange={(event) => setQuantity(Number(event.target.value))} className="mt-1 w-full rounded-lg border border-[var(--line)] bg-white px-3 py-2 outline-none focus:border-[var(--gold)]" />
            </label>
            <button type="button" onClick={addLine} disabled={!selectedVariantId || lines.length >= 20} className="rounded-lg border border-[var(--line)] px-3 py-2 text-sm hover:bg-[var(--cream)] disabled:opacity-50">加入商品</button>
          </div>

          {lines.length > 0 && (
            <div className="mt-3 divide-y divide-[var(--line)] border-y border-[var(--line)]">
              {lines.map((line) => {
                const variant = variantById.get(line.variantId);
                const unitPrice = Number(variant?.price || 0);
                return (
                  <div key={line.variantId} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2 text-sm">
                    {/* 產品名獨佔一行，避免擠喺窄欄逐字斷行 */}
                    <span className="basis-full min-w-0 break-words font-medium">
                      {variant?.productTitle}
                      {variant?.title && variant.title !== "Default Title" ? <span className="font-normal text-[var(--soft)]"> · {variant.title}</span> : null}
                    </span>
                    <span className="text-[var(--soft)]">{line.quantity} × {money(unitPrice, currency)}</span>
                    <span className="ml-auto text-right">{money(unitPrice * line.quantity, currency)}</span>
                    <button type="button" onClick={() => setLines((current) => current.filter((item) => item.variantId !== line.variantId))} aria-label={`移除${variant?.productTitle || "商品"}`} className="px-2 py-1 text-sm text-red-700 hover:bg-red-50">移除</button>
                  </div>
                );
              })}
              <div className="py-2 text-right text-sm font-medium">商品小計估算：{money(subtotal, currency)}</div>
            </div>
          )}
          <p className="mt-2 text-xs text-[var(--soft)]">實際價格、運費及稅項以 Shopify 付款頁為準。</p>
        </div>

        <label className="block text-sm">內部備註（選填）
          <textarea name="note" maxLength={1000} rows={2} className="mt-1 w-full rounded-lg border border-[var(--line)] bg-white px-3 py-2 outline-none focus:border-[var(--gold)]" />
        </label>
        <input type="hidden" name="lineItems" value={JSON.stringify(lines)} />
        <button type="submit" disabled={creating || !lines.length} className="rounded-lg bg-[var(--gold)] px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50">
          {creating ? "建立中…" : "建立草稿訂單"}
        </button>
      </form>
    </section>
  );
}
