// 客戶檔案：接送、獸醫評估、火化及產品記錄共用的表格（手機版為卡片）
export type RecordRow = {
  key: string;
  when: string;
  project: string;
  order: string;
  content: string;
  status: string;
  payment: string;
  amount: string;
};

const HEAD = ["日期及時間", "專案編號", "訂單編號", "內容（產品／毛孩）", "狀態", "付款", "金額"];

export function RecordTable({ icon, title, empty, rows }: { icon: string; title: string; empty: string; rows: RecordRow[] }) {
  return (
    <section className="mb-8">
      <h2 className="mb-3 flex items-center gap-2 text-base font-semibold">
        <span className="text-[var(--gold)]">{icon}</span> {title}
      </h2>
      {rows.length === 0 ? (
        <div className="rounded-2xl border border-[var(--line)] bg-[var(--card)] p-8 text-center text-[var(--soft)]">{empty}</div>
      ) : (
        <>
          <div className="hidden overflow-x-auto rounded-2xl border border-[var(--line)] bg-[var(--card)] md:block">
            <table className="w-full min-w-[820px] table-fixed text-sm">
              <colgroup>
                <col className="w-[19%]" />
                <col className="w-[17%]" />
                <col className="w-[8%]" />
                <col />
                <col className="w-[8%]" />
                <col className="w-[8%]" />
                <col className="w-[8%]" />
              </colgroup>
              <thead>
                <tr className="whitespace-nowrap bg-[var(--head)] text-left text-[var(--soft)]">
                  {HEAD.map((h, i) => (
                    <th key={h} className={"px-4 py-3 font-medium" + (i === HEAD.length - 1 ? " text-right" : "")}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.key} className="border-t border-[var(--line)] align-top">
                    <td className="px-4 py-3">{r.when}</td>
                    <td className="break-all px-4 py-3 font-medium text-[var(--gold)]">{r.project}</td>
                    <td className="whitespace-nowrap px-4 py-3">{r.order}</td>
                    <td className="px-4 py-3 text-[var(--soft)]">{r.content}</td>
                    <td className="whitespace-nowrap px-4 py-3">{r.status}</td>
                    <td className="whitespace-nowrap px-4 py-3">{r.payment}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-right tabular-nums">{r.amount}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="space-y-3 md:hidden">
            {rows.map((r) => (
              <div key={r.key} className="rounded-2xl border border-[var(--line)] bg-[var(--card)] p-4">
                <div className="flex items-start justify-between gap-2">
                  <span className="break-all font-medium text-[var(--gold)]">{r.project}</span>
                  <span className="shrink-0 font-medium tabular-nums">{r.amount}</span>
                </div>
                <div className="mt-1 text-sm text-[var(--soft)]">{r.content}</div>
                <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
                  <span className="text-[var(--soft)]">{r.when}</span>
                  <span>{r.order}</span>
                  <span>{r.status}</span>
                  <span>{r.payment}</span>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </section>
  );
}
