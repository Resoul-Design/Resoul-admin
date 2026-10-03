"use client";

/**
 * WhatsApp 客人（職員跟進）
 * - 只會「開啟」WhatsApp 並預填訊息；WhatsApp 本身不會自動發送，須由同事按傳送。
 * - 測試期間的確認提示由 ../_testing-notice（WHATSAPP_TESTING）統一控制。
 */
export { WHATSAPP_CONFIRM } from "../_testing-notice";

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
