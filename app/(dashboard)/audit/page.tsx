import { PageHeader } from "../_page-header";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { MODULES } from "@/lib/modules";
import { canonicalProjectNo, projectNoFromNotes } from "@/lib/order-label";

export const dynamic = "force-dynamic";

type Log = {
  id: string;
  created_at: string;
  actor_id: string | null;
  actor_email: string | null;
  action: string;
  entity: string | null;
  entity_id: string | null;
  detail: string | null;
};

// 記錄對象的顯示名稱（主人・毛孩・專案編號等），由 entity_id 查回
type Names = Map<string, string>;

const BOOKING_STATUS: Record<string, string> = {
  new: "新收到",
  contacted: "已聯絡",
  scheduled: "已排期",
  pickup: "已接送",
  cremating: "火化中",
  ready: "可取回",
  completed: "已完成",
  cancelled: "已取消",
};
const POST_STATUS: Record<string, string> = { held: "待審核", visible: "公開", hidden: "隱藏" };
const MODULE_LABEL = new Map(MODULES.map((m) => [m.key, m.label]));

function formatTime(value?: string | null) {
  return value?.slice(0, 16).replace("T", " ") || "—";
}

function quote(name?: string | null) {
  return name ? `「${name}」` : "";
}

function statusOf(detail: string | null) {
  const m = (detail || "").match(/^狀態=([a-z_]+)/);
  return m ? BOOKING_STATUS[m[1]] || m[1] : "";
}

function money(v: string) {
  const n = Number(v);
  return Number.isFinite(n) ? `HK$${n.toLocaleString("en-HK")}` : v;
}

// 以一句中文描述每項改動
function describe(l: Log, names: Names): string {
  const who = names.get(l.entity_id || "") || "";
  const d = l.detail || "";
  const parts = d.split("｜");
  switch (l.action) {
    case "update_booking": {
      const s = statusOf(d);
      return `更新火化預約${quote(who)}資料${s ? `，狀態為「${s}」` : ""}`;
    }
    case "update_progress":
      return `火化預約${quote(who)}進度更新為「${parts[0]}」${parts[1] ? `（${parts[1]}）` : ""}`;
    case "undo_progress":
      return `火化預約${quote(who)}撤回進度「${d}」`;
    case "update_deposit": {
      if (d.includes("訂金跟進")) return `接送服務${quote(who)}訂金跟進：標記為已聯絡`;
      const s = statusOf(d);
      return `更新接送服務${quote(who)}資料${s ? `，狀態為「${s}」` : ""}`;
    }
    case "create_deposit_payment_link":
      return `為接送服務${quote(who)}產生付款連結${d ? `（Shopify 草稿 ${d}）` : ""}`;
    case "mark_deposit_reminded":
      return `接送服務${quote(who)}標記已提醒付款${d ? `（${d}）` : ""}`;
    case "close_deposit_follow_up":
      return `接送服務${quote(who)}標記不再跟進訂金`;
    case "create_deposit_order":
    case "create_cremation_order": {
      const kind = l.action === "create_deposit_order" ? "接送訂金" : "火化預約";
      const [projectNo, product, draft] = parts;
      return `新增${kind}訂單 ${projectNo || ""}${product ? `（${product}）` : ""}，並建立付款連結${draft ? ` ${draft}` : ""}`.replace(/\s+/g, " ");
    }
    case "add_entry": {
      const [head, ...rest] = parts;
      const [kind, amount] = (head || "").split(" ");
      const label = kind === "income" ? "收入" : kind === "expense" ? "支出" : "收支";
      return `新增專案${label} ${amount ? money(amount) : ""}${rest.join("｜") ? `：${rest.join("｜")}` : ""}`;
    }
    case "delete_entry":
      return "刪除一筆專案收支明細";
    case "delete_project":
      return `刪除專案${quote(who)}（連同收支明細）`;
    case "set_post_status":
      return `將故事分享${quote(who)}設為「${POST_STATUS[d] || d}」`;
    case "delete_post":
      return `刪除故事分享${quote(who)}`;
    case "create_google_review":
      return `新增 Google 評價${quote(d)}`;
    case "update_google_review":
      return `修改 Google 評價${quote(d)}`;
    case "delete_google_review":
      return "刪除一則 Google 評價";
    case "create_reply_snippet":
      return `新增回覆知識庫範本${quote(d)}`;
    case "update_reply_snippet":
      return `修改回覆知識庫範本${quote(d)}`;
    case "delete_reply_snippet":
      return "刪除一則回覆知識庫範本";
    case "create_blog_category":
      return `新增文章分類${quote(d)}`;
    case "update_blog_categories":
      return `儲存文章分類：${d}`;
    case "delete_blog_category":
      return `刪除文章分類${quote(d)}`;
    case "create_staff": {
      const [email, role] = parts;
      return `新增員工 ${email || ""}（${role === "admin" ? "管理員" : "員工"}）`;
    }
    case "update_staff": {
      const kv = new Map(parts.map((p) => p.split("=") as [string, string]));
      const bits = [
        kv.get("name") && kv.get("name") !== "—" ? `姓名「${kv.get("name")}」` : "",
        kv.has("role") ? `角色：${kv.get("role") === "admin" ? "管理員" : "員工"}` : "",
        kv.has("active") ? (kv.get("active") === "true" ? "在職" : "停用") : "",
      ].filter(Boolean);
      return `更新員工${quote(who)}資料${bits.length ? `：${bits.join("、")}` : ""}`;
    }
    case "update_permissions": {
      const keys = d.split(",").map((k) => k.trim()).filter(Boolean);
      return keys.length
        ? `更改員工${quote(who)}權限：${keys.map((k) => MODULE_LABEL.get(k) || k).join("、")}`
        : `取消員工${quote(who)}全部功能權限`;
    }
    default:
      return [l.action, who, d].filter(Boolean).join("：");
  }
}

// 批次查回各記錄的顯示名稱；已刪除的記錄會查不到，描述時略去名稱
async function loadNames(logs: Log[]): Promise<Names> {
  const ids = (entity: string) => [...new Set(logs.filter((l) => l.entity === entity && l.entity_id).map((l) => l.entity_id!))];
  const names: Names = new Map();
  const admin = createAdminClient();
  const label = (...bits: (string | null | undefined)[]) => bits.filter((b) => b && b !== "—").join("・");

  const [bookings, deposits, staff, posts] = await Promise.all([
    ids("cremation_bookings").length
      ? admin.from("cremation_bookings").select("id, owner_name, pet_name, case_no, notes").in("id", ids("cremation_bookings"))
      : null,
    ids("deposit_bookings").length
      ? admin.from("deposit_bookings").select("id, owner_name, pet_name, notes").in("id", ids("deposit_bookings"))
      : null,
    ids("staff").length ? admin.from("staff").select("id, name, email").in("id", ids("staff")) : null,
    ids("posts").length ? admin.from("posts").select("id, pet_name, name").in("id", ids("posts")) : null,
  ]);
  for (const b of bookings?.data || []) {
    const no = canonicalProjectNo(b.case_no, projectNoFromNotes(b.notes));
    names.set(b.id, label(b.owner_name, b.pet_name, no));
  }
  for (const b of deposits?.data || []) names.set(b.id, label(b.owner_name, b.pet_name, projectNoFromNotes(b.notes)));
  for (const s of staff?.data || []) names.set(s.id, s.name || s.email);
  for (const p of posts?.data || []) names.set(p.id, label(p.pet_name, p.name));
  return names;
}

export default async function AuditPage() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("audit_log")
    .select("id, created_at, actor_id, actor_email, action, entity, entity_id, detail")
    .order("created_at", { ascending: false })
    .limit(500);
  const logs = (data ?? []) as Log[];
  const names = error ? new Map<string, string>() : await loadNames(logs);

  // 操作人：顯示員工姓名（未設姓名時顯示電郵）
  const actorIds = [...new Set(logs.map((l) => l.actor_id).filter(Boolean))] as string[];
  const actors = new Map<string, string>();
  if (actorIds.length) {
    const { data: rows } = await createAdminClient().from("staff").select("id, name").in("id", actorIds);
    for (const s of rows || []) if (s.name) actors.set(s.id, s.name);
  }
  const actorName = (l: Log) => (l.actor_id && actors.get(l.actor_id)) || l.actor_email || "—";

  return (
    <div>
      <PageHeader title="審計記錄" />

      {error && (
        <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          尚未啟用審計記錄。請於 Supabase → SQL Editor 執行 <code>db/migration_audit_log.sql</code>。
        </div>
      )}

      {!error && logs.length === 0 ? (
        <div className="rounded-2xl border border-[var(--line)] bg-[var(--card)] p-10 text-center text-[var(--soft)]">暫無記錄。</div>
      ) : !error && (
        <><div className="hidden md:block rounded-2xl border border-[var(--line)] bg-[var(--card)] overflow-x-auto">
          <table className="w-full text-sm min-w-[760px]">
            <thead>
              <tr className="bg-[var(--head)] text-left text-[var(--soft)] whitespace-nowrap">
                <th className="px-4 py-3 font-medium w-[150px]">時間</th>
                <th className="px-4 py-3 font-medium w-[200px]">操作人</th>
                <th className="px-4 py-3 font-medium">改動內容</th>
              </tr>
            </thead>
            <tbody>
              {logs.map((l) => (
                <tr key={l.id} className="border-t border-[var(--line)] align-top">
                  <td className="px-4 py-3 whitespace-nowrap text-[var(--soft)]">{formatTime(l.created_at)}</td>
                  <td className="px-4 py-3 break-words">{actorName(l)}</td>
                  <td className="px-4 py-3 break-words">{describe(l, names)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="space-y-2 md:hidden">
          {logs.map((l) => (
            <div key={l.id} className="rounded-2xl border border-[var(--line)] bg-[var(--card)] p-4">
              <div className="flex items-center justify-between gap-2 text-xs text-[var(--soft)]">
                <span className="truncate">{actorName(l)}</span>
                <span className="shrink-0">{formatTime(l.created_at)}</span>
              </div>
              <div className="mt-1.5 text-sm break-words">{describe(l, names)}</div>
            </div>
          ))}
        </div>
        </>
      )}
    </div>
  );
}
