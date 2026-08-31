import { redirect } from "next/navigation";
import { getStaff } from "@/lib/auth";
import { NavLinks } from "./_nav";
import { UserMenu } from "./_usermenu";
import { MobileMenu } from "./_mobilemenu";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const staff = await getStaff();
  if (!staff) redirect("/login");

  const displayName = staff.name || staff.email;
  const roleLabel = staff.role === "admin" ? "管理員" : "員工";
  const allowed = staff.role === "admin" ? null : staff.permissions || [];

  return (
    <div className="min-h-screen md:flex">
      {/* 桌面：左側欄（品牌 + 導覽） */}
      <aside className="hidden md:flex w-56 shrink-0 flex-col bg-[var(--card)] border-r border-[var(--line)]">
        <div className="px-5 py-5 border-b border-[var(--line)]">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/resoul-wordmark.png" alt="Resoul" className="h-9 w-auto" />
          <div className="text-xs text-[var(--soft)] mt-1.5">後台管理系統</div>
        </div>
        <NavLinks allowed={allowed} />
      </aside>

      {/* 右側主區 */}
      <div className="flex-1 min-w-0 flex flex-col">
        {/* 頂部功能列（左：手機漢堡選單；右：使用者選單） */}
        <header className="sticky top-0 z-20 bg-[var(--card)] border-b border-[var(--line)] relative">
          <div className="flex items-center justify-between px-4 md:px-8 py-2.5">
            <div className="flex items-center gap-2 md:hidden">
              <MobileMenu allowed={allowed} />
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/resoul-wordmark.png" alt="Resoul" className="h-7 w-auto" />
            </div>
            <div className="hidden md:block" />
            <UserMenu name={displayName} role={roleLabel} />
          </div>
        </header>

        <main className="flex-1 min-w-0 px-5 md:px-8 py-6 md:py-8 overflow-x-auto">
          {children}
        </main>
      </div>
    </div>
  );
}
