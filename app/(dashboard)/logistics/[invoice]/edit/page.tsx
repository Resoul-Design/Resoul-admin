import { redirect } from "next/navigation";

// 完整客戶資料表格已移至單號詳細頁
export default async function EditCustomerPage({ params }: { params: Promise<{ invoice: string }> }) {
  redirect(`/logistics/${encodeURIComponent(decodeURIComponent((await params).invoice))}`);
}
