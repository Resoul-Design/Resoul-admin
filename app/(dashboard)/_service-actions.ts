"use server";

// 一條進度線（接送服務及火化預約共用）：新收到 → 已聯絡 → 已排期 → 已接送 → 火化中 → 可取回 → 已交還
// 已接送之後的階段記錄於火化預約；接送服務按「已接送」時自動建立同一專案的火化預約。
import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireModule } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { advanceProgress, undoProgress } from "./bookings/_progress-actions";
import { createCremationFromDeposit } from "./deposits/_link-actions";

type Result = { error?: string };
type Entity = "deposit" | "cremation";

function revalidate() {
  revalidatePath("/deposits");
  revalidatePath("/bookings");
  revalidatePath("/");
}

async function setStatus(entity: Entity, id: string, status: string, from: string[]): Promise<Result> {
  const table = entity === "deposit" ? "deposit_bookings" : "cremation_bookings";
  const { data, error } = await createAdminClient().from(table).update({ status }).eq("id", id).in("status", from).select("id");
  if (error) return { error: `更新失敗：${error.message}` };
  if (!data?.length) return { error: "狀態已改變，請重新整理頁面後再試。" };
  await logAudit(entity === "deposit" ? "update_deposit" : "update_booking", table, id, `狀態=${status}`);
  revalidate();
  return {};
}

// 接送服務：已聯絡、已排期
export async function advanceDepositStep(id: string, step: "contacted" | "scheduled"): Promise<Result> {
  await requireModule("deposits");
  if (step === "contacted") return setStatus("deposit", id, "contacted", ["new"]);
  return setStatus("deposit", id, "scheduled", ["new", "contacted"]);
}

// 接送服務：已接送 → 建立（或沿用）火化預約並標記已接送；接送服務隨之變為已完成
export async function pickupFromDeposit(id: string, cremationId: string | null): Promise<Result> {
  await requireModule("deposits");
  await requireModule("bookings");
  let bookingId = cremationId;
  if (!bookingId) {
    const created = await createCremationFromDeposit(id);
    if (created.error || !created.bookingId) return { error: created.error || "未能建立火化預約。" };
    bookingId = created.bookingId;
  }
  return advanceProgress(bookingId, "picked_up");
}

// 接送服務：撤回（已排期 → 已聯絡 → 新收到）；已接送之後由火化預約撤回
export async function undoDepositStep(id: string, cremationId: string | null): Promise<Result> {
  await requireModule("deposits");
  if (cremationId) {
    const { data } = await createAdminClient().from("cremation_bookings").select("picked_up_at").eq("id", cremationId).maybeSingle();
    if (data?.picked_up_at) return undoProgress(cremationId);
  }
  const { data: d } = await createAdminClient().from("deposit_bookings").select("status").eq("id", id).maybeSingle();
  if (d?.status === "scheduled") return setStatus("deposit", id, "contacted", ["scheduled"]);
  if (d?.status === "contacted") return setStatus("deposit", id, "new", ["contacted"]);
  return { error: "未有可撤回的進度。" };
}

// 火化預約：已排期（新收到 → 已排期）及撤回
export async function scheduleCremation(id: string): Promise<Result> {
  await requireModule("bookings");
  return setStatus("cremation", id, "scheduled", ["new"]);
}
export async function unscheduleCremation(id: string): Promise<Result> {
  await requireModule("bookings");
  return setStatus("cremation", id, "new", ["scheduled"]);
}

// 取消及恢復（兩者共用）
export async function cancelService(entity: Entity, id: string): Promise<Result> {
  await requireModule(entity === "deposit" ? "deposits" : "bookings");
  return setStatus(entity, id, "cancelled", entity === "deposit" ? ["new", "contacted", "scheduled"] : ["new", "scheduled"]);
}
export async function restoreService(entity: Entity, id: string): Promise<Result> {
  await requireModule(entity === "deposit" ? "deposits" : "bookings");
  return setStatus(entity, id, "new", ["cancelled"]);
}
