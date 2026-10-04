// 統一跟進（火化服務、獸醫評估、紀念品訂單）：分類規則、名稱及 WhatsApp 訊息範本。
// 沿用接送服務（lib/deposit-followup.ts）的四類邏輯；頁面（伺服器）及跟進視窗（瀏覽器）共用，不可引用伺服器模組。
import { FOLLOW_UP_ORDER, REMIND_WAIT_MS, findTimeSlot, type FollowUpKind, type FollowUpLang } from "@/lib/deposit-followup";

export { FOLLOW_UP_ORDER, type FollowUpKind, type FollowUpLang };

export type FollowEntity = "cremation" | "vet" | "product";

export type FollowMark = {
  remindedAt: string | null;
  reminderCount: number;
  contactedAt: string | null;
  closedAt: string | null;
  paymentLink: string | null;
};

export const EMPTY_MARK: FollowMark = { remindedAt: null, reminderCount: 0, contactedAt: null, closedAt: null, paymentLink: null };

// 跟進所需的資料（可序列化，傳給瀏覽器視窗）
export type FollowItem = {
  entity: FollowEntity;
  ref: string;
  createdAt: string;
  owner: string;
  contact: string;
  pet: string;
  serviceDate: string;
  serviceTime: string;
  status: string; // new／completed／cancelled 等；紀念品：new＝未出貨
  paymentStatus: "paid" | "pending" | "failed" | "refunded" | "none";
  amount: number | null;
  label: string; // 方案或產品
  projectNo: string;
  english: boolean;
  mark: FollowMark;
};

const LABELS: Record<FollowEntity, Record<FollowUpKind, string>> = {
  cremation: { paid_unscheduled: "已付款、未排期", payment_failed: "付款失敗", unpaid_next_day: "隔日仍未付款", reminded_unpaid: "已提醒、仍未付款" },
  vet: { paid_unscheduled: "已確認、未排期", payment_failed: "—", unpaid_next_day: "隔日仍未聯絡", reminded_unpaid: "已聯絡、未有回覆" },
  product: { paid_unscheduled: "已付款、未出貨", payment_failed: "付款失敗", unpaid_next_day: "隔日仍未付款", reminded_unpaid: "已提醒、仍未付款" },
};

const ACTIONS: Record<FollowEntity, Record<FollowUpKind, string>> = {
  cremation: { paid_unscheduled: "安排排期", payment_failed: "重新付款", unpaid_next_day: "提醒付款", reminded_unpaid: "致電跟進" },
  vet: { paid_unscheduled: "安排排期", payment_failed: "—", unpaid_next_day: "聯絡客人", reminded_unpaid: "致電跟進" },
  product: { paid_unscheduled: "安排出貨", payment_failed: "重新付款", unpaid_next_day: "提醒付款", reminded_unpaid: "致電跟進" },
};

export const followLabel = (entity: FollowEntity, kind: FollowUpKind) => LABELS[entity][kind];
export const followAction = (entity: FollowEntity, kind: FollowUpKind) => ACTIONS[entity][kind];

const HK_OFFSET_MS = 8 * 60 * 60 * 1000;
function hkTodayStart(now: Date) {
  const hk = new Date(now.getTime() + HK_OFFSET_MS);
  hk.setUTCHours(0, 0, 0, 0);
  return hk.getTime() - HK_OFFSET_MS;
}

// 與接送服務相同的四類規則；獸醫評估沒有收費，以「仍是新收到」代替「未付款」
export function followKind(it: FollowItem, now = new Date()): FollowUpKind | null {
  const m = it.mark;
  if (m.closedAt) return null;
  if (it.status === "cancelled" || it.status === "completed") return null;
  if (it.paymentStatus === "refunded") return null;
  if (it.paymentStatus === "paid") return it.status === "new" && !m.contactedAt ? "paid_unscheduled" : null;
  if (it.entity === "vet" && it.status !== "new") return null;
  if (m.remindedAt) return now.getTime() - new Date(m.remindedAt).getTime() >= REMIND_WAIT_MS ? "reminded_unpaid" : null;
  if (it.paymentStatus === "failed") return "payment_failed";
  return new Date(it.createdAt).getTime() < hkTodayStart(now) ? "unpaid_next_day" : null;
}

// 已提醒、等候客人回應期間的提示（例如「已提醒 10/3 · 10/5 起致電跟進」）；四個列表共用
export function waitingNote(remindedAt: string, now = new Date(), contacted = false): string | null {
  const reminded = Date.parse(remindedAt);
  if (!Number.isFinite(reminded)) return null;
  const due = reminded + REMIND_WAIT_MS;
  if (now.getTime() >= due) return null;
  const md = (ms: number) => {
    const d = new Date(ms + HK_OFFSET_MS);
    return `${d.getUTCMonth() + 1}/${d.getUTCDate()}`;
  };
  return `${contacted ? "已聯絡" : "已提醒"} ${md(reminded)} · ${md(due)} 起致電跟進`;
}

export function followWaitingNote(it: FollowItem, now = new Date()): string | null {
  const m = it.mark;
  if (!m.remindedAt || m.closedAt) return null;
  if (it.status === "cancelled" || it.status === "completed") return null;
  if (it.paymentStatus === "paid" || it.paymentStatus === "refunded") return null;
  if (it.entity === "vet" && it.status !== "new") return null;
  return waitingNote(m.remindedAt, now, it.entity === "vet");
}

// 需要付款連結的類別（獸醫評估不收費）
export function followNeedsLink(entity: FollowEntity, kind: FollowUpKind) {
  return entity !== "vet" && (kind === "payment_failed" || kind === "unpaid_next_day");
}

const MONTHS_EN = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
function whenText(it: FollowItem, lang: FollowUpLang) {
  const m = it.serviceDate.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  const date = !m ? "" : lang === "en" ? `${Number(m[3])} ${MONTHS_EN[Number(m[2]) - 1]}` : `${Number(m[2])} 月 ${Number(m[3])} 日`;
  const slot = findTimeSlot(it.serviceTime);
  return [date, slot ? slot[lang] : it.serviceTime.trim()].filter(Boolean).join(" ");
}
const amountText = (it: FollowItem) => (it.amount && it.amount > 0 ? "HK$" + it.amount.toLocaleString("en-US") : "");

export const FOLLOW_LINK_PLACEHOLDER = { zh: "［付款連結］", en: "[payment link]" };

// 廣東話口語／英文範本；「已提醒、仍未付款」不起草第二次提醒，回傳 null（改為致電）
export function followMessage(it: FollowItem, kind: FollowUpKind, staffName: string, link: string | null, lang: FollowUpLang): string | null {
  if (kind === "reminded_unpaid") return null;
  const url = link || FOLLOW_LINK_PLACEHOLDER[lang];
  const when = whenText(it, lang);
  const amount = amountText(it);
  if (lang === "en") {
    const hi = `Hi${it.owner ? ` ${it.owner}` : ""}, this is ${staffName} from Resoul.`;
    const pet = it.pet || "your companion";
    if (it.entity === "vet") {
      return `${hi} We received your enquiry about an at-home vet assessment for ${pet}${when ? ` (${when})` : ""}. We'd like to learn a little more about how ${pet} is doing so we can arrange a home visit. Please reply when convenient, and feel free to message me with any questions.`;
    }
    const what = it.entity === "product" ? `your order (${it.label})` : `${it.label || "the cremation service"} for ${pet}`;
    if (kind === "paid_unscheduled") {
      return it.entity === "product"
        ? `${hi} Thank you for ${what} — we've received your payment. We'd like to confirm pick-up or delivery so we can have everything ready for you.`
        : `${hi} Thank you for booking ${what} — we've received your ${amount || "payment"}. ${when ? `You chose ${when}; we'd` : "We'd"} like to confirm the date, time and pick-up arrangements so we can prepare everything for you. If there's anything you'd like us to know beforehand, just let us know.`;
    }
    if (kind === "payment_failed") {
      return `${hi} It looks like the ${amount ? `${amount} ` : ""}payment for ${what} didn't go through — no worries. You can try again with this link:\n${url}\nIf you run into any problems, just message me.`;
    }
    return `${hi} Thank you for ${it.entity === "product" ? what : `booking ${what}${when ? ` on ${when}` : ""}`}. We noticed the ${amount ? `${amount} ` : ""}payment hasn't been completed yet — did you run into any issues? You can pay with this link:\n${url}\nIf you have any questions, just message me.`;
  }
  const who = /^[A-Za-z]/.test(staffName) ? ` ${staffName}` : staffName;
  const hi = `${it.owner}你好，我係 Resoul 嘅${who}。`;
  const pet = it.pet || "毛孩";
  if (it.entity === "vet") {
    return `${hi}收到你為${pet}查詢上門獸醫評估${when ? `（${when}）` : ""}。想同你了解多少少${pet}而家嘅情況，再幫你安排獸醫上門時間。方便嘅話回覆一下就得，有任何疑問都可以隨時搵我。`;
  }
  const what = it.entity === "product" ? `${it.label || "紀念品"}` : `${pet}嘅${it.label || "火化服務"}`;
  if (kind === "paid_unscheduled") {
    return it.entity === "product"
      ? `${hi}多謝你訂購 ${what}，款項已經收到。想同你確認返取貨或者送貨安排，我哋再幫你準備好。`
      : `${hi}多謝你預約${what}，${amount || "款項"}已經收到。${when ? `你之前揀咗 ${when}，` : ""}想同你確認返日期、時間同接送安排，我哋再幫你準備好。有咩想預先話我哋知，都可以隨時講。`;
  }
  if (kind === "payment_failed") {
    return `${hi}見到你${it.entity === "product" ? "訂購" : "預約"}${what}嗰陣，${amount ? `${amount} ` : ""}好似未成功付款，唔緊要㗎。你可以用呢條連結再試一次：\n${url}\n如果遇到任何問題，隨時搵我就得。`;
  }
  return `${hi}多謝你${it.entity === "product" ? `訂購 ${what}` : `預約${what}${when ? `，時間係 ${when}` : ""}`}。我哋留意到${amount ? ` ${amount} ` : ""}仲未完成付款，唔知係咪遇到啲問題呢？你可以用呢條連結付款：\n${url}\n如果有咩疑問，隨時搵我就得。`;
}
