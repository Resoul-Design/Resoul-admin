import { notFound, redirect } from "next/navigation";
import { getStaff, hasModule } from "@/lib/auth";
import { PageHeader } from "../_page-header";
import { listDiscounts } from "@/lib/discounts";
import { DiscountManager } from "./_manager";

export const dynamic = "force-dynamic";

export default async function DiscountsPage() {
  const staff = await getStaff();
  if (!staff) redirect("/login");
  if (!hasModule(staff, ["discounts"])) notFound();
  const { codes, error } = await listDiscounts(true);
  return (
    <div>
      <PageHeader title="優惠碼" />
      {error && <p className="mb-5 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">{error}</p>}
      <DiscountManager codes={codes} canEdit={!error} />
    </div>
  );
}
