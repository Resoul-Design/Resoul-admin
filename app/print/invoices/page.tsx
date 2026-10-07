import { redirect } from "next/navigation";
import { getStaff } from "@/lib/auth";
import { COMPANY } from "@/lib/company";
import { loadInvoices, type InvoiceDoc } from "@/lib/invoices";
import { PrintButton } from "../_print-button";

export const dynamic = "force-dynamic";

const money = (n: number) => "HK$" + Number(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const date = (iso: string) =>
  iso ? new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "Asia/Hong_Kong" }) : "—";

const CSS = `
@page{size:A4;margin:10mm}
.inv-wrap{background:#fff;color:#3b2f27;font-size:13px;-webkit-print-color-adjust:exact;print-color-adjust:exact}
.inv{max-width:820px;margin:24px auto;border:1px solid #cfc4b0;padding:7px;break-after:page}
.inv:last-child{break-after:auto}
.inv-in{border:1px solid #e6dccb;padding:30px 32px}
.inv-top{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:30px}
.inv-title{border:1px solid #cfc4b0;border-radius:16px;padding:10px 24px;font-family:var(--serif);font-size:28px;letter-spacing:.15em;color:#6f6156}
.inv-brand{text-align:right}.inv-brand img{height:46px;display:inline-block}
.inv-slogan{font-family:var(--slogan);font-style:italic;font-size:12px;color:#6f6156;margin-top:2px}
.inv-meta{display:flex;justify-content:space-between;align-items:flex-start;gap:24px;margin-bottom:30px}
.inv-box{border:1px solid #cfc4b0;border-radius:16px;padding:14px 20px;min-width:330px}
.inv-grid{display:grid;grid-template-columns:110px 1fr;row-gap:4px}
.inv-k{color:#6f6156}.inv-no{display:grid;grid-template-columns:auto auto;column-gap:12px;row-gap:4px;text-align:right;padding-top:6px}
.inv table{width:100%;border-collapse:collapse}
.inv th{text-align:left;color:#6f6156;font-weight:500;letter-spacing:.04em;padding:8px 0;border-bottom:1px solid #e6dccb}
.inv td{padding:10px 0;vertical-align:top;border-bottom:1px solid #f1ebe0}
.inv .r{text-align:right}.inv .c{text-align:center}.inv .num{font-variant-numeric:tabular-nums}
.inv-bottom{display:flex;justify-content:space-between;gap:30px;margin-top:48px}.inv-remarks{max-width:52%;line-height:1.7}
.inv-tot{width:290px}.inv-tot div{display:flex;justify-content:space-between;padding:4px 0}
.inv-grand{border-top:1px solid #cfc4b0;margin-top:4px;padding-top:7px !important;font-weight:600}
.inv-stamp{display:inline-block;margin-top:10px;border:2px solid #7a9a6e;color:#5f7f54;border-radius:8px;padding:3px 12px;font-weight:700;letter-spacing:.2em;transform:rotate(-4deg)}
.inv-sign{text-align:right;margin-top:40px}.inv-sign img{height:56px;display:inline-block}.inv-sign div{font-size:11px;letter-spacing:.25em;color:#6f6156;margin-top:4px}
.inv-foot{text-align:center;font-size:11px;color:#6f6156;margin-top:30px;line-height:1.7}
.inv-test{margin-bottom:12px;border:1px dashed #d97706;color:#b45309;border-radius:8px;padding:4px 10px;font-size:12px;display:inline-block}
@media print{.no-print{display:none!important}html,body{background:#fff!important}.inv{margin:0 auto}}
`;

function Invoice({ d }: { d: InvoiceDoc }) {
  const remarks = [d.kind, d.project ? `專案編號 Project no.: ${d.project}` : "", d.paymentRef ? `付款參考 Payment ref.: ${d.paymentRef}` : "", "已全數付款 Paid in full"].filter(Boolean);
  return (
    <div className="inv">
      <div className="inv-in">
        {d.isTest && <div className="inv-test">測試記錄 TEST — 不屬正式交易</div>}
        <div className="inv-top">
          <div className="inv-title">INVOICE</div>
          <div className="inv-brand">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/resoul-wordmark.png" alt={COMPANY.name} />
            <div className="inv-slogan">{COMPANY.tagline}</div>
          </div>
        </div>
        <div className="inv-meta">
          <div className="inv-box">
            <div className="inv-grid">
              <span className="inv-k">Issued to:</span><span>{d.issuedTo || "—"}</span>
              {d.pet && <><span className="inv-k">Owner of:</span><span>{d.pet}</span></>}
              <span className="inv-k">Phone number:</span><span>{d.phone || "—"}</span>
              {d.email && <><span className="inv-k">Email:</span><span style={{ wordBreak: "break-all" }}>{d.email}</span></>}
            </div>
          </div>
          <div className="inv-no">
            <span className="inv-k">Invoice No.:</span><b style={{ fontWeight: 500 }}>{d.no}</b>
            {d.project && <><span className="inv-k">Project No.:</span><span>{d.project}</span></>}
            <span className="inv-k">Date:</span><span>{date(d.date)}</span>
          </div>
        </div>
        <table>
          <thead>
            <tr><th style={{ width: 110 }}>ITEM CODE</th><th>DESCRIPTION</th><th className="r" style={{ width: 120 }}>UNIT PRICE</th><th className="c" style={{ width: 56 }}>QTY</th><th className="r" style={{ width: 120 }}>SUBTOTAL</th></tr>
          </thead>
          <tbody>
            {d.items.map((it, i) => (
              <tr key={i}>
                <td>{it.sku}</td>
                <td>{it.title}</td>
                <td className="r num">{it.unit != null ? money(it.unit) : "—"}</td>
                <td className="c num">{it.qty}</td>
                <td className="r num">{it.unit != null ? money(it.unit * it.qty) : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="inv-bottom">
          <div className="inv-remarks">
            <div className="inv-k" style={{ letterSpacing: ".04em", marginBottom: 4 }}>REMARKS</div>
            {remarks.map((r) => <div key={r}>{r}</div>)}
          </div>
          <div className="inv-tot">
            <div><span className="inv-k">SUBTOTAL</span><span className="num">{money(d.subtotal)}</span></div>
            <div><span className="inv-k">DISCOUNT</span><span className="num">{money(d.discount)}</span></div>
            <div className="inv-grand"><span>TOTAL（HKD）</span><span className="num">{money(d.total)}</span></div>
            <div style={{ justifyContent: "flex-end" }}><span className="inv-stamp">PAID</span></div>
          </div>
        </div>
        <div className="inv-sign">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/resoul-signature.png" alt={COMPANY.name} />
          <div>THANK YOU</div>
        </div>
        <div className="inv-foot">
          <p>{COMPANY.footer}</p>
          <p>{COMPANY.web} | {COMPANY.ig} | {COMPANY.tel} | {COMPANY.email}</p>
        </div>
      </div>
    </div>
  );
}

// 發票（可列印或另存 PDF）：?refs=deposit:<id>,booking:<id>,order:<id>；或 ?from=YYYY-MM-DD&to=YYYY-MM-DD&kinds=deposit,cremation,vet,order
export default async function InvoicesPage({ searchParams }: { searchParams: Promise<{ refs?: string; from?: string; to?: string; kinds?: string | string[] }> }) {
  const staff = await getStaff();
  if (!staff) redirect("/login");
  const p = await searchParams;
  const kinds = (Array.isArray(p.kinds) ? p.kinds : (p.kinds || "").split(",")).map((k) => k.trim()).filter(Boolean);
  const docs = await loadInvoices({ refs: p.refs ? p.refs.split(",").map((r) => r.trim()).filter(Boolean) : undefined, from: p.from, to: p.to, kinds }, staff);
  const range = p.from && p.to ? `${p.from} 至 ${p.to}` : "";

  return (
    <div className="inv-wrap min-h-screen px-3 py-6">
      <style>{CSS}</style>
      <PrintButton />
      <div className="no-print mx-auto mb-2 max-w-[820px] text-sm text-[#6f6156]">
        {docs.length ? `共 ${docs.length} 張發票${range ? `（付款日期 ${range}）` : ""}。按「列印」並選擇「另存為 PDF」即可下載。` : "沒有符合的已付款記錄（只限已付款並有 Shopify 訂單號的記錄）。"}
      </div>
      {docs.map((d) => <Invoice key={d.ref} d={d} />)}
    </div>
  );
}
