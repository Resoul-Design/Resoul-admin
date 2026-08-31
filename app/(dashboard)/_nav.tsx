"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

type Item = { label: string; href: string; soon?: boolean };
type Group = {
  label: string;
  icon: string;
  href?: string;
  soon?: boolean;
  children?: Item[];
};

export const GROUPS: Group[] = [
  { label: "總覽", icon: "◆", href: "/" },
  {
    label: "火化服務",
    icon: "✦",
    children: [
      { label: "客戶預約火化記錄", href: "/bookings" },
      { label: "安排火化服務", href: "/schedule" },
    ],
  },
  {
    label: "留言審核",
    icon: "✎",
    children: [
      { label: "照顧誌留言", href: "/board/blog" },
      { label: "同路人留言板", href: "/board/community" },
    ],
  },
  {
    label: "紀念產品管理",
    icon: "▣",
    children: [
      { label: "客戶訂單", href: "/orders" },
      { label: "倉存 · 出貨", href: "/inventory" },
    ],
  },
  {
    label: "宣傳管理",
    icon: "❋",
    children: [{ label: "文章記錄", href: "/articles" }],
  },
  {
    label: "員工排更",
    icon: "☷",
    children: [
      { label: "員工管理", href: "/staff" },
      { label: "排更表", href: "/staff/roster" },
      { label: "任務指派", href: "/staff/tasks" },
    ],
  },
  { label: "客戶檔案", icon: "☺", href: "/crm" },
  { label: "財務管理", icon: "＄", href: "/finance" },
  { label: "報表與匯出", icon: "▤", href: "/reports" },
];

function isActive(path: string, href: string) {
  if (href === "/") return path === "/";
  return path === href;
}
function groupActive(path: string, g: Group) {
  if (g.href) return isActive(path, g.href);
  return (g.children || []).some((c) => isActive(path, c.href));
}

export function NavLinks({ onNavigate }: { onNavigate?: () => void }) {
  const path = usePathname();
  const [open, setOpen] = useState<Record<string, boolean>>(() => {
    const init: Record<string, boolean> = {};
    for (const g of GROUPS) if (g.children && groupActive(path, g)) init[g.label] = true;
    return init;
  });

  return (
    <nav className="flex-1 px-3 py-3 space-y-0.5 overflow-y-auto">
      {GROUPS.map((g) => {
        // 單一項目（總覽、員工排更）
        if (!g.children) {
          const active = isActive(path, g.href!);
          return (
            <Link
              key={g.label}
              href={g.soon ? "#" : g.href!}
              aria-disabled={g.soon}
              onClick={onNavigate}
              className={
                "flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition " +
                (g.soon
                  ? "text-[var(--faint)] pointer-events-none"
                  : active
                  ? "bg-[var(--gold)] text-white"
                  : "text-[var(--ink)] hover:bg-[var(--cream)]")
              }
            >
              <span className={"w-4 text-center " + (active ? "text-white" : "text-[var(--gold)]")}>
                {g.icon}
              </span>
              <span>{g.label}</span>
              {g.soon && <span className="ml-auto text-[10px] text-[var(--faint)]">即將</span>}
            </Link>
          );
        }

        // 有子項的分類（手風琴）
        const gActive = groupActive(path, g);
        const isOpen = open[g.label] ?? gActive;
        return (
          <div key={g.label}>
            <button
              onClick={() => setOpen((o) => ({ ...o, [g.label]: !isOpen }))}
              className={
                "w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition " +
                (gActive
                  ? "text-[var(--ink)] font-medium"
                  : "text-[var(--ink)] hover:bg-[var(--cream)]")
              }
            >
              <span className="w-4 text-center text-[var(--gold)]">{g.icon}</span>
              <span>{g.label}</span>
              <span
                className={
                  "ml-auto text-[10px] text-[var(--soft)] transition-transform " +
                  (isOpen ? "rotate-90" : "")
                }
              >
                ▸
              </span>
            </button>
            {isOpen && (
              <div className="ml-[22px] pl-3 border-l border-[var(--line)] space-y-0.5 py-1">
                {g.children.map((c) => {
                  const active = isActive(path, c.href);
                  return (
                    <Link
                      key={c.href}
                      href={c.href}
                      onClick={onNavigate}
                      className={
                        "block px-3 py-1.5 rounded-lg text-sm transition " +
                        (active
                          ? "bg-[var(--gold)] text-white"
                          : "text-[var(--soft)] hover:bg-[var(--cream)] hover:text-[var(--ink)]")
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
    </nav>
  );
}
