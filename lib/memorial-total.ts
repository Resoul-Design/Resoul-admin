// 紀念品加購：同一單的產品行實際金額加總（對應試算表 Order Tracking 的 N，或每行只出現一次的 O）。
// 不用目錄牌價覆蓋成交價。若每行 amount 都是同一個整單總額，只計一次，不可把重覆總額再加總。

export type MemorialLine = { amount?: number | null; unitPrice?: number | null; quantity?: number | null };

export type MemorialTotal =
  | { state: "none" }
  | { state: "amount"; amount: number }
  | { state: "ambiguous" };

const round2 = (n: number) => Math.round(n * 100) / 100;
const finite = (v: unknown): number | null => {
  if (v == null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

export function sumMemorialLines(lines: MemorialLine[]): MemorialTotal {
  if (!lines.length) return { state: "none" };
  const parsed = lines.map((line) => {
    const quantity = finite(line.quantity) ?? 1;
    const unit = finite(line.unitPrice);
    return {
      amount: finite(line.amount),
      line: unit == null ? null : round2(unit * (quantity > 0 ? quantity : 1)),
    };
  });
  if (parsed.some((row) => row.amount == null && row.line == null)) return { state: "ambiguous" };

  const lineKnown = parsed.every((row) => row.line != null);
  const lineSum = lineKnown ? round2(parsed.reduce((sum, row) => sum + (row.line ?? 0), 0)) : null;
  const amountsKnown = parsed.every((row) => row.amount != null);

  if (lineKnown && amountsKnown && parsed.length >= 2 && lineSum != null) {
    const first = parsed[0].amount ?? 0;
    const sameAmount = parsed.every((row) => Math.abs((row.amount ?? 0) - first) < 0.001);
    const eachIsOwnLine = parsed.every((row) => Math.abs((row.amount ?? 0) - (row.line ?? 0)) < 0.001);
    // 每行都抄了整單總額，而行小計加起來才是那個總額：用行小計，不要把總額乘上行數。
    if (sameAmount && !eachIsOwnLine && Math.abs(first - lineSum) < 0.001) return { state: "amount", amount: lineSum };
  }

  if (!amountsKnown && lineSum != null) return { state: "amount", amount: lineSum };
  if (!amountsKnown) return { state: "ambiguous" };

  const firstAmount = parsed[0].amount ?? 0;
  const sameAmount = parsed.every((row) => Math.abs((row.amount ?? 0) - firstAmount) < 0.001);
  // 兩行以上、金額完全相同，又沒有行小計可核對：可能是相同單價，也可能是重覆的整單總額。
  if (!lineKnown && parsed.length >= 2 && sameAmount && firstAmount !== 0) return { state: "ambiguous" };
  return { state: "amount", amount: round2(parsed.reduce((sum, row) => sum + (row.amount ?? 0), 0)) };
}
