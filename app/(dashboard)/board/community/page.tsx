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
      subtitle="訪客分享的毛孩故事，核准後才會在分享頁公開。系統標記「優先查看」的留言會排在前面；這只是審核提示，請閱讀內容後再判斷。"
      contextType="community"
      filter={filter}
      basePath="/board/community"
    />
  );
}
