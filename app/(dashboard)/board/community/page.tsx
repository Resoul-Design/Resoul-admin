import { BoardView } from "../_view";

export const dynamic = "force-dynamic";

export default async function CommunityBoardPage({
  searchParams,
}: {
  searchParams: Promise<{ filter?: string }>;
}) {
  const { filter = "held" } = await searchParams;
  return (
    <BoardView
      title="同路人留言板"
      subtitle="同路人留言板的留言，審核後才於前台顯示。危機留言會置頂。"
      contextType="community"
      filter={filter}
      basePath="/board/community"
    />
  );
}
