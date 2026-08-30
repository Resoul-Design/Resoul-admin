import Link from "next/link";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

function today() {
  return new Date().toISOString().slice(0, 10);
}

export default async function OverviewPage() {
  const supabase = await createClient();

  const [heldPosts, crisisPosts, todaysBookings, activeBookings] =
    await Promise.all([
      supabase
        .from("posts")
        .select("*", { count: "exact", head: true })
        .eq("status", "held"),
      supabase
        .from("posts")
        .select("*", { count: "exact", head: true })
        .eq("status", "held")
        .eq("crisis_flag", true),
      supabase
        .from("cremation_bookings")
        .select("*", { count: "exact", head: true })
        .eq("service_date", today()),
      supabase
        .from("cremation_bookings")
        .select("*", { count: "exact", head: true })
        .not("status", "in", "(completed,cancelled)"),
    ]);

  const cards = [
    { label: "今日預約服務", value: todaysBookings.count ?? 0, href: "/bookings" },
    { label: "進行中預約", value: activeBookings.count ?? 0, href: "/bookings" },
    { label: "待審留言", value: heldPosts.count ?? 0, href: "/board" },
    {
      label: "危機留言（待跟進）",
      value: crisisPosts.count ?? 0,
      href: "/board",
      alert: (crisisPosts.count ?? 0) > 0,
    },
  ];

  return (
    <div>
      <h1 className="text-2xl font-semibold mb-1">總覽</h1>
      <p className="text-sm text-[var(--soft)] mb-7">{today()}</p>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {cards.map((c) => (
          <Link
            key={c.label}
            href={c.href}
            className={
              "block rounded-2xl border p-5 bg-[var(--card)] hover:shadow-sm transition " +
              (c.alert ? "border-red-300" : "border-[var(--line)]")
            }
          >
            <div className="text-sm text-[var(--soft)] mb-2">{c.label}</div>
            <div
              className={
                "text-3xl font-semibold " +
                (c.alert ? "text-red-600" : "text-[var(--ink)]")
              }
            >
              {c.value}
            </div>
          </Link>
        ))}
      </div>

      <p className="text-xs text-[var(--soft)] mt-8 leading-relaxed">
        提示：訂單、倉存、文章模組需先設定 Shopify Admin API（見 README）。
        危機留言請優先於「留言板審核」跟進。
      </p>
    </div>
  );
}
