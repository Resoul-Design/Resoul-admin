// OPC 紀錄：只追加到已設定的 Notion 任務頁，不新建任務、不改成已完成、不設期限。
// 內容不含客人姓名、電話、地址、寵物名或備註。業務開單成功與否與此寫入分開。
// 網站 Landing 的 NOTION_TOKEN／NOTION_TASKS_DB 會新建「任務總表」任務，不是這次要追加的既有 OPC 頁，因此不借用。
export type OpcBusiness = "verified" | "mismatch" | "incomplete" | "blocked";

export type OpcSummary = {
  atHk: string;
  formalNo: number;
  business: OpcBusiness;
  serviceCount: number;
  amounts: { type: "deposit" | "cremation"; amount: number }[];
  payment: "pending";
  driverIndependent: boolean;
  formalAligned: boolean;
  elapsedMs: number;
};

export type OpcConfig = { token: string; pageId: string };

export type OpcResult =
  | { status: "logged"; readback: true; blockId: string }
  | { status: "not_configured"; missing: string[] }
  | { status: "failed"; error: string }
  | { status: "skipped"; reason: string };

const TOKEN_KEY = "OPC_NOTION_TOKEN";
const PAGE_KEY = "OPC_NOTION_PAGE_ID";

export function readOpcConfig(env: Record<string, string | undefined>): { ok: true; config: OpcConfig } | { ok: false; missing: string[] } {
  const missing: string[] = [];
  const token = (env[TOKEN_KEY] || "").trim();
  const pageId = (env[PAGE_KEY] || "").trim();
  if (!token) missing.push(TOKEN_KEY);
  if (!pageId) missing.push(PAGE_KEY);
  if (missing.length) return { ok: false, missing };
  return { ok: true, config: { token, pageId } };
}

export function opcText(summary: OpcSummary): string {
  const amounts = summary.amounts.map((a) => `${a.type === "deposit" ? "押金" : "火化"} ${a.amount}`).join("、") || "沒有金額";
  return [
    "[待審核][無期限]",
    `來源正式號 ${summary.formalNo}`,
    `業務核實 ${summary.business}`,
    `服務 ${summary.serviceCount}`,
    `付款 ${summary.payment}`,
    amounts,
    `司機獨立欄 ${summary.driverIndependent ? "已讀回" : "未讀回"}`,
    `正式號對齊 ${summary.formalAligned ? "是" : "否"}`,
    `耗時 ${summary.elapsedMs}ms`,
    "不寄出客戶訊息",
    "重試只補這則紀錄，不重建服務",
  ].join("｜");
}

type FetchLike = (url: string, init?: { method?: string; headers?: Record<string, string>; body?: string }) => Promise<{ ok: boolean; status: number; text: () => Promise<string> }>;

function notionHeaders(token: string): Record<string, string> {
  return {
    Authorization: `Bearer ${token}`,
    "Notion-Version": "2022-06-28",
    "Content-Type": "application/json",
  };
}

export async function recordOpc(summary: OpcSummary, env: Record<string, string | undefined>, fetchImpl: FetchLike = fetch as unknown as FetchLike): Promise<OpcResult> {
  const cfg = readOpcConfig(env);
  if (!cfg.ok) return { status: "not_configured", missing: cfg.missing };
  const text = opcText(summary);
  if (hasPersonalData(text)) return { status: "failed", error: "OPC 內容含不應寫入的個人資料，已停止。" };
  let appended: { results?: { id?: string }[] } = {};
  try {
    const res = await fetchImpl(`https://api.notion.com/v1/blocks/${cfg.config.pageId}/children`, {
      method: "PATCH",
      headers: notionHeaders(cfg.config.token),
      body: JSON.stringify({ children: [{ object: "block", type: "paragraph", paragraph: { rich_text: [{ type: "text", text: { content: text.slice(0, 1800) } }] } }] }),
    });
    const raw = await res.text();
    if (!res.ok) return { status: "failed", error: `Notion 追加失敗（HTTP ${res.status}）。` };
    appended = JSON.parse(raw) as { results?: { id?: string }[] };
  } catch {
    return { status: "failed", error: "未能連接 Notion。業務開單結果不受這次失敗影響。" };
  }
  const blockId = appended.results?.[0]?.id;
  if (!blockId) return { status: "failed", error: "Notion 沒有回傳可讀回的區塊。" };
  try {
    const res = await fetchImpl(`https://api.notion.com/v1/blocks/${blockId}`, { method: "GET", headers: notionHeaders(cfg.config.token) });
    const raw = await res.text();
    if (!res.ok) return { status: "failed", error: `已追加但讀回失敗（HTTP ${res.status}）。` };
    const body = JSON.parse(raw) as { paragraph?: { rich_text?: { plain_text?: string; text?: { content?: string } }[] } };
    const read = (body.paragraph?.rich_text || []).map((r) => r.plain_text || r.text?.content || "").join("");
    if (!read.includes(`來源正式號 ${summary.formalNo}`) || !read.includes("[待審核]") || !read.includes("[無期限]")) {
      return { status: "failed", error: "讀回的 OPC 內容與寫入不一致。" };
    }
    return { status: "logged", readback: true, blockId };
  } catch {
    return { status: "failed", error: "已追加但讀回時未能連接 Notion。" };
  }
}

function hasPersonalData(text: string): boolean {
  if (/\b\d{8}\b/.test(text)) return true;
  if (/@/.test(text)) return true;
  return false;
}
