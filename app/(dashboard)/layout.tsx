import { redirect } from "next/navigation";
import { getStaff } from "@/lib/auth";
import { TopNav } from "./_topnav";
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
    <div className="min-h-screen flex flex-col">
      {/* 頂部：品牌 + 水平導覽（桌面）／漢堡（手機）+ 使用者選單 */}
      <header className="sticky top-0 z-30 bg-[var(--card)] border-b border-[var(--line)]">
        <div className="flex items-center gap-3 px-4 md:px-6 py-2.5">
          <div className="flex items-center gap-2 lg:hidden">
            <MobileMenu allowed={allowed} />
          </div>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/resoul-wordmark.png" alt="Resoul" className="h-8 w-auto shrink-0" />
          <nav className="hidden lg:flex flex-1 min-w-0">
            <TopNav allowed={allowed} />
          </nav>
          <div className="flex-1 lg:hidden" />
          <div className="shrink-0">
            <UserMenu name={displayName} role={roleLabel} />
          </div>
        </div>
      </header>

      <main className="flex-1 min-w-0 w-full max-w-[1400px] mx-auto px-4 md:px-6 py-6 md:py-8">
        {children}
      </main>
    </div>
  );
}
