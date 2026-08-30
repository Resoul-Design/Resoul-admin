"use client";

import { useEffect, useState } from "react";

function greeting(h: number) {
  if (h < 6) return "夜深了";
  if (h < 12) return "早晨";
  if (h < 18) return "午安";
  return "晚上好";
}

export function Clock({ name }: { name: string }) {
  const [now, setNow] = useState<Date | null>(null);

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    const raf = requestAnimationFrame(() => setNow(new Date()));
    return () => {
      clearInterval(id);
      cancelAnimationFrame(raf);
    };
  }, []);

  // 首次伺服器渲染時避免時間不一致，等 client 掛載後才顯示
  if (!now) {
    return (
      <p className="text-sm text-[var(--soft)] h-5" aria-hidden>

      </p>
    );
  }

  const date = now.toLocaleDateString("zh-HK", {
    year: "numeric",
    month: "long",
    day: "numeric",
    weekday: "long",
  });
  const time = now.toLocaleTimeString("zh-HK", { hour12: false });

  return (
    <p className="text-sm text-[var(--soft)]">
      {greeting(now.getHours())}，{name}　·　{date}　·
      <span className="tabular-nums">{time}</span>
    </p>
  );
}
