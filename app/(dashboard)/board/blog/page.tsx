import { BoardView } from "../_view";
import Link from "next/link";

export const dynamic = "force-dynamic";

export default async function BlogCommentsPage({
  searchParams,
}: {
  searchParams: Promise<{ filter?: string }>;
}) {
  const { filter = "held" } = await searchParams;
  return (
    <div>
      <div className="mb-4 flex justify-end">
        <Link href="/board/blog/reviews" className="rounded-lg border border-[var(--line)] bg-[var(--card)] px-3 py-2 text-sm hover:bg-[var(--cream)]">管理 Google 評價</Link>
      </div>
      <BoardView
        title="照顧誌留言"
        subtitle="讀者於照顧誌文章下的留言，審核後才於前台顯示。"
        contextType="blog"
        filter={filter}
        basePath="/board/blog"
      />
    </div>
  );
}
