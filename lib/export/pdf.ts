import type { FinancialReport, FinancialReportRow, ParameterReport, ParameterReportRow } from "./report-model";
import type { FinancialNarrative, NarrativeSection } from "./financial-narrative";

const PAGE_WIDTH = 595;
const PAGE_HEIGHT = 842;
const COVER_PAGE_WIDTH = 595;
const COVER_PAGE_HEIGHT = 842;
const MARGIN = 24;
const TITLE_HEIGHT = 34;
const SUBTITLE_HEIGHT = 18;
const HEADER_HEIGHT = 18;
const ROW_HEIGHT = 14;
const PARAMETER_BASE_ROW_HEIGHT = 15;

type PdfColor = readonly [number, number, number];

export interface PdfCover {
  jpegBytes: Uint8Array;
  imageWidth: number;
  imageHeight: number;
  title: string;
  subtitle: string;
}

const COLORS: Record<string, PdfColor> = {
  navy: [0.12, 0.31, 0.47],
  income: [0.89, 0.94, 0.85],
  expense: [0.85, 0.89, 0.95],
  result: [0.91, 0.90, 0.90],
  section: [0.93, 0.94, 0.96],
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

function concatBytes(parts: Uint8Array[]): Uint8Array {
  const length = parts.reduce((total, part) => total + part.length, 0);
  const output = new Uint8Array(length);
  let offset = 0;
  for (const part of parts) {
    output.set(part, offset);
    offset += part.length;
  }
  return output;
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

function displayParameterValue(row: ParameterReportRow): string {
  if (typeof row.value === "string") return row.value;
  if (row.valueKind === "percent") return percent(row.value);
  if (row.valueKind === "currency") return money(row.value);
  return number(row.value);
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

function wrapText(text: string, width: number, size: number): string[] {
  const clean = text.trim();
  if (!clean) return [""];
  const words = clean.split(/\s+/);
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (textWidthApprox(candidate, size) <= width || !current) {
      current = candidate;
    } else {
      lines.push(current);
      current = word;
    }
  }
  if (current) lines.push(current);
  return lines;
}

function createFinancialPageContent(report: FinancialReport, rows: FinancialReportRow[], pageNumber: number, totalPages: number): string {
  const tableWidth = PAGE_WIDTH - MARGIN * 2;
  const labelWidth = Math.min(255, tableWidth * 0.48);
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

const PARAMETER_WIDTHS = [82, 175, 60, 90, PAGE_WIDTH - MARGIN * 2 - 82 - 175 - 60 - 90];

function parameterRowLayout(row: ParameterReportRow) {
  const fontSize = 6.2;
  const columns = [row.section, row.parameter, row.period, displayParameterValue(row), row.detail ?? ""];
  const lines = columns.map((text, index) => wrapText(text, PARAMETER_WIDTHS[index] - 8, fontSize));
  const lineCount = Math.max(...lines.map((item) => item.length));
  const height = Math.max(PARAMETER_BASE_ROW_HEIGHT, lineCount * 8 + 5);
  return { columns: lines, height, fontSize };
}

function paginateParameterRows(rows: ParameterReportRow[]): ParameterReportRow[][] {
  const available = PAGE_HEIGHT - MARGIN * 2 - TITLE_HEIGHT - SUBTITLE_HEIGHT - HEADER_HEIGHT;
  const pages: ParameterReportRow[][] = [];
  let current: ParameterReportRow[] = [];
  let used = 0;
  for (const row of rows) {
    const height = parameterRowLayout(row).height;
    if (current.length && used + height > available) {
      pages.push(current);
      current = [];
      used = 0;
    }
    current.push(row);
    used += height;
  }
  if (current.length || pages.length === 0) pages.push(current);
  return pages;
}

function createParameterPageContent(report: ParameterReport, rows: ParameterReportRow[], pageNumber: number, totalPages: number): string {
  const tableWidth = PAGE_WIDTH - MARGIN * 2;
  let y = PAGE_HEIGHT - MARGIN - TITLE_HEIGHT;
  let content = "";

  content += rect(MARGIN, y, tableWidth, TITLE_HEIGHT, COLORS.navy, COLORS.navy);
  content += `1 1 1 rg\n${drawText(report.title, MARGIN + 6, y + 9, 10, true)}`;
  y -= SUBTITLE_HEIGHT;
  content += rect(MARGIN, y, tableWidth, SUBTITLE_HEIGHT, COLORS.white);
  content += `0 0 0 rg\n${drawText(`${report.subtitle} · Página ${pageNumber}/${totalPages}`, MARGIN + 6, y + 5, 7, false)}`;
  y -= HEADER_HEIGHT;

  const headers = ["SECCIÓN", "PARÁMETRO", "PERIODO", "VALOR", "UNIDAD / DETALLE"];
  let x = MARGIN;
  headers.forEach((header, index) => {
    const width = PARAMETER_WIDTHS[index];
    content += rect(x, y, width, HEADER_HEIGHT, COLORS.navy, COLORS.navy);
    content += `1 1 1 rg\n${drawText(header, x + 4, y + 5, 7, true)}`;
    x += width;
  });

  let previousSection = "";
  for (const row of rows) {
    const layout = parameterRowLayout(row);
    y -= layout.height;
    const sectionChanged = row.section !== previousSection;
    const fill = sectionChanged ? COLORS.section : COLORS.white;
    x = MARGIN;
    layout.columns.forEach((lines, index) => {
      const width = PARAMETER_WIDTHS[index];
      content += rect(x, y, width, layout.height, fill);
      lines.forEach((line, lineIndex) => {
        content += `0 0 0 rg\n${drawText(line, x + 4, y + layout.height - 9 - lineIndex * 8, layout.fontSize, sectionChanged && index === 0)}`;
      });
      x += width;
    });
    previousSection = row.section;
  }
  return content;
}

function createCoverPageContent(cover: PdfCover): string {
  const scale = Math.min(COVER_PAGE_WIDTH / cover.imageWidth, COVER_PAGE_HEIGHT / cover.imageHeight);
  const drawWidth = cover.imageWidth * scale;
  const drawHeight = cover.imageHeight * scale;
  const imageX = (COVER_PAGE_WIDTH - drawWidth) / 2;
  const imageY = (COVER_PAGE_HEIGHT - drawHeight) / 2;
  const right = COVER_PAGE_WIDTH - 50;
  const maxTitleWidth = 410;
  const titleSize = cover.title.length > 70 ? 25 : cover.title.length > 48 ? 29 : cover.title.length > 30 ? 32 : 35;
  const titleLines = wrapText(cover.title, maxTitleWidth, titleSize);
  const subtitleLines = cover.subtitle
    .split("\n")
    .flatMap((line) => wrapText(line, maxTitleWidth, 14));

  // El bloque se centra deliberadamente en la zona media de la portada y
  // mantiene alineación a la derecha, tal como se usa en la identidad visual.
  const titleHeight = titleLines.length * (titleSize + 6);
  const subtitleHeight = subtitleLines.length * 20;
  const blockHeight = titleHeight + 28 + subtitleHeight;
  let y = COVER_PAGE_HEIGHT * 0.56 + blockHeight / 2;
  let content = rect(0, 0, COVER_PAGE_WIDTH, COVER_PAGE_HEIGHT, [0.015, 0.20, 0.50], [0.015, 0.20, 0.50]);
  content += `q ${drawWidth.toFixed(2)} 0 0 ${drawHeight.toFixed(2)} ${imageX.toFixed(2)} ${imageY.toFixed(2)} cm /Im1 Do Q\n`;

  content += "1 1 1 rg\n";
  for (const line of titleLines) {
    content += drawRightText(line, right, y, titleSize, true);
    y -= titleSize + 6;
  }
  y -= 8;
  content += `1 1 1 RG 1.5 w ${(right - 190).toFixed(2)} ${y.toFixed(2)} m ${right.toFixed(2)} ${y.toFixed(2)} l S\n`;
  y -= 27;
  for (const line of subtitleLines) {
    content += drawRightText(line, right, y, 14, false);
    y -= 20;
  }
  return content;
}


function narrativeLines(section: NarrativeSection, width: number): Array<{ text: string; bold: boolean; gapAfter?: number }> {
  const lines: Array<{ text: string; bold: boolean; gapAfter?: number }> = [];
  for (const line of wrapText(section.heading, width, 10)) lines.push({ text: line, bold: true });
  lines.push({ text: "", bold: false, gapAfter: 3 });
  for (const paragraph of section.paragraphs) {
    for (const line of wrapText(paragraph, width, 8.5)) lines.push({ text: line, bold: false });
    lines.push({ text: "", bold: false, gapAfter: 5 });
  }
  return lines;
}

function createNarrativePages(narrative: FinancialNarrative): string[][] {
  const width = PAGE_WIDTH - MARGIN * 2;
  const entries: Array<{ text: string; bold: boolean; gapAfter?: number }> = [];
  narrative.sections.forEach((section) => entries.push(...narrativeLines(section, width)));
  const pages: string[][] = [];
  let current: string[] = [];
  let used = 0;
  const maxHeight = PAGE_HEIGHT - MARGIN * 2 - 65;
  for (const entry of entries) {
    const height = entry.text ? 12 : (entry.gapAfter ?? 4);
    if (used + height > maxHeight && current.length) { pages.push(current); current = []; used = 0; }
    current.push(`${entry.bold ? "B" : "R"}|${entry.text}`);
    used += height;
  }
  if (current.length) pages.push(current);
  return pages;
}

function createNarrativePageContent(narrative: FinancialNarrative, lines: string[], page: number, totalPages: number): string {
  let content = "";
  content += drawText(narrative.title, MARGIN, PAGE_HEIGHT - MARGIN - 10, 16, true);
  content += drawText("Relato técnico-financiero construido exclusivamente desde el presupuesto y sus parámetros", MARGIN, PAGE_HEIGHT - MARGIN - 28, 8, false);
  let y = PAGE_HEIGHT - MARGIN - 55;
  for (const encoded of lines) {
    const bold = encoded.startsWith("B|");
    const text = encoded.slice(2);
    if (!text) { y -= 5; continue; }
    content += drawText(text, MARGIN, y, bold ? 10 : 8.5, bold);
    y -= 12;
  }
  content += drawRightText(`Página ${page} de ${totalPages}`, PAGE_WIDTH - MARGIN, 14, 7, false);
  return content;
}

function jpegObject(cover: PdfCover): Uint8Array {
  return concatBytes([
    latin1(`<< /Type /XObject /Subtype /Image /Width ${cover.imageWidth} /Height ${cover.imageHeight} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${cover.jpegBytes.length} >>\nstream\n`),
    cover.jpegBytes,
    latin1("\nendstream"),
  ]);
}

function streamObject(content: string): Uint8Array {
  const bytes = latin1(content);
  return concatBytes([latin1(`<< /Length ${bytes.length} >>\nstream\n`), bytes, latin1("\nendstream")]);
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

export function createFinancialReportPdf(report: FinancialReport, parameterReport?: ParameterReport, cover?: PdfCover, narrative?: FinancialNarrative): Uint8Array {
  // PDF completamente vertical. Para mantener legibilidad, cuando existen
  // muchos años el flujo se divide en grupos de hasta 3 años, pero conserva
  // todas las filas y todos los valores del presupuesto.
  const maxRows = Math.max(1, Math.floor((PAGE_HEIGHT - MARGIN * 2 - TITLE_HEIGHT - SUBTITLE_HEIGHT - HEADER_HEIGHT) / ROW_HEIGHT));
  const rowPages: FinancialReportRow[][] = [];
  for (let index = 0; index < report.rows.length; index += maxRows) rowPages.push(report.rows.slice(index, index + maxRows));

  const yearChunkSize = 3;
  const financialPageSpecs: Array<{ report: FinancialReport; rows: FinancialReportRow[] }> = [];
  for (let yearStart = 0; yearStart < report.years.length; yearStart += yearChunkSize) {
    const yearEnd = Math.min(report.years.length, yearStart + yearChunkSize);
    const subReport: FinancialReport = {
      ...report,
      years: report.years.slice(yearStart, yearEnd),
      subtitle: `${report.subtitle} · Años ${report.years.slice(yearStart, yearEnd).join(", ")}`,
    };
    for (const pageRows of rowPages) {
      financialPageSpecs.push({
        report: subReport,
        rows: pageRows.map((row) => ({ ...row, values: row.values.slice(yearStart, yearEnd) })),
      });
    }
  }

  const narrativePages = narrative ? createNarrativePages(narrative) : [];
  const parameterPages = parameterReport ? paginateParameterRows(parameterReport.rows) : [];
  const hasCover = Boolean(cover?.jpegBytes.length);
  const totalPages = financialPageSpecs.length + narrativePages.length + parameterPages.length + (hasCover ? 1 : 0);

  const regularPageContents: string[] = [];
  const pageOffset = hasCover ? 1 : 0;
  financialPageSpecs.forEach((spec, index) => {
    regularPageContents.push(createFinancialPageContent(spec.report, spec.rows, pageOffset + index + 1, totalPages));
  });
  narrativePages.forEach((lines, index) => {
    regularPageContents.push(createNarrativePageContent(narrative!, lines, pageOffset + financialPageSpecs.length + index + 1, totalPages));
  });
  parameterPages.forEach((rows, index) => {
    regularPageContents.push(createParameterPageContent(parameterReport!, rows, pageOffset + financialPageSpecs.length + narrativePages.length + index + 1, totalPages));
  });

  const regularStartId = hasCover ? 8 : 5;
  const regularPageIds = regularPageContents.map((_, index) => regularStartId + index * 2);
  const allPageIds = hasCover ? [6, ...regularPageIds] : regularPageIds;

  const objects: Array<string | Uint8Array> = [];
  objects.push("<< /Type /Catalog /Pages 2 0 R >>");
  objects.push(`<< /Type /Pages /Count ${allPageIds.length} /Kids [${allPageIds.map((id) => `${id} 0 R`).join(" ")}] >>`);
  objects.push("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>");
  objects.push("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>");

  if (hasCover && cover) {
    objects.push(jpegObject(cover)); // 5
    objects.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${COVER_PAGE_WIDTH} ${COVER_PAGE_HEIGHT}] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> /XObject << /Im1 5 0 R >> >> /Contents 7 0 R >>`); // 6
    objects.push(streamObject(createCoverPageContent(cover))); // 7
  }

  regularPageContents.forEach((pageContent, index) => {
    const pageId = regularStartId + index * 2;
    const contentId = pageId + 1;
    // Todas las páginas internas usan A4 vertical, igual que la portada.
    objects.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE_WIDTH} ${PAGE_HEIGHT}] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${contentId} 0 R >>`);
    objects.push(streamObject(pageContent));
  });
  return buildPdf(objects);
}
