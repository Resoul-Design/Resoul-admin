import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { addEntry, deleteEntry } from "../../actions";
import { orderLabel } from "@/lib/order-label";
import type { ProductOrderRow } from "@/lib/product-orders";

export const dynamic = "force-dynamic";

const money = (n: number) => "$" + Math.round(n).toLocaleString();
const inputCls =
  "px-3 py-2 rounded-lg border border-[var(--line)] bg-white outline-none focus:border-[var(--gold)] text-sm";

type Entry = {
  id: string;
  kind: string;
  description: string;
  amount: number;
  entry_date: string;
  file_path: string | null;
};

export default async function ProductProjectPage({
  params,
}: {
  params: Promise<{ oid: string }>;
}) {
  const { oid } = await params;
  const supabase = await createClient();
  const gid = `gid://shopify/Order/${oid}`;

  const oRes = await supabase
    .from("product_orders")
    .select("*")
    .eq("shopify_order_id", gid)
    .maybeSingle();
  const o = oRes.data as ProductOrderRow | null;

  if (!o) {
    return <div className="text-[var(--soft)]">找不到此產品訂單專案。</div>;
  }

  // 收支明細（order_ref 欄需先執行 migration_project_entries_orders.sql；未執行時優雅回退為空）
  const peRes = await supabase
    .from("project_entries")
    .select("id, kind, description, amount, entry_date, file_path")
    .eq("order_ref", o.shopify_order_id)
    .order("entry_date", { ascending: false });
  const migrationMissing = !!peRes.error;
  const entries = (peRes.data ?? []) as Entry[];

  const withFile = entries.filter((e) => e.file_path);
  const signed = await Promise.all(
    withFile.map((e) => supabase.storage.from("project-files").createSignedUrl(e.file_path!, 3600))
  );
  const urlMap: Record<string, string> = {};
  withFile.forEach((e, i) => {
    if (signed[i].data?.signedUrl) urlMap[e.id] = signed[i].data!.signedUrl;
  });

  const manualIncome = entries.filter((e) => e.kind === "income").reduce((n, e) => n + (e.amount || 0), 0);
  const expense = entries.filter((e) => e.kind === "expense").reduce((n, e) => n + (e.amount || 0), 0);
  const paidIncome = Number(o.total_amount || 0);
  const showAutoIncome = manualIncome === 0 && paidIncome > 0;
  const income = manualIncome > 0 ? manualIncome : paidIncome;
  const net = income - expense;
  const items = (o.line_items || []).map((it) => `${it.title}×${it.quantity}`).join("、");

  return (
    <div>
      <div className="flex items-center gap-2 mb-1 text-sm text-[var(--soft)]">
        <Link href="/projects" className="hover:underline">專案管理</Link>
        <span>›</span>
        <span>{orderLabel(o.order_name, "product")}</span>
      </div>
      <div className="flex flex-wrap items-center gap-3 mb-3">
        <h1 className="text-2xl font-semibold">{o.customer_name || "產品訂單"}</h1>
        <span className="text-xs px-2.5 py-1 rounded-full bg-[var(--cream)] text-[var(--gold-deep)] border border-[var(--line)]">紀念產品</span>
      </div>
      <div className="mb-6 grid gap-x-8 gap-y-1.5 text-sm sm:grid-cols-2 lg:grid-cols-3">
        {[
          { label: "專案編號", value: orderLabel(o.order_name, "product") },
          { label: "單據編號", value: o.order_name || "—" },
          { label: "客人名稱", value: o.customer_name || "—" },
          { label: "聯絡電話", value: o.phone || "—" },
          { label: "內容", value: items || "—" },
          { label: "訂單日期", value: o.shopify_created_at?.slice(0, 10) || "—" },
        ].map((f) => (
          <div key={f.label} className="flex gap-2">
            <span className="text-[var(--soft)] shrink-0">{f.label}：</span>
            <span className="text-[var(--ink)] break-words">{f.value}</span>
          </div>
        ))}
      </div>

      {/* 收支小結 */}
      <div className="grid grid-cols-3 gap-3 sm:gap-4 mb-6">
        <div className="rounded-2xl border border-[var(--line)] border-l-4 border-l-green-500 bg-[var(--card)] p-4">
          <div className="text-xs text-[var(--soft)] mb-1">收入 Income</div>
          <div className="text-xl sm:text-2xl font-semibold tabular-nums text-green-700">{money(income)}</div>
          {showAutoIncome && <div className="text-[11px] text-[var(--soft)] mt-1">訂單金額自動計入</div>}
        </div>
        <div className="rounded-2xl border border-[var(--line)] border-l-4 border-l-amber-500 bg-[var(--card)] p-4">
          <div className="text-xs text-[var(--soft)] mb-1">支出 Expense</div>
          <div className="text-xl sm:text-2xl font-semibold tabular-nums text-amber-700">{money(expense)}</div>
        </div>
        <div className={"rounded-2xl border border-[var(--line)] border-l-4 bg-[var(--card)] p-4 " + (net >= 0 ? "border-l-[var(--gold)]" : "border-l-red-500")}>
          <div className="text-xs text-[var(--soft)] mb-1">淨額 Net</div>
          <div className={"text-xl sm:text-2xl font-semibold tabular-nums " + (net >= 0 ? "text-[var(--ink)]" : "text-red-700")}>{money(net)}</div>
        </div>
      </div>

      {migrationMissing && (
        <div className="mb-5 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          尚未啟用產品專案的收支明細。請先於 Supabase SQL Editor 執行 <code>db/migration_project_entries_orders.sql</code>，之後即可在此新增收入／支出明細。
        </div>
      )}

      {/* 新增明細 */}
      {!migrationMissing && (
        <details className="mb-5 rounded-2xl border border-[var(--line)] bg-[var(--card)]" open>
          <summary className="cursor-pointer list-none px-5 py-3.5 flex items-center gap-2 font-medium">
            <span className="text-[var(--gold)]">＋</span> 新增收支明細
          </summary>
          <form action={addEntry} encType="multipart/form-data" className="px-5 pb-5 pt-1 border-t border-[var(--line)] flex flex-wrap gap-3 items-end">
            <input type="hidden" name="order_ref" value={o.shopify_order_id} />
            <label className="text-sm">
              <span className="block text-[var(--soft)] mb-1">類型</span>
              <select name="kind" defaultValue="expense" className={inputCls}>
                <option value="income">收入</option>
                <option value="expense">支出</option>
              </select>
            </label>
            <label className="text-sm flex-1 min-w-[160px]">
              <span className="block text-[var(--soft)] mb-1">說明</span>
              <input name="description" required className={inputCls + " w-full"} placeholder="如 材料成本 / 包裝 / 運費…" />
            </label>
            <label className="text-sm">
              <span className="block text-[var(--soft)] mb-1">金額</span>
              <input type="number" step="0.01" name="amount" required className={inputCls + " w-28"} />
            </label>
            <label className="text-sm">
              <span className="block text-[var(--soft)] mb-1">日期</span>
              <input type="date" name="entry_date" defaultValue={new Date().toISOString().slice(0, 10)} className={inputCls} />
            </label>
            <label className="text-sm">
              <span className="block text-[var(--soft)] mb-1">文件（收據，可選）</span>
              <input type="file" name="file" className="text-sm block w-56" />
            </label>
            <button className="px-4 py-2 rounded-lg text-sm bg-[var(--gold)] text-white hover:opacity-90">新增</button>
          </form>
        </details>
      )}

      {/* 明細列表 */}
      {entries.length === 0 && !showAutoIncome ? (
        <div className="rounded-2xl border border-[var(--line)] bg-[var(--card)] p-10 text-center text-[var(--soft)]">
          暫無收支明細。
        </div>
      ) : (
        <div className="rounded-2xl border border-[var(--line)] bg-[var(--card)] overflow-x-auto">
          <table className="w-full text-sm min-w-[640px]">
            <thead>
              <tr className="bg-[var(--head)] text-left text-[var(--soft)]">
                <th className="px-4 py-3 font-medium">日期</th>
                <th className="px-4 py-3 font-medium">類型</th>
                <th className="px-4 py-3 font-medium">說明</th>
                <th className="px-4 py-3 font-medium text-right">金額</th>
                <th className="px-4 py-3 font-medium">文件</th>
                <th className="px-4 py-3 font-medium text-right">操作</th>
              </tr>
            </thead>
            <tbody>
              {showAutoIncome && (
                <tr className="border-t border-[var(--line)] bg-green-50/40">
                  <td className="px-4 py-3 whitespace-nowrap text-[var(--soft)]">{o.shopify_created_at?.slice(0, 10) || "—"}</td>
                  <td className="px-4 py-3"><span className="text-xs px-2 py-0.5 rounded-full bg-green-100 text-green-800">收入</span></td>
                  <td className="px-4 py-3">產品訂單（已付款）<span className="text-xs text-[var(--soft)]">　· 系統自動</span></td>
                  <td className="px-4 py-3 text-right tabular-nums font-medium text-green-700">{"+" + money(paidIncome)}</td>
                  <td className="px-4 py-3"><span className="text-[var(--faint)]">—</span></td>
                  <td className="px-4 py-3 text-right text-xs text-[var(--faint)]">自動</td>
                </tr>
              )}
              {entries.map((e) => (
                <tr key={e.id} className="border-t border-[var(--line)]">
                  <td className="px-4 py-3 whitespace-nowrap text-[var(--soft)]">{e.entry_date}</td>
                  <td className="px-4 py-3">
                    <span className={"text-xs px-2 py-0.5 rounded-full " + (e.kind === "income" ? "bg-green-100 text-green-800" : "bg-amber-100 text-amber-800")}>
                      {e.kind === "income" ? "收入" : "支出"}
                    </span>
                  </td>
                  <td className="px-4 py-3">{e.description}</td>
                  <td className={"px-4 py-3 text-right tabular-nums font-medium " + (e.kind === "income" ? "text-green-700" : "text-amber-700")}>
                    {(e.kind === "income" ? "+" : "−") + money(e.amount)}
                  </td>
                  <td className="px-4 py-3">
                    {e.file_path && urlMap[e.id] ? (
                      <a href={urlMap[e.id]} target="_blank" className="text-xs text-[var(--gold)] hover:underline">下載</a>
                    ) : (
                      <span className="text-[var(--faint)]">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <form action={deleteEntry}>
                      <input type="hidden" name="id" value={e.id} />
                      <input type="hidden" name="order_ref" value={o.shopify_order_id} />
                      <button className="text-xs text-red-600 hover:underline">刪除</button>
                    </form>
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-[var(--line)] bg-[var(--head)] font-semibold">
                <td className="px-4 py-3" colSpan={3}>淨額 Net（收入 − 支出）</td>
                <td className={"px-4 py-3 text-right tabular-nums " + (net >= 0 ? "text-[var(--ink)]" : "text-red-700")}>{money(net)}</td>
                <td className="px-4 py-3" colSpan={2}></td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  );
}
