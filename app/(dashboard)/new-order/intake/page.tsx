import { redirect } from "next/navigation";
import Link from "next/link";
import { getStaff, hasModule } from "@/lib/auth";
import { PageHeader, headerLinkClass } from "../../_page-header";
import { IntakeForm } from "./intake-form";

export const dynamic = "force-dynamic";

export default async function IntakePage() {
  const staff = await getStaff();
  if (!staff) redirect("/login");
  const allowed = hasModule(staff, ["deposits"]) && hasModule(staff, ["bookings"]);
  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader title="試算表預檢開單">
        <Link href="/new-order" className={headerLinkClass}>返回開新單</Link>
      </PageHeader>
      {allowed ? <IntakeForm /> : <p className="rounded-2xl border border-[var(--line)] bg-[var(--card)] p-6 text-sm text-[var(--soft)]">需要同時有接送服務及火化預約權限。</p>}
    </div>
  );
}