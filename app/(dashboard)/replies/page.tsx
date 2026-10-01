import Link from "next/link";
import { createAdminClient } from "@/lib/supabase/admin";
import { getStaff } from "@/lib/auth";
import { LANDING_URL } from "@/lib/company";
import { canonicalProjectNo, projectNoFromNotes } from "@/lib/order-label";
import type { ReplyLang, ReplyRecord, ReplySnippet } from "@/lib/reply";
import { ReplyAssistant } from "./_assistant";

export const dynamic = "force-dynamic";

type RecordRow = {
  id: string;
  created_at: string;
  owner_name: string | null;
  contact: string | null;
  pet_name: string | null;
  service_date: string | null;
  service_time: string | null;
  notes: string | null;
  project_no?: string | null;
  case_no?: string | null;
  source?: string | null;
};

// 找不到專案編號時 canonicalProjectNo 回傳「—」，回覆時改為留空
const projectOf = (...candidates: Array<string | null | undefined>) => {
  const value = canonicalProjectNo(...candidates);
  return value === "—" ? "" : value;
};

const langOf = (notes: string | null): ReplyLang => (/Project no\./i.test(notes || "") ? "en" : "zh");

export default async function RepliesPage({ searchParams }: { searchParams: Promise<{ ref?: string }> }) {
  const { ref } = await searchParams;
  const supabase = createAdminClient();
  const [snippetsRes, depositsRes, bookingsRes, staff] = await Promise.all([
    supabase.from("reply_snippets").select("id, slug, category, title, zh, en, sort_order, active").eq("active", true).order("sort_order"),
    supabase
      .from("deposit_bookings")
      .select("id, created_at, owner_name, contact, pet_name, service_date, service_time, notes, project_no")
      .order("created_at", { ascending: false })
      .limit(300),
    supabase
      .from("cremation_bookings")
      .select("id, created_at, owner_name, contact, pet_name, service_date, service_time, notes, case_no, source")
      .order("created_at", { ascending: false })
      .limit(300),
    getStaff(),
  ]);

  const notReady = !!snippetsRes.error;
  const snippets = (snippetsRes.data ?? []) as ReplySnippet[];
  const records: ReplyRecord[] = [
    ...((depositsRes.data ?? []) as RecordRow[]).map((r) => ({
      ref: `deposit:${r.id}`,
      kind: "接送服務" as const,
      created_at: r.created_at,
      owner_name: r.owner_name,
      contact: r.contact,
      pet_name: r.pet_name,
      service_date: r.service_date,
      service_time: r.service_time,
      projectNo: projectOf(r.project_no, projectNoFromNotes(r.notes)),
      lang: langOf(r.notes),
    })),
    ...((bookingsRes.data ?? []) as RecordRow[]).map((r) => ({
      ref: `booking:${r.id}`,
      kind: ((r.source || "").includes("euthanasia") ? "獸醫評估" : "火化預約") as ReplyRecord["kind"],
      created_at: r.created_at,
      owner_name: r.owner_name,
      contact: r.contact,
      pet_name: r.pet_name,
      service_date: r.service_date,
      service_time: r.service_time,
      projectNo: projectOf(r.case_no, projectNoFromNotes(r.notes)),
      lang: langOf(r.notes),
    })),
  ].sort((a, b) => b.created_at.localeCompare(a.created_at));

  const staffName = staff?.name?.trim() || staff?.email?.split("@")[0] || "同事";

  return (
    <div>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">回覆助手</h1>
        <Link href="/replies/knowledge" className="rounded-lg border border-[var(--line)] bg-[var(--card)] px-3 py-2 text-sm hover:bg-[var(--cream)]">管理回覆知識庫</Link>
      </div>
      {notReady ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          未啟用回覆知識庫：請先於 Supabase（diyxcx）執行 <code>db/migration_reply_snippets.sql</code>。
        </div>
      ) : (
        <ReplyAssistant snippets={snippets} records={records} staffName={staffName} siteUrl={LANDING_URL} initialRef={ref || ""} />
      )}
    </div>
  );
}
