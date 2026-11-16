"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { saveInventory, type InventoryChange } from "./actions";

type Variant = { id: string; title: string; sku: string | null; price: string | null; qty: number | null; itemId: string | null; locationId: string | null; tracked: boolean };
type Product = { id: string; title: string; status: string; image: string | null; variants: Variant[] };
export type Group = { type: string; products: Product[] };

const STATUS: Record<string, string> = {
  ACTIVE: "上架中",
  DRAFT: "草稿",
  ARCHIVED: "已封存",
};

const field = "w-24 rounded-lg border border-[var(--line)] bg-white px-2 py-1 text-sm tabular-nums outline-none focus:border-[var(--gold)]";
const money = (v: string | null) => (v == null || v === "" ? "" : String(Number(v)));

export function InventoryList({ groups }: { groups: Group[] }) {
  const router = useRouter();
  const [type, setType] = useState<string>("all");
  const [edits, setEdits] = useState<Record<string, { price?: string; qty?: string }>>({});
  const [msg, setMsg] = useState<{ ok: boolean; text: string; failed?: string[] } | null>(null);
  const [pending, start] = useTransition();
  const shown = type === "all" ? groups : groups.filter((g) => g.type === type);

  const all = groups.flatMap((g) => g.products.flatMap((p) => p.variants.map((v) => ({ p, v }))));
  const changes: InventoryChange[] = all.flatMap(({ p, v }) => {
    const e = edits[v.id];
    if (!e) return [];
    const label = `${p.title}${v.title === "Default Title" ? "" : `（${v.title}）`}`;
    const priceChanged = e.price !== undefined && e.price.trim() !== "" && Number(e.price) !== Number(v.price);
    const qtyChanged = e.qty !== undefined && e.qty.trim() !== "" && Number(e.qty) !== (v.qty ?? NaN);
    if (!priceChanged && !qtyChanged) return [];
    return [{
      productId: p.id, variantId: v.id, label,
      ...(priceChanged ? { price: e.price } : {}),
      ...(qtyChanged ? { qty: Number(e.qty), fromQty: v.qty, inventoryItemId: v.itemId, locationId: v.locationId } : {}),
    }];
  });

  const set = (id: string, patch: { price?: string; qty?: string }) => setEdits((m) => ({ ...m, [id]: { ...m[id], ...patch } }));
  function save() {
    if (!changes.length) return;
    if (!window.confirm(`確定同步 ${changes.length} 個款式的售價／庫存到 Shopify？`)) return;
    setMsg(null);
    start(async () => {
      const r = await saveInventory(changes);
      if (r.error) return setMsg({ ok: false, text: r.error });
      setMsg({ ok: !r.failed?.length, text: r.done || "", failed: r.failed });
      if (!r.failed?.length) setEdits({});
      router.refresh();
    });
  }

  return (
    <div>
      <div className="mb-5 flex flex-wrap items-center gap-2">
        <label className="text-sm text-[var(--soft)]">產品類型：</label>
        <select
          value={type}
          onChange={(e) => setType(e.target.value)}
          // 類型名稱可以好長，原生 select 會按最長選項撐闊；限制闊度避免手機出現橫向卷軸
          className="w-full min-w-0 max-w-full truncate px-3 py-2 rounded-lg border border-[var(--line)] bg-white text-sm outline-none focus:border-[var(--gold)] sm:w-auto sm:max-w-md"
        >
          <option value="all">全部（{groups.reduce((n, g) => n + g.products.length, 0)}）</option>
          {groups.map((g) => (
            <option key={g.type} value={g.type}>
              {g.type}（{g.products.length}）
            </option>
          ))}
        </select>
      </div>

      <div className="space-y-8">
        {shown.map((g) => (
          <section key={g.type}>
            <h2 className="text-base font-semibold mb-3 flex items-center gap-2">
              <span className="text-[var(--gold)]">▣</span>
              {g.type}
              <span className="text-xs font-normal text-[var(--soft)]">（{g.products.length} 項產品）</span>
            </h2>
            <div className="space-y-3">
              {g.products.map((p) => (
                <div key={p.id} className="rounded-2xl border border-[var(--line)] bg-[var(--card)] p-4">
                  <div className="flex items-start gap-3">
                    {p.image ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={p.image} alt={p.title} className="h-16 w-16 rounded-lg object-cover border border-[var(--line)] shrink-0" />
                    ) : (
                      <div className="h-16 w-16 rounded-lg bg-[var(--cream)] shrink-0" />
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium">{p.title}</span>
                        <span className="text-[11px] px-1.5 py-0.5 rounded-full bg-[var(--cream)] text-[var(--soft)]">{STATUS[p.status] || p.status}</span>
                      </div>
                      <div className="mt-2 divide-y divide-[var(--line)]/60">
                        {p.variants.map((v) => {
                          const e = edits[v.id] || {};
                          const price = e.price ?? money(v.price);
                          const qty = e.qty ?? (v.qty == null ? "" : String(v.qty));
                          const priceChanged = price.trim() !== "" && Number(price) !== Number(v.price);
                          const qtyChanged = qty.trim() !== "" && Number(qty) !== (v.qty ?? NaN);
                          const low = (v.qty ?? 0) <= 3;
                          return (
                            <div key={v.id} className={"flex flex-wrap items-center gap-x-4 gap-y-1 py-2 text-sm" + (priceChanged || qtyChanged ? " bg-amber-50" : "")}>
                              <div className="min-w-[120px] flex-1">
                                <span>{v.title === "Default Title" ? "預設款式" : v.title}</span>
                                <span className="text-xs text-[var(--soft)] ml-2">SKU：{v.sku || "—"}</span>
                              </div>
                              <label className="flex items-center gap-1 text-[var(--soft)]">
                                售價 $
                                <input value={price} onChange={(ev) => set(v.id, { price: ev.target.value.replace(/[^\d.]/g, "") })} inputMode="decimal" className={field + (priceChanged ? " !border-amber-400" : "")} aria-label="售價" />
                              </label>
                              <label className={"flex items-center gap-1 " + (low && !qtyChanged ? "text-red-600" : "text-[var(--soft)]")}>
                                庫存
                                {v.tracked && v.itemId && v.locationId ? (
                                  <input value={qty} onChange={(ev) => set(v.id, { qty: ev.target.value.replace(/\D/g, "") })} inputMode="numeric" className={field + (qtyChanged ? " !border-amber-400" : "")} aria-label="庫存" />
                                ) : (
                                  <span className="tabular-nums text-[var(--ink)]">{v.qty ?? "—"}（不追蹤）</span>
                                )}
                                {low && !qtyChanged && v.qty != null && " ⚠"}
                              </label>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </section>
        ))}
      </div>

      {(changes.length > 0 || msg) && (
        <div className="sticky bottom-0 mt-4 flex flex-wrap items-center gap-3 rounded-2xl border border-[var(--line)] bg-[var(--head)] px-4 py-3">
          {changes.length > 0 && <button type="button" onClick={save} disabled={pending} className="rounded-lg bg-[var(--gold)] px-4 py-2 text-sm text-white hover:opacity-90 disabled:opacity-50">{pending ? "同步中…" : `儲存並同步 Shopify（${changes.length} 項）`}</button>}
          {changes.length > 0 && !pending && <button type="button" onClick={() => setEdits({})} className="text-sm text-[var(--soft)] hover:underline">取消修改</button>}
          {msg && (
            <div role="status" className={"text-sm " + (msg.ok ? "text-green-700" : "text-red-700")}>
              {msg.text}
              {msg.failed?.length ? <ul className="mt-1 list-disc pl-5">{msg.failed.map((f, i) => <li key={i}>{f}</li>)}</ul> : null}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
