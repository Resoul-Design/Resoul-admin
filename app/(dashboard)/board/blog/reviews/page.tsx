import { redirect } from "next/navigation";

// Google 評價管理已移至主人評價及故事分享之下
export default function OldReviewsRedirect() {
  redirect("/board/community/reviews");
}
