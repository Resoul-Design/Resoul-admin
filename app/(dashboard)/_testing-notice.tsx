// WhatsApp 測試期間設定（接送服務、火化預約、獸醫評估、紀念品訂單共用）。
// 正式啟用、可向客人發送訊息後，把 WHATSAPP_TESTING 改為 false，提示及確認視窗即全部移除。
export const WHATSAPP_TESTING = true;

// 開啟 WhatsApp 草稿前的確認文字
export const WHATSAPP_CONFIRM = WHATSAPP_TESTING
  ? "測試期間提示\n\n只會開啟 WhatsApp 並預填訊息，不會自動發送。\n請勿按傳送鍵發送任何訊息給客人。\n\n繼續開啟草稿？"
  : undefined;

export function TestingNotice() {
  if (!WHATSAPP_TESTING) return null;
  return (
    <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
      ⚠️ 測試期間：所有「💬 WhatsApp」功能只會開啟預填訊息草稿，<b>請勿按下傳送鍵，或向客人發送任何訊息</b>。
    </div>
  );
}
