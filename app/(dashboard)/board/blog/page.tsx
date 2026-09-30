import { redirect } from "next/navigation";

// 照顧誌沒有留言功能，舊連結轉去主人評價及故事分享
export default function BlogCommentsRedirect() {
  redirect("/board/community");
}
