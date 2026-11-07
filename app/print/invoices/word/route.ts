import { getStaff } from "@/lib/auth";
import { loadInvoices } from "@/lib/invoices";
import { buildInvoicesDocx } from "../_word";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function image(url: URL) {
  try {
    const res = await fetch(url);
    return res.ok ? new Uint8Array(await res.arrayBuffer()) : null;
  } catch {
    return null; // 讀不到圖片時仍可下載，只是沒有商標或簽名
  }
}

// 發票 Word 版下載：查詢參數與 /print/invoices 相同（refs，或 from、to、kinds）
export async function GET(request: Request) {
  const staff = await getStaff();
  if (!staff) return new Response("Unauthorized", { status: 401 });
  const url = new URL(request.url);
  const list = (key: string) => url.searchParams.getAll(key).flatMap((v) => v.split(",")).map((v) => v.trim()).filter(Boolean);
  const refs = list("refs");
  const docs = await loadInvoices({
    refs: refs.length ? refs : undefined,
    from: url.searchParams.get("from") || undefined,
    to: url.searchParams.get("to") || undefined,
    kinds: list("kinds"),
  }, staff);
  if (!docs.length) {
    return new Response("沒有符合的已付款記錄（只限已付款並有 Shopify 訂單號的記錄）。", { status: 404, headers: { "Content-Type": "text/plain; charset=utf-8" } });
  }
  const [wordmark, signature] = await Promise.all([image(new URL("/resoul-wordmark.png", url)), image(new URL("/resoul-signature.png", url))]);
  const buffer = await buildInvoicesDocx(docs, { wordmark, signature });
  // 下載檔名只用英文數字（單據編號可含中文，留空時用通用名稱）
  const safeNo = docs.length === 1 ? docs[0].no.replace(/[^A-Za-z0-9-]/g, "") : "";
  const name = docs.length > 1 ? `Resoul-Invoices-${docs.length}.docx` : safeNo ? `Invoice-${safeNo}.docx` : "Invoice.docx";
  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "Content-Disposition": `attachment; filename="${name}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
