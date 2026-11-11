// Shopify 金額的純規則：訂金抵扣與折扣分開、退款／作廢不計已收、讀取失敗不可變成 0。
// 尚欠用 Shopify 應付（已扣抵扣及折扣），不會再減一次已收訂金。

const round2 = (n: number) => Math.round(n * 100) / 100;

export function splitCreditAndPromo(totalDiscount: number, creditAmount: number): { credit: number; other: number } {
  const discount = Math.max(0, Number(totalDiscount) || 0);
  const credit = Math.min(discount, Math.max(0, Number(creditAmount) || 0));
  return { credit: round2(credit), other: round2(discount - credit) };
}

export function classifyOrderPayment(status: string, cancelled: boolean, received: number, refunded: number): { paid: boolean; voided: boolean; refunded: boolean; net: number } {
  const net = round2(Math.max(0, (Number(received) || 0) - (Number(refunded) || 0)));
  const voided = cancelled || status === "VOIDED" || status === "EXPIRED";
  const refundedFull = status === "REFUNDED" || (!voided && (Number(received) || 0) > 0 && net === 0 && (Number(refunded) || 0) > 0);
  const paid = !voided && !refundedFull && net > 0 && ["PAID", "PARTIALLY_PAID", "PARTIALLY_REFUNDED"].includes(status);
  return { paid, voided, refunded: refundedFull, net: voided || refundedFull ? 0 : net };
}

export type PlanLine = { title?: string | null; variantTitle?: string | null; sku?: string | null };

const PLAN_TITLE = /星之旅|雲之旅|風之旅|Star Journey|Cloud Journey|Breeze Journey|Charity/i;

// 套餐代碼用所選套餐款式的 Shopify SKU。前面的其他貨品代碼不會蓋過套餐行。
export function selectPlanSku(lines: PlanLine[]): string {
  const rows = lines
    .map((line) => ({ title: `${line.title || ""} ${line.variantTitle || ""}`.trim(), sku: String(line.sku || "").trim() }))
    .filter((line) => line.sku);
  return rows.find((line) => PLAN_TITLE.test(line.title))?.sku || rows.find((line) => /^(BJ|CJ|SJ|CP|BTN)\d*$/i.test(line.sku))?.sku || "";
}

export type DepositInput = {
  status?: string | null;
  paymentStatus?: string | null;
  paymentAmount?: number | null;
  shopifyOrderId?: string | null;
  isTest?: boolean | null;
};

export type RemotePayment = { found: boolean; paid: boolean; voided: boolean; refunded: boolean; net: number };

export type DepositSummary = { amount: number | null; source: "none" | "shopify" | "cash" | "mixed" | "unverified"; notes: string[] };

// 已收訂金只計同一單、確實已付的接送訂金。有 Shopify 訂單時以淨實收為準；沒有訂單而人手標記已付才用本機金額。
export function summarizeDeposits(rows: DepositInput[], remote: (shopifyOrderId: string) => RemotePayment | null, loadError: boolean): DepositSummary {
  if (loadError) return { amount: null, source: "unverified", notes: ["Shopify 未能讀取，已收訂金未改為 0"] };
  let shopify = 0;
  let cash = 0;
  let sawShopify = false;
  let sawCash = false;
  const notes: string[] = [];
  for (const row of rows) {
    if (row.isTest || row.status === "cancelled") continue;
    if (row.paymentStatus === "refunded") {
      notes.push("接送訂金已退款，不計入已收");
      continue;
    }
    if (row.paymentStatus !== "paid") continue;
    const local = round2(Number(row.paymentAmount) || 0);
    const id = String(row.shopifyOrderId || "").trim();
    if (!id) {
      cash += local;
      sawCash = true;
      notes.push("人手標記已收（沒有 Shopify 訂單）");
      continue;
    }
    const payment = remote(id);
    if (!payment || !payment.found) return { amount: null, source: "unverified", notes: ["Shopify 訂單未能核對，已收訂金未改為 0"] };
    if (payment.voided || payment.refunded || !payment.paid) {
      notes.push(payment.voided ? "Shopify 訂單已作廢，不計入已收" : payment.refunded ? "Shopify 訂單已退款，不計入已收" : "本機標記已付，但 Shopify 訂單未付款");
      continue;
    }
    shopify += payment.net;
    sawShopify = true;
  }
  const amount = round2(shopify + cash);
  const source = sawShopify && sawCash ? "mixed" : sawShopify ? "shopify" : sawCash ? "cash" : "none";
  return { amount, source, notes };
}

export function legacyMoneyNote(
  live: { deposit: number | null; discount: number | null; payable: number | null },
  stored: { deposit: number | null; discount: number | null; balance: number | null },
): string {
  if (live.deposit == null && live.discount == null && live.payable == null) return "";
  const parts: string[] = [];
  const differ = (label: string, current: number | null, previous: number | null) => {
    if (current == null || previous == null || Math.abs(current - previous) <= 0.005) return;
    parts.push(`${label}本機 ${previous}、Shopify ${current}`);
  };
  differ("已收訂金", live.deposit, stored.deposit);
  differ("折扣", live.discount, stored.discount);
  differ("尚欠", live.payable, stored.balance);
  return parts.length ? `本機舊數與 Shopify 不同，未改寫：${parts.join("；")}` : "";
}

export function payableText(t: { gross: number; credit: number; other: number; payable: number; received?: number; open?: boolean }, prefix = "HK$"): string {
  const f = (n: number) => `${prefix}${n.toLocaleString("en-US", { maximumFractionDigits: 2 })}`;
  const parts = [`原價 ${f(t.gross)}`];
  if (t.credit) parts.push(`接送訂金抵扣 −${f(t.credit)}`);
  if (t.other) parts.push(`折扣 −${f(t.other)}`);
  if (t.open === false) {
    parts.push(`實收 ${f(t.received ?? 0)}`);
    parts.push(`尚欠 ${f(t.payable)}`);
  } else parts.push(`應付 ${f(t.payable)}`);
  return parts.join("、");
}
