"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

const STATUS_OPTS = [
  { key: "", label: "全部狀態" },
  { key: "new", label: "新收到" },
  { key: "contacted", label: "已聯絡" },
  { key: "scheduled", label: "已排期" },
  { key: "completed", label: "已完成" },
  { key: "cancelled", label: "已取消" },
  { key: "unpaid", label: "未付款" },
];

const field = "rounded-lg border border-[var(--line)] bg-white px-3 py-2 text-sm outline-none focus:border-[var(--gold)]";

// 接送服務工具列：搜尋（停頓 300ms 後更新網址 ?q=）、狀態篩選（?status=）、匯出 CSV；與其他列表一致
export function DepositsToolbar({ query, status }: { query: string; status: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [q, setQ] = useState(query);
  const first = useRef(true);
  // 由全後台搜尋帶入新的 ?q= 時同步輸入框（自己輸入時網址與輸入一致，不會重設）
  const [prevQuery, setPrevQuery] = useState(query);
  if (query !== prevQuery) {
    setPrevQuery(query);
    if (query !== q.trim()) setQ(query);
  }

  function go(next: Record<string, string>) {
    const sp = new URLSearchParams(params.toString());
    for (const [k, v] of Object.entries(next)) {
      if (v) sp.set(k, v);
      else sp.delete(k);
    }
    const qs = sp.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }

  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    const timer = setTimeout(() => go({ q: q.trim() }), 300);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  return (
    <div className="mb-4 flex flex-wrap items-center gap-2">
      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="搜尋 專案編號 / 主人 / 電話 / 毛孩 / 付款參考…"
        aria-label="搜尋接送服務"
        className={field + " min-w-[200px] flex-1"}
      />
      <select value={status} onChange={(e) => go({ status: e.target.value })} aria-label="狀態篩選" className={field}>
        {STATUS_OPTS.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
      </select>
      <a href="/api/export/deposits" className="rounded-lg border border-[var(--line)] px-3 py-2 text-sm hover:bg-[var(--cream)]">匯出 CSV</a>
    </div>
  );
}
