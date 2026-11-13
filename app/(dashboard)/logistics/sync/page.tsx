import Link from "next/link";
import { getStaff, hasModule } from "@/lib/auth";
import { notFound, redirect } from "next/navigation";
import { ImportForm } from "./_import-form";

export default async function LogisticsSyncPage() {
  const staff = await getStaff(); if (!staff) redirect("/login"); if (!hasModule(staff, ["inventory"])) notFound();
  return (
    <div>
      <Link href="/logistics" className="text-sm text-[var(--gold)] hover:underline">← 客戶資料</Link>
      <h1 className="mt-4 text-2xl font-semibold">由 Excel 匯入</h1>
      <div className="mt-5 max-w-2xl rounded-2xl border border-[var(--line)] bg-[var(--card)] p-6 text-sm">
        <ol className="list-decimal space-y-1 pl-5 text-[var(--soft)]">
          <li>在 Excel／Google 試算表另存為 CSV（UTF-8）。第一行須為欄位名稱，並有「單號」欄。</li>
          <li>欄位名稱可用中文（與單號詳細頁相同）或欄位代號；可先 <a href="/api/logistics/sync" className="text-[var(--gold)] hover:underline">下載範本</a>。</li>
          <li>空白格不會覆蓋現有資料；只會更新有填的欄位。未有的單號會新增記錄。</li>
          <li>金額可含 $ 或逗號；日期接受 2026-11-08、2026/11/08 或 8/11/2026。</li>
          <li>Excel「Basic Info Logistic」及「Memorial Product Order Tracking」匯出的 CSV 可直接匯入；紀念品只會加入未有的項目。</li>
        </ol>
        <ImportForm />
      </div>
    </div>
  );
}
