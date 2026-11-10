// 「開新單」單類型設定：名稱、權限、Shopify 標籤及首屏欄位。加類型時在此加一項，再於 new-order/actions.ts 補建立邏輯。
// 類型 key 沿用後台現有名稱（接送 deposit、火化 cremation、獸醫 vet、紀念品 product），只新增 other。

export type OrderType = "cremation" | "vet" | "deposit" | "product" | "other";
export type PaymentIntent = "link" | "received";

export type OrderTypeDef = {
  key: OrderType;
  label: string;
  icon: string;
  desc: string;
  module: string; // 開此類型單需要的權限
  tags: string[]; // Shopify 草稿標籤（另加專案編號、單號）
};

export const ORDER_TYPES: OrderTypeDef[] = [
  { key: "cremation", label: "善終／告別套餐", icon: "🕊️", desc: "風／雲／星之旅火化方案，按寵物體重收費", module: "bookings", tags: ["Resoul Admin", "Cremation"] },
  { key: "vet", label: "安樂在家", icon: "🩺", desc: "上門獸醫評估及安樂服務（劃一收費）", module: "vet_assessments", tags: ["Resoul Admin", "Vet Assessment"] },
  { key: "deposit", label: "預約接送訂金", icon: "🚐", desc: "接送訂金，金額跟 Shopify 訂金產品", module: "deposits", tags: ["Resoul Admin", "Pickup Deposit"] },
  { key: "product", label: "紀念品／加購", icon: "🎁", desc: "紀念品及加購商品，可選多件", module: "orders", tags: ["Resoul Admin", "Memorial Product"] },
  { key: "other", label: "其他／自訂", icon: "✏️", desc: "自訂項目、金額及說明", module: "orders", tags: ["Resoul Admin", "Memorial Product", "Other Order"] },
];

export const ORDER_TYPE_MAP = Object.fromEntries(ORDER_TYPES.map((t) => [t.key, t])) as Record<OrderType, OrderTypeDef>;

export const PAYMENT_INTENTS: { key: PaymentIntent; label: string; hint: string }[] = [
  { key: "link", label: "稍後付款", hint: "產生 Shopify 付款連結，客人網上付款後自動標記已付款" },
  { key: "received", label: "已收款", hint: "現金、FPS 等已收：Shopify 訂單直接標記已付款" },
];

export const PET_GENDERS = ["公", "母", "不詳"];

// 火化時間選項（09:00–19:30，每半小時）
export const CREMATION_TIMES = Array.from({ length: 22 }, (_, i) => `${String(9 + Math.floor(i / 2)).padStart(2, "0")}:${i % 2 ? "30" : "00"}`);

// 骨灰龕類別（跟 logistics Excel）：另加 Shopify「骨灰龕 URN」產品代碼
export const URN_BASIC_OPTIONS = [
  { value: "By Package", label: "套餐包括（By Package）" },
  { value: "No Urn", label: "不需要（No Urn）" },
  { value: "Pending", label: "待定（Pending）" },
];

export const RECEIVED_METHODS = ["現金", "FPS 轉數快", "PayMe", "信用卡", "銀行轉帳", "其他"];

export const ORDER_STATUS_LABEL: Record<string, string> = {
  draft: "未同步 Shopify",
  awaiting_payment: "待付款",
  paid: "已付款",
  cancelled: "已取消",
};
