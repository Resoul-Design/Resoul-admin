import { redirect } from "next/navigation";
import { getStaff } from "@/lib/auth";
import { NavLinks } from "./_nav";

function SignOut({ className = "" }: { className?: string }) {
  return (
    <form action="/auth/signout" method="post">
      <button
        className={
          "text-xs text-[var(--soft)] hover:text-[var(--ink)] underline underline-offset-2 " +
          className
        }
      >
        登出
      </button>
    </form>
  );
}

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const staff = await getStaff();
  if (!staff) redirect("/login");

  return (
    <div className="min-h-screen md:flex">
      {/* 桌面：左側欄 */}
      <aside className="hidden md:flex w-56 shrink-0 flex-col bg-[var(--card)] border-r border-[var(--line)]">
        <div className="px-5 py-5 border-b border-[var(--line)]">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/resoul-wordmark.png" alt="Resoul" className="h-9 w-auto" />
          <div className="text-xs text-[var(--soft)] mt-1.5">後台管理系統</div>
        </div>

        <NavLinks variant="side" />

        <div className="px-4 py-4 border-t border-[var(--line)]">
          <div className="text-sm text-[var(--ink)] truncate">
            {staff.name || staff.email}
          </div>
          <div className="text-xs text-[var(--soft)] mb-3">
            {staff.role === "admin" ? "管理員" : "員工"}
          </div>
          <SignOut />
        </div>
      </aside>

      {/* 手機：頂部欄 + 橫向 nav */}
      <header className="md:hidden bg-[var(--card)] border-b border-[var(--line)] sticky top-0 z-20">
        <div className="flex items-center justify-between px-4 py-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/resoul-wordmark.png" alt="Resoul" className="h-7 w-auto" />
          <div className="flex items-center gap-3">
            <span className="text-xs text-[var(--soft)]">
              {staff.name || staff.email}
            </span>
            <SignOut />
          </div>
        </div>
        <NavLinks variant="top" />
      </header>

      <main className="flex-1 min-w-0 px-5 md:px-8 py-6 md:py-8 overflow-x-auto">
        {children}
      </main>
    </div>
  );
}
