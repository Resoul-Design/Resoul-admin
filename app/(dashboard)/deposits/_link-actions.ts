"use server";

// 接送服務 ↔ 火化預約：快速更新狀態、一鍵建立火化預約（同一專案編號）
import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireModule } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { canonicalProjectNo, projectNoFromNotes } from "@/lib/order-label";

type Result = { error?: string };
const STATUSES = ["new", "contacted", "scheduled", "completed", "cancelled"];

function revalidate() {
  revalidatePath("/deposits");
  revalidatePath("/bookings");
  revalidatePath("/");
}

export async function setDepositStatus(id: string, status: string): Promise<Result> {
  await requireModule("deposits");
  if (!id || !STATUSES.includes(status)) return { error: "狀態無效。" };
  const { error } = await createAdminClient().from("deposit_bookings").update({ status }).eq("id", id);
  if (error) return { error: `更新失敗：${error.message}` };
  await logAudit("update_deposit", "deposit_bookings", id, `狀態=${status}`);
  revalidate();
  return {};
}

// 由接送服務建立火化預約：帶入主人、電話、毛孩、地址、日期及專案編號；方案及收費待與客人確認（不設金額，不會觸發付款提醒）
export async function createCremationFromDeposit(id: string): Promise<Result & { bookingId?: string }> {
  const staff = await requireModule("deposits");
  await requireModule("bookings");
  const admin = createAdminClient();
  const { data: d, error } = await admin
    .from("deposit_bookings")
    .select("id, project_no, owner_name, contact, pet_name, pet_type, service_date, service_time, pickup_address, notes, status, payment_status, payment_amount")
    .eq("id", id)
    .maybeSingle();
  if (error || !d) return { error: "找不到此接送服務。" };
  if (d.status === "cancelled") return { error: "已取消的接送服務不能建立火化預約。" };
  const projectNo = canonicalProjectNo(d.project_no, projectNoFromNotes(d.notes));
  if (!projectNo) return { error: "此接送服務未有專案編號，請先於「編輯資料」補上。" };

  // 已有同一專案的火化預約（獸醫評估除外）就不再建立
  const { data: existing } = await admin
    .from("cremation_bookings")
    .select("id, case_no, notes, source")
    .or(`case_no.eq.${projectNo},notes.ilike.*${projectNo}*`);
  if ((existing || []).some((b) => !String(b.source || "").includes("euthanasia"))) return { error: "此專案已有火化預約。" };

  const paidDeposit = d.payment_status === "paid" ? `已付接送訂金 HK$${Number(d.payment_amount || 1800).toLocaleString("en-US")}（可抵扣）` : "接送訂金未付款";
  const notes = [
    `專案編號：${projectNo}`,
    "方案及收費：待與客人確認",
    paidDeposit,
    d.service_time ? `希望時段: ${d.service_time}` : "",
    `由接送服務建立：${staff.name || staff.email}`,
  ].filter(Boolean).join(" | ");
  const row = {
    owner_name: d.owner_name, contact: d.contact, pet_name: d.pet_name, pet_type: d.pet_type,
    plan: null, service_date: d.service_date, service_time: null, pickup_address: d.pickup_address,
    notes, source: "admin:cremation", status: d.service_date ? "scheduled" : "new", payment_status: "pending", payment_currency: "HKD",
  };
  // 專案編號寫入 case_no；如已被同一專案的獸醫評估使用（唯一索引），只寫於備註
  let ins = await admin.from("cremation_bookings").insert({ ...row, case_no: projectNo }).select("id").single();
  if (ins.error && /duplicate|unique/i.test(ins.error.message)) ins = await admin.from("cremation_bookings").insert(row).select("id").single();
  if (ins.error || !ins.data) return { error: `未能建立火化預約：${ins.error?.message || "未知錯誤"}` };
  await logAudit("create_cremation_from_deposit", "cremation_bookings", ins.data.id, projectNo);
  revalidate();
  return { bookingId: ins.data.id };
}
