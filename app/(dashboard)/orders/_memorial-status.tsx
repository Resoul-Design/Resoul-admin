"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { MEMORIAL_STATUSES, isMemorialStatus, memorialClass, memorialLabel } from "@/lib/memorial-status";
import { setOrderMemorialStatus } from "./actions";

// 紀念品訂單的產品狀態：揀選後即時保存；失敗還原並顯示原因
export function MemorialStatusSelect({ orderId, value }: { orderId: string; value: string }) {
  const router = useRouter();
  const [current, setCurrent] = useState(value);
  const [error, setError] = useState("");
  const [pending, start] = useTransition();
  return (
    <span className="inline-flex flex-col gap-0.5">
      <select
        value={current}
        disabled={pending}
        aria-label="產品狀態"
        onChange={(e) => {
          const next = e.target.value;
          const prev = current;
          setCurrent(next);
          setError("");
          start(async () => {
            const res = await setOrderMemorialStatus(orderId, next);
            if (res.error) { setCurrent(prev); setError(res.error); return; }
            router.refresh();
          });
        }}
        className={"rounded-full border-0 px-2 py-0.5 text-xs outline-none " + memorialClass(memorialLabel(current))}
      >
        {!isMemorialStatus(current) && <option value={current}>{memorialLabel(current)}</option>}
        {MEMORIAL_STATUSES.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
      </select>
      {error && <span role="alert" className="max-w-[180px] whitespace-normal text-xs text-red-700">{error}</span>}
    </span>
  );
}
