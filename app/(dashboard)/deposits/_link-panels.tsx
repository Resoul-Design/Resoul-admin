"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useCloseRowActions } from "../_row-actions";
import { createCremationFromDeposit, setDepositStatus } from "./_link-actions";

const STATUSES: [string, string][] = [["new", "新收到"], ["contacted", "已聯絡"], ["scheduled", "已排期"], ["completed", "已完成"], ["cancelled", "已取消"]];
const btn = "rounded-lg border px-3 py-2 text-sm disabled:opacity-50";

// 快速更新接送服務狀態
export function DepositStatusPanel({ id, status }: { id: string; status: string }) {
  const router = useRouter();
  const close = useCloseRowActions();
  const [error, setError] = useState("");
  const [pending, start] = useTransition();
  function pick(s: string) {
    setError("");
    start(async () => {
      const res = await setDepositStatus(id, s);
      if (res.error) return setError(res.error);
      router.refresh();
      close?.();
    });
  }
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {STATUSES.map(([v, l]) => (
          <button key={v} type="button" disabled={pending || v === status} onClick={() => pick(v)}
            className={btn + (v === status ? " border-[var(--gold)] bg-[var(--cream)] font-medium" : " border-[var(--line)] bg-white hover:border-[var(--gold)]")}>
            {v === status ? "✓ " : ""}{l}
          </button>
        ))}
      </div>
      <p className="text-xs leading-5 text-[var(--soft)]">火化預約標記「已接送」時，接送服務會自動改為「已完成」。</p>
      {error && <p className="text-sm text-red-700">{error}</p>}
    </div>
  );
}

// 一鍵建立火化預約（同一專案編號；方案及收費待確認）
export function CreateCremationPanel({ id, projectNo }: { id: string; projectNo: string }) {
  const router = useRouter();
  const close = useCloseRowActions();
  const [error, setError] = useState("");
  const [pending, start] = useTransition();
  function create() {
    setError("");
    start(async () => {
      const res = await createCremationFromDeposit(id);
      if (res.error) return setError(res.error);
      router.refresh();
      close?.();
    });
  }
  return (
    <div className="space-y-3 text-sm">
      <p className="leading-6">會以專案編號 <b>{projectNo}</b> 建立火化預約，自動帶入主人、電話、毛孩、地址及日期。</p>
      <p className="leading-6 text-[var(--soft)]">方案及收費會標示為「待與客人確認」，不會設定金額，亦不會觸發付款提醒。確認後，到「火化預約 → 編輯資料」揀方案及填寫收費金額，再產生付款連結。</p>
      <button type="button" disabled={pending} onClick={create} className={btn + " border-[var(--gold)] bg-[var(--gold)] text-white"}>
        {pending ? "建立中…" : "🕊️ 建立火化預約"}
      </button>
      {error && <p className="text-red-700">{error}</p>}
    </div>
  );
}
