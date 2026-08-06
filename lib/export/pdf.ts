import type { FinancialReport, FinancialReportRow } from "./report-model";

const PAGE_WIDTH = 842;
const PAGE_HEIGHT = 595;
const MARGIN = 24;
const TITLE_HEIGHT = 28;
const SUBTITLE_HEIGHT = 18;
const HEADER_HEIGHT = 18;
const ROW_HEIGHT = 13;

type PdfColor = readonly [number, number, number];

const COLORS: Record<string, PdfColor> = {
  navy: [0.12, 0.31, 0.47],
  income: [0.89, 0.94, 0.85],
  expense: [0.85, 0.89, 0.95],
  result: [0.91, 0.90, 0.90],
  white: [1, 1, 1],
  black: [0, 0, 0],
  border: [0.72, 0.78, 0.86],
};

function latin1(value: string): Uint8Array {
  const normalized = value.normalize("NFC");
  const out = new Uint8Array(normalized.length);
  for (let i = 0; i < normalized.length; i += 1) {
    const code = normalized.charCodeAt(i);
    out[i] = code <= 255 ? code : 63;
  }
  return out;
}

function escapePdf(value: string): string {
  return value.replaceAll("\\", "\\\\").replaceAll("(", "\\(").replaceAll(")", "\\)");
}

function money(value: number): string {
  if (Math.abs(value) < 0.5) return "-";
  const formatted = Math.round(Math.abs(value)).toLocaleString("es-CL");
  return value < 0 ? `($ ${formatted})` : `$ ${formatted}`;
}

function number(value: number): string {
  return value.toLocaleString("es-CL", { minimumFractionDigits: Number.isInteger(value) ? 0 : 1, maximumFractionDigits: 1 });
}

function percent(value: number): string {
  return `${(value * 100).toLocaleString("es-CL", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`;
}

function displayValue(row: FinancialReportRow, value: number): string {
  if (row.valueKind === "percent") return percent(value);
  if (row.valueKind === "number") return number(value);
  return money(value);
}

function fillForTone(tone: FinancialReportRow["tone"]): PdfColor {
  if (tone === "income") return COLORS.income;
  if (tone === "expense") return COLORS.expense;
  if (tone === "result") return COLORS.result;
  return COLORS.white;
}

function textWidthApprox(text: string, fontSize: number): number {
  return text.length * fontSize * 0.48;
}

function drawText(text: string, x: number, y: number, size: number, bold = false): string {
  return `BT /${bold ? "F2" : "F1"} ${size} Tf ${x.toFixed(2)} ${y.toFixed(2)} Td (${escapePdf(text)}) Tj ET\n`;
}

function drawRightText(text: string, right: number, y: number, size: number, bold = false): string {
  return drawText(text, right - textWidthApprox(text, size), y, size, bold);
}

function rect(x: number, y: number, width: number, height: number, fill: PdfColor, stroke: PdfColor = COLORS.border): string {
  return `${fill[0]} ${fill[1]} ${fill[2]} rg ${stroke[0]} ${stroke[1]} ${stroke[2]} RG ${x} ${y} ${width} ${height} re B\n`;
}

function createPageContent(report: FinancialReport, rows: FinancialReportRow[], pageNumber: number, totalPages: number): string {
  const tableWidth = PAGE_WIDTH - MARGIN * 2;
  const labelWidth = Math.min(370, tableWidth * 0.55);
  const valueWidth = (tableWidth - labelWidth) / report.years.length;
  let y = PAGE_HEIGHT - MARGIN - TITLE_HEIGHT;
  let content = "";

  content += rect(MARGIN, y, tableWidth, TITLE_HEIGHT, COLORS.navy, COLORS.navy);
  content += `1 1 1 rg\n${drawText(report.title, MARGIN + 6, y + 9, 10, true)}`;
  y -= SUBTITLE_HEIGHT;
  content += rect(MARGIN, y, tableWidth, SUBTITLE_HEIGHT, COLORS.white);
  content += `0 0 0 rg\n${drawText(`${report.subtitle} · Página ${pageNumber}/${totalPages}`, MARGIN + 6, y + 5, 7, false)}`;
  y -= HEADER_HEIGHT;
  content += rect(MARGIN, y, labelWidth, HEADER_HEIGHT, COLORS.navy, COLORS.navy);
  content += `1 1 1 rg\n${drawText("DETALLE", MARGIN + labelWidth / 2 - 18, y + 5, 8, true)}`;
  report.years.forEach((year, index) => {
    const x = MARGIN + labelWidth + valueWidth * index;
    content += rect(x, y, valueWidth, HEADER_HEIGHT, COLORS.navy, COLORS.navy);
    content += `1 1 1 rg\n${drawRightText(String(year), x + valueWidth - 6, y + 5, 8, true)}`;
  });

  for (const row of rows) {
    y -= ROW_HEIGHT;
    const fill = fillForTone(row.tone);
    content += rect(MARGIN, y, labelWidth, ROW_HEIGHT, fill);
    content += `0 0 0 rg\n${drawText(row.label, MARGIN + 4, y + 4, 7, Boolean(row.bold || row.tone === "section"))}`;
    row.values.forEach((value, index) => {
      const x = MARGIN + labelWidth + valueWidth * index;
      content += rect(x, y, valueWidth, ROW_HEIGHT, fill);
      content += `0 0 0 rg\n${drawRightText(displayValue(row, value), x + valueWidth - 4, y + 4, 7, Boolean(row.bold || row.tone === "section"))}`;
    });
  }
  return content;
}

function buildPdf(objects: Array<string | Uint8Array>): Uint8Array {
  const header = latin1("%PDF-1.4\n%âãÏÓ\n");
  const chunks: Uint8Array[] = [header];
  const offsets: number[] = [0];
  let offset = header.length;
  objects.forEach((object, index) => {
    offsets.push(offset);
    const prefix = latin1(`${index + 1} 0 obj\n`);
    const body = typeof object === "string" ? latin1(object) : object;
    const suffix = latin1("\nendobj\n");
    chunks.push(prefix, body, suffix);
    offset += prefix.length + body.length + suffix.length;
  });
  const xrefOffset = offset;
  let xref = `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (let i = 1; i <= objects.length; i += 1) xref += `${String(offsets[i]).padStart(10, "0")} 00000 n \n`;
  xref += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;
  chunks.push(latin1(xref));
  const total = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const output = new Uint8Array(total);
  let position = 0;
  for (const chunk of chunks) { output.set(chunk, position); position += chunk.length; }
  return output;
}

export function createFinancialReportPdf(report: FinancialReport): Uint8Array {
  const maxRows = Math.max(1, Math.floor((PAGE_HEIGHT - MARGIN * 2 - TITLE_HEIGHT - SUBTITLE_HEIGHT - HEADER_HEIGHT) / ROW_HEIGHT));
  const pages: FinancialReportRow[][] = [];
  for (let index = 0; index < report.rows.length; index += maxRows) pages.push(report.rows.slice(index, index + maxRows));

  const objects: Array<string | Uint8Array> = [];
  objects.push("<< /Type /Catalog /Pages 2 0 R >>");
  const pageObjectIds = pages.map((_, index) => 5 + index * 2);
  objects.push(`<< /Type /Pages /Count ${pages.length} /Kids [${pageObjectIds.map((id) => `${id} 0 R`).join(" ")}] >>`);
  objects.push("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>");
  objects.push("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>");

  pages.forEach((rows, index) => {
    const pageId = 5 + index * 2;
    const contentId = pageId + 1;
    const content = latin1(createPageContent(report, rows, index + 1, pages.length));
    objects.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE_WIDTH} ${PAGE_HEIGHT}] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${contentId} 0 R >>`);
    objects.push(latin1(`<< /Length ${content.length} >>\nstream\n${new TextDecoder("latin1").decode(content)}\nendstream`));
  });
  return buildPdf(objects);
}
