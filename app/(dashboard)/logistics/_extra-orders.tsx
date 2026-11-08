import { LOGISTICS_GROUPS } from "@/lib/logistics-fields";
import type { ExtraOrder } from "@/lib/logistics-extra";

// 附加單（Excel「66B」等）：只讀顯示，按客戶資料同樣的分組列出已填欄位
export function ExtraOrders({ orders, isAdmin }: { orders: ExtraOrder[]; isAdmin: boolean }) {
  if (!orders.length) return null;
  const empty = (v: unknown) => v == null || String(v).trim() === "" || /^(n\/?a|na|-|")$/i.test(String(v).trim());
  return (
    <section className="mb-6" id="extra">
      <h2 className="mb-3 text-lg font-semibold">附加單（{orders.length}）</h2>
      <div className="space-y-3">
        {orders.map((o) => (
          <div key={o.ref} id={`extra-${o.ref}`} className="scroll-mt-20 rounded-2xl border border-[var(--line)] bg-white p-4">
            <h3 className="mb-2 font-semibold">單號 {o.ref}{o.source_row ? <span className="ml-2 text-xs font-normal text-[var(--soft)]">Excel 第 {o.source_row} 行</span> : null}</h3>
            {LOGISTICS_GROUPS.map((g) => {
              const rows = g.fields.filter((f) => (!f.adminOnly || isAdmin) && !empty(o.fields[f.key]));
              if (!rows.length) return null;
              return (
                <div key={g.title} className="mt-2">
                  <p className="text-xs font-semibold text-[var(--soft)]">{g.title}</p>
                  <dl className="mt-1 grid gap-x-4 gap-y-1 text-sm sm:grid-cols-2 lg:grid-cols-4">
                    {rows.map((f) => (
                      <div key={f.key} className={f.type === "textarea" ? "sm:col-span-2 lg:col-span-4" : ""}>
                        <dt className="text-xs text-[var(--soft)]">{f.label}</dt>
                        <dd className="whitespace-pre-wrap break-words">{f.type === "date" ? String(o.fields[f.key]).slice(0, 10) : String(o.fields[f.key])}</dd>
                      </div>
                    ))}
                  </dl>
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </section>
  );
}
