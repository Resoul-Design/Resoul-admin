"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { linkOrderProject } from "./actions";
import { useCloseRowActions } from "../_row-actions";

// 紀念品訂單改用客人原有的專案編號（例如舊客在網上商店購買，系統自動派了新編號）
export function LinkProjectPanel({ orderId, current }: { orderId: string; current: string }) {
  const router = useRouter();
  const close = useCloseRowActions();
  const [value, setValue] = useState(current === "—" ? "" : current);
  const [error, setError] = useState("");
  const [pending, start] = useTransition();
  return (
    <div className="space-y-3 text-sm">
      <p className="leading-6 text-[var(--soft)]">輸入客人原有的專案編號（RSL-…），此訂單會歸入同一專案。系統會先確認編號存在於接送、火化或其他紀念品記錄。</p>
      <input
        value={value}
        onChange={(e) => setValue(e.target.value.toUpperCase())}
        placeholder="RSL-260924-1E0L325L"
        className="w-full rounded-lg border border-[var(--line)] bg-white px-3 py-2 outline-none focus:border-[var(--gold)]"
      />
      {error && <p className="text-red-700" role="alert">{error}</p>}
      <button
        type="button"
        disabled={pending || !value.trim()}
        onClick={() =>
          start(async () => {
            setError("");
            const res = await linkOrderProject(orderId, value);
            if (res.error) setError(res.error);
            else {
              close();
              router.refresh();
            }
          })
        }
        className="rounded-lg bg-[var(--gold)] px-4 py-2 font-medium text-white hover:opacity-90 disabled:opacity-50"
      >
        {pending ? "儲存中…" : "連結專案"}
      </button>
    </div>
  );
}
