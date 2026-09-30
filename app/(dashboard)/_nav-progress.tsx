"use client";

import { useEffect, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";

// 轉頁進度條：舊頁保持顯示直至新頁準備好（不閃出空白或骨架），頂部以幼金色進度條示意載入中。
export function NavProgress() {
  const pathname = usePathname();
  const query = useSearchParams()?.toString() || "";
  const routeKey = pathname + (query ? `?${query}` : "");
  // 點擊時所在頁面；網址改變即代表新頁已顯示
  const [loadingFrom, setLoadingFrom] = useState<string | null>(null);
  const done = loadingFrom !== null && loadingFrom !== routeKey;

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = (e.target as HTMLElement | null)?.closest("a");
      if (!a || a.target === "_blank" || a.hasAttribute("download")) return;
      const url = new URL(a.href, location.href);
      if (url.origin !== location.origin) return;
      const current = location.pathname + location.search;
      if (url.pathname + url.search === current) return;
      setLoadingFrom(current);
    }
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, []);

  // 新頁顯示後，進度條補滿並淡出；轉頁失敗（例如斷網）時 15 秒後自動收起
  useEffect(() => {
    if (loadingFrom === null) return;
    const t = window.setTimeout(() => setLoadingFrom(null), done ? 350 : 15000);
    return () => window.clearTimeout(t);
  }, [loadingFrom, done]);

  if (loadingFrom === null) return null;
  return (
    <div aria-hidden="true" className="pointer-events-none fixed inset-x-0 top-0 z-50 h-0.5">
      <style>{"@keyframes resoul-nav-progress{from{width:0}to{width:80%}}"}</style>
      <div
        className="h-full bg-[var(--gold)]"
        style={
          done
            ? { width: "100%", opacity: 0, transition: "width 200ms ease-out, opacity 300ms ease-out 100ms" }
            : { width: "80%", animation: "resoul-nav-progress 6s cubic-bezier(0.1, 0.7, 0.3, 1)" }
        }
      />
    </div>
  );
}
