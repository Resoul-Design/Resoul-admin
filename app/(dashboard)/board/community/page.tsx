import { headerLinkClass } from "../../_page-header";
import Link from "next/link";
import { BoardView } from "../_view";

export const dynamic = "force-dynamic";

export default async function CommunityBoardPage({
  searchParams,
}: {
  searchParams: Promise<{ filter?: string }>;
}) {
  const { filter = "held" } = await searchParams;
  return (
    <div>
      <BoardView
        title="主人評價及故事分享"
        actions={<Link href="/board/community/reviews" className={headerLinkClass}>查看服務評價</Link>}
        note="訪客分享的毛孩故事，核准後才會在分享頁公開。系統標記「優先查看」的留言會排在前面；這只是審核提示，請閱讀內容後再判斷。"
        contextType="community"
        filter={filter}
        basePath="/board/community"
      />
    </div>
  );
}
