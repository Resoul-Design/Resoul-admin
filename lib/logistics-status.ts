// 客戶資料列表狀態：用回 logistics Excel 常用的行狀態，每張單一個。
//   Appointment Made 已預約／Processing 處理中／To collect Urn 待取骨灰／Rental storage Owner 寄存中／
//   To Delivery Memorial Products 待交付紀念品／Completed 已完成；全部記錄已取消時為「已取消」
export const LOGISTICS_STATUSES = [
  { key: "Appointment Made", label: "已預約", className: "bg-amber-100 text-amber-800" },
  { key: "Processing", label: "處理中", className: "bg-blue-100 text-blue-800" },
  { key: "To collect Urn", label: "待取骨灰", className: "bg-blue-100 text-blue-800" },
  { key: "To Deliver Urn", label: "待送骨灰", className: "bg-blue-100 text-blue-800" },
  { key: "Rental storage Owner", label: "寄存中", className: "bg-purple-100 text-purple-800" },
  { key: "To Delivery Memorial Products", label: "待交付紀念品", className: "bg-blue-100 text-blue-800" },
  { key: "Completed", label: "已完成", className: "bg-green-100 text-green-800" },
  { key: "Cancelled", label: "已取消", className: "bg-red-100 text-red-700" },
] as const;
export type LogisticsStatus = { key: string; label: string; className: string };

const BY_KEY = new Map<string, LogisticsStatus>(LOGISTICS_STATUSES.map((s) => [s.key.toLowerCase(), s]));
const CREMATION: Record<string, string> = {
  new: "Appointment Made", contacted: "Appointment Made", scheduled: "Appointment Made",
  pickup: "Processing", picked_up: "Processing", cremating: "Processing",
  ready: "To collect Urn", returned: "Completed", completed: "Completed",
};

// Excel 文字（或已知的 key）→ 狀態；未能對應的照原文顯示
export function logisticsStatus(raw: string | null | undefined): LogisticsStatus | null {
  const s = String(raw || "").trim();
  if (!s) return null;
  return BY_KEY.get(s.toLowerCase()) || { key: s, label: s, className: "bg-gray-200 text-gray-700" };
}

type Rec = { status?: unknown; cancelled_at?: unknown; source?: unknown; is_test?: unknown };
// 一張單的狀態：有火化預約時按火化進度；沒有時用 Excel 已存的行狀態；只有接送／獸醫時為已預約；只有紀念品時按紀念品進度
export function invoiceLogisticsStatus(p: { rowStatus?: string | null; deposits: Rec[]; cremations: Rec[]; company: Rec[]; products: Rec[]; memorialStatuses: string[] }): LogisticsStatus | null {
  const live = (r: Rec) => String(r.status || "") !== "cancelled" && !r.cancelled_at;
  const all = [...p.deposits, ...p.cremations, ...p.company, ...p.products].filter((r) => !r.is_test);
  if (all.length && !all.some(live)) return BY_KEY.get("cancelled")!;
  const crem = p.cremations.filter((r) => !r.is_test && live(r) && !String(r.source || "").includes("euthanasia"));
  const memorialPending = p.memorialStatuses.some((s) => s !== "completed");
  if (crem.length) {
    const key = CREMATION[String(crem[0].status || "")] || "Appointment Made";
    if (key === "Completed" && memorialPending) return BY_KEY.get("to delivery memorial products")!;
    return BY_KEY.get(key.toLowerCase())!;
  }
  const saved = logisticsStatus(p.rowStatus);
  if (saved) return saved;
  if ([...p.deposits, ...p.cremations].some((r) => !r.is_test && live(r))) return BY_KEY.get("appointment made")!;
  if (p.memorialStatuses.length || p.products.length || p.company.length) return BY_KEY.get(memorialPending || !p.memorialStatuses.length ? "to delivery memorial products" : "completed")!;
  return null;
}
