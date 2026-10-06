// 回覆助手：代號填入、開頭問候、危機字眼及語言判斷（固定範本，不經 AI）。
// 頁面（伺服器）及回覆助手（瀏覽器）共用，故此檔不可引用伺服器專用模組。
import { findTimeSlot } from "@/lib/deposit-followup";
import type { PriceTokens } from "@/lib/site-content";

export type ReplyLang = "zh" | "en";

export type ReplySnippet = {
  id: string;
  slug: string | null;
  category: string;
  title: string;
  zh: string;
  en: string;
  sort_order: number;
  active: boolean;
};

// 回覆時可選的客人記錄（接送訂金或火化／獸醫預約）
export type ReplyRecord = {
  ref: string; // "deposit:<id>" 或 "booking:<id>"
  kind: "接送服務" | "火化預約" | "獸醫評估";
  created_at: string;
  owner_name: string | null;
  contact: string | null;
  pet_name: string | null;
  service_date: string | null;
  service_time: string | null;
  projectNo: string;
  lang: ReplyLang;
};

export const REPLY_CATEGORIES = ["常用語", "收費", "付款", "接送", "流程", "告別儀式與火化", "骨灰與紀念", "時間", "獸醫轉介", "情緒支援"];

export const REPLY_TOKENS = ["{稱呼}", "{毛孩}", "{日期}", "{時段}", "{專案編號}", "{同事}", "{網站}"];

const MONTHS_EN = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function dateText(value: string | null | undefined, lang: ReplyLang) {
  const m = (value || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return "";
  return lang === "en" ? `${Number(m[3])} ${MONTHS_EN[Number(m[2]) - 1]}` : `${Number(m[2])} 月 ${Number(m[3])} 日`;
}

// prices：「網站內容」收費產生的代號（{火化收費表} 等），由頁面伺服器端計算後傳入
export type FillContext = { record: ReplyRecord | null; ownerName: string; staffName: string; siteUrl: string; lang: ReplyLang; prices?: PriceTokens };

// 填入代號；未有資料的代號保留原樣（例如「{日期}」），提醒同事手動補上
export function fillTokens(text: string, ctx: FillContext) {
  const r = ctx.record;
  const slot = findTimeSlot(r?.service_time);
  const values: Record<string, string> = {
    "{稱呼}": ctx.ownerName.trim(),
    "{毛孩}": (r?.pet_name || "").trim() || (ctx.lang === "en" ? "your pet" : "毛孩"),
    "{日期}": dateText(r?.service_date, ctx.lang),
    "{時段}": slot ? slot[ctx.lang] : (r?.service_time || "").trim(),
    "{專案編號}": r?.projectNo || "",
    "{同事}": ctx.staffName,
    "{網站}": ctx.siteUrl,
  };
  return text
    .replace(/\{(稱呼|毛孩|日期|時段|專案編號|同事|網站)\}/g, (token) => values[token] || token)
    .replace(/\{(風之旅起價|雲之旅起價|星之旅起價|火化收費表|獸醫收費表|情緒支援收費表)\}/g, (token) => ctx.prices?.[token]?.[ctx.lang] || token);
}

export function greeting(ctx: FillContext) {
  const name = ctx.ownerName.trim();
  if (ctx.lang === "en") return `Hi${name ? ` ${name}` : ""}, this is ${ctx.staffName} from Resoul.`;
  // 英文名前加空格（嘅 Amy），中文名不加（嘅陳姑娘）
  const who = /^[A-Za-z]/.test(ctx.staffName) ? ` ${ctx.staffName}` : ctx.staffName;
  return `${name}你好，我係 Resoul 嘅${who}。`;
}

// 與網站情緒支援對話相同的危機字眼
export function detectCrisis(text: string) {
  return (
    /想死|唔想活|唔想再.*(活|喺)|冇意思|冇晒意思|撐唔住|頂唔住|傷害自己|自殺|想跟(佢|牠|你)去|想跟佢走|活唔落去|結束生命|结束生命|唔想生存/.test(text) ||
    /\b(want to die|kill myself|end my life|end it all|suicid|hurt myself|harm myself|don'?t want to live|can'?t go on|no reason to live|want to join (him|her|them|it))\b/i.test(text)
  );
}

// 客人訊息沒有中文字而有英文字時判斷為英文
export function detectLang(text: string): ReplyLang | null {
  if (!text.trim()) return null;
  if (/[㐀-鿿]/.test(text)) return "zh";
  return /[A-Za-z]/.test(text) ? "en" : null;
}
