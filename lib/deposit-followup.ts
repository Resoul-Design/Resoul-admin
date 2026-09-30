// 接送訂金跟進：分類規則及 WhatsApp 訊息範本（固定範本，不經 AI）。
// 頁面（伺服器）及跟進清單（瀏覽器）共用，故此檔不可引用伺服器專用模組。

export type FollowUpRow = {
  id: string;
  created_at: string;
  owner_name: string | null;
  contact: string | null;
  pet_name: string | null;
  service_date: string | null;
  service_time: string | null;
  status: string;
  payment_status: string | null;
  payment_amount: number | null;
  reminded_at?: string | null;
  reminder_count?: number | null;
  follow_up_closed_at?: string | null;
  payment_link?: string | null;
};

export type FollowUpKind = "paid_unscheduled" | "payment_failed" | "unpaid_next_day" | "reminded_unpaid";

// 次序即清單排列優先次序
export const FOLLOW_UP_ORDER: FollowUpKind[] = ["paid_unscheduled", "payment_failed", "unpaid_next_day", "reminded_unpaid"];

export const FOLLOW_UP_LABEL: Record<FollowUpKind, string> = {
  paid_unscheduled: "已付款、未排期",
  payment_failed: "付款失敗",
  unpaid_next_day: "隔日仍未付款",
  reminded_unpaid: "已提醒、仍未付款",
};

// 已提醒後等候多久才列入「已提醒、仍未付款」
export const REMIND_WAIT_MS = 2 * 24 * 60 * 60 * 1000;

const HK_OFFSET_MS = 8 * 60 * 60 * 1000;

// 今日香港時間 00:00 對應的 UTC 毫秒
function hkTodayStart(now: Date) {
  const hk = new Date(now.getTime() + HK_OFFSET_MS);
  hk.setUTCHours(0, 0, 0, 0);
  return hk.getTime() - HK_OFFSET_MS;
}

export function followUpKind(row: FollowUpRow, now = new Date()): FollowUpKind | null {
  if (row.follow_up_closed_at) return null;
  if (row.status === "cancelled" || row.status === "completed") return null;
  const payment = row.payment_status || "pending";
  if (payment === "refunded") return null;
  if (payment === "paid") return row.status === "new" ? "paid_unscheduled" : null;
  if (row.reminded_at) {
    return now.getTime() - new Date(row.reminded_at).getTime() >= REMIND_WAIT_MS ? "reminded_unpaid" : null;
  }
  if (payment === "failed") return "payment_failed";
  return new Date(row.created_at).getTime() < hkTodayStart(now) ? "unpaid_next_day" : null;
}

// 需要付款連結的類別
export function needsPaymentLink(kind: FollowUpKind) {
  return kind === "payment_failed" || kind === "unpaid_next_day";
}

export const LINK_PLACEHOLDER = "［付款連結］";

function whenText(row: FollowUpRow) {
  const m = (row.service_date || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
  const date = m ? `${Number(m[2])} 月 ${Number(m[3])} 日` : "";
  const time = (row.service_time || "").trim();
  return [date, time].filter(Boolean).join(" ");
}

function amountText(row: FollowUpRow) {
  const amount = row.payment_amount != null && Number(row.payment_amount) > 0 ? Number(row.payment_amount) : 1800;
  return "HK$" + amount.toLocaleString("en-US");
}

// 廣東話口語範本；「已提醒、仍未付款」不起草第二次提醒，回傳 null。
export function followUpMessage(kind: FollowUpKind, row: FollowUpRow, staffName: string, link?: string | null) {
  // 英文名前加空格（嘅 Amy），中文名不加（嘅陳姑娘）
  const who = /^[A-Za-z]/.test(staffName) ? ` ${staffName}` : staffName;
  const greeting = `${(row.owner_name || "").trim()}你好，我係 Resoul 嘅${who}。`;
  const pet = (row.pet_name || "").trim() || "毛孩";
  const when = whenText(row);
  const amount = amountText(row);
  const url = link || LINK_PLACEHOLDER;
  switch (kind) {
    case "paid_unscheduled":
      return `${greeting}多謝你幫${pet}預約接送，${amount} 訂金已經收到。想同你確認返接送嘅日期、時間同地址${when ? `（你揀咗 ${when}）` : ""}，我哋再幫你安排好。有咩想預先話我哋知，都可以隨時講。`;
    case "payment_failed":
      return `${greeting}見到你幫${pet}預約接送嗰陣，${amount} 訂金好似未成功付款，唔緊要㗎。你可以用呢條連結再試一次：\n${url}\n如果遇到任何問題，或者想改時間，隨時搵我就得。`;
    case "unpaid_next_day":
      return `${greeting}多謝你幫${pet}預約${when ? ` ${when} ` : ""}嘅接送。我哋留意到 ${amount} 訂金仲未完成付款，唔知係咪遇到啲問題呢？你可以用呢條連結付款：\n${url}\n如果想改時間或者有咩疑問，隨時搵我就得。`;
    default:
      return null;
  }
}

// 香港 8 位電話自動加 852
export function whatsappLink(contact: string | null, text: string) {
  const digits = (contact || "").replace(/\D/g, "");
  if (!digits) return null;
  const number = digits.length === 8 ? `852${digits}` : digits;
  return `https://wa.me/${number}?text=${encodeURIComponent(text)}`;
}
