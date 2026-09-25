"use client";

import { useState } from "react";

// 「只限連結」分享：客人忘記網址時，同事核對身份後可複製連結傳回給客人。
export function CopyShareLink({ url, active }: { url: string; active: boolean }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      window.prompt("複製分享連結：", url);
    }
  }

  return (
    <div className="mt-2 rounded-lg border border-[var(--line)] bg-[var(--cream)] px-3 py-2 text-xs">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[var(--soft)]">分享連結</span>
        <button
          type="button"
          onClick={copy}
          className="rounded-md border border-[var(--line)] bg-white px-2 py-1 hover:border-[var(--gold)]"
        >
          {copied ? "已複製 ✓" : "複製分享連結"}
        </button>
        {!active && <span className="text-amber-700">審核顯示後連結才可開啟</span>}
      </div>
      <div className="mt-1 break-all text-[var(--soft)]">{url}</div>
    </div>
  );
}
