// 各服務單狀態（客戶資料列表、服務工作台共用）：不同資料表的狀態統一對應為中文及顏色
import { memorialClass, orderMemorialLabel } from "@/lib/memorial-status";

export type StatusChip = { label: string; className: string };
const RED = "bg-red-100 text-red-700", GREEN = "bg-green-100 text-green-800", AMBER = "bg-amber-100 text-amber-800", GRAY = "bg-gray-200 text-gray-700", BLUE = "bg-blue-100 text-blue-800";

export const SERVICE_PROGRESS: Record<string, string> = { new: "新收到", contacted: "已聯絡", scheduled: "已排期", pickup: "已接送", picked_up: "已接送", cremating: "火化中", ready: "可取回", returned: "已交還", completed: "已完成" };

// 接送訂金／火化／獸醫：取消優先，其次付款；已付款再顯示服務進度
export function bookingChip(r: { status?: string | null; payment_status?: string | null }): StatusChip {
  if (r.status === "cancelled") return { label: r.payment_status === "refunded" ? "已取消（已退款）" : "已取消", className: RED };
  if (r.payment_status === "refunded") return { label: "已退款", className: GRAY };
  if (r.payment_status === "failed") return { label: "付款失敗", className: RED };
  const progress = SERVICE_PROGRESS[String(r.status || "")] || "";
  if (r.payment_status === "paid") return { label: progress && r.status !== "new" ? `已付款・${progress}` : "已付款", className: r.status === "completed" ? GREEN : BLUE };
  return { label: progress && !["new", "contacted"].includes(String(r.status)) ? `待付款・${progress}` : "待付款", className: AMBER };
}

// 紀念品訂單：取消／退款優先；已付款顯示產品狀態
export function productChip(o: { cancelled_at?: string | null; financial_status?: string | null; memorial_status?: string | null; fulfillment_status?: string | null }): StatusChip {
  if (o.cancelled_at) return { label: o.financial_status === "REFUNDED" ? "已取消（已退款）" : "已取消", className: RED };
  if (o.financial_status === "REFUNDED") return { label: "已退款", className: GRAY };
  if (o.financial_status === "PARTIALLY_REFUNDED") return { label: "部分退款", className: GRAY };
  if (o.financial_status !== "PAID") return { label: "待付款", className: AMBER };
  const label = orderMemorialLabel(o);
  return { label, className: memorialClass(label) };
}

// 開新單（未連結服務記錄）
export function companyChip(o: { status?: string | null }): StatusChip {
  if (o.status === "cancelled") return { label: "已取消", className: RED };
  if (o.status === "paid") return { label: "已付款", className: GREEN };
  if (o.status === "draft") return { label: "未同步 Shopify", className: AMBER };
  return { label: "待付款", className: AMBER };
}
