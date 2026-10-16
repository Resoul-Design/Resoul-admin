"use server";

// 人手確認收款：現金／FPS／PayMe 等非網上付款，或 webhook 因金額不符未有標記已付款時使用
import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireModule } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { appendNote } from "@/lib/payment-check";

const TABLE = { deposit: "deposit_bookings", cremation: "cremation_bookings" } as const;
const METHODS = ["現金", "FPS 轉數快", "PayMe", "信用卡", "銀行轉帳", "Shopify（折扣／其他）", "其他"];

export async function markPaidManually(entity: "deposit" | "cremation", id: string, amountText: string, method: string): Promise<{ error?: string }> {
  const staff = await requireModule(entity === "deposit" ? "deposits" : "bookings");
  if (!TABLE[entity] || !id) return { error: "記錄無效。" };
  const amount = Number(String(amountText || "").replace(/[,\s]/g, ""));
  if (!Number.isFinite(amount) || amount <= 0 || amount > 1_000_000) return { error: "請輸入正確的收款金額。" };
  if (!METHODS.includes(method)) return { error: "請選擇收款方式。" };
  const admin = createAdminClient();
  const { data: row, error } = await admin.from(TABLE[entity]).select("id, payment_status, status, notes, source").eq("id", id).maybeSingle();
  if (error || !row) return { error: "找不到此記錄。" };
  if (String(row.source || "").includes("euthanasia")) return { error: "獸醫評估不適用。" };
  if (row.payment_status === "paid") return { error: "此記錄已經是已付款。" };
  if (row.status === "cancelled") return { error: "已取消的記錄不能確認收款。" };
  const who = staff.name || staff.email;
  const today = new Date(Date.now() + 8 * 3600 * 1000).toISOString().slice(0, 10);
  const { error: upErr } = await admin.from(TABLE[entity]).update({
    payment_status: "paid",
    payment_amount: amount,
    payment_currency: "HKD",
    paid_at: new Date().toISOString(),
    notes: appendNote(row.notes, `人手確認收款：${method} HK$${amount.toLocaleString("en-US")}（${who}，${today}）`),
  }).eq("id", id);
  if (upErr) return { error: `更新失敗：${upErr.message}` };
  await logAudit("mark_paid_manually", TABLE[entity], id, `${method} HK$${amount}`);
  revalidatePath(entity === "deposit" ? "/deposits" : "/bookings");
  revalidatePath("/");
  return {};
}
