"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export const NAV = [
  { href: "/", label: "總覽", icon: "◆" },
  { href: "/bookings", label: "預約火化", icon: "✦" },
  { href: "/board", label: "留言板審核", icon: "✎" },
  { href: "/orders", label: "客戶訂單", icon: "▣" },
  { href: "/inventory", label: "倉存 · 出貨", icon: "▦" },
  { href: "/articles", label: "文章記錄", icon: "❋" },
  { href: "/staff", label: "員工排更", icon: "☷", soon: true },
];

function isActive(path: string, href: string) {
  if (href === "/") return path === "/";
  return path === href || path.startsWith(href + "/");
}

export function NavLinks({ variant }: { variant: "side" | "top" }) {
  const path = usePathname();

  if (variant === "top") {
    return (
      <nav className="flex gap-1.5 overflow-x-auto no-scrollbar px-4 pb-2.5">
        {NAV.map((item) => {
          const active = isActive(path, item.href);
          return (
            <Link
              key={item.href}
              href={item.soon ? "#" : item.href}
              aria-disabled={item.soon}
              className={
                "shrink-0 px-3 py-1.5 rounded-full text-sm whitespace-nowrap transition " +
                (item.soon
                  ? "text-[var(--faint)] pointer-events-none border border-[var(--line)]"
                  : active
                  ? "bg-[var(--gold)] text-white"
                  : "text-[var(--soft)] border border-[var(--line)] bg-[var(--card)]")
              }
            >
              {item.label}
              {item.soon && " ·即將"}
            </Link>
          );
        })}
      </nav>
    );
  }

  return (
    <nav className="flex-1 px-3 py-3 space-y-0.5">
      {NAV.map((item) => {
        const active = isActive(path, item.href);
        return (
          <Link
            key={item.href}
            href={item.soon ? "#" : item.href}
            aria-disabled={item.soon}
            className={
              "flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition " +
              (item.soon
                ? "text-[var(--faint)] pointer-events-none"
                : active
                ? "bg-[var(--gold)] text-white"
                : "text-[var(--ink)] hover:bg-[var(--cream)]")
            }
          >
            <span
              className={
                "w-4 text-center " + (active ? "text-white" : "text-[var(--gold)]")
              }
            >
              {item.icon}
            </span>
            <span>{item.label}</span>
            {item.soon && (
              <span className="ml-auto text-[10px] text-[var(--faint)]">即將</span>
            )}
          </Link>
        );
      })}
    </nav>
  );
}
