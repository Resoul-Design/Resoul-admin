import { notFound } from "next/navigation";
import { loadSouvenirDrafts } from "@/lib/souvenir-drafts";
import { ProjectLedger } from "../../_ledger";

export const dynamic = "force-dynamic";

const btn = "rounded-lg border border-[var(--line)] bg-[var(--card)] px-3 py-2 text-sm hover:bg-[var(--cream)]";

// 紀念品草稿（客人未付款）詳細：資料及付款連結；付款後會變成正式訂單，屆時在該訂單記錄收支
export default async function DraftProjectPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const d = (await loadSouvenirDrafts()).find((x) => x.id.split("/").pop() === id);
  if (!d) notFound();

  return (
    <ProjectLedger
      projectNo={d.projectNo}
      title={d.owner || "紀念品訂單"}
      badge="紀念產品（草稿）"
      fields={[
        { label: "專案編號", value: d.projectNo || "—" },
        { label: "草稿訂單", value: d.name },
        { label: "客人名稱", value: d.owner },
        { label: "聯絡電話", value: d.phone },
        { label: "內容", value: d.itemsText },
        { label: "建立日期", value: d.createdAt.slice(0, 10) },
        { label: "金額", value: `${d.currency} ${d.amount.toLocaleString("en-HK")}` },
        { label: "付款", value: "待付款" },
      ]}
      orderRef={d.id}
      entries={[]}
      urls={{}}
      canEdit={false}
      notice={
        <div className="mb-5 rounded-xl border border-[var(--line)] bg-[var(--head)] px-4 py-3 text-sm">
          客人付款後，草稿會變成正式訂單，屆時可在該訂單記錄收入及支出。
        </div>
      }
      actions={
        <>
          {d.invoiceUrl && <a href={d.invoiceUrl} target="_blank" rel="noopener noreferrer" className={btn}>💳 開啟付款頁 ↗</a>}
          <a href={d.adminUrl} target="_blank" rel="noopener noreferrer" className={btn}>Shopify 草稿 ↗</a>
        </>
      }
    />
  );
}
