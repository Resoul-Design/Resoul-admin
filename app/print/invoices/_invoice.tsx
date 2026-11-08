import { COMPANY } from "@/lib/company";
import type { InvoiceDoc } from "@/lib/invoices";

// 發票版面（列印頁及預覽共用）
export const invoiceMoney = (n: number) => "HKD " + Number(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export const invoiceDate = (iso: string) =>
  iso ? new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "Asia/Hong_Kong" }) : "—";

export const INVOICE_CSS = `
@import url('https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,400;0,500;0,600;1,500&family=Noto+Serif+TC:wght@400;500;600&display=swap');
@page{size:A4;margin:10mm}
.inv-wrap{background:#fff;-webkit-print-color-adjust:exact;print-color-adjust:exact}
.inv{max-width:820px;margin:24px auto;font-family:'Cormorant Garamond','Noto Serif TC','Times New Roman',serif;color:#3a352f;background:#fffdf9;font-size:14.5px;line-height:1.5;-webkit-font-smoothing:antialiased;border:1.5px solid #b7b1a6;padding:5px;break-after:page}
.inv:last-child{break-after:auto}
.inv-in{border:1px solid #d3cdc2;padding:40px 44px 30px}
.inv-top{display:flex;justify-content:space-between;align-items:flex-start}
.inv-title{border:1px solid #cfc9be;border-radius:18px;padding:16px 34px;font-size:46px;font-weight:500;letter-spacing:.12em;color:#4a453e;line-height:1}
.inv-brand{text-align:right}.inv-brand img{height:74px;width:auto;display:inline-block}
.inv-slogan{font-style:italic;font-size:12px;color:#6f6a63;margin-top:4px}
.inv-meta{display:flex;justify-content:space-between;align-items:flex-start;margin-top:26px;gap:30px}
.inv-box{border:1px solid #cfc9be;border-radius:16px;padding:16px 22px;min-width:320px}
.inv-row{display:flex;gap:10px;margin:2px 0}.inv-row .inv-k{min-width:96px}
.inv-k{color:#6f6a63}
.inv-no{padding-top:14px}.inv-no .inv-row{gap:16px;margin:3px 0}.inv-no .inv-k{min-width:92px}
.inv table{width:100%;border-collapse:collapse;table-layout:fixed;margin-top:34px}
.inv th{font-weight:500;color:#77716a;text-align:left;font-size:13px;letter-spacing:.14em;text-transform:uppercase;padding-bottom:14px;border-bottom:1px solid #e4ded4}
.inv td{padding:15px 0;vertical-align:top;font-size:15px;font-weight:500;line-height:1.55;letter-spacing:.01em}
.inv .code{color:#5f5b55;font-size:13px;letter-spacing:.02em;padding-right:26px}
.inv .desc{color:#4b463f;padding-left:8px}
.inv .r{text-align:right;white-space:nowrap}.inv .c{text-align:center}.inv .price{padding-right:26px}
.inv .num{font-variant-numeric:lining-nums tabular-nums;font-feature-settings:"lnum" 1,"tnum" 1}
.inv-bottom{display:flex;justify-content:space-between;margin-top:46px;gap:40px}
.inv-remarks{flex:1 1 auto;max-width:52%}
.inv-remarks .h{color:#6f6a63;letter-spacing:.14em;text-transform:uppercase;font-size:12px;margin-bottom:6px}
.inv-remarks .b{color:#4a453e;line-height:1.6;white-space:pre-wrap}.inv-remarks .empty{color:#b0a79a}
.inv-tot{min-width:300px}.inv-tot div{display:flex;justify-content:space-between;gap:22px;padding:5px 0}
.inv-tot .inv-k{letter-spacing:.1em;text-transform:uppercase;font-size:12px}.inv-tot .v{color:#3a352f;white-space:nowrap}
.inv-grand{border-top:1px solid #e4ded4;margin-top:6px;padding-top:10px !important}
.inv-grand .inv-k,.inv-grand .v{font-weight:600;color:#2f2b25;letter-spacing:.08em}
.inv-sign{text-align:right;margin-top:24px}.inv-sign img{display:inline-block;width:190px;max-width:38%;height:auto}
.inv-sign div{letter-spacing:.3em;color:#5d6f62;font-size:15px;margin-top:10px}
.inv-foot{text-align:center;margin-top:20px;color:#6f6a63}.inv-foot .msg{font-size:14px}.inv-foot .contact{font-size:11.5px;letter-spacing:.04em;margin-top:4px;color:#8a8379}
.inv-test{margin-bottom:12px;border:1px dashed #d97706;color:#b45309;border-radius:8px;padding:4px 10px;font-size:12px;display:inline-block}
@media screen and (min-width:641px) and (max-width:900px){.inv-in{padding:30px 26px 24px}.inv-title{font-size:38px;padding:12px 26px}.inv-brand img{height:60px}.inv-box{min-width:280px}.inv th{font-size:11.5px;letter-spacing:.08em}.inv td{font-size:14px}.inv .code{padding-right:12px}.inv .price{padding-right:14px}.inv-bottom{gap:24px}.inv-tot{min-width:260px}}
@media screen and (max-width:640px){.inv{font-size:13px;margin:12px auto}.inv-in{padding:22px 16px 18px}.inv-top{flex-direction:column-reverse;align-items:flex-start;gap:14px}.inv-brand{text-align:left}.inv-brand img{height:48px}.inv-title{font-size:30px;padding:10px 20px;border-radius:14px}.inv-meta{flex-direction:column-reverse;gap:12px;margin-top:18px}.inv-box{min-width:0;width:100%;padding:12px 14px}.inv-row .inv-k,.inv-no .inv-k{min-width:104px}.inv-no{padding-top:0}.inv table{margin-top:22px;table-layout:auto}.inv colgroup,.inv thead{display:none}.inv table,.inv tbody,.inv tr,.inv td{display:block;width:100%!important}.inv tr{border-bottom:1px solid #e4ded4;padding:12px 0}.inv td{padding:2px 0;font-size:14px}.inv .desc{padding-left:0}.inv .code{padding-right:0}.inv td.code:empty{display:none}.inv td[data-label]{display:flex;justify-content:space-between;gap:12px;text-align:right;padding-right:0}.inv td[data-label]::before{content:attr(data-label);color:#8a8379;font-size:11px;letter-spacing:.1em;text-transform:uppercase;text-align:left}.inv-bottom{flex-direction:column;gap:22px;margin-top:26px}.inv-remarks{max-width:100%}.inv-tot{min-width:0;width:100%}.inv-sign img{width:140px;max-width:50%}}
@media print{.no-print{display:none!important}html,body{background:#fff!important}.inv{margin:0 auto}}
`;

// Remarks：有 Shopify 訂單時與 Order Printer 範本相同（訂單備註＋附加資料）；否則用後台資料
export const invoiceRemarks = (d: InvoiceDoc) =>
  d.remarks ?? [d.kind, d.project && d.project !== d.no ? `專案編號 Project no.: ${d.project}` : "", d.paymentRef ? `付款參考 Payment ref.: ${d.paymentRef}` : ""].filter(Boolean);

// 金額欄：Total＝項目合計；Deposits＝已付金額；Balance to settle＝餘額（發票只限已付款，故為 0）
export const invoiceTotals = (d: InvoiceDoc): [string, number][] => [
  ["Total", d.subtotal],
  ["Discount", d.discount],
  ["Deposits", d.total],
  ["Balance to settle", Math.max(0, d.subtotal - d.discount - d.total)],
];

export function Invoice({ d }: { d: InvoiceDoc }) {
  const remarks = invoiceRemarks(d);
  const money = invoiceMoney;
  const totals = invoiceTotals(d);
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
            <div className="inv-row"><span className="inv-k">Issued to:</span><span>{d.issuedTo || "—"}</span></div>
            {d.pet && <div className="inv-row"><span className="inv-k">Owner of:</span><span>{d.pet}</span></div>}
            <div className="inv-row"><span className="inv-k">Phone number:</span><span>{d.phone || "—"}</span></div>
          </div>
          <div className="inv-no">
            <div className="inv-row"><span className="inv-k">Invoice No.:</span><span>{d.no}</span></div>
            <div className="inv-row"><span className="inv-k">Date:</span><span>{invoiceDate(d.date)}</span></div>
          </div>
        </div>
        <table>
          <colgroup><col style={{ width: "20%" }} /><col style={{ width: "38%" }} /><col style={{ width: "15%" }} /><col style={{ width: "9%" }} /><col style={{ width: "18%" }} /></colgroup>
          <thead>
            <tr><th>Item Code</th><th>Description</th><th className="r price">Unit Price</th><th className="c">Qty</th><th className="r">Subtotal</th></tr>
          </thead>
          <tbody>
            {d.items.map((it, i) => (
              <tr key={i}>
                <td className="code" data-label="Item Code">{it.sku}</td>
                <td className="desc">{it.title}</td>
                <td className="r price num" data-label="Unit Price">{it.unit != null ? money(it.unit) : "—"}</td>
                <td className="c num" data-label="Qty">{it.qty}</td>
                <td className="r num" data-label="Subtotal">{it.unit != null ? money(it.unit * it.qty) : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="inv-bottom">
          <div className="inv-remarks">
            <div className="h">Remarks</div>
            {remarks.length ? remarks.map((r, i) => <div key={i} className="b">{r}</div>) : <div className="b empty">—</div>}
          </div>
          <div className="inv-tot">
            {totals.map(([k, v], i) => (
              <div key={k} className={i === totals.length - 1 ? "inv-grand" : undefined}><span className="inv-k">{k}</span><span className="v num">{money(v)}</span></div>
            ))}
          </div>
        </div>
        <div className="inv-sign">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/resoul-signature.png" alt={COMPANY.name} />
          <div>THANK YOU</div>
        </div>
        <div className="inv-foot">
          <div className="msg">{COMPANY.footer}</div>
          <div className="contact">{COMPANY.web} | {COMPANY.ig} | {COMPANY.tel} | {COMPANY.email}</div>
        </div>
      </div>
    </div>
  );
}
