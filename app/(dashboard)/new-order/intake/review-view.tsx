import React, { type CSSProperties, type ReactNode } from "react";
import type { IntakePayload, IntakePreview } from "@/lib/order-intake";
import type { BundleRunResult } from "@/lib/order-bundle";
import type { OpcResult } from "@/lib/opc-log";

const card: CSSProperties = { background: "#fdfaf4", border: "1px solid #e6dccb", borderRadius: 16, padding: 16, marginTop: 16 };
const muted: CSSProperties = { color: "#6f6156", fontSize: 14, lineHeight: 1.6 };
const title: CSSProperties = { fontSize: 18, margin: "0 0 8px" };

export function IntakeReview({ preview, renderRow }: { preview: IntakePreview; renderRow?: (row: IntakePayload) => ReactNode }) {
  return (
    <div>
      <section style={card}>
        <h2 style={title}>來源</h2>
        <p style={muted}>
          {preview.source.fileName}　／　{preview.source.location}
          <br />
          取得時間（香港）：{preview.source.fetchedAtHk}
          <br />
          預檢時間（香港）：{preview.source.previewedAtHk}　時區 {preview.source.zone}
        </p>
        <p style={muted}>後台查重：{preview.backendChecked ? "已讀取" : "未能讀取，相關行不會開單"}。司機名單：{preview.driversLive ? "已讀取後台" : "未能讀取後台，暫用已設定名單"}。</p>
        {preview.importErrors.length > 0 && (
          <ul style={{ color: "#9a3412", fontSize: 14 }}>{preview.importErrors.map((e) => <li key={e}>{e}</li>)}</ul>
        )}
      </section>
      {preview.excluded.length > 0 && (
        <section style={card}>
          <h2 style={title}>不開單</h2>
          <ul style={muted}>{preview.excluded.map((e) => <li key={`${e.line}-${e.formalNo}-${e.reason}`}>第 {e.line} 行{e.formalNo ? `　正式號 ${e.formalNo}` : ""}：{e.reason}</li>)}</ul>
        </section>
      )}
      {preview.rows.map((row) => <RowCard key={`${row.formalNo}-${row.sourceLine}`} row={row}>{renderRow?.(row)}</RowCard>)}
      {!preview.rows.length && <p style={card}>這份來源沒有可覆核的新正式號。</p>}
    </div>
  );
}

export function RowCard({ row, children }: { row: IntakePayload; children?: ReactNode }) {
  const services = row.package.confirmed ? "接送押金＋已確認火化套餐" : "只準備接送押金";
  return (
    <article style={card}>
      <h2 style={title}>正式號 {row.formalNo}　第 {row.sourceLine} 行</h2>
      <p style={muted}>{row.mode === "reuse" ? `沿用現有專案 ${row.existingProjectNo}` : row.mode === "blocked" ? "這行不能開單" : "新專案（沿用現有編號產生器，不改生成規則）"}。{services}。付款只會是待付款。</p>
      <p style={muted}>主人 {row.customer.name || "—"}　寵物 {row.pet.name || "—"}　電話 {row.customer.phone || "—"}　司機 {row.pickup.driver || "未記入獨立欄"}</p>
      <p style={muted}>到達 {row.pickup.date || "—"} {row.pickup.time || ""}（{row.cremation?.zone || "Asia/Hong_Kong"}）　火化開始 {row.cremation?.date || "—"} {row.cremation?.time || ""}{row.farewellDate ? `　告別日期只寫入備註：${row.farewellDate}` : ""}</p>
      <p style={muted}>押金 {row.deposit.amount != null ? `${row.deposit.amount}（${row.deposit.source}）` : "金額未確認"}。套餐 {row.package.confirmed ? `${row.package.sku}　官方價 ${row.package.officialPrice}` : "未確認"}。{row.package.reason}</p>
      {row.products.length > 0 && <p style={muted}>明確產品：{row.products.map((p) => `${p.sku}×${p.qty}　${p.officialPrice}`).join("、")}</p>}
      {row.pendingFields.length > 0 && <p style={muted}>待處理：{row.pendingFields.join("；")}</p>}
      {row.withheldSuggestions.length > 0 && <p style={muted}>未採用黃色建議（來源沒有可核實的值）：{row.withheldSuggestions.join("、")}</p>}
      <p style={muted}>這一張的備註：{row.notesCremation || row.notesDeposit || "（空白）"}</p>
      <h3 style={{ fontSize: 15, marginBottom: 4 }}>待確認（一次列出）</h3>
      {row.questions.length ? (
        <ul style={muted}>{row.questions.map((q) => <li key={`${q.code}-${q.text}`}>{q.blocking ? "須先處理：" : "請知悉："}{q.text}</li>)}</ul>
      ) : <p style={muted}>沒有待確認項目。</p>}
      {children}
    </article>
  );
}

export function ResultPanel({ business, opc, elapsedMs }: { business: BundleRunResult; opc: OpcResult; elapsedMs: number }) {
  const done = business.complete && opc.status === "logged";
  const heading = business.complete ? (opc.status === "logged" ? "業務已核實，OPC 已讀回" : "業務已核實；OPC 尚未寫入") : "業務尚未完成";
  return (
    <section style={{ ...card, borderColor: done ? "#3f6212" : business.complete ? "#9c7f52" : "#9a3412" }}>
      <h2 style={title}>{heading}</h2>
      <p style={muted}>業務狀態：{label(business.business)}。OPC：{opcLabel(opc)}。兩者分開，OPC 失敗不會重開服務。</p>
      <p style={muted}>正式號 {business.formalNo}　專案 {business.projectNo || "—"}　單號 {business.invoiceNo ?? "—"}　服務 {business.services.length}　耗時 {elapsedMs} ms。三分鐘是操作目標，不是這次結果的保證。</p>
      {business.error && <p style={{ color: "#9a3412" }}>{business.error}</p>}
      {business.warnings.map((w) => <p key={w} style={{ color: "#9a3412" }}>{w}</p>)}
      {business.verify && !business.verify.ok && (
        <ul style={{ color: "#9a3412", fontSize: 14 }}>{business.verify.actionable.map((a) => <li key={a}>{a}</li>)}</ul>
      )}
      {business.verify?.ok && <p style={muted}>讀回的顯示編號、內部專案、押金、火化 case_no、備註專案號、群組、司機獨立欄、日期、待付款及金額與這次預期一致。</p>}
      {!business.complete && <p style={muted}>業務未完成的項目保持待處理，沒有期限，也不會向客人發訊息。</p>}
      {business.complete && opc.status !== "logged" && <p style={muted}>業務紀錄已核實。OPC 仍未寫入或未讀回，這次不會重開服務。</p>}
    </section>
  );
}

function label(business: BundleRunResult["business"]): string {
  if (business === "verified") return "已寫入並讀回核實";
  if (business === "mismatch") return "已讀回，但與預期不一致";
  if (business === "incomplete") return "未完成，可再試；已成功的服務不會重開";
  return "未開單";
}

function opcLabel(opc: OpcResult): string {
  if (opc.status === "logged") return `已追加到原任務並讀回（${opc.blockId}）`;
  if (opc.status === "not_configured") return `未設定，缺少 ${opc.missing.join("、")}`;
  if (opc.status === "failed") return `寫入失敗：${opc.error}`;
  return `沒有寫入：${opc.reason}`;
}
