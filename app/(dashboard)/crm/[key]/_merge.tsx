"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { mergeCustomer, unmergeCustomer } from "../_merge-actions";

// 客戶檔案：合併同一位客人的其他電話／名稱記錄
export function MergeCustomer({ primaryKey, aliases }: { primaryKey: string; aliases: string[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState("");
  const [error, setError] = useState("");
  const [pending, start] = useTransition();
  const run = (fn: () => Promise<{ error?: string }>) =>
    start(async () => {
      setError("");
      const res = await fn();
      if (res.error) setError(res.error);
      else {
        setValue("");
        router.refresh();
      }
    });

  return (
    <div className="mb-6 rounded-xl border border-[var(--line)] bg-[var(--card)] px-4 py-3 text-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-[var(--soft)]">
          {aliases.length ? `已合併：${aliases.join("、")}` : "同一位客人用過其他電話或名稱？可合併為一個檔案。"}
        </span>
        <button type="button" onClick={() => setOpen((v) => !v)} className="text-[var(--gold)] hover:underline">
          {open ? "收起" : "合併客戶"}
        </button>
      </div>
      {open && (
        <div className="mt-3 space-y-3">
          <div className="flex flex-wrap gap-2">
            <input
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder="另一位客戶的電話（例如 9123 4567）或名稱"
              className="min-w-[16rem] flex-1 rounded-lg border border-[var(--line)] bg-white px-3 py-2 outline-none focus:border-[var(--gold)]"
            />
            <button
              type="button"
              disabled={pending || !value.trim()}
              onClick={() => {
                if (window.confirm(`把「${value.trim()}」的記錄合併入此客戶檔案？之後可取消合併。`)) run(() => mergeCustomer(primaryKey, value));
              }}
              className="rounded-lg bg-[var(--gold)] px-4 py-2 font-medium text-white hover:opacity-90 disabled:opacity-50"
            >
              {pending ? "處理中…" : "合併"}
            </button>
          </div>
          {aliases.length > 0 && (
            <ul className="space-y-1">
              {aliases.map((a) => (
                <li key={a} className="flex items-center justify-between gap-2 rounded-lg bg-[var(--head)] px-3 py-1.5">
                  <span>{a}</span>
                  <button type="button" disabled={pending} onClick={() => run(() => unmergeCustomer(primaryKey, a))} className="text-xs text-red-700 hover:underline disabled:opacity-50">
                    取消合併
                  </button>
                </li>
              ))}
            </ul>
          )}
          <p className="text-xs leading-5 text-[var(--soft)]">合併只影響客戶檔案的歸類及統計，不會修改預約或訂單本身。</p>
          {error && <p className="text-red-700" role="alert">{error}</p>}
        </div>
      )}
    </div>
  );
}
