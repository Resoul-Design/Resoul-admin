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
  notes?: string | null;
};

export type FollowUpLang = "zh" | "en";

// 客人在英文版網站落單時，備註會寫「Project no.」，預設用英文訊息
export function preferredLang(row: FollowUpRow): FollowUpLang {
  return /Project no\./i.test(row.notes || "") ? "en" : "zh";
}

export type FollowUpKind = "paid_unscheduled" | "payment_failed" | "unpaid_next_day" | "reminded_unpaid";

// 次序即清單排列優先次序
export const FOLLOW_UP_ORDER: FollowUpKind[] = ["paid_unscheduled", "payment_failed", "unpaid_next_day", "reminded_unpaid"];

export const FOLLOW_UP_LABEL: Record<FollowUpKind, string> = {
  paid_unscheduled: "已付款、未排期",
  payment_failed: "付款失敗",
  unpaid_next_day: "隔日仍未付款",
  reminded_unpaid: "已提醒、仍未付款",
};

// 「操作」掣上顯示的跟進動作（只寫要做的事）
export const FOLLOW_UP_ACTION: Record<FollowUpKind, string> = {
  paid_unscheduled: "安排排期",
  payment_failed: "重新付款",
  unpaid_next_day: "提醒付款",
  reminded_unpaid: "致電跟進",
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
export const LINK_PLACEHOLDER_EN = "[payment link]";

// 預約時段：網站中文版及英文版表格各自儲存本語言的值，後台合併為中英對照選項
export const TIME_SLOTS = [
  { zh: "上午（09:00–12:00）", en: "Morning (09:00-12:00)", label: "上午 Morning（09:00–12:00）" },
  { zh: "下午（12:00–17:00）", en: "Afternoon (12:00-17:00)", label: "下午 Afternoon（12:00–17:00）" },
  { zh: "傍晚至晚上（17:00–21:00）", en: "Evening (17:00-21:00)", label: "傍晚至晚上 Evening（17:00–21:00）" },
];

export function findTimeSlot(value: string | null | undefined) {
  const v = (value || "").trim();
  return v ? TIME_SLOTS.find((slot) => slot.zh === v || slot.en === v) : undefined;
}

const MONTHS_EN = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function whenText(row: FollowUpRow, lang: FollowUpLang = "zh") {
  const m = (row.service_date || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
  const date = !m ? "" : lang === "en" ? `${Number(m[3])} ${MONTHS_EN[Number(m[2]) - 1]}` : `${Number(m[2])} 月 ${Number(m[3])} 日`;
  const slot = findTimeSlot(row.service_time);
  const time = slot ? slot[lang] : (row.service_time || "").trim();
  return [date, time].filter(Boolean).join(" ");
}

function amountText(row: FollowUpRow) {
  const amount = row.payment_amount != null && Number(row.payment_amount) > 0 ? Number(row.payment_amount) : 1800;
  return "HK$" + amount.toLocaleString("en-US");
}

// 廣東話口語／英文範本；「已提醒、仍未付款」不起草第二次提醒，回傳 null。
export function followUpMessage(kind: FollowUpKind, row: FollowUpRow, staffName: string, link?: string | null, lang: FollowUpLang = "zh") {
  if (lang === "en") return followUpMessageEn(kind, row, staffName, link);
  // 英文名前加空格（嘅 Amy），中文名不加（嘅陳姑娘）
  const who = /^[A-Za-z]/.test(staffName) ? ` ${staffName}` : staffName;
  const greeting = `${(row.owner_name || "").trim()}你好，我係 Resoul 嘅${who}。`;
  const pet = (row.pet_name || "").trim() || "毛孩";
  const when = whenText(row);
  const amount = amountText(row);
  const url = link || LINK_PLACEHOLDER;
  switch (kind) {
    case "paid_unscheduled":
      return `${greeting}多謝你幫${pet}預約接送，${amount} 訂金已經收到。${when ? `你之前揀咗 ${when}，` : ""}想同你確認返接送嘅日期、時間同地址，我哋再幫你安排好。有咩想預先話我哋知，都可以隨時講。`;
    case "payment_failed":
      return `${greeting}見到你幫${pet}預約接送嗰陣，${amount} 訂金好似未成功付款，唔緊要㗎。你可以用呢條連結再試一次：\n${url}\n如果遇到任何問題，或者想改時間，隨時搵我就得。`;
    case "unpaid_next_day":
      return `${greeting}多謝你幫${pet}預約${when ? ` ${when} ` : ""}嘅接送。我哋留意到 ${amount} 訂金仲未完成付款，唔知係咪遇到啲問題呢？你可以用呢條連結付款：\n${url}\n如果想改時間或者有咩疑問，隨時搵我就得。`;
    default:
      return null;
  }
}

function followUpMessageEn(kind: FollowUpKind, row: FollowUpRow, staffName: string, link?: string | null) {
  const name = (row.owner_name || "").trim();
  const greeting = `Hi${name ? ` ${name}` : ""}, this is ${staffName} from Resoul.`;
  const pet = (row.pet_name || "").trim();
  const petPickup = pet ? `${pet}'s pick-up` : "your pet's pick-up";
  const when = whenText(row, "en");
  const amount = amountText(row);
  const url = link || LINK_PLACEHOLDER_EN;
  switch (kind) {
    case "paid_unscheduled":
      return `${greeting} Thank you for booking ${petPickup} — we've received your ${amount} deposit. ${when ? `You chose ${when}; we'd` : "We'd"} like to confirm the pick-up date, time and address so we can arrange everything for you. If there's anything you'd like us to know beforehand, just let us know.`;
    case "payment_failed":
      return `${greeting} It looks like the ${amount} deposit for ${petPickup} didn't go through — no worries. You can try again with this link:\n${url}\nIf you run into any problems or would like to change the time, just message me.`;
    case "unpaid_next_day":
      return `${greeting} Thank you for booking ${petPickup}${when ? ` on ${when}` : ""}. We noticed the ${amount} deposit hasn't been completed yet — did you run into any issues? You can pay with this link:\n${url}\nIf you'd like to change the time or have any questions, just message me.`;
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
