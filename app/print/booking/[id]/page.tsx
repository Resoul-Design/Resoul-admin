import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getStaff } from "@/lib/auth";
import { COMPANY, PLAN_CODES } from "@/lib/company";
import { PrintButton } from "../../_print-button";

export const dynamic = "force-dynamic";

const money = (n: number) => "HK$" + Number(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

type Item = { code: string; desc: string; unit: number; qty: number };

export default async function BookingDocPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ type?: string }>;
}) {
  if (!(await getStaff())) redirect("/login");
  const { id } = await params;
  const { type = "quote" } = await searchParams;

  const supabase = await createClient();
  const [{ data: b }, { data: entriesData }] = await Promise.all([
    supabase.from("cremation_bookings").select("*").eq("id", id).maybeSingle(),
    supabase
      .from("project_entries")
      .select("kind, description, amount")
      .eq("booking_id", id)
      .eq("kind", "income")
      .order("created_at", { ascending: true }),
  ]);

  if (!b) {
    return <div className="p-10 text-center text-[var(--soft)]">找不到此預約記錄。</div>;
  }

  // 項目：優先用專案收入明細；否則以方案作單一項目
  const incomeEntries = (entriesData ?? []) as { description: string; amount: number }[];
  let items: Item[] = [];
  if (incomeEntries.length > 0) {
    items = incomeEntries.map((e) => ({ code: "", desc: e.description, unit: e.amount || 0, qty: 1 }));
  } else {
    const { data: pp } = b.plan
      ? await supabase.from("plan_prices").select("price").eq("plan", b.plan).maybeSingle()
      : { data: null };
    const unit = b.amount ?? b.payment_amount ?? pp?.price ?? 0;
    const pc = b.plan ? PLAN_CODES[b.plan] : undefined;
    items = [
      {
        code: pc?.code || "",
        desc: (pc?.en ? pc.en : "寵物火化服務") + (b.plan ? `（${b.plan}）` : ""),
        unit,
        qty: 1,
      },
    ];
  }

  const total = items.reduce((n, it) => n + it.unit * it.qty, 0);
  const discount = 0;
  const deposits = type === "receipt" ? total : 0;
  const balance = total - discount - deposits;

  const isReceipt = type === "receipt";
  const titleEn = type === "invoice" ? "INVOICE" : isReceipt ? "RECEIPT" : "QUOTATION";
  const noLabel = type === "invoice" ? "Invoice No.:" : isReceipt ? "Receipt No.:" : "Quotation No.:";
  const docNo = b.shopify_order_name || b.case_no || b.id.slice(0, 8);
  const today = new Date().toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });

  return (
    <div className="min-h-screen bg-white text-[#3b2f27] py-8 px-4 flex justify-center">
      <style>{`
        @media print { .no-print{display:none!important} html,body{background:#fff!important} }
        @page { margin: 10mm; }
      `}</style>
      <PrintButton />

      <div className="w-full max-w-[820px] border border-[#cfc4b0] p-2">
        <div className="border border-[#e6dccb] px-8 py-8">
          {/* 抬頭 */}
          <div className="flex items-start justify-between mb-8">
            <div className="border border-[#cfc4b0] rounded-2xl px-6 py-3">
              <div className="text-3xl tracking-[0.15em] text-[#6f6156]" style={{ fontFamily: "'Noto Serif TC',serif" }}>
                {titleEn}
              </div>
            </div>
            <div className="text-right">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/resoul-wordmark.png" alt={COMPANY.name} className="h-12 w-auto inline-block" />
              <div className="brand-slogan text-xs text-[#6f6156] mt-1">{COMPANY.tagline}</div>
            </div>
          </div>

          {/* 客戶 + 單號 */}
          <div className="flex items-start justify-between gap-6 mb-8">
            <div className="border border-[#cfc4b0] rounded-2xl px-5 py-4 text-sm min-w-[320px]">
              <div className="grid grid-cols-[92px_1fr] gap-y-1">
                <span className="text-[#6f6156]">Issued to:</span>
                <span>{b.owner_name || "—"}</span>
                <span className="text-[#6f6156]">Owner of:</span>
                <span>{b.pet_name || "—"}{b.pet_type ? `（${b.pet_type}）` : ""}</span>
                <span className="text-[#6f6156]">Phone number:</span>
                <span>{b.contact || "—"}</span>
              </div>
            </div>
            <div className="text-sm text-right whitespace-nowrap pt-2">
              <div className="grid grid-cols-[auto_auto] gap-x-3 gap-y-1 justify-end">
                <span className="text-[#6f6156]">{noLabel}</span>
                <span className="font-medium">{docNo}</span>
                <span className="text-[#6f6156]">Date:</span>
                <span>{today}</span>
              </div>
            </div>
          </div>

          {/* 項目表 */}
          <table className="w-full text-sm mb-2">
            <thead>
              <tr className="text-left text-[#6f6156] tracking-wide">
                <th className="py-2 font-medium w-24">ITEM CODE</th>
                <th className="py-2 font-medium">DESCRIPTION</th>
                <th className="py-2 font-medium text-right w-28">UNIT PRICE</th>
                <th className="py-2 font-medium text-center w-14">QTY</th>
                <th className="py-2 font-medium text-right w-28">SUBTOTAL</th>
              </tr>
            </thead>
            <tbody>
              {items.map((it, i) => (
                <tr key={i}>
                  <td className="py-2.5 align-top">{it.code || ""}</td>
                  <td className="py-2.5 align-top">{it.desc}</td>
                  <td className="py-2.5 align-top text-right tabular-nums">{money(it.unit)}</td>
                  <td className="py-2.5 align-top text-center tabular-nums">{it.qty}</td>
                  <td className="py-2.5 align-top text-right tabular-nums">{money(it.unit * it.qty)}</td>
                </tr>
              ))}
            </tbody>
          </table>

          {/* REMARKS + 合計 */}
          <div className="flex items-start justify-between gap-8 mt-16">
            <div className="text-sm max-w-[46%]">
              <div className="text-[#6f6156] tracking-wide mb-1">REMARKS</div>
              <div className="whitespace-pre-wrap">{b.notes || ""}</div>
            </div>
            <div className="text-sm w-[280px]">
              <div className="flex justify-between py-1">
                <span className="text-[#6f6156]">TOTAL</span>
                <span className="tabular-nums">{money(total)}</span>
              </div>
              <div className="flex justify-between py-1">
                <span className="text-[#6f6156]">DISCOUNT</span>
                <span className="tabular-nums">{money(discount)}</span>
              </div>
              <div className="flex justify-between py-1">
                <span className="text-[#6f6156]">DEPOSITS</span>
                <span className="tabular-nums">{money(deposits)}</span>
              </div>
              <div className="flex justify-between py-1.5 mt-1 border-t border-[#cfc4b0] font-semibold">
                <span>BALANCE TO SETTLE</span>
                <span className="tabular-nums">{money(balance)}</span>
              </div>
            </div>
          </div>

          {/* 簽署 */}
          <div className="flex justify-end mt-10">
            <div className="text-right">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/resoul-signature.png" alt={COMPANY.name} className="h-14 w-auto inline-block" />
              <div className="text-xs tracking-[0.25em] text-[#6f6156] mt-1">THANK YOU</div>
            </div>
          </div>

          {/* 頁尾 */}
          <div className="text-center text-xs text-[#6f6156] mt-8 leading-relaxed">
            <p>{COMPANY.footer}</p>
            <p className="mt-1">{COMPANY.web} | {COMPANY.ig} | {COMPANY.tel} | {COMPANY.email}</p>
          </div>
        </div>
      </div>
    </div>
  );
}
