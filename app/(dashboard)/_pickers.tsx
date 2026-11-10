"use client";

import { URN_BASIC_OPTIONS } from "@/lib/order-types";

export type UrnProduct = { id: string; title: string; variants: { id: string; title: string; sku: string | null }[] };

const urnValue = (p: UrnProduct, v: UrnProduct["variants"][number]) => v.sku || `${p.title}（${v.title}）`;
const variantName = (p: UrnProduct, v: UrnProduct["variants"][number]) => (v.title === "Default Title" ? p.title : v.title);

// 骨灰龕名稱（按產品代碼找回 Shopify 產品及款式）
export function urnServiceName(value: string, products: UrnProduct[]): string {
  const basic = URN_BASIC_OPTIONS.find((o) => o.value === value);
  if (basic) return basic.label;
  for (const p of products) for (const v of p.variants) if (urnValue(p, v) === value) return `${p.title}｜${variantName(p, v)}`;
  return "";
}

// 骨灰龕：先選大類別（套餐包括／不需要／待定，或 Shopify 骨灰龕款式），再選尺寸／升級
export function UrnPicker({ value, onChange, products, className }: { value: string; onChange: (v: string) => void; products: UrnProduct[]; className: string }) {
  const product = products.find((p) => p.variants.some((v) => urnValue(p, v) === value));
  const basic = URN_BASIC_OPTIONS.some((o) => o.value === value);
  const category = basic ? value : product ? product.id : value ? "__other" : "";
  return (
    <div className="grid gap-2 sm:grid-cols-2">
      <select
        value={category}
        onChange={(e) => {
          const c = e.target.value;
          if (!c || URN_BASIC_OPTIONS.some((o) => o.value === c)) return onChange(c);
          const p = products.find((x) => x.id === c);
          if (p) onChange(urnValue(p, p.variants[0]));
        }}
        className={className}
        aria-label="骨灰龕類別"
      >
        <option value="">請選擇</option>
        {URN_BASIC_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        {products.map((p) => <option key={p.id} value={p.id}>{p.title}</option>)}
        {category === "__other" && <option value="__other">{value}</option>}
      </select>
      {product && (
        <select value={value} onChange={(e) => onChange(e.target.value)} className={className} aria-label="骨灰龕尺寸／升級">
          {product.variants.map((v) => <option key={v.id} value={urnValue(product, v)}>{variantName(product, v)}{v.sku ? `（${v.sku}）` : ""}</option>)}
        </select>
      )}
    </div>
  );
}

const HOURS = Array.from({ length: 24 }, (_, i) => String(i).padStart(2, "0"));
const MINUTES = Array.from({ length: 12 }, (_, i) => String(i * 5).padStart(2, "0"));

// 時間：分開選擇時及分（HH:MM）；舊資料不是 HH:MM 時保留原文
export function TimePicker({ value, onChange, className }: { value: string; onChange: (v: string) => void; className: string }) {
  const m = String(value || "").match(/^(\d{1,2}):(\d{2})/);
  const hh = m ? m[1].padStart(2, "0") : "";
  const mm = m ? m[2] : "";
  const set = (h: string, mi: string) => onChange(h ? `${h}:${mi || "00"}` : "");
  return (
    <div className="grid grid-cols-2 gap-2">
      <select value={hh} onChange={(e) => set(e.target.value, mm)} className={className} aria-label="時">
        <option value="">{value && !m ? value : "時"}</option>
        {HOURS.map((h) => <option key={h} value={h}>{h} 時</option>)}
      </select>
      <select value={mm} onChange={(e) => set(hh || "00", e.target.value)} disabled={!hh} className={className} aria-label="分">
        <option value="">分</option>
        {[...new Set([...MINUTES, ...(mm && !MINUTES.includes(mm) ? [mm] : [])])].sort().map((x) => <option key={x} value={x}>{x} 分</option>)}
      </select>
    </div>
  );
}
