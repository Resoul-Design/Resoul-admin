"use client";

/**
 * WhatsApp 客人（職員跟進）
 * - 只會「開啟」WhatsApp 並預填訊息；WhatsApp 本身不會自動發送，須人手㩒 send。
 * - 測試期間：點擊時先彈確認，提醒職員切勿發送任何訊息給客人。
 * - 若日後測試完成，可將 TESTING 設為 false 以移除確認提示。
 */
const TESTING = true;

function toIntlHK(phone: string | null): string {
  const digits = (phone || "").replace(/\D/g, "");
  if (!digits) return "";
  if (digits.startsWith("852")) return digits;
  if (digits.length === 8) return "852" + digits; // 本地 8 位 → 加香港區號
  return digits.replace(/^0+/, "");
}

// WhatsApp 草稿連結（無有效電話時回傳空字串）
export function whatsappHref(phone: string | null, text: string): string {
  const intl = toIntlHK(phone);
  return intl ? `https://wa.me/${intl}?text=${encodeURIComponent(text)}` : "";
}

// 測試期間開啟前的確認提示
export const WHATSAPP_CONFIRM = TESTING
  ? "測試期間提示\n\n只會開啟 WhatsApp 並預填訊息，不會自動發送。\n請勿㩒 send 發送任何訊息給客人。\n\n繼續開啟草稿？"
  : undefined;
