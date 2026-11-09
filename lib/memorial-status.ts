// 紀念品產品狀態：所有頁面共用。舊資料（Shopify 出貨狀態、Excel 文字）按此對應，對應不到的照原文顯示。
export const MEMORIAL_STATUSES = [
  { key: "ordered", label: "已訂購", en: "Ordered" },
  { key: "pending_delivery", label: "待交付", en: "Pending delivery" },
  { key: "completed", label: "已完成", en: "Completed" },
] as const;
export type MemorialStatus = (typeof MEMORIAL_STATUSES)[number]["key"];

const LABEL: Record<string, string> = Object.fromEntries(MEMORIAL_STATUSES.map((s) => [s.key, s.label]));
const RANK: Record<string, number> = { ordered: 0, pending_delivery: 1, completed: 2 };

export const isMemorialStatus = (v: unknown): v is MemorialStatus => typeof v === "string" && v in LABEL;

// 舊狀態對應：Shopify 出貨狀態及常見文字
const LEGACY: Record<string, MemorialStatus> = {
  FULFILLED: "completed", COMPLETED: "completed", DELIVERED: "completed",
  PARTIALLY_FULFILLED: "pending_delivery", PENDING_DELIVERY: "pending_delivery", IN_PROGRESS: "pending_delivery",
  UNFULFILLED: "ordered", OPEN: "ordered", ON_HOLD: "ordered", SCHEDULED: "ordered", ORDERED: "ordered",
};
// 對應不到（例如 RESTOCKED）時回傳 null；空白視為已訂購
export function memorialFromLegacy(v: string | null | undefined): MemorialStatus | null {
  const key = String(v || "").trim().replace(/[\s-]+/g, "_").toUpperCase();
  if (!key) return "ordered";
  return LEGACY[key] || null;
}

// 訂單目前的產品狀態：人手設定優先，否則按 Shopify 出貨狀態
export function orderMemorialStatus(o: { memorial_status?: string | null; fulfillment_status?: string | null }): MemorialStatus | null {
  return isMemorialStatus(o.memorial_status) ? o.memorial_status : memorialFromLegacy(o.fulfillment_status);
}

const LEGACY_LABEL: Record<string, string> = { RESTOCKED: "已退貨入庫" };
export function memorialLabel(v: string | null | undefined): string {
  if (isMemorialStatus(v)) return LABEL[v];
  const mapped = memorialFromLegacy(v);
  return mapped ? LABEL[mapped] : LEGACY_LABEL[String(v || "").toUpperCase()] || String(v || "");
}
export function orderMemorialLabel(o: { memorial_status?: string | null; fulfillment_status?: string | null }): string {
  const s = orderMemorialStatus(o);
  return s ? LABEL[s] : memorialLabel(o.fulfillment_status);
}
export function memorialClass(label: string): string {
  if (label === "已完成") return "bg-green-100 text-green-800";
  if (label === "待交付") return "bg-blue-100 text-blue-800";
  if (label === "已訂購") return "bg-amber-100 text-amber-800";
  return "bg-gray-200 text-gray-700";
}
// 同一訂單多行時，訂單狀態取最落後的一行
export function slowestStatus(list: (string | null | undefined)[]): MemorialStatus | null {
  const known = list.filter(isMemorialStatus);
  return known.length ? known.reduce((a, b) => (RANK[b] < RANK[a] ? b : a)) : null;
}
