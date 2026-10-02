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
        contextType="community"
        filter={filter}
        basePath="/board/community"
      />
    </div>
  );
}
