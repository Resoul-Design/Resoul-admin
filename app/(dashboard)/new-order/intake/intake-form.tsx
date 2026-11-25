"use client";

import { useState, useTransition } from "react";
import type { IntakeAnswers, IntakePayload, IntakePreview } from "@/lib/order-intake";
import type { BundleRunResult } from "@/lib/order-bundle";
import { previewIntake, retryIntakeLog, submitIntake, type IntakeActionResult } from "./actions";
import { IntakeReview, ResultPanel, RowCard } from "./review-view";

const input = { width: "100%", border: "1px solid #e6dccb", borderRadius: 8, padding: "8px 10px", font: "inherit", background: "#fff" } as const;

export function IntakeForm() {
  const [fileName, setFileName] = useState("");
  const [location, setLocation] = useState("");
  const [fetchedAtHk, setFetchedAtHk] = useState("");
  const [logisticsCsv, setLogisticsCsv] = useState("");
  const [memorialCsv, setMemorialCsv] = useState("");
  const [preview, setPreview] = useState<IntakePreview | null>(null);
  const [answers, setAnswers] = useState<Record<number, IntakeAnswers>>({});
  const [ack, setAck] = useState(false);
  const [result, setResult] = useState<IntakeActionResult | null>(null);
  const [error, setError] = useState("");
  const [pending, start] = useTransition();

  function readFile(file: File | undefined, set: (v: string) => void) {
    if (!file) return;
    file.text().then(set);
    if (!fileName) setFileName(file.name);
  }

  function onPreview() {
    setError("");
    setResult(null);
    start(async () => {
      const res = await previewIntake({ logisticsCsv, memorialCsv, fileName, location, fetchedAtHk });
      if (res.error) setError(res.error);
      else setPreview(res.preview || null);
    });
  }

  function onSubmit(row: IntakePayload) {
    setError("");
    start(async () => {
      const res = await submitIntake({ values: row.source, answers: answers[row.formalNo] || {}, acknowledgeAlignment: ack });
      setResult(res);
      const outcome = res.business;
      if (res.message) setError(res.message);
      else if ("row" in outcome && outcome.row) setError(outcome.row.questions.filter((q) => q.blocking).map((q) => q.text).join(" "));
    });
  }

  function onRetryLog(row: IntakePayload) {
    start(async () => {
      const res = await retryIntakeLog({ values: row.source, answers: answers[row.formalNo] || {} });
      setResult(res);
    });
  }

  const run = result && result.business.business !== "blocked" ? result.business as BundleRunResult : null;

  return (
    <div>
      <section style={{ background: "#fdfaf4", border: "1px solid #e6dccb", borderRadius: 16, padding: 16 }}>
        <p style={{ color: "#6f6156", fontSize: 14, lineHeight: 1.6 }}>上傳今次重新取得的 Customers Record &amp; Logistic。預檢只會驗證、查重及對照官方價，不會開單。提交時才經現有開單路徑，一次建立同一專案的接送押金；套餐已確認才加火化及明確產品。編號產生器不會改。保存後會讀回核對，不一致就停在未完成。</p>
        <div style={{ display: "grid", gap: 8, marginTop: 12 }}>
          <input style={input} placeholder="檔案名稱" value={fileName} onChange={(e) => setFileName(e.target.value)} aria-label="檔案名稱" />
          <input style={input} placeholder="來源位置" value={location} onChange={(e) => setLocation(e.target.value)} aria-label="來源位置" />
          <input style={input} placeholder="取得時間（香港），例如 2026-11-25T18:00:00+08:00" value={fetchedAtHk} onChange={(e) => setFetchedAtHk(e.target.value)} aria-label="取得時間" />
          <label style={{ fontSize: 14 }}>客戶資料 CSV<input style={{ display: "block", marginTop: 4 }} type="file" accept=".csv,text/csv" onChange={(e) => readFile(e.target.files?.[0], setLogisticsCsv)} /></label>
          <label style={{ fontSize: 14 }}>紀念品 Tracking CSV（可省略）<input style={{ display: "block", marginTop: 4 }} type="file" accept=".csv,text/csv" onChange={(e) => readFile(e.target.files?.[0], setMemorialCsv)} /></label>
          <button type="button" disabled={pending || !logisticsCsv} onClick={onPreview} style={{ width: 140, border: 0, borderRadius: 8, padding: "8px 12px", background: "#9c7f52", color: "#fff" }}>{pending ? "處理中" : "預檢"}</button>
        </div>
        {error && <p style={{ color: "#9a3412" }}>{error}</p>}
      </section>
      {preview && (
        <IntakeReview
          preview={preview}
          renderRow={(row) => (
            <RowAnswers row={row} answers={answers[row.formalNo] || {}} onChange={(next) => setAnswers((cur) => ({ ...cur, [row.formalNo]: next }))} ack={ack} setAck={setAck} pending={pending} onSubmit={() => onSubmit(row)} onRetry={() => onRetryLog(row)} />
          )}
        />
      )}
      {run && result && <ResultPanel business={run} opc={result.opc} elapsedMs={result.elapsedMs} />}
    </div>
  );
}

function RowAnswers({ row, answers, onChange, ack, setAck, pending, onSubmit, onRetry }: {
  row: IntakePayload;
  answers: IntakeAnswers;
  onChange: (next: IntakeAnswers) => void;
  ack: boolean;
  setAck: (v: boolean) => void;
  pending: boolean;
  onSubmit: () => void;
  onRetry: () => void;
}) {
  return (
    <div style={{ marginTop: 8 }}>
      <div style={{ display: "grid", gap: 8 }}>
        {!row.pickup.driver && <input style={input} placeholder="司機（只填這一張，必須在名單內）" value={answers.driver || ""} onChange={(e) => onChange({ ...answers, driver: e.target.value })} aria-label={`正式號 ${row.formalNo} 司機`} />}
        {!row.pet.breed && <input style={input} placeholder="品種（來源沒有才填）" value={answers.breed || ""} onChange={(e) => onChange({ ...answers, breed: e.target.value })} aria-label={`正式號 ${row.formalNo} 品種`} />}
        {!row.pickup.address && <input style={input} placeholder="接送地址（來源沒有才填）" value={answers.address || ""} onChange={(e) => onChange({ ...answers, address: e.target.value })} aria-label={`正式號 ${row.formalNo} 地址`} />}
        {row.questions.some((q) => q.code === "note_ditto") && <input style={input} placeholder="這一張的備註；留空請輸入空白後仍須按預檢規則" value={answers.note || ""} onChange={(e) => onChange({ ...answers, note: e.target.value })} aria-label={`正式號 ${row.formalNo} 備註`} />}
        {row.package.confirmed && row.questions.some((q) => q.code === "urn_arrangement_unknown") && (
          <select style={input} value={answers.urnPickup || ""} onChange={(e) => onChange({ ...answers, urnPickup: e.target.value as IntakeAnswers["urnPickup"] })} aria-label={`正式號 ${row.formalNo} 骨灰取回`}>
            <option value="">骨灰取回安排</option>
            <option value="today">今日取回</option>
            <option value="later">另日取回</option>
            <option value="na">不適用</option>
          </select>
        )}
      </div>
      <label style={{ display: "flex", gap: 8, marginTop: 8, fontSize: 14, color: "#3b2f27" }}>
        <input type="checkbox" checked={ack} onChange={(e) => setAck(e.target.checked)} />
        我明白系統單號若與來源正式號不同，這次不會自動改號，也不會標成完成。
      </label>
      <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
        <button type="button" disabled={pending || !ack} onClick={onSubmit} style={{ border: 0, borderRadius: 8, padding: "8px 12px", background: "#9c7f52", color: "#fff" }}>提交正式號 {row.formalNo}</button>
        <button type="button" disabled={pending} onClick={onRetry} style={{ border: "1px solid #e6dccb", borderRadius: 8, padding: "8px 12px", background: "#fff" }}>只重試讀回及 OPC</button>
      </div>
    </div>
  );
}
