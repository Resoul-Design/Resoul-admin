"use client";

import { useState } from "react";

type Variant = { title: string; sku: string | null; price: string | null; qty: number | null };
type Product = { id: string; title: string; status: string; image: string | null; variants: Variant[] };
export type Group = { type: string; products: Product[] };

const STATUS: Record<string, string> = {
  ACTIVE: "上架中",
  DRAFT: "草稿",
  ARCHIVED: "已封存",
};

export function InventoryList({ groups }: { groups: Group[] }) {
  const [type, setType] = useState<string>("all");
  const shown = type === "all" ? groups : groups.filter((g) => g.type === type);

  return (
    <div>
      {/* 篩選：揀產品類型 */}
      <div className="mb-5 flex flex-wrap items-center gap-2">
        <label className="text-sm text-[var(--soft)]">產品類型：</label>
        <select
          value={type}
          onChange={(e) => setType(e.target.value)}
          className="px-3 py-2 rounded-lg border border-[var(--line)] bg-white text-sm outline-none focus:border-[var(--gold)]"
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
                      <div className="mt-2 divide-y divide-[var(--line)]/60">
                        {p.variants.map((v, i) => {
                          const low = (v.qty ?? 0) <= 3;
                          return (
                            <div key={i} className="flex flex-wrap items-center gap-x-4 gap-y-1 py-2 text-sm">
                              <div className="min-w-[120px] flex-1">
                                <span>{v.title === "Default Title" ? "預設款式" : v.title}</span>
                                <span className="text-xs text-[var(--soft)] ml-2">SKU：{v.sku || "—"}</span>
                              </div>
                              <div className="text-[var(--soft)]">
                                售價：
                                <span className="text-[var(--ink)]">
                                  {v.price ? "$" + Number(v.price).toLocaleString() : "—"}
                                </span>
                              </div>
                              <div className={low ? "text-red-600 font-medium" : "text-[var(--soft)]"}>
                                庫存：<span className="tabular-nums">{v.qty ?? "—"}</span>
                                {low && v.qty != null && " ⚠"}
                              </div>
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
    </div>
  );
}
