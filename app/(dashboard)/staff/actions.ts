"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getStaff } from "@/lib/auth";
import { MODULES } from "@/lib/modules";

async function requireAdmin() {
  const s = await getStaff();
  if (!s || s.role !== "admin") throw new Error("僅限管理員");
  return s;
}

export async function updateStaffPermissions(formData: FormData) {
  await requireAdmin();
  const id = String(formData.get("id") || "");
  if (!id) return;
  const perms = MODULES.map((m) => m.key).filter(
    (k) => formData.get("perm_" + k) === "on"
  );
  const supabase = await createClient();
  await supabase.from("staff").update({ permissions: perms }).eq("id", id);
  revalidatePath("/staff");
}

// ---- 員工管理 ----
export async function createStaff(formData: FormData) {
  await requireAdmin();
  const email = String(formData.get("email") || "").trim();
  const name = String(formData.get("name") || "").trim();
  const password = String(formData.get("password") || "");
  const role = String(formData.get("role") || "staff") === "admin" ? "admin" : "staff";
  if (!email || password.length < 6) return;
  // 未設定服務金鑰時優雅返回，避免整版崩潰（需於 Vercel 設 SUPABASE_SERVICE_ROLE_KEY）
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) return;

  const admin = createAdminClient();
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (error || !data.user) return;
  await admin.from("staff").insert({
    id: data.user.id,
    email,
    name: name || null,
    role,
    active: true,
  });
  revalidatePath("/staff");
}

export async function updateStaff(formData: FormData) {
  await requireAdmin();
  const id = String(formData.get("id") || "");
  if (!id) return;
  const role = String(formData.get("role") || "staff") === "admin" ? "admin" : "staff";
  const active = formData.get("active") === "on";
  const supabase = await createClient();
  await supabase.from("staff").update({ role, active }).eq("id", id);
  revalidatePath("/staff");
}

// ---- 排更 ----
export async function addShift(formData: FormData) {
  if (!(await getStaff())) return;
  const staff_id = String(formData.get("staff_id") || "");
  const shift_date = String(formData.get("shift_date") || "");
  if (!staff_id || !shift_date) return;
  const supabase = await createClient();
  await supabase.from("shifts").insert({
    staff_id,
    shift_date,
    start_time: String(formData.get("start_time") || "") || null,
    end_time: String(formData.get("end_time") || "") || null,
    role_note: String(formData.get("role_note") || "").trim() || null,
  });
  revalidatePath("/staff/roster");
}

export async function deleteShift(formData: FormData) {
  if (!(await getStaff())) return;
  const id = String(formData.get("id") || "");
  if (!id) return;
  const supabase = await createClient();
  await supabase.from("shifts").delete().eq("id", id);
  revalidatePath("/staff/roster");
}

// ---- 任務 ----
export async function createTask(formData: FormData) {
  const s = await getStaff();
  if (!s) return;
  const title = String(formData.get("title") || "").trim();
  if (!title) return;
  const supabase = await createClient();
  await supabase.from("tasks").insert({
    title,
    detail: String(formData.get("detail") || "").trim() || null,
    assignee: String(formData.get("assignee") || "") || null,
    booking_id: String(formData.get("booking_id") || "") || null,
    due_date: String(formData.get("due_date") || "") || null,
    status: "todo",
    created_by: s.id,
  });
  revalidatePath("/staff/tasks");
  revalidatePath("/");
}

export async function updateTaskStatus(formData: FormData) {
  const id = String(formData.get("id") || "");
  const status = String(formData.get("status") || "");
  if (!id || !["todo", "doing", "done"].includes(status)) return;
  const supabase = await createClient();
  await supabase.from("tasks").update({ status }).eq("id", id);
  revalidatePath("/staff/tasks");
  revalidatePath("/");
}

export async function deleteTask(formData: FormData) {
  const id = String(formData.get("id") || "");
  if (!id) return;
  const supabase = await createClient();
  await supabase.from("tasks").delete().eq("id", id);
  revalidatePath("/staff/tasks");
}
