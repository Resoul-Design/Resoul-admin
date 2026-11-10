"use client";

import { usePathname, useRouter } from "next/navigation";

// 每頁頂部「← 返回」：返回上一頁；直接開啟（沒有上一頁）時回到上一層或總覽
export function BackButton() {
  const pathname = usePathname();
  const router = useRouter();
  if (!pathname || pathname === "/") return null;
  function back() {
    if (window.history.length > 1 && document.referrer && new URL(document.referrer).origin === window.location.origin) return router.back();
    if (window.history.state && window.history.length > 1) return router.back();
    const parent = pathname.split("/").slice(0, -1).join("/") || "/";
    router.push(parent);
  }
  return (
    <button type="button" onClick={back} className="mb-3 inline-flex items-center gap-1 rounded-lg px-2 py-1 text-sm text-[var(--gold)] hover:bg-[var(--cream)]" aria-label="返回上一頁">
      ← 返回
    </button>
  );
}
