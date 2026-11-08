// 發票 Word 版（.docx）：內容與 PDF 版相同（共用 InvoiceDoc），可再編輯
import {
  AlignmentType,
  BorderStyle,
  Document,
  ImageRun,
  Packer,
  Paragraph,
  Table,
  TableCell,
  TableRow,
  TabStopType,
  TextRun,
  VerticalAlign,
  WidthType,
} from "docx";
import { COMPANY } from "@/lib/company";
import type { InvoiceDoc } from "@/lib/invoices";
import { invoiceDate, invoiceMoney, invoiceRemarks, invoiceTotals } from "./_invoice";

export type InvoiceImages = { wordmark?: Uint8Array | null; signature?: Uint8Array | null };

const INK = "3B2F27";
const SOFT = "6F6156";
const LINE = "CFC4B0";
const LIGHT = "E6DCCB";
const AMBER = "B45309";
const WIDTH = 9906; // A4 減左右邊界 1000
const FONT = { ascii: "Georgia", hAnsi: "Georgia", eastAsia: "Microsoft JhengHei", cs: "Microsoft JhengHei" };

const none = { style: BorderStyle.NONE, size: 0, color: "FFFFFF" };
const noBorders = { top: none, bottom: none, left: none, right: none, insideHorizontal: none, insideVertical: none };
const box = { style: BorderStyle.SINGLE, size: 6, color: LINE };
const pad = (top: number, bottom: number, left = 0, right = 0) => ({ top, bottom, left, right });

function text(value: string, opts: { size?: number; color?: string; bold?: boolean; italics?: boolean; font?: typeof FONT } = {}) {
  return new TextRun({ text: value, font: opts.font || FONT, size: opts.size || 20, color: opts.color || INK, bold: opts.bold, italics: opts.italics });
}

function pairs(rows: [string, string][], valueAlign: (typeof AlignmentType)[keyof typeof AlignmentType], labelWidth: number, valueWidth: number) {
  return new Table({
    width: { size: labelWidth + valueWidth, type: WidthType.DXA },
    columnWidths: [labelWidth, valueWidth],
    borders: noBorders,
    rows: rows.map(([k, v]) => new TableRow({
      children: [
        new TableCell({ width: { size: labelWidth, type: WidthType.DXA }, borders: noBorders, margins: pad(30, 30), children: [new Paragraph({ children: [text(k, { color: SOFT })] })] }),
        new TableCell({ width: { size: valueWidth, type: WidthType.DXA }, borders: noBorders, margins: pad(30, 30), children: [new Paragraph({ alignment: valueAlign, children: [text(v)] })] }),
      ],
    })),
  });
}

function invoiceBlocks(d: InvoiceDoc, images: InvoiceImages, first: boolean) {
  const blocks: (Paragraph | Table)[] = [];
  // 每張發票由新一頁開始
  blocks.push(new Paragraph({
    pageBreakBefore: !first,
    spacing: { after: 120 },
    children: d.isTest ? [text("測試記錄 TEST — 不屬正式交易", { size: 18, color: AMBER })] : [],
  }));

  // 標題及品牌
  const brand: Paragraph[] = [];
  if (images.wordmark) {
    brand.push(new Paragraph({ alignment: AlignmentType.RIGHT, children: [new ImageRun({ type: "png", data: images.wordmark, transformation: { width: 95, height: 53 } })] }));
  } else {
    brand.push(new Paragraph({ alignment: AlignmentType.RIGHT, children: [text(COMPANY.name, { size: 36 })] }));
  }
  brand.push(new Paragraph({ alignment: AlignmentType.RIGHT, children: [text(COMPANY.tagline, { size: 17, color: SOFT, italics: true })] }));
  blocks.push(new Table({
    width: { size: WIDTH, type: WidthType.DXA },
    columnWidths: [3000, WIDTH - 3000],
    borders: noBorders,
    rows: [new TableRow({ children: [
      new TableCell({
        width: { size: 3000, type: WidthType.DXA },
        verticalAlign: VerticalAlign.CENTER,
        borders: { top: box, bottom: box, left: box, right: box },
        margins: pad(110, 110, 120, 120),
        children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: "INVOICE", font: FONT, size: 44, color: SOFT, characterSpacing: 60 })] })],
      }),
      new TableCell({ width: { size: WIDTH - 3000, type: WidthType.DXA }, borders: noBorders, verticalAlign: VerticalAlign.CENTER, children: brand }),
    ] })],
  }));
  blocks.push(new Paragraph({ spacing: { after: 240 }, children: [] }));

  // 客人及發票資料
  const issued: [string, string][] = [["Issued to:", d.issuedTo || "—"]];
  if (d.pet) issued.push(["Owner of:", d.pet]);
  issued.push(["Phone number:", d.phone || "—"]);
  const info: [string, string][] = [["Invoice No.:", d.no]];
  info.push(["Date:", invoiceDate(d.date)]);
  const left = 5500;
  blocks.push(new Table({
    width: { size: WIDTH, type: WidthType.DXA },
    columnWidths: [left, WIDTH - left],
    borders: noBorders,
    rows: [new TableRow({ children: [
      new TableCell({
        width: { size: left, type: WidthType.DXA },
        borders: { top: box, bottom: box, left: box, right: box },
        margins: pad(120, 120, 160, 160),
        children: [pairs(issued, AlignmentType.LEFT, 1650, left - 1650 - 340), new Paragraph({ children: [] })],
      }),
      new TableCell({
        width: { size: WIDTH - left, type: WidthType.DXA },
        borders: noBorders,
        margins: pad(60, 0, 300, 0),
        children: [pairs(info, AlignmentType.RIGHT, 1400, WIDTH - left - 300 - 1400), new Paragraph({ children: [] })],
      }),
    ] })],
  }));
  blocks.push(new Paragraph({ spacing: { after: 240 }, children: [] }));

  // 項目
  const cols = [1300, 4306, 1600, 700, 2000];
  const headLine = { style: BorderStyle.SINGLE, size: 6, color: LIGHT };
  const cell = (i: number, children: TextRun, align: (typeof AlignmentType)[keyof typeof AlignmentType], head: boolean) => new TableCell({
    width: { size: cols[i], type: WidthType.DXA },
    borders: { top: none, left: none, right: none, bottom: head ? headLine : { style: BorderStyle.SINGLE, size: 4, color: "F1EBE0" } },
    margins: pad(100, 100, 0, i === cols.length - 1 ? 0 : 80),
    children: [new Paragraph({ alignment: align, children: [children] })],
  });
  const aligns = [AlignmentType.LEFT, AlignmentType.LEFT, AlignmentType.RIGHT, AlignmentType.CENTER, AlignmentType.RIGHT];
  blocks.push(new Table({
    width: { size: WIDTH, type: WidthType.DXA },
    columnWidths: cols,
    borders: noBorders,
    rows: [
      new TableRow({ tableHeader: true, children: ["ITEM CODE", "DESCRIPTION", "UNIT PRICE", "QTY", "SUBTOTAL"].map((h, i) => cell(i, text(h, { color: SOFT, size: 18 }), aligns[i], true)) }),
      ...d.items.map((it) => new TableRow({ children: [
        it.sku,
        it.title,
        it.unit != null ? invoiceMoney(it.unit) : "—",
        String(it.qty),
        it.unit != null ? invoiceMoney(it.unit * it.qty) : "—",
      ].map((v, i) => cell(i, text(v), aligns[i], false)) })),
    ],
  }));
  blocks.push(new Paragraph({ spacing: { after: 360 }, children: [] }));

  // 備註及總計
  const totalsWidth = 3700;
  const tab = [{ type: TabStopType.RIGHT, position: totalsWidth }];
  const line = (k: string, v: string, grand = false) => new Paragraph({
    tabStops: tab,
    spacing: { before: 50, after: 50 },
    border: grand ? { top: { style: BorderStyle.SINGLE, size: 6, color: LINE, space: 6 } } : undefined,
    children: [text(k, { color: grand ? INK : SOFT, bold: grand }), new TextRun({ text: `\t${v}`, font: FONT, size: 20, color: INK, bold: grand })],
  });
  blocks.push(new Table({
    width: { size: WIDTH, type: WidthType.DXA },
    columnWidths: [WIDTH - totalsWidth, totalsWidth],
    borders: noBorders,
    rows: [new TableRow({ children: [
      new TableCell({
        width: { size: WIDTH - totalsWidth, type: WidthType.DXA },
        borders: noBorders,
        margins: pad(0, 0, 0, 300),
        children: [
          new Paragraph({ spacing: { after: 60 }, children: [text("REMARKS", { color: SOFT })] }),
          ...invoiceRemarks(d).map((r) => new Paragraph({ spacing: { after: 40 }, children: [text(r)] })),
        ],
      }),
      new TableCell({
        width: { size: totalsWidth, type: WidthType.DXA },
        borders: noBorders,
        children: [
          ...invoiceTotals(d).map(([k, v], i, all) => line(k.toUpperCase(), invoiceMoney(v), i === all.length - 1)),
        ],
      }),
    ] })],
  }));

  // 簽名及頁尾
  const sign: (ImageRun | TextRun)[] = images.signature ? [new ImageRun({ type: "png", data: images.signature, transformation: { width: 130, height: 56 } })] : [];
  blocks.push(new Paragraph({ alignment: AlignmentType.RIGHT, spacing: { before: 480 }, children: sign }));
  blocks.push(new Paragraph({ alignment: AlignmentType.RIGHT, spacing: { after: 360 }, children: [new TextRun({ text: "THANK YOU", font: FONT, size: 17, color: SOFT, characterSpacing: 50 })] }));
  blocks.push(new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 60 }, children: [text(COMPANY.footer, { size: 17, color: SOFT })] }));
  blocks.push(new Paragraph({ alignment: AlignmentType.CENTER, children: [text(`${COMPANY.web} | ${COMPANY.ig} | ${COMPANY.tel} | ${COMPANY.email}`, { size: 17, color: SOFT })] }));
  return blocks;
}

export async function buildInvoicesDocx(docs: InvoiceDoc[], images: InvoiceImages): Promise<Buffer> {
  const doc = new Document({
    creator: COMPANY.name,
    title: docs.length === 1 ? `Invoice ${docs[0].no}` : "Resoul Invoices",
    sections: [{
      properties: { page: { size: { width: 11906, height: 16838 }, margin: { top: 800, bottom: 800, left: 1000, right: 1000 } } },
      children: docs.flatMap((d, i) => invoiceBlocks(d, images, i === 0)),
    }],
  });
  return Packer.toBuffer(doc);
}
