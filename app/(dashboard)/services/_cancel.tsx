"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { isBackdropPress } from "../_modal";
import { cancelServiceRecord, getCancelInfo, markRefunded, type CancelInfo, type CancelKind, type RefundMode } from "./_cancel-actions";

const hk = (n: number) => `HK$${n.toLocaleString("en-US", { maximumFractionDigits: 2 })}`;

// 工作台每行的「取消」掣：先讀取最新付款狀態，再要求確認
export function CancelButton({ kind, id, label, pet }: { kind: CancelKind; id: string; label: string; pet?: string | null }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [info, setInfo] = useState<CancelInfo | null>(null);
  const [refund, setRefund] = useState<RefundMode>("manual");
  const [reason, setReason] = useState("");
  const [error, setError] = useState("");
  const [done, setDone] = useState("");
  const [pending, start] = useTransition();

  function show() {
    setOpen(true); setInfo(null); setError(""); setDone(""); setReason(""); setRefund("manual");
    start(async () => setInfo(await getCancelInfo(kind, id)));
  }
  function close() {
    setOpen(false);
    if (done) router.refresh();
  }
  function submit() {
    setError("");
    start(async () => {
      const res = await cancelServiceRecord(kind, id, info?.paid ? refund : "none", reason);
      if (res.error) return setError(res.error);
      setDone(res.done || "已取消。");
      router.refresh();
    });
  }

  return (
    <>
      <button type="button" onClick={show} className="text-red-700 hover:underline">取消</button>
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onMouseDown={(e) => { if (isBackdropPress(e)) close(); }}>
          <div role="dialog" aria-modal="true" aria-label="取消此單" className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-2xl bg-[var(--card)] p-5 text-left text-sm shadow-xl">
            <h3 className="text-lg font-semibold">取消 {label}</h3>
            {pet && <p className="mt-1 text-[var(--soft)]">寵物：{pet}</p>}
            {done ? (
              <>
                <p role="status" className="mt-3 text-green-800">{done}</p>
                <div className="mt-4 flex justify-end"><button type="button" onClick={close} className="rounded-lg border border-[var(--line)] px-4 py-2 hover:bg-[var(--cream)]">關閉</button></div>
              </>
            ) : !info ? (
              <p className="mt-3 text-[var(--soft)]">正在讀取最新付款狀態…</p>
            ) : info.error ? (
              <>
                <p className="mt-3 text-red-700">{info.error}</p>
                <div className="mt-4 flex justify-end"><button type="button" onClick={close} className="rounded-lg border border-[var(--line)] px-4 py-2 hover:bg-[var(--cream)]">關閉</button></div>
              </>
            ) : (
              <>
                <p className="mt-3">單號 {info.invoiceNo ?? "—"}：{info.paid ? `已付款 ${hk(info.amount || 0)}` : "未付款"}。記錄不會刪除，狀態會改為「已取消」。</p>
                {info.note && <p className="mt-2 text-[var(--soft)]">{info.note}</p>}
                {info.paid && (
                  <fieldset className="mt-3 space-y-2">
                    <legend className="font-medium">退款安排</legend>
                    <label className={"flex cursor-pointer gap-2 rounded-xl border p-3 " + (refund === "manual" ? "border-[var(--gold)] bg-[var(--cream)]" : "border-[var(--line)] bg-white")}>
                      <input type="radio" name="refund" checked={refund === "manual"} onChange={() => setRefund("manual")} className="mt-1" />
                      <span><b>取消，稍後人手退款</b><span className="block text-xs text-[var(--soft)]">Shopify 訂單會取消但不退款；工作台顯示「待退款」，退款後按「標記已退款」。現金、FPS 等收款適用。</span></span>
                    </label>
                    {info.canShopifyRefund && (
                      <label className={"flex cursor-pointer gap-2 rounded-xl border p-3 " + (refund === "shopify" ? "border-red-400 bg-red-50" : "border-[var(--line)] bg-white")}>
                        <input type="radio" name="refund" checked={refund === "shopify"} onChange={() => setRefund("shopify")} className="mt-1" />
                        <span><b>取消並即時經 Shopify 原路退款 {hk(info.amount || 0)}</b><span className="block text-xs text-[var(--soft)]">款項會即時退回客人原本的付款方式，不能復原。只適用於經 Shopify 網上付款的單。</span></span>
                      </label>
                    )}
                  </fieldset>
                )}
                <label className="mt-3 block">取消原因（可選）<input value={reason} onChange={(e) => setReason(e.target.value)} maxLength={300} className="mt-1 w-full rounded-lg border border-[var(--line)] bg-white px-3 py-2" /></label>
                {error && <p role="alert" className="mt-3 text-red-700">{error}</p>}
                <div className="mt-4 flex justify-end gap-2">
                  <button type="button" onClick={close} className="rounded-lg border border-[var(--line)] px-4 py-2 hover:bg-[var(--cream)]">返回</button>
                  <button type="button" disabled={pending} onClick={submit} className="rounded-lg bg-red-700 px-4 py-2 text-white hover:opacity-90 disabled:opacity-50">{pending ? "處理中…" : refund === "shopify" && info.paid ? "確認取消及退款" : "確認取消"}</button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}

// 待退款 → 已退款
export function MarkRefundedButton({ kind, id, amount }: { kind: CancelKind; id: string; amount: number | null }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState("");
  return (
    <>
      <button
        type="button"
        disabled={pending}
        onClick={() => {
          if (!window.confirm(`確定已退款${amount ? ` ${hk(amount)}` : ""} 給客人？此掣只記錄結果，不會退款。`)) return;
          start(async () => {
            setError("");
            const r = await markRefunded(kind, id);
            if (r.error) return setError(r.error);
            router.refresh();
          });
        }}
        className="text-[var(--gold)] hover:underline disabled:opacity-50"
      >
        {pending ? "更新中…" : "標記已退款"}
      </button>
      {error && <span className="text-red-700">{error}</span>}
    </>
  );
}
