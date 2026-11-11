"use client";

import { useState } from "react";
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

// 時間：新選擇是 HH:MM。舊時段（例如上午 08:00–12:00）整段保留，不會截成 08:00。
export function TimePicker({ value, onChange, className }: { value: string; onChange: (v: string) => void; className: string }) {
  const raw = String(value || "").trim();
  const m = raw.match(/^(\d{1,2}):(\d{2})$/);
  const hh = m ? m[1].padStart(2, "0") : "";
  const mm = m ? m[2] : "";
  const set = (h: string, mi: string) => onChange(h ? `${h}:${mi || "00"}` : raw && !m ? raw : "");
  return (
    <div className="grid gap-2">
      {raw && !m && <p className="text-xs text-[var(--soft)]">原紀錄：{raw}（未改成精確時間）</p>}
      <div className="grid grid-cols-2 gap-2">
        <select value={hh} onChange={(e) => set(e.target.value, mm)} className={className} aria-label="時">
          <option value="">{raw && !m ? "保留原時段" : "時"}</option>
          {HOURS.map((h) => <option key={h} value={h}>{h} 時</option>)}
        </select>
        <select value={mm} onChange={(e) => set(hh || "00", e.target.value)} disabled={!hh} className={className} aria-label="分">
          <option value="">分</option>
          {[...new Set([...MINUTES, ...(mm && !MINUTES.includes(mm) ? [mm] : [])])].sort().map((x) => <option key={x} value={x}>{x} 分</option>)}
        </select>
      </div>
    </div>
  );
}

// 司機：開接送單及客戶資料共用，可搜尋。名單以外的舊名稱仍可看見，不會在這裡改寫。
export function DriverPicker({ value, drivers, onChange, className }: { value: string; drivers: string[]; onChange: (v: string) => void; className: string }) {
  const [query, setQuery] = useState("");
  const q = query.trim().toLowerCase();
  const options = drivers.filter((name) => !q || name.toLowerCase().includes(q));
  return (
    <div className="grid gap-2">
      <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="搜尋司機" aria-label="搜尋司機" className={className} />
      <select value={value} onChange={(e) => onChange(e.target.value)} className={className} aria-label="司機">
        <option value="">（未選擇）</option>
        {options.map((name) => <option key={name} value={name}>{name}</option>)}
        {value && !options.includes(value) && <option value={value}>{value}{drivers.includes(value) ? "" : "（原紀錄）"}</option>}
      </select>
    </div>
  );
}
