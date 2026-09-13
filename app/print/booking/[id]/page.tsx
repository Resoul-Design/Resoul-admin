import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getStaff } from "@/lib/auth";
import { COMPANY, PLAN_CODES } from "@/lib/company";
import { PrintButton } from "../../_print-button";

export const dynamic = "force-dynamic";

const money = (n: number) => "HK$" + Number(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

type Item = {
  code: string;
  desc: string;
  unit: number;
  qty: number;
  detail?: { label: string; value: string }[];
};

// 由 notes 抽出欄位（前端問卷格式：以「｜」分隔，部分為「標籤：值」）
function parseNotes(notes?: string | null) {
  const parts = (notes || "").split("｜").map((s) => s.trim()).filter(Boolean);
  const get = (label: string) => {
    const seg = parts.find((p) => p.startsWith(label));
    return seg ? seg.slice(label.length).replace(/^[:：]\s*/, "").trim() : "";
  };
  const weight = parts.find((p) => /kg/i.test(p) && !/[:：]/.test(p)) || "";
  const ref = get("Ref");
  return {
    ref,
    weight,
    timePref: get("希望時段"),
    petName: get("毛孩名字"),
    remark: get("備註"),
  };
}

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
    const n = parseNotes(b.notes);
    const planFull = (b.plan || "") + (pc?.en ? ` ${pc.en}` : "");
    const title = planFull
      ? planFull + (n.weight ? ` - ${n.weight}` : "")
      : "寵物火化服務";
    const detail = [
      { label: "payment_ref", value: b.payment_ref || n.ref },
      { label: "旅程", value: b.plan || "" },
      { label: "體重", value: n.weight },
      { label: "毛孩名字", value: b.pet_name || n.petName },
      { label: "主人稱呼", value: b.owner_name || "" },
      { label: "聯絡電話", value: b.contact || "" },
      { label: "希望日期", value: b.service_date || "" },
      { label: "希望時段", value: n.timePref },
      { label: "接送地址", value: b.pickup_address || "-" },
      { label: "備註", value: n.remark || "-" },
    ].filter((d) => d.value);
    items = [
      {
        code: pc?.code || "",
        desc: title,
        unit,
        qty: 1,
        detail,
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
    <div className="min-h-screen bg-white text-[#3b2f27] py-6 sm:py-8 px-3 sm:px-4 flex justify-center">
      <style>{`
        @media print { .no-print{display:none!important} html,body{background:#fff!important} }
        @page { margin: 10mm; }
      `}</style>
      <PrintButton />

      <div className="w-full max-w-[820px] border border-[#cfc4b0] p-1.5 sm:p-2">
        <div className="border border-[#e6dccb] px-4 sm:px-8 py-6 sm:py-8">
          {/* 抬頭 */}
          <div className="flex items-start justify-between gap-3 mb-6 sm:mb-8">
            <div className="border border-[#cfc4b0] rounded-2xl px-4 sm:px-6 py-2.5 sm:py-3">
              <div className="text-xl sm:text-3xl tracking-[0.15em] text-[#6f6156]" style={{ fontFamily: "'Noto Serif TC',serif" }}>
                {titleEn}
              </div>
            </div>
            <div className="text-right shrink-0">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/resoul-wordmark.png" alt={COMPANY.name} className="h-9 sm:h-12 w-auto inline-block" />
              <div className="brand-slogan text-[10px] sm:text-xs text-[#6f6156] mt-1">{COMPANY.tagline}</div>
            </div>
          </div>

          {/* 客戶 + 單號 */}
          <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4 sm:gap-6 mb-6 sm:mb-8">
            <div className="border border-[#cfc4b0] rounded-2xl px-4 sm:px-5 py-4 text-sm w-full sm:min-w-[320px] sm:w-auto">
              <div className="grid grid-cols-[92px_1fr] gap-y-1">
                <span className="text-[#6f6156]">Issued to:</span>
                <span>{b.owner_name || "—"}</span>
                <span className="text-[#6f6156]">Owner of:</span>
                <span>{b.pet_name || "—"}{b.pet_type ? `（${b.pet_type}）` : ""}</span>
                <span className="text-[#6f6156]">Phone number:</span>
                <span>{b.contact || "—"}</span>
              </div>
            </div>
            <div className="text-sm text-left sm:text-right pt-1 sm:pt-2">
              <div className="grid grid-cols-[auto_1fr] sm:grid-cols-[auto_auto] gap-x-3 gap-y-1 sm:justify-end">
                <span className="text-[#6f6156]">{noLabel}</span>
                <span className="font-medium">{docNo}</span>
                <span className="text-[#6f6156]">Date:</span>
                <span>{today}</span>
              </div>
            </div>
          </div>

          {/* 項目表 */}
          <div className="overflow-x-auto -mx-1 sm:mx-0">
          <table className="w-full text-sm mb-2 min-w-[480px]">
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
                  <td className="py-2.5 align-top">
                    <div>{it.desc}</div>
                    {it.detail && it.detail.length > 0 && (
                      <div className="mt-1 text-xs text-[#8a7d70] leading-relaxed">
                        {it.detail.map((d, j) => (
                          <div key={j}>
                            {d.label}: {d.value}
                          </div>
                        ))}
                      </div>
                    )}
                  </td>
                  <td className="py-2.5 align-top text-right tabular-nums">{money(it.unit)}</td>
                  <td className="py-2.5 align-top text-center tabular-nums">{it.qty}</td>
                  <td className="py-2.5 align-top text-right tabular-nums">{money(it.unit * it.qty)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>

          {/* REMARKS + 合計 */}
          <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-6 sm:gap-8 mt-10 sm:mt-16">
            <div className="text-sm sm:max-w-[46%] order-2 sm:order-1">
              <div className="text-[#6f6156] tracking-wide mb-1">REMARKS</div>
              <div className="whitespace-pre-wrap">
                {b.notes && !b.notes.startsWith("付款問卷") ? b.notes : "—"}
              </div>
            </div>
            <div className="text-sm w-full sm:w-[280px] order-1 sm:order-2">
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
