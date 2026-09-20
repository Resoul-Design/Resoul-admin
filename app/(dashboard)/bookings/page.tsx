import { createClient } from "@/lib/supabase/server";
import { shopDomain } from "@/lib/shopify";
import { type BookingData } from "./_edit";
import { BookingsTable, type BookingRow } from "./_table";

export const dynamic = "force-dynamic";

// 由 notes 抽出「希望時段」（前端落單時寫入的欄位）
function parseTimePref(notes?: string | null): string {
  if (!notes) return "";
  const m = notes.match(/希望時段[:：]\s*([^｜|]+)/);
  const v = m ? m[1].trim() : "";
  return v && v !== "—" && v !== "-" ? v : "";
}

// 產生「加入 Google Calendar」連結（預填日期、標題、客戶資料）
function gcalUrl(
  b: { service_date?: string | null; service_time?: string | null; pet_name?: string | null; owner_name?: string | null; contact?: string | null; plan?: string | null; pickup_address?: string | null; shopify_order_name?: string | null; source?: string | null },
  timePref: string,
  email: string
): string | null {
  if (!b.service_date) return null;
  const ymd = b.service_date.replace(/-/g, "");
  let dates: string;
  if (b.service_time) {
    const hm = b.service_time.slice(0, 5).replace(":", "");
    const startH = Number(hm.slice(0, 2));
    const endH = String(Math.min(startH + 2, 23)).padStart(2, "0");
    dates = `${ymd}T${hm}00/${ymd}T${endH}${hm.slice(2)}00`;
  } else {
    const nd = new Date(b.service_date + "T00:00:00");
    nd.setDate(nd.getDate() + 1);
    const end = `${nd.getFullYear()}${String(nd.getMonth() + 1).padStart(2, "0")}${String(nd.getDate()).padStart(2, "0")}`;
    dates = `${ymd}/${end}`;
  }
  const kind = (b.source || "").includes("euthanasia") ? "獸醫評估／安辭查詢" : "火化預約";
  const title = `Resoul ${kind} · ${b.pet_name || "毛孩"}`;
  const details = [
    `主人：${b.owner_name || "—"}`,
    `電話：${b.contact || "—"}`,
    email ? `電郵：${email}` : "",
    `方案：${b.plan || "—"}`,
    timePref ? `希望時段：${timePref}` : "",
    b.shopify_order_name ? `發票編號：${b.shopify_order_name}` : "",
  ].filter(Boolean).join("\n");
  const params = new URLSearchParams({ action: "TEMPLATE", text: title, dates, details });
  if (b.pickup_address) params.set("location", b.pickup_address);
  return "https://calendar.google.com/calendar/render?" + params.toString();
}

const STATUS_LABEL: Record<string, string> = {
  new: "新收到",
  scheduled: "已排期",
  pickup: "接送中",
  cremating: "火化中",
  completed: "已完成",
  cancelled: "已取消",
};

const PAYMENT_LABEL: Record<string, string> = {
  pending: "待付款",
  paid: "已付款",
  failed: "付款失敗",
  refunded: "已退款",
};

function badgeClass(status: string) {
  switch (status) {
    case "new":
      return "bg-amber-100 text-amber-800";
    case "scheduled":
      return "bg-blue-100 text-blue-800";
    case "pickup":
    case "cremating":
      return "bg-violet-100 text-violet-800";
    case "completed":
      return "bg-green-100 text-green-800";
    case "cancelled":
      return "bg-gray-200 text-gray-600";
    default:
      return "bg-gray-100 text-gray-700";
  }
}

function sourceLabel(source?: string | null) {
  switch (source) {
    case "web:cremation-order":
      return "付款問卷";
    case "web:cremation-order-en":
      return "付款問卷 EN";
    case "web:cremation":
      return "普通預約";
    case "web:euthanasia":
      return "安辭查詢";
    default:
      return source || "—";
  }
}

function paymentBadgeClass(status?: string | null) {
  switch (status) {
    case "paid":
      return "bg-green-100 text-green-800";
    case "failed":
      return "bg-red-100 text-red-700";
    case "refunded":
      return "bg-gray-200 text-gray-700";
    default:
      return "bg-amber-100 text-amber-800";
  }
}

const BASE_SELECT =
  "id, case_no, owner_name, contact, pet_name, pet_type, plan, service_date, service_time, pickup_address, status, source, notes, created_at";

const PAYMENT_SELECT =
  BASE_SELECT +
  ", payment_ref, payment_status, payment_amount, payment_currency, shopify_order_name, shopify_order_id, paid_at";

function isVet(source?: string | null) {
  return (source || "").indexOf("euthanasia") >= 0;
}

export default async function BookingsPage() {
  const supabase = await createClient();
  let paymentColumnsReady = true;
  const primary = await supabase
    .from("cremation_bookings")
    .select(PAYMENT_SELECT)
    .order("created_at", { ascending: false });
  let rows: unknown[] | null = primary.data as unknown[] | null;
  let error = primary.error;

  if (error && /payment_|shopify_order|paid_at/i.test(error.message)) {
    paymentColumnsReady = false;
    const fallback = await supabase
      .from("cremation_bookings")
      .select(BASE_SELECT)
      .order("created_at", { ascending: false });
    rows = fallback.data as unknown[] | null;
    error = fallback.error;
  }

  const bookings = (rows ?? []) as (BookingData & {
    created_at: string;
    notes?: string | null;
  })[];

  const tableRows: BookingRow[] = bookings.map((b) => {
    const invoiceNo = b.shopify_order_name || b.case_no || "";
    const timePref = parseTimePref(b.notes);
    const serviceLine = [
      b.service_date || "",
      b.service_time ? b.service_time.slice(0, 5) : "",
      timePref ? "· " + timePref : "",
    ].filter(Boolean).join(" ");
    const vet = isVet(b.source);
    return {
      id: b.id,
      created: b.created_at?.slice(0, 10) || "",
      invoiceNo,
      owner: b.owner_name || "",
      contact: b.contact || "",
      address: b.pickup_address || "",
      petName: b.pet_name || "",
      petType: b.pet_type || "",
      plan: b.plan || "",
      amountText: b.payment_amount != null ? (b.payment_currency || "HKD") + " " + Number(b.payment_amount).toLocaleString() : "—",
      sourceKey: vet ? "vet" : "cremation",
      sourceLabel: sourceLabel(b.source),
      statusKey: b.status,
      statusLabel: STATUS_LABEL[b.status] || b.status,
      statusClass: badgeClass(b.status),
      paymentLabel: PAYMENT_LABEL[b.payment_status || "pending"] || b.payment_status || "待付款",
      paymentClass: paymentBadgeClass(b.payment_status),
      serviceDate: b.service_date || "",
      serviceLine,
      calUrl: gcalUrl(b, timePref, ""),
      waText: `你好，我哋係 RESOUL 🐾。已收到${b.pet_name || "毛孩"}嘅${vet ? "查詢" : "火化預約"}${invoiceNo ? "（編號 " + invoiceNo + "）" : ""}。想同你確認接送時間同安排，請問方便嗎？`,
      search: [b.owner_name, b.contact, b.pet_name, invoiceNo, b.plan, b.pickup_address].filter(Boolean).join(" ").toLowerCase(),
      shopifyOrderUrl: b.shopify_order_id
        ? `https://${shopDomain()}/admin/orders/${String(b.shopify_order_id).split("/").pop()}`
        : null,
      booking: b,
    };
  });

  return (
    <div>
      <h1 className="text-2xl font-semibold mb-6">預約火化記錄</h1>

      <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
        ⚠️ 測試期間：「💬 WhatsApp 客人」只會開啟預填訊息草稿，<b>請勿按下傳送鍵，或向客人發送任何訊息</b>。正式啟用後，可於程式中移除此限制。
      </div>

      {error && (
        <div className="mb-4 text-sm text-red-600">
          讀取失敗：{error.message}
          <div className="text-[var(--soft)] mt-1">
            若提示欄位不存在，請先於 Supabase 執行 db/migration_booking_fields.sql 及 db/migration_payment_tracking.sql。
          </div>
        </div>
      )}

      {!paymentColumnsReady && (
        <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          付款追蹤欄位尚未建立。預約資料仍會顯示；請於 Supabase 執行
          <code className="mx-1">db/migration_payment_tracking.sql</code>
          後，付款狀態與訂單編號會在此顯示。
        </div>
      )}

      {bookings.length === 0 ? (
        <div className="rounded-2xl border border-[var(--line)] bg-[var(--card)] p-10 text-center text-[var(--soft)]">
          暫無預約記錄。
        </div>
      ) : (
        <BookingsTable rows={tableRows} paymentReady={paymentColumnsReady} />
      )}
    </div>
  );
}
