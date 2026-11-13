import { notFound, redirect } from "next/navigation";
import { getStaff, hasModule } from "@/lib/auth";
import { PageHeader } from "../_page-header";
import { DataCheckPanel } from "./_panel";

export const dynamic = "force-dynamic";

export default async function DataCheckPage() {
  const staff = await getStaff();
  if (!staff) redirect("/login");
  if (!hasModule(staff, ["sync"])) notFound();
  return (
    <div>
      <PageHeader title="資料核對" />
      <DataCheckPanel />
    </div>
  );
}
