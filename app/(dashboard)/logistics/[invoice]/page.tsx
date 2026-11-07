import { getStaff, hasModule } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { notFound, redirect } from "next/navigation";
import Link from "next/link";

export const dynamic = "force-dynamic";
export default async function LogisticsDetail({ params }: { params: Promise<{ invoice: string }> }) {
  const staff = await getStaff(); if (!staff) redirect("/login"); if (!hasModule(staff, ["logistics"])) notFound();
  const invoice = decodeURIComponent((await params).invoice);
  const { data, error } = await createAdminClient().from("logistics_orders").select("*").eq("invoice_no", invoice).maybeSingle();
  if (error || !data) notFound();
  const row = data as Record<string, unknown>;
  const entries = Object.entries(row).filter(([, value]) => value !== null && value !== "");
  return <div><div className="mb-5 flex items-center gap-3"><Link href="/logistics" className="text-sm text-[var(--gold)] hover:underline">← 物流客戶</Link><h1 className="text-2xl font-semibold">{invoice}</h1></div><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{entries.map(([key, value]) => <div key={key} className="rounded-xl border border-[var(--line)] bg-[var(--card)] p-4"><div className="text-xs text-[var(--soft)]">{key}</div><div className="mt-1 break-words text-sm">{String(value)}</div></div>)}</div></div>;
}

