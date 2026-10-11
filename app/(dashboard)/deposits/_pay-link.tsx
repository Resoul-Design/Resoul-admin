"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createDepositPaymentLink } from "./actions";

const btn = "rounded-md border border-[var(--line)] bg-white px-2 py-0.5 text-xs hover:border-[var(--gold)] disabled:opacity-50";

// 訂金列表：未付款的記錄統一顯示「付款連結」及「複製」；未有連結時，按任何一個會先產生（Shopify 草稿）再開啟／複製
export function DepositPayLink({ id, link: initial }: { id: string; link: string | null }) {
  const router = useRouter();
  const [link, setLink] = useState(initial || "");
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState("");
  const [pending, start] = useTransition();

  async function ensureLink(): Promise<string> {
    if (link) return link;
    const res = await createDepositPaymentLink(id);
    if (res.error) setError(res.error);
    if (res.link) {
      setLink(res.link);
      router.refresh();
    }
    return res.link || "";
  }

  function open() {
    setError("");
    if (link) {
      window.open(link, "_blank", "noopener,noreferrer");
      return;
    }
    // 先開空白分頁（避免被瀏覽器當作彈出視窗攔截），產生後再轉往付款頁
    const win = window.open("", "_blank");
    start(async () => {
      const url = await ensureLink();
      if (win) {
        if (url) {
          win.opener = null;
          win.location.href = url;
        } else win.close();
      }
    });
  }

  function copy() {
    setError("");
    start(async () => {
      const url = await ensureLink();
      if (!url) return;
      try {
        await navigator.clipboard.writeText(url);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      } catch {
        window.prompt("複製付款連結：", url);
      }
    });
  }

  return (
    <span className="inline-flex flex-wrap items-center gap-1.5 text-xs">
      <button type="button" className={btn} disabled={pending} onClick={open} title={link ? "開啟付款頁" : "未有連結：按此產生並開啟"}>
        {pending ? "產生中…" : "🔗 付款連結"}
      </button>
      <button type="button" className={btn} disabled={pending} onClick={copy} title={link ? "複製付款連結" : "未有連結：按此產生並複製"}>
        {copied ? "已複製 ✓" : "複製"}
      </button>
      {error && <span className="text-red-700">{error}</span>}
    </span>
  );
}
