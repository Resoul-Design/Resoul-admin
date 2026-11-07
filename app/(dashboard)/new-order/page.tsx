import { redirect } from "next/navigation";
import { getStaff, hasModule } from "@/lib/auth";
import { loadCatalog } from "@/lib/catalog";
import { TIME_SLOTS } from "@/lib/deposit-followup";
import { loadSiteContent } from "@/lib/site-content-server";
import { createAdminClient } from "@/lib/supabase/admin";
import { ORDER_TYPES, type OrderType } from "@/lib/order-types";
import { PageHeader } from "../_page-header";
import { NewOrderForm, type NewOrderPrefill } from "./_form";

export const dynamic = "force-dynamic";

// 開新單：所有單類型的唯一入口（?type= 預選類型；?from=<單 id> 複製客人及類型為新單）
export default async function NewOrderPage({ searchParams }: { searchParams: Promise<{ type?: string; from?: string }> }) {
  const staff = await getStaff();
  if (!staff) redirect("/login");
  const allowed = ORDER_TYPES.filter((t) => hasModule(staff, [t.module])).map((t) => t.key);
  const { type, from } = await searchParams;

  const [cremation, deposit, souvenir, site] = await Promise.all([
    allowed.includes("cremation") ? loadCatalog("cremation") : { products: [], error: "" },
    allowed.includes("deposit") ? loadCatalog("deposit") : { products: [], error: "" },
    allowed.includes("product") || allowed.includes("cremation") ? loadCatalog("souvenir") : { products: [], error: "" },
    loadSiteContent(),
  ]);
  const vet = site.content["prices.vet"];

  const prefill: NewOrderPrefill = {};
  if (type && allowed.includes(type as OrderType)) prefill.type = type as OrderType;
  if (from && /^[0-9a-f-]{36}$/i.test(from)) {
    const { data: o } = await createAdminClient().from("company_orders").select("order_type, customer_name, phone, email, project_no, pet_name").eq("id", from).maybeSingle();
    if (o) Object.assign(prefill, { type: allowed.includes(o.order_type) ? o.order_type : undefined, name: o.customer_name, phone: o.phone || "", email: o.email || "", projectNo: o.project_no, petName: o.pet_name || "" });
  }

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader title="開新單" />
      {allowed.length ? (
        <NewOrderForm
          allowed={allowed}
          prefill={prefill}
          catalog={{
            cremation: cremation.products,
            deposit: deposit.products,
            souvenir: souvenir.products,
            error: [cremation.error, deposit.error, souvenir.error].filter(Boolean)[0] || "",
            vet: { base: vet.base, surcharges: vet.surcharges.map((s) => ({ zh: s.zh, price: s.price })) },
            slots: TIME_SLOTS.map((s) => ({ zh: s.zh, label: s.label })),
          }}
        />
      ) : (
        <p className="rounded-2xl border border-[var(--line)] bg-[var(--card)] p-6 text-sm text-[var(--soft)]">沒有開單權限，請管理員在「員工管理」開通。</p>
      )}
    </div>
  );
}
