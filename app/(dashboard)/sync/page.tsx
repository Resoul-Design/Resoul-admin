import { createAdminClient } from "@/lib/supabase/admin";
import { shopifyGraphQL, shopDomain } from "@/lib/shopify";
import { syncProductOrders } from "../orders/actions";

export const dynamic = "force-dynamic";

type State = "ok" | "warn" | "fail";
type Check = { label: string; state: State; detail: string };

const DOT: Record<State, string> = { ok: "bg-green-500", warn: "bg-amber-500", fail: "bg-red-500" };
const TXT: Record<State, string> = { ok: "正常", warn: "注意", fail: "未設定" };

function envSet(k: string) {
  const v = process.env[k];
  return typeof v === "string" && v.length > 0;
}

async function tableOk(sb: ReturnType<typeof createAdminClient>, table: string, column = "id") {
  try {
    const { error, count } = await sb.from(table).select(column, { count: "exact", head: true });
    return { ok: !error, count: count ?? 0, error: error?.message || "" };
  } catch (e) {
    return { ok: false, count: 0, error: e instanceof Error ? e.message : String(e) };
  }
}

export default async function SyncStatusPage() {
  const checks: Check[] = [];
  let sb: ReturnType<typeof createAdminClient> | null = null;
  try { sb = createAdminClient(); } catch { sb = null; }

  // 1) 環境變數（只檢查有沒有設定，不會顯示內容）
  const envs: [string, string][] = [
    ["NEXT_PUBLIC_SUPABASE_URL", "Supabase 網址"],
    ["NEXT_PUBLIC_SUPABASE_ANON_KEY", "Supabase 公開金鑰"],
    ["SUPABASE_SERVICE_ROLE_KEY", "Supabase 服務金鑰（機密）"],
    ["SHOPIFY_WEBHOOK_SECRET", "Shopify webhook 簽署密鑰"],
    ["SHOPIFY_ADMIN_API_TOKEN", "Shopify Admin API token"],
  ];
  for (const [k, label] of envs) {
    checks.push({ label: `環境變數：${label}`, state: envSet(k) ? "ok" : "fail", detail: envSet(k) ? `已設定（${k}）` : `未設定 ${k}` });
  }

  // 2) 資料表 / migration
  if (sb) {
    const po = await tableOk(sb, "product_orders");
    checks.push({ label: "資料表：product_orders", state: po.ok ? "ok" : "fail", detail: po.ok ? `${po.count} 筆產品訂單` : "未建立（請執行 migration_product_orders.sql）" });

    const oref = await tableOk(sb, "project_entries", "order_ref");
    checks.push({ label: "產品專案收支（project_entries.order_ref）", state: oref.ok ? "ok" : "warn", detail: oref.ok ? "已啟用" : "未啟用（請執行 migration_project_entries_orders.sql）" });

    const audit = await tableOk(sb, "audit_log");
    checks.push({ label: "審計記錄（audit_log）", state: audit.ok ? "ok" : "warn", detail: audit.ok ? `${audit.count} 條記錄` : "未啟用（請執行 migration_audit_log.sql）" });

    const pay = await tableOk(sb, "cremation_bookings", "payment_ref");
    checks.push({ label: "火化付款欄位（payment_ref 等）", state: pay.ok ? "ok" : "fail", detail: pay.ok ? "已啟用" : "未啟用（請執行 migration_payment_tracking.sql）" });
  } else {
    checks.push({ label: "資料庫連線", state: "fail", detail: "無法建立 Supabase 服務端連線（檢查 SUPABASE_SERVICE_ROLE_KEY）" });
  }

  // 3) Shopify Admin API 連線
  try {
    const d = await shopifyGraphQL<{ shop: { name: string } }>(`{ shop { name } }`);
    checks.push({ label: "Shopify Admin API 連線", state: "ok", detail: `已連線：${d.shop.name}（${shopDomain()}）` });
  } catch (e) {
    checks.push({ label: "Shopify Admin API 連線", state: "fail", detail: "連線失敗（檢查 SHOPIFY_ADMIN_API_TOKEN）：" + (e instanceof Error ? e.message.slice(0, 80) : "") });
  }

  // 4) 資料新鮮度 / webhook 運作跡象
  if (sb) {
    // 產品訂單最近同步
    const { data: poLatest } = await sb.from("product_orders").select("synced_at").order("synced_at", { ascending: false }).limit(1);
    const lastSync = poLatest?.[0]?.synced_at ? String(poLatest[0].synced_at).slice(0, 16).replace("T", " ") : "";
    checks.push({ label: "產品訂單最近同步時間", state: lastSync ? "ok" : "warn", detail: lastSync ? lastSync : "未有同步記錄（按「紀念品訂單 → 同步 Shopify 訂單」）" });

    // 火化 orders/paid webhook 運作跡象：有已付款預約被寫入訂單編號
    const total = await sb.from("cremation_bookings").select("id", { count: "exact", head: true });
    const stamped = await sb.from("cremation_bookings").select("id", { count: "exact", head: true }).not("shopify_order_name", "is", null);
    const st = stamped.count ?? 0;
    checks.push({
      label: "火化付款 webhook（orders/paid）跡象",
      state: st > 0 ? "ok" : "warn",
      detail: st > 0 ? `${st} 筆預約已由 Shopify 自動補上訂單編號` : "尚未見到自動補上的訂單編號；請確認 orders/paid webhook 與簽署密鑰",
    });
    checks.push({ label: "火化預約總數", state: "ok", detail: `${total.count ?? 0} 筆` });

    // 審計最近一條
    const { data: auditLatest, error: auditErr } = await sb.from("audit_log").select("created_at").order("created_at", { ascending: false }).limit(1);
    if (!auditErr) {
      const la = auditLatest?.[0]?.created_at ? String(auditLatest[0].created_at).slice(0, 16).replace("T", " ") : "";
      checks.push({ label: "審計記錄最近一條", state: la ? "ok" : "warn", detail: la || "尚無記錄" });
    }
  }

  const fails = checks.filter((c) => c.state === "fail").length;
  const warns = checks.filter((c) => c.state === "warn").length;
  const overall: State = fails > 0 ? "fail" : warns > 0 ? "warn" : "ok";

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold mb-1">同步狀態自我檢查</h1>
          <p className="text-sm text-[var(--soft)]">檢查 Shopify、Supabase、環境變數與 webhook 是否已正確連接。此頁只讀，不會顯示任何機密內容。</p>
        </div>
        <form action={syncProductOrders}>
          <button className="rounded-lg bg-[var(--gold)] px-4 py-2 text-sm font-medium text-white hover:opacity-90 whitespace-nowrap">
            ⟳ 立即同步 Shopify 訂單
          </button>
        </form>
      </div>

      <div className={"mb-6 rounded-2xl border p-4 " + (overall === "ok" ? "border-green-300 bg-green-50" : overall === "warn" ? "border-amber-300 bg-amber-50" : "border-red-300 bg-red-50")}>
        <div className="flex items-center gap-2">
          <span className={"inline-block h-3 w-3 rounded-full " + DOT[overall]} />
          <span className="font-semibold">
            {overall === "ok" ? "全部正常" : overall === "warn" ? `${warns} 項需注意` : `${fails} 項未設定、${warns} 項需注意`}
          </span>
        </div>
      </div>

      <div className="rounded-2xl border border-[var(--line)] bg-[var(--card)] overflow-hidden">
        {checks.map((c, i) => (
          <div key={i} className={"flex items-start gap-3 px-4 py-3 " + (i > 0 ? "border-t border-[var(--line)]" : "")}>
            <span className={"mt-1.5 inline-block h-2.5 w-2.5 shrink-0 rounded-full " + DOT[c.state]} />
            <div className="min-w-0 flex-1">
              <div className="text-sm font-medium">{c.label}</div>
              <div className="text-xs text-[var(--soft)] break-words">{c.detail}</div>
            </div>
            <span className={"shrink-0 rounded-full px-2 py-0.5 text-xs " + (c.state === "ok" ? "bg-green-100 text-green-800" : c.state === "warn" ? "bg-amber-100 text-amber-800" : "bg-red-100 text-red-700")}>
              {TXT[c.state]}
            </span>
          </div>
        ))}
      </div>

      <div className="mt-5 rounded-2xl border border-[var(--line)] bg-[var(--card)] p-4 text-sm text-[var(--soft)]">
        <div className="mb-1 font-medium text-[var(--ink)]">提示</div>
        <ul className="list-disc pl-5 space-y-1">
          <li>「未設定 / 未啟用」通常代表某個 Vercel 環境變數或 Supabase migration 未做。</li>
          <li>webhook 無法在此直接檢查（設在 Shopify Settings → Notifications）；以上以「已自動補上訂單編號」作為運作跡象。</li>
          <li>改動環境變數後，記得在 Vercel 重新部署（Redeploy）。</li>
        </ul>
      </div>
    </div>
  );
}
