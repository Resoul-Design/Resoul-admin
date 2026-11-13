"use client";

import { URN_BASIC_OPTIONS, URN_PICKUP_PENDING } from "@/lib/order-types";

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

// 骨灰龕：先選大類別（不需要／待定，或 Shopify 骨灰龕款式），再選尺寸／升級
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
        {URN_BASIC_OPTIONS.filter((o) => !o.legacy || o.value === value).map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
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

// 骨灰龕取回日期：日期或「待定」；舊資料的其他文字保留為文字欄
export function DateOrPending({ value, onChange, className }: { value: string; onChange: (v: string) => void; className: string }) {
  const pending = value === URN_PICKUP_PENDING;
  const legacy = !!value && !pending && !/^\d{4}-\d{2}-\d{2}$/.test(value);
  return (
    <div className="flex items-center gap-3">
      {legacy
        ? <input value={value} onChange={(e) => onChange(e.target.value)} className={className} />
        : <input type="date" value={pending ? "" : value} disabled={pending} onChange={(e) => onChange(e.target.value)} className={className + (pending ? " opacity-50" : "")} />}
      <label className="flex shrink-0 items-center gap-1.5 text-sm"><input type="checkbox" checked={pending} onChange={(e) => onChange(e.target.checked ? URN_PICKUP_PENDING : "")} />待定</label>
    </div>
  );
}

// 套餐（Excel 用英文簡稱：Breeze、Cloud、Star…）
export type PackageProduct = { title: string; variants: { title: string; sku: string | null; price: string | null }[] };
const PACKAGES: [string, string][] = [["Breeze", "風之旅"], ["Cloud", "雲之旅"], ["Star", "星之旅"], ["Charity", "慈善套餐"], ["Back to Nature", "回歸自然"], ["Product only", "只有紀念品"]];
const packageOf = (text: string) => PACKAGES.find(([en, zh]) => text.toLowerCase().includes(en.toLowerCase()) || text.includes(zh))?.[0] || "";

export function PackagePicker({ name, code, products, onChange, className }: { name: string; code: string; products: PackageProduct[]; onChange: (v: { name: string; code: string; price: string | null }) => void; className: string }) {
  const byCode = code ? products.find((p) => p.variants.some((v) => (v.sku || "").toUpperCase() === code.toUpperCase())) : undefined;
  const current = byCode ? packageOf(byCode.title) : packageOf(name) || name;
  const product = products.find((p) => packageOf(p.title) === current);
  const known = PACKAGES.some(([en]) => en === current);
  const label = (v: PackageProduct["variants"][number]) => `${v.title === "Default Title" ? "標準" : v.title}${v.sku ? `（${v.sku}）` : ""}`;
  return (
    <div className="grid gap-2 sm:grid-cols-2">
      <select
        value={current}
        onChange={(e) => {
          const next = e.target.value;
          const p = products.find((x) => packageOf(x.title) === next);
          const only = p && p.variants.length === 1 ? p.variants[0] : null;
          onChange({ name: next, code: only?.sku || "", price: only?.price ?? null });
        }}
        className={className}
        aria-label="套餐"
      >
        <option value="">請選擇</option>
        {PACKAGES.map(([en, zh]) => <option key={en} value={en}>{zh} {en}</option>)}
        {current && !known && <option value={current}>{current}</option>}
      </select>
      {product && product.variants.length > 1 ? (
        <select
          value={code}
          onChange={(e) => { const v = product.variants.find((x) => x.sku === e.target.value); onChange({ name: current, code: e.target.value, price: v?.price ?? null }); }}
          className={className}
          aria-label="套餐代碼"
        >
          <option value="">選擇體重（套餐代碼）</option>
          {product.variants.map((v) => <option key={v.sku || v.title} value={v.sku || ""}>{label(v)}</option>)}
          {code && !byCode && <option value={code}>{code}</option>}
        </select>
      ) : (
        <div className={className + " flex items-center text-[var(--soft)]"}>{code || "—"}</div>
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
