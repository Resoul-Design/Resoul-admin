"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireModule } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { PROGRESS_STAGES, type ProgressStage } from "@/lib/booking-progress";

type Result = { error?: string };

const COLUMNS = "id, status, source, service_date, picked_up_at, cremation_started_at, ready_at, returned_at";
const NOT_READY = "未啟用進度追蹤：請先於 Supabase（diyxcx）執行 db/migration_cremation_progress.sql。";

async function load(id: string) {
  const { data, error } = await createAdminClient().from("cremation_bookings").select(COLUMNS).eq("id", id).maybeSingle();
  if (error) return { error: /picked_up_at|cremation_started_at|ready_at|returned_at/.test(error.message) ? NOT_READY : `讀取失敗：${error.message}` };
  if (!data) return { error: "找不到此預約。" };
  if (String(data.source || "").includes("euthanasia")) return { error: "獸醫評估不適用火化進度。" };
  return { row: data as Record<string, string | null> };
}

// 已完成的階段數（由第一個階段起連續計算）
function doneCount(row: Record<string, string | null>) {
  let n = 0;
  for (const s of PROGRESS_STAGES) {
    if (!row[s.column]) break;
    n += 1;
  }
  return n;
}

function revalidate() {
  revalidatePath("/bookings");
  revalidatePath("/");
}

// 推進至下一階段：只可按次序逐步標記
export async function advanceProgress(id: string, stage: ProgressStage, returnedTo = ""): Promise<Result> {
  await requireModule("bookings");
  const loaded = await load(String(id || ""));
  if (loaded.error || !loaded.row) return { error: loaded.error };
  const row = loaded.row;
  if (row.status === "cancelled") return { error: "已取消的預約不能更新進度。" };

  const index = PROGRESS_STAGES.findIndex((s) => s.key === stage);
  if (index < 0) return { error: "進度階段無效。" };
  if (index !== doneCount(row)) return { error: "進度已更新，請重新整理頁面後再試。" };

  const target = PROGRESS_STAGES[index];
  const update: Record<string, string | null> = { [target.column]: new Date().toISOString(), status: target.status };
  if (target.key === "returned") {
    const who = returnedTo.trim().slice(0, 100);
    if (!who) return { error: "請填寫簽收人。" };
    update.returned_to = who;
  }
  const { error } = await createAdminClient().from("cremation_bookings").update(update).eq("id", id);
  if (error) return { error: `更新失敗：${error.message}` };
  await logAudit("update_progress", "cremation_bookings", id, target.label + (update.returned_to ? `｜簽收人：${update.returned_to}` : ""));
  revalidate();
  return {};
}

// 撤回最後一個已標記的階段（例如按錯）
export async function undoProgress(id: string): Promise<Result> {
  await requireModule("bookings");
  const loaded = await load(String(id || ""));
  if (loaded.error || !loaded.row) return { error: loaded.error };
  const row = loaded.row;
  const n = doneCount(row);
  if (n === 0) return { error: "未有可撤回的進度。" };

  const last = PROGRESS_STAGES[n - 1];
  const previousStatus = n >= 2 ? PROGRESS_STAGES[n - 2].status : row.service_date ? "scheduled" : "new";
  const update: Record<string, string | null> = { [last.column]: null, status: previousStatus };
  if (last.key === "returned") update.returned_to = null;
  const { error } = await createAdminClient().from("cremation_bookings").update(update).eq("id", id);
  if (error) return { error: `撤回失敗：${error.message}` };
  await logAudit("undo_progress", "cremation_bookings", id, last.label);
  revalidate();
  return {};
}
