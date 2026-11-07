import Link from "next/link";
import { getStaff, hasModule } from "@/lib/auth";
import { notFound, redirect } from "next/navigation";

export default async function LogisticsSyncPage() {
  const staff = await getStaff(); if (!staff) redirect("/login"); if (!hasModule(staff, ["inventory"])) notFound();
  return <div><Link href="/logistics" className="text-sm text-[var(--gold)] hover:underline">← 物流客戶</Link><h1 className="mt-4 text-2xl font-semibold">由 Excel 同步</h1><div className="mt-5 max-w-2xl rounded-2xl border border-[var(--line)] bg-[var(--card)] p-6"><p className="text-sm text-[var(--soft)]">請先將 Excel 另存為 CSV，再上傳。欄位名稱會原樣保留，錯誤會逐行列出。</p><form action="/api/logistics/sync" method="post" encType="multipart/form-data" className="mt-5 flex flex-wrap items-center gap-3"><input name="file" type="file" accept=".csv,text/csv" required className="text-sm" /><button className="rounded-lg bg-[var(--gold)] px-4 py-2 text-sm text-white">開始同步</button></form></div></div>;
}

