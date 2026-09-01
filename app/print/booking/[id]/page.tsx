import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getStaff } from "@/lib/auth";
import { COMPANY } from "@/lib/company";
import { PrintButton } from "../../_print-button";

export const dynamic = "force-dynamic";

const money = (n: number) => "$" + Math.round(n).toLocaleString();

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
  const { data: b } = await supabase
    .from("cremation_bookings")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (!b) {
    return <div className="p-10 text-center text-[var(--soft)]">找不到此預約記錄。</div>;
  }

  const { data: pp } = b.plan
    ? await supabase.from("plan_prices").select("price").eq("plan", b.plan).maybeSingle()
    : { data: null };
  const unit = b.amount ?? pp?.price ?? 0;
  const isReceipt = type === "receipt";
  const title = isReceipt ? "收據" : "報價單";
  const titleEn = isReceipt ? "RECEIPT" : "QUOTATION";
  const today = new Date().toLocaleDateString("zh-HK", { year: "numeric", month: "long", day: "numeric" });

  return (
    <div className="min-h-screen bg-white text-[var(--ink)] py-10 px-4 flex justify-center">
      <style>{`
        @media print { .no-print{display:none!important} html,body{background:#fff!important} }
        @page { margin: 16mm; }
      `}</style>
      <PrintButton />

      <div className="w-full max-w-[720px]">
        {/* 抬頭 */}
        <div className="flex items-start justify-between border-b-2 border-[var(--gold)] pb-4 mb-6">
          <div>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/resoul-wordmark.png" alt={COMPANY.name} className="h-11 w-auto" />
            <div className="brand-slogan text-sm text-[var(--soft)] mt-1">{COMPANY.tagline}</div>
          </div>
          <div className="text-right text-xs text-[var(--soft)] leading-relaxed">
            <div>{COMPANY.address}</div>
            <div>電話：{COMPANY.tel}</div>
            <div>電郵：{COMPANY.email}</div>
            {COMPANY.br && <div>商業登記：{COMPANY.br}</div>}
          </div>
        </div>

        {/* 標題 + 編號 */}
        <div className="flex items-end justify-between mb-6">
          <div>
            <div className="text-2xl font-semibold">{title}</div>
            <div className="text-xs text-[var(--soft)] tracking-widest">{titleEn}</div>
          </div>
          <div className="text-right text-sm">
            <div>編號：<span className="font-medium">{b.case_no || "—"}</span></div>
            <div className="text-[var(--soft)]">日期：{today}</div>
          </div>
        </div>

        {/* 客戶 */}
        <div className="grid grid-cols-2 gap-6 mb-6 text-sm">
          <div>
            <div className="text-xs text-[var(--soft)] mb-1">客戶</div>
            <div className="font-medium">{b.owner_name || "—"}</div>
            {b.contact && <div className="text-[var(--soft)]">{b.contact}</div>}
            {b.pickup_address && <div className="text-[var(--soft)]">{b.pickup_address}</div>}
          </div>
          <div>
            <div className="text-xs text-[var(--soft)] mb-1">服務資料</div>
            <div>毛孩：{b.pet_name || "—"}{b.pet_type ? `（${b.pet_type}）` : ""}</div>
            {b.service_date && (
              <div className="text-[var(--soft)]">
                服務日期：{b.service_date}{b.service_time ? " " + b.service_time.slice(0, 5) : ""}
              </div>
            )}
          </div>
        </div>

        {/* 項目 */}
        <table className="w-full text-sm mb-4 border border-[var(--line)]">
          <thead>
            <tr className="bg-[var(--head)] text-left">
              <th className="px-3 py-2 font-medium">項目</th>
              <th className="px-3 py-2 font-medium text-center w-16">數量</th>
              <th className="px-3 py-2 font-medium text-right w-28">單價</th>
              <th className="px-3 py-2 font-medium text-right w-28">金額</th>
            </tr>
          </thead>
          <tbody>
            <tr className="border-t border-[var(--line)]">
              <td className="px-3 py-2">
                寵物火化服務{b.plan ? ` · ${b.plan}` : ""}
                {b.pet_name ? `（${b.pet_name}）` : ""}
              </td>
              <td className="px-3 py-2 text-center">1</td>
              <td className="px-3 py-2 text-right tabular-nums">{money(unit)}</td>
              <td className="px-3 py-2 text-right tabular-nums">{money(unit)}</td>
            </tr>
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-[var(--gold)] bg-[var(--cream)]/40">
              <td colSpan={3} className="px-3 py-2 text-right font-medium">總計</td>
              <td className="px-3 py-2 text-right font-semibold tabular-nums">{money(unit)}</td>
            </tr>
          </tfoot>
        </table>

        {b.notes && (
          <div className="text-sm mb-6">
            <span className="text-[var(--soft)]">備註：</span>
            {b.notes}
          </div>
        )}

        {/* 條款 / 簽署 */}
        <div className="text-xs text-[var(--soft)] leading-relaxed border-t border-[var(--line)] pt-4 mt-8">
          {isReceipt ? (
            <p>本收據確認上述款項已收妥。多謝惠顧，願毛孩安詳。</p>
          ) : (
            <p>本報價單有效期 14 天。實際安排以雙方確認為準。金額以港幣計算。</p>
          )}
          <div className="grid grid-cols-2 gap-10 mt-10">
            <div className="border-t border-[var(--ink)] pt-1">客戶簽署</div>
            <div className="border-t border-[var(--ink)] pt-1">{COMPANY.name} 代表</div>
          </div>
        </div>
      </div>
    </div>
  );
}
