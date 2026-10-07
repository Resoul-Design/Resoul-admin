import { redirect } from "next/navigation";
import { getStaff } from "@/lib/auth";
import { loadInvoices } from "@/lib/invoices";
import { Invoice, INVOICE_CSS } from "./_invoice";
import { PrintButton } from "../_print-button";

export const dynamic = "force-dynamic";

// 發票（可列印或另存 PDF）：?refs=deposit:<id>,booking:<id>,order:<id>；或 ?from=YYYY-MM-DD&to=YYYY-MM-DD&kinds=deposit,cremation,vet,order
export default async function InvoicesPage({ searchParams }: { searchParams: Promise<{ refs?: string; from?: string; to?: string; kinds?: string | string[] }> }) {
  const staff = await getStaff();
  if (!staff) redirect("/login");
  const p = await searchParams;
  const kinds = (Array.isArray(p.kinds) ? p.kinds : (p.kinds || "").split(",")).map((k) => k.trim()).filter(Boolean);
  const docs = await loadInvoices({ refs: p.refs ? p.refs.split(",").map((r) => r.trim()).filter(Boolean) : undefined, from: p.from, to: p.to, kinds }, staff);
  const range = p.from && p.to ? `${p.from} 至 ${p.to}` : "";

  return (
    <div className="inv-wrap min-h-screen px-3 py-6">
      <style>{INVOICE_CSS}</style>
      <PrintButton />
      <div className="no-print mx-auto mb-2 max-w-[820px] text-sm text-[#6f6156]">
        {docs.length ? `共 ${docs.length} 張發票${range ? `（付款日期 ${range}）` : ""}。按「列印」並選擇「另存為 PDF」即可下載。` : "沒有符合的已付款記錄（只限已付款並有 Shopify 訂單號的記錄）。"}
      </div>
      {docs.map((d) => <Invoice key={d.ref} d={d} />)}
    </div>
  );
}
