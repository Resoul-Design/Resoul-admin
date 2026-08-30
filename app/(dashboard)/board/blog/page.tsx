import { BoardView } from "../_view";

export const dynamic = "force-dynamic";

export default async function BlogCommentsPage({
  searchParams,
}: {
  searchParams: Promise<{ filter?: string }>;
}) {
  const { filter = "held" } = await searchParams;
  return (
    <BoardView
      title="照顧誌留言"
      subtitle="讀者於照顧誌文章下的留言，審核後才於前台顯示。"
      contextType="blog"
      filter={filter}
      basePath="/board/blog"
    />
  );
}
