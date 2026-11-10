"use client";

import { displayPhone } from "@/lib/phone-display";
import Link from "next/link";
import { useMemo, useState } from "react";
import { invoiceQuery, matchesInvoice } from "@/lib/invoice-search";
import type { StatusChip } from "@/lib/service-status";
import type { referralFee } from "@/lib/logistics-calc";

export type LogisticsRow = { invoiceNo: string; owner: string; phone: string; email: string; project: string; pet: string; plan: string; arrival: string; deposit: string; balance: string; status: string; updated: string; extraRefs: string[]; pickupChips: StatusChip[]; serviceChips: StatusChip[]; memorialChips: StatusChip[]; referral: ReturnType<typeof referralFee> };

function Chips({ list }: { list: StatusChip[] }) {
  if (!list.length) return <span className="text-[var(--soft)]">—</span>;
  return <div className="flex flex-col items-start gap-1">{list.map((c, i) => <span key={i} className={"inline-block whitespace-nowrap rounded-full px-2 py-0.5 text-xs " + c.className}>{c.label}</span>)}</div>;
}

export function LogisticsTable({ rows, error }: { rows: LogisticsRow[]; error: string | null }) {
  const [query, setQuery] = useState("");
  const [refFilter, setRefFilter] = useState("all");
  const filtered = useMemo(() => {
    const raw = query.trim();
    // 轉介篩選：須付轉介費（對照表「應付」夥伴）／毋須付
    const byRef = rows.filter((r) => refFilter === "all" || (refFilter === "payable" ? r.referral.payable && !!r.referral.fee : !(r.referral.payable && !!r.referral.fee)));
    if (!raw) return byRef;
    const q = raw.toLowerCase();
    const digits = raw.replace(/\D/g, "");
    // 單號（319、#319、319-DEPOSIT、66B）比對整個單號；其他文字比對主人、電話、電郵、寵物、專案
    const invoiceHits = byRef.filter((r) => matchesInvoice(raw, r.invoiceNo));
    if (invoiceQuery(raw) && digits.length < 4) return invoiceHits;
    return byRef.filter((r) => invoiceHits.includes(r) || [r.owner, r.phone, r.email, r.project, r.pet, ...r.extraRefs].join(" ").toLowerCase().includes(q) || (digits.length >= 4 && r.phone.replace(/\D/g, "").includes(digits)));
  }, [rows, query, refFilter]);
  return <div>
    {error && <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">讀取客戶資料失敗：{error}</div>}
    <div className="mb-4 flex flex-wrap items-center gap-2"><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="搜尋單號（例如 319、66B）／電話／寵物／主人" className="min-w-[260px] flex-1 rounded-lg border border-[var(--line)] bg-white px-3 py-2 text-sm" /><select value={refFilter} onChange={(e) => setRefFilter(e.target.value)} aria-label="轉介篩選" className="rounded-lg border border-[var(--line)] bg-white px-3 py-2 text-sm"><option value="all">全部轉介</option><option value="payable">須付轉介費</option><option value="none">毋須付轉介費</option></select><Link href="/logistics/sync" className="rounded-lg border border-[var(--line)] px-3 py-2 text-sm hover:bg-[var(--cream)]">由 Excel 同步</Link><span className="text-xs text-[var(--soft)]">共 {filtered.length} 筆</span></div>
    <div className="overflow-x-auto rounded-2xl border border-[var(--line)] bg-[var(--card)]"><table className="w-full min-w-[1100px] text-sm"><thead><tr className="bg-[var(--head)] text-left text-[var(--soft)]">{["單號","主人／電話","寵物","接送","火化／獸醫","紀念品","轉介","到達","更新"].map((h) => <th key={h} className="px-4 py-3 font-medium">{h}</th>)}</tr></thead><tbody>{filtered.map((r) => <tr key={r.invoiceNo + r.phone} className="border-t border-[var(--line)] align-top hover:bg-[var(--cream)]"><td className="px-4 py-3 font-medium text-[var(--gold)]"><Link href={`/logistics/${encodeURIComponent(r.invoiceNo)}`} className="hover:underline">{r.invoiceNo}</Link>{r.extraRefs.length > 0 && <div className="text-xs font-normal text-[var(--soft)]">＋{r.extraRefs.join("、")}</div>}</td><td className="px-4 py-3">{r.owner || "—"}<div className="text-xs text-[var(--soft)]">{displayPhone(r.phone) || "—"}</div></td><td className="px-4 py-3">{r.pet || "—"}</td><td className="px-4 py-3"><Chips list={r.pickupChips} /></td><td className="px-4 py-3"><Chips list={r.serviceChips} /></td><td className="px-4 py-3"><Chips list={r.memorialChips} /></td><td className="px-4 py-3 text-xs">{r.referral.partner ? <>{r.referral.partner}<div className={r.referral.payable && r.referral.fee ? "text-amber-800" : "text-[var(--soft)]"}>{r.referral.fee == null ? "—" : `HK$${r.referral.fee.toLocaleString("en-US")}`}{r.referral.payable && r.referral.fee ? "（應付）" : ""}</div></> : "—"}</td><td className="px-4 py-3">{r.arrival || "—"}</td><td className="px-4 py-3 text-xs text-[var(--soft)]">{r.updated || "—"}</td></tr>)}</tbody></table>{filtered.length === 0 && <div className="p-10 text-center text-sm text-[var(--soft)]">沒有符合的客戶資料。</div>}</div>
  </div>;
}
