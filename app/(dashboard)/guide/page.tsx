import { PageHeader } from "../_page-header";
import { notFound } from "next/navigation";
import { getStaff, hasModule } from "@/lib/auth";

export const dynamic = "force-dynamic";

// 使用教學：嵌入營運手冊網頁版（public/manual/resoul-guide.html，須有「使用教學」權限才可讀取）
const GUIDE_URL = "/manual/resoul-guide.html";

export default async function GuidePage() {
  const staff = await getStaff();
  if (!staff || !hasModule(staff, ["guide"])) notFound();
  return (
    <div>
      <PageHeader title="使用教學">
        <a
          href={GUIDE_URL}
          target="_blank"
          rel="noopener"
          className="rounded-lg border border-[var(--line)] px-3 py-2 text-sm hover:bg-[var(--cream)]"
        >
          新分頁開啟 ↗
        </a>
      </PageHeader>
      <iframe
        src={GUIDE_URL}
        title="RESOUL 營運手冊"
        className="h-[calc(100dvh-180px)] min-h-[480px] w-full rounded-xl border border-[var(--line)] bg-white"
      />
    </div>
  );
}
