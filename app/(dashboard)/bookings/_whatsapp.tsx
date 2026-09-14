"use client";

import type { MouseEvent } from "react";

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

export function WhatsAppButton({ phone, text }: { phone: string | null; text: string }) {
  const intl = toIntlHK(phone);
  if (!intl) return null;
  const url = `https://wa.me/${intl}?text=${encodeURIComponent(text)}`;

  function open(e: MouseEvent) {
    e.preventDefault();
    if (
      TESTING &&
      !window.confirm(
        "測試期間提示\n\n只會開啟 WhatsApp 並預填訊息，不會自動發送。\n請勿㩒 send 發送任何訊息給客人。\n\n繼續開啟草稿？"
      )
    ) {
      return;
    }
    window.open(url, "_blank", "noopener,noreferrer");
  }

  return (
    <a
      href={url}
      onClick={open}
      className="text-xs text-green-700 hover:underline"
      title="開啟 WhatsApp 草稿（預填訊息，不會自動發送）"
    >
      💬 WhatsApp 客人
    </a>
  );
}
