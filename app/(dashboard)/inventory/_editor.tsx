"use client";

import { useState, useTransition } from "react";
import { updateVariantPrice, updateVariantInventory } from "./actions";

export type EVariant = {
  id: string;
  inventoryItemId: string | null;
  title: string;
  sku: string | null;
  price: string | null;
  qty: number | null;
};
export type EProduct = {
  id: string;
  title: string;
  status: string;
  productType: string;
  image: string | null;
  variants: EVariant[];
};
export type EGroup = { type: string; products: EProduct[] };

const STATUS: Record<string, string> = {
  ACTIVE: "上架中",
  DRAFT: "草稿",
  ARCHIVED: "已封存",
};

function VariantRow({ productId, v }: { productId: string; v: EVariant }) {
  const [price, setPrice] = useState(v.price ?? "");
  const [qty, setQty] = useState(v.qty == null ? "" : String(v.qty));
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const dirty = price !== (v.price ?? "") || qty !== (v.qty == null ? "" : String(v.qty));

  function save() {
    setMsg(null);
    start(async () => {
      let err = "";
      if (price !== (v.price ?? "")) {
        const r = await updateVariantPrice(productId, v.id, price);
        if (!r.ok) err = r.error || "售價更新失敗";
      }
      if (!err && qty !== (v.qty == null ? "" : String(v.qty))) {
        if (!v.inventoryItemId) err = "此款式未追蹤庫存";
        else {
          const r = await updateVariantInventory(v.inventoryItemId, Number(qty));
          if (!r.ok) err = r.error || "庫存更新失敗";
        }
      }
      setMsg(err ? { ok: false, text: err } : { ok: true, text: "已儲存" });
    });
  }

  const low = (v.qty ?? 0) <= 3;

  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 py-2.5 border-t border-[var(--line)]/60 first:border-t-0">
      <div className="min-w-[120px] flex-1">
        <div className="text-sm">{v.title === "Default Title" ? "預設款式" : v.title}</div>
        <div className="text-xs text-[var(--soft)]">SKU：{v.sku || "—"}</div>
      </div>
      <label className="text-xs text-[var(--soft)]">
        售價
        <div className="mt-0.5 flex items-center">
          <span className="text-[var(--soft)] mr-1">$</span>
          <input
            value={price}
            onChange={(e) => setPrice(e.target.value)}
            inputMode="decimal"
            className="w-24 px-2 py-1.5 rounded-lg border border-[var(--line)] bg-white text-sm text-[var(--ink)] outline-none focus:border-[var(--gold)]"
          />
        </div>
      </label>
      <label className="text-xs text-[var(--soft)]">
        庫存
        <div className="mt-0.5">
          <input
            value={qty}
            onChange={(e) => setQty(e.target.value)}
            inputMode="numeric"
            placeholder={v.inventoryItemId ? "" : "未追蹤"}
            disabled={!v.inventoryItemId}
            className={
              "w-20 px-2 py-1.5 rounded-lg border bg-white text-sm outline-none focus:border-[var(--gold)] " +
              (low ? "border-red-300 text-red-600" : "border-[var(--line)] text-[var(--ink)]")
            }
          />
        </div>
      </label>
      <div className="flex items-center gap-2">
        <button
          onClick={save}
          disabled={!dirty || pending}
          className="px-3 py-1.5 rounded-lg text-sm bg-[var(--gold)] text-white hover:opacity-90 disabled:opacity-40"
        >
          {pending ? "儲存中…" : "儲存"}
        </button>
        {msg && (
          <span className={"text-xs " + (msg.ok ? "text-green-600" : "text-red-600")}>
            {msg.ok ? "✓ " : ""}
            {msg.text}
          </span>
        )}
      </div>
    </div>
  );
}

export function InventoryEditor({ groups }: { groups: EGroup[] }) {
  return (
    <div className="space-y-8">
      {groups.map((g) => (
        <section key={g.type}>
          <h2 className="text-base font-semibold mb-3 flex items-center gap-2">
            <span className="text-[var(--gold)]">▣</span>
            {g.type}
            <span className="text-xs font-normal text-[var(--soft)]">
              （{g.products.length} 項產品）
            </span>
          </h2>
          <div className="space-y-3">
            {g.products.map((p) => (
              <div
                key={p.id}
                className="rounded-2xl border border-[var(--line)] bg-[var(--card)] p-4"
              >
                <div className="flex items-start gap-3">
                  {p.image ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={p.image}
                      alt={p.title}
                      className="h-16 w-16 rounded-lg object-cover border border-[var(--line)] shrink-0"
                    />
                  ) : (
                    <div className="h-16 w-16 rounded-lg bg-[var(--cream)] shrink-0" />
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium">{p.title}</span>
                      <span className="text-[11px] px-1.5 py-0.5 rounded-full bg-[var(--cream)] text-[var(--soft)]">
                        {STATUS[p.status] || p.status}
                      </span>
                    </div>
                    <div className="mt-2">
                      {p.variants.map((v) => (
                        <VariantRow key={v.id} productId={p.id} v={v} />
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
