// 付款 webhook 核對金額：實付少於應付時不標記已付款，改為「付款失敗」並於備註記錄差額
export type AmountCheck = { ok: true } | { ok: false; note: string };

const hk = (n: number) => `HK$${n.toLocaleString("en-US", { maximumFractionDigits: 2 })}`;

export function checkPaidAmount(expected: number | null | undefined, paid: number | null | undefined, currency: string | null | undefined, orderName: string | null | undefined): AmountCheck {
  const order = orderName || "Shopify 訂單";
  const exp = Number(expected);
  if (!(exp > 0)) return { ok: false, note: `⚠️ 未設定收費金額，未能核對 ${order} 實付 ${paid != null ? hk(Number(paid)) : "—"}；請人手確認收款` };
  const amount = Number(paid);
  if (!Number.isFinite(amount)) return { ok: false, note: `⚠️ ${order} 未有付款金額，未能核對；請人手確認收款` };
  if (currency && currency.toUpperCase() !== "HKD") return { ok: false, note: `⚠️ ${order} 貨幣為 ${currency}，未能核對；請人手確認收款` };
  // 容許 0.5 元以內的進位差
  if (amount + 0.5 < exp) return { ok: false, note: `⚠️ 付款金額不符：應付 ${hk(exp)}，${order} 實付 ${hk(amount)}，未標記已付款` };
  return { ok: true };
}

export function appendNote(notes: string | null | undefined, line: string) {
  const base = String(notes || "").trim();
  return (base ? `${base} | ${line}` : line).slice(0, 4000);
}
