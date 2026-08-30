import { redirect } from "next/navigation";
import Link from "next/link";
import { getStaff } from "@/lib/auth";

const NAV = [
  { href: "/", label: "總覽", icon: "◆" },
  { href: "/bookings", label: "預約火化", icon: "✦" },
  { href: "/board", label: "留言板審核", icon: "✎" },
  { href: "/orders", label: "客戶訂單", icon: "▣", soon: true },
  { href: "/inventory", label: "倉存 · 出貨", icon: "▦", soon: true },
  { href: "/articles", label: "文章記錄", icon: "❋", soon: true },
  { href: "/staff", label: "員工排更", icon: "☷", soon: true },
];

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const staff = await getStaff();
  if (!staff) redirect("/login");

  return (
    <div className="min-h-screen flex">
      <aside className="w-56 shrink-0 bg-[var(--card)] border-r border-[var(--line)] flex flex-col">
        <div className="px-5 py-5 border-b border-[var(--line)]">
          <div className="text-xl font-semibold text-[var(--gold)]">Resoul</div>
          <div className="text-xs text-[var(--soft)] mt-0.5">後台管理</div>
        </div>

        <nav className="flex-1 px-3 py-3 space-y-0.5">
          {NAV.map((item) => (
            <Link
              key={item.href}
              href={item.soon ? "#" : item.href}
              aria-disabled={item.soon}
              className={
                "flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition " +
                (item.soon
                  ? "text-[var(--soft)]/50 pointer-events-none"
                  : "text-[var(--ink)] hover:bg-[var(--head)]")
              }
            >
              <span className="text-[var(--gold)] w-4 text-center">{item.icon}</span>
              <span>{item.label}</span>
              {item.soon && (
                <span className="ml-auto text-[10px] text-[var(--soft)]/60">即將</span>
              )}
            </Link>
          ))}
        </nav>

        <div className="px-4 py-4 border-t border-[var(--line)]">
          <div className="text-sm text-[var(--ink)] truncate">
            {staff.name || staff.email}
          </div>
          <div className="text-xs text-[var(--soft)] mb-3">
            {staff.role === "admin" ? "管理員" : "員工"}
          </div>
          <form action="/auth/signout" method="post">
            <button className="text-xs text-[var(--soft)] hover:text-[var(--ink)] underline underline-offset-2">
              登出
            </button>
          </form>
        </div>
      </aside>

      <main className="flex-1 min-w-0 px-8 py-7 overflow-x-auto">{children}</main>
    </div>
  );
}
