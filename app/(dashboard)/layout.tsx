import { redirect } from "next/navigation";
import { getStaff } from "@/lib/auth";
import { NavLinks } from "./_nav";
import { UserMenu } from "./_usermenu";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const staff = await getStaff();
  if (!staff) redirect("/login");

  const displayName = staff.name || staff.email;
  const roleLabel = staff.role === "admin" ? "管理員" : "員工";

  return (
    <div className="min-h-screen md:flex">
      {/* 桌面：左側欄（品牌 + 導覽） */}
      <aside className="hidden md:flex w-56 shrink-0 flex-col bg-[var(--card)] border-r border-[var(--line)]">
        <div className="px-5 py-5 border-b border-[var(--line)]">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/resoul-wordmark.png" alt="Resoul" className="h-9 w-auto" />
          <div className="text-xs text-[var(--soft)] mt-1.5">後台管理系統</div>
        </div>
        <NavLinks variant="side" />
      </aside>

      {/* 右側主區 */}
      <div className="flex-1 min-w-0 flex flex-col">
        {/* 頂部功能列（右上角使用者選單） */}
        <header className="sticky top-0 z-20 bg-[var(--card)] border-b border-[var(--line)]">
          <div className="flex items-center justify-between px-4 md:px-8 py-2.5">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/resoul-wordmark.png"
              alt="Resoul"
              className="h-7 w-auto md:hidden"
            />
            <div className="hidden md:block" />
            <UserMenu name={displayName} role={roleLabel} />
          </div>
          {/* 手機：橫向導覽 */}
          <div className="md:hidden border-t border-[var(--line)]">
            <NavLinks variant="top" />
          </div>
        </header>

        <main className="flex-1 min-w-0 px-5 md:px-8 py-6 md:py-8 overflow-x-auto">
          {children}
        </main>
      </div>
    </div>
  );
}
