"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { NavLinks } from "./_nav";

export function MobileMenu({ allowed }: { allowed: string[] | null }) {
  const [open, setOpen] = useState(false);
  const path = usePathname();

  // 導航後自動收起（用 rAF 避免在 effect 內同步 setState）
  useEffect(() => {
    const raf = requestAnimationFrame(() => setOpen(false));
    return () => cancelAnimationFrame(raf);
  }, [path]);

  return (
    <>
      <button
        onClick={() => setOpen((o) => !o)}
        aria-label="選單"
        className="p-2 -ml-1 rounded-lg hover:bg-[var(--cream)] text-[var(--ink)]"
      >
        <span className="block w-5 text-lg leading-none">{open ? "✕" : "☰"}</span>
      </button>

      {open && (
        <div className="absolute left-0 right-0 top-full border-t border-[var(--line)] bg-[var(--card)] max-h-[75vh] overflow-y-auto shadow-[var(--shadow)] z-30">
          <NavLinks onNavigate={() => setOpen(false)} allowed={allowed} />
        </div>
      )}
    </>
  );
}
