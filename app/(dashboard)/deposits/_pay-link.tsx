"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createDepositPaymentLink } from "./actions";

const btn = "rounded-md border border-[var(--line)] bg-white px-2 py-0.5 text-xs hover:border-[var(--gold)] disabled:opacity-50";

// 訂金列表：未付款的記錄直接顯示付款連結（開啟／複製）；未有連結可即時產生
export function DepositPayLink({ id, link: initial }: { id: string; link: string | null }) {
  const router = useRouter();
  const [link, setLink] = useState(initial || "");
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState("");
  const [pending, start] = useTransition();

  async function copy() {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      window.prompt("複製付款連結：", link);
    }
  }

  function create() {
    setError("");
    start(async () => {
      const res = await createDepositPaymentLink(id);
      if (res.link) setLink(res.link);
      if (res.error) setError(res.error);
      if (res.link) router.refresh();
    });
  }

  return (
    <span className="inline-flex flex-wrap items-center gap-1.5 text-xs">
      {link ? (
        <>
          <a href={link} target="_blank" rel="noopener noreferrer" className="text-[var(--gold)] underline underline-offset-2">🔗 付款連結</a>
          <button type="button" className={btn} onClick={copy}>{copied ? "已複製 ✓" : "複製"}</button>
        </>
      ) : (
        <button type="button" className={btn} disabled={pending} onClick={create}>{pending ? "產生中…" : "＋ 產生付款連結"}</button>
      )}
      {error && <span className="text-red-700">{error}</span>}
    </span>
  );
}
