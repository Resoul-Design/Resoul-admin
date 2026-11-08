// 附加單（Excel「66B」等）：同一客人之後再加的骨灰盅存放、紀念品等單，附在原單號 logistics_orders.extra_orders。
// 每項 { ref: "66B", fields: { 欄位代號: 值 }, source_row? }，欄位代號與 lib/logistics-fields.ts 相同。
export type ExtraOrder = { ref: string; fields: Record<string, string | number | null>; source_row?: number };

export function extraOrders(row: { extra_orders?: unknown } | null | undefined): ExtraOrder[] {
  const v = row?.extra_orders;
  if (!Array.isArray(v)) return [];
  return v.filter((x): x is ExtraOrder => !!x && typeof x === "object" && typeof (x as ExtraOrder).ref === "string" && typeof (x as ExtraOrder).fields === "object");
}

// 「66B」「66b」→ { invoice: 66, ref: "66B" }；純數字回傳 null
export function parseExtraRef(s: string): { invoice: number; ref: string } | null {
  const m = String(s || "").trim().match(/^#?(\d+)\s*([A-Za-z])$/);
  return m ? { invoice: Number(m[1]), ref: m[1] + m[2].toUpperCase() } : null;
}
