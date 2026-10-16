"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useCloseRowActions } from "./_row-actions";
import { markPaidManually } from "./_payment-actions";

const METHODS = ["現金", "FPS 轉數快", "PayMe", "信用卡", "銀行轉帳", "Shopify（折扣／其他）", "其他"];
const input = "w-full rounded-lg border border-[var(--line)] bg-white px-3 py-2 text-sm outline-none focus:border-[var(--gold)]";

// 人手確認收款（現金、FPS、PayMe 等，或付款金額不符時由同事確認）
export function ManualPaidPanel({ entity, id, expected }: { entity: "deposit" | "cremation"; id: string; expected: number | null }) {
  const router = useRouter();
  const close = useCloseRowActions();
  const [amount, setAmount] = useState(expected ? String(expected) : "");
  const [method, setMethod] = useState("");
  const [error, setError] = useState("");
  const [pending, start] = useTransition();
  function submit() {
    setError("");
    if (!window.confirm(`確定已收款 HK$${amount || "—"}（${method || "未選方式"}）？標記後會變為「已付款」。`)) return;
    start(async () => {
      const res = await markPaidManually(entity, id, amount, method);
      if (res.error) return setError(res.error);
      router.refresh();
      close?.();
    });
  }
  return (
    <div className="space-y-3 text-sm">
      <p className="leading-6 text-[var(--soft)]">客人以現金、FPS、PayMe 等方式付款，或網上付款金額與收費不符而需要確認時使用。會記錄於備註及操作記錄。</p>
      <label className="block">
        <span className="text-xs text-[var(--soft)]">收款金額（HK$）</span>
        <input inputMode="numeric" value={amount} onChange={(e) => setAmount(e.target.value)} className={input + " mt-1"} />
      </label>
      <label className="block">
        <span className="text-xs text-[var(--soft)]">收款方式</span>
        <select value={method} onChange={(e) => setMethod(e.target.value)} className={input + " mt-1"}>
          <option value="">請選擇</option>
          {METHODS.map((m) => <option key={m} value={m}>{m}</option>)}
        </select>
      </label>
      <button type="button" disabled={pending || !amount || !method} onClick={submit} className="rounded-lg border border-[var(--gold)] bg-[var(--gold)] px-3 py-2 text-white disabled:opacity-50">
        {pending ? "處理中…" : "✅ 確認已收款"}
      </button>
      {error && <p className="text-red-700">{error}</p>}
    </div>
  );
}
