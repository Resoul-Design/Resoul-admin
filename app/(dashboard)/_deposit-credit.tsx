"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { applyDepositCredit, getCreditStatus, getDepositCreditUse, removeDepositCredit, type CreditStatus, type CreditTarget } from "./_deposit-credit-actions";

const btn = "rounded-lg border px-3 py-2 text-sm disabled:opacity-50";
const hk = (n: number) => `HK$${n.toLocaleString("en-US", { maximumFractionDigits: 2 })}`;
const day = (iso: string) => (iso ? new Date(Date.parse(iso) + 8 * 3600 * 1000).toISOString().slice(0, 10) : "");

// 火化預約／紀念品草稿訂單：套用已付的接送訂金
export function DepositCreditPanel({ target }: { target: CreditTarget }) {
  const router = useRouter();
  const [status, setStatus] = useState<CreditStatus | null>(null);
  const [pick, setPick] = useState("");
  const [error, setError] = useState("");
  const [warning, setWarning] = useState("");
  const [pending, start] = useTransition();

  function load() {
    start(async () => {
      const s = await getCreditStatus(target);
      setStatus(s);
      setPick(s.available[0]?.id || "");
    });
  }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(load, [target.id]);

  function run(action: () => Promise<{ error?: string; warning?: string }>) {
    setError("");
    setWarning("");
    start(async () => {
      const res = await action();
      if (res.error) return setError(res.error);
      if (res.warning) setWarning(res.warning);
      router.refresh();
      const s = await getCreditStatus(target);
      setStatus(s);
      setPick(s.available[0]?.id || "");
    });
  }

  if (!status) return <p className="text-sm text-[var(--soft)]">讀取中…</p>;
  if (status.error && !status.applied && !status.available.length) return <p className="text-sm text-red-700">{status.error}</p>;

  return (
    <div className="space-y-3 text-sm">
      <p className="leading-6 text-[var(--soft)]">客人已付的接送訂金可抵扣此單的收費（只限同一專案編號）。套用後，Shopify 付款頁會加入「接送訂金抵扣」，客人只需支付餘額；Shopify 及後台備註會記錄抵扣。每筆訂金只可使用一次。</p>
      {status.projectNo && <p>專案編號：<b>{status.projectNo}</b></p>}
      {status.targetAmount != null && <p>此單收費：<b>{hk(status.targetAmount)}</b></p>}

      {status.applied ? (
        <div className="rounded-xl border border-[var(--gold)] bg-[var(--cream)] p-3">
          <p>已套用接送訂金 <b>{hk(status.applied.amount)}</b>{status.applied.projectNo ? `（${status.applied.projectNo}）` : ""}</p>
          {status.targetAmount != null && <p className="mt-1">客人尚需支付：<b>{hk(Math.max(0, status.targetAmount - status.applied.amount))}</b></p>}
          <button type="button" disabled={pending} onClick={() => { if (window.confirm("取消抵扣？付款頁會恢復原價，訂金可再用於其他單。")) run(() => removeDepositCredit(target)); }} className={btn + " mt-3 border-[var(--line)] bg-white hover:border-[var(--gold)]"}>
            取消抵扣
          </button>
        </div>
      ) : status.available.length ? (
        <>
          <div className="space-y-2">
            {status.available.map((d) => (
              <label key={d.id} className={"flex cursor-pointer items-start gap-2 rounded-xl border p-3 " + (pick === d.id ? "border-[var(--gold)] bg-[var(--cream)]" : "border-[var(--line)] bg-white")}>
                <input type="radio" name="credit" checked={pick === d.id} onChange={() => setPick(d.id)} className="mt-1" />
                <span>
                  <b>{hk(d.amount)}</b>{d.orderName ? ` · ${d.orderName}` : ""}{d.isTest ? "（測試）" : ""}
                  <span className="block text-xs text-[var(--soft)]">{[d.owner, d.pet].filter(Boolean).join(" · ")}{d.paidAt ? ` · ${day(d.paidAt)} 付款` : ""}</span>
                </span>
              </label>
            ))}
          </div>
          <button type="button" disabled={pending || !pick} onClick={() => { if (window.confirm("確定套用此接送訂金？")) run(() => applyDepositCredit(target, pick)); }} className={btn + " border-[var(--gold)] bg-[var(--gold)] text-white"}>
            {pending ? "處理中…" : "💰 套用接送訂金"}
          </button>
        </>
      ) : (
        <p className="rounded-xl border border-[var(--line)] bg-white p-3 text-[var(--soft)]">此專案編號未有可抵扣的接送訂金。系統只會列出同一專案編號、已付款而未使用的訂金。</p>
      )}
      {warning && <p className="text-amber-700">{warning}</p>}
      {(error || status.error) && <p className="text-red-700">{error || status.error}</p>}
    </div>
  );
}

// 接送服務：查看訂金抵扣狀態
export function DepositCreditInfo({ depositId }: { depositId: string }) {
  const [text, setText] = useState<string | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    getDepositCreditUse(depositId).then((r) => { setText(r.text); setError(r.error || ""); });
  }, [depositId]);
  if (text === null && !error) return <p className="text-sm text-[var(--soft)]">讀取中…</p>;
  return <p className={"text-sm leading-6 " + (error ? "text-red-700" : "")}>{error || text}</p>;
}
