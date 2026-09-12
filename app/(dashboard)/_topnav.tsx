"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { keyForHref } from "@/lib/modules";
import { GROUPS } from "./_nav";

function isActive(path: string, href: string) {
  if (href === "/") return path === "/";
  return path === href || path.startsWith(href + "/");
}

// 桌面版：頂部水平導覽（有子項者為下拉選單）
export function TopNav({ allowed }: { allowed: string[] | null }) {
  const path = usePathname();
  const [openKey, setOpenKey] = useState<string | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpenKey(null);
      }
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);
  useEffect(() => {
    // 導航後收起下拉（用 rAF 避免在 effect 內同步 setState）
    const raf = requestAnimationFrame(() => setOpenKey(null));
    return () => cancelAnimationFrame(raf);
  }, [path]);

  const vis = (href: string) => {
    const k = keyForHref(href);
    return !k || allowed === null || allowed.includes(k);
  };

  return (
    <div ref={wrapRef} className="flex items-center gap-1">
      {GROUPS.map((g) => {
        // 單一項目
        if (!g.children) {
          if (!vis(g.href!)) return null;
          const active = isActive(path, g.href!);
          return (
            <Link
              key={g.label}
              href={g.href!}
              className={
                "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm whitespace-nowrap transition " +
                (active
                  ? "bg-[var(--gold)] text-white"
                  : "text-[var(--ink)] hover:bg-[var(--cream)]")
              }
            >
              <span className={active ? "text-white" : "text-[var(--gold)]"}>{g.icon}</span>
              <span>{g.label}</span>
            </Link>
          );
        }

        // 有子項：下拉
        const kids = g.children.filter((c) => vis(c.href));
        if (kids.length === 0) return null;
        const gActive = kids.some((c) => isActive(path, c.href));
        const isOpen = openKey === g.label;
        return (
          <div key={g.label} className="relative">
            <button
              onClick={() => setOpenKey(isOpen ? null : g.label)}
              className={
                "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm whitespace-nowrap transition " +
                (gActive || isOpen
                  ? "bg-[var(--cream)] text-[var(--ink)] font-medium"
                  : "text-[var(--ink)] hover:bg-[var(--cream)]")
              }
            >
              <span className="text-[var(--gold)]">{g.icon}</span>
              <span>{g.label}</span>
              <span className={"text-[10px] text-[var(--soft)] transition-transform " + (isOpen ? "rotate-180" : "")}>▾</span>
            </button>
            {isOpen && (
              <div className="absolute left-0 top-full mt-1 min-w-[200px] rounded-xl border border-[var(--line)] bg-[var(--card)] shadow-[var(--shadow)] py-1.5 z-40">
                {kids.map((c) => {
                  const active = isActive(path, c.href);
                  return (
                    <Link
                      key={c.href}
                      href={c.href}
                      onClick={() => setOpenKey(null)}
                      className={
                        "block px-4 py-2 text-sm whitespace-nowrap transition " +
                        (active
                          ? "bg-[var(--gold)] text-white"
                          : "text-[var(--ink)] hover:bg-[var(--cream)]")
                      }
                    >
                      {c.label}
                    </Link>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
