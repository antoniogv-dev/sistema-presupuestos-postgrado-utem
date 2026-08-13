import type { FinancialReport, FinancialReportRow, ParameterReport, ParameterReportRow } from "./report-model";

const encoder = new TextEncoder();
const crcTable = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = (c & 1) ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(data: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of data) crc = crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function u16(value: number): Uint8Array {
  return new Uint8Array([value & 0xff, (value >>> 8) & 0xff]);
}

function u32(value: number): Uint8Array {
  return new Uint8Array([value & 0xff, (value >>> 8) & 0xff, (value >>> 16) & 0xff, (value >>> 24) & 0xff]);
}

function concat(parts: Uint8Array[]): Uint8Array {
  const size = parts.reduce((total, part) => total + part.length, 0);
  const output = new Uint8Array(size);
  let offset = 0;
  for (const part of parts) { output.set(part, offset); offset += part.length; }
  return output;
}

function dosDateTime(date = new Date()): { time: number; date: number } {
  const year = Math.max(1980, date.getFullYear());
  return {
    time: (date.getHours() << 11) | (date.getMinutes() << 5) | Math.floor(date.getSeconds() / 2),
    date: ((year - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate(),
  };
}

function zip(files: Array<{ name: string; data: string | Uint8Array }>): Uint8Array {
  const locals: Uint8Array[] = [];
  const centrals: Uint8Array[] = [];
  let offset = 0;
  const stamp = dosDateTime();

  for (const file of files) {
    const name = encoder.encode(file.name);
    const data = typeof file.data === "string" ? encoder.encode(file.data) : file.data;
    const crc = crc32(data);
    const local = concat([
      u32(0x04034b50), u16(20), u16(0), u16(0), u16(stamp.time), u16(stamp.date),
      u32(crc), u32(data.length), u32(data.length), u16(name.length), u16(0), name, data,
    ]);
    locals.push(local);
    const central = concat([
      u32(0x02014b50), u16(20), u16(20), u16(0), u16(0), u16(stamp.time), u16(stamp.date),
      u32(crc), u32(data.length), u32(data.length), u16(name.length), u16(0), u16(0), u16(0), u16(0), u32(0), u32(offset), name,
    ]);
    centrals.push(central);
    offset += local.length;
  }
  const centralData = concat(centrals);
  const end = concat([
    u32(0x06054b50), u16(0), u16(0), u16(files.length), u16(files.length), u32(centralData.length), u32(offset), u16(0),
  ]);
  return concat([...locals, centralData, end]);
}

function xml(value: string): string {
  // Microsoft Excel rechaza una hoja completa si encuentra caracteres de control
  // no válidos en XML 1.0. Se limpian antes de escapar el texto.
  return String(value)
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\uFFFE\uFFFF]/g, "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function columnName(index: number): string {
  let result = "";
  let current = index;
  while (current > 0) { current -= 1; result = String.fromCharCode(65 + (current % 26)) + result; current = Math.floor(current / 26); }
  return result;
}

function styleForRow(row: FinancialReportRow): number {
  if (row.tone === "income") return row.bold ? 4 : 3;
  if (row.tone === "expense") return 5;
  if (row.tone === "section") return 6;
  if (row.tone === "result") return row.bold ? 8 : 7;
  return 2;
}

function numericStyle(row: FinancialReportRow): number {
  const base = styleForRow(row);
  const numberStyles: Record<number, number> = { 3: 12, 4: 13, 5: 14, 6: 15, 7: 16, 8: 17 };
  const percentStyles: Record<number, number> = { 3: 22, 4: 23, 5: 24, 6: 25, 7: 26, 8: 27 };
  if (row.valueKind === "percent") return percentStyles[base] ?? 20;
  if (row.valueKind === "number") return numberStyles[base] ?? 10;
  return base;
}

function buildFinancialSheet(report: FinancialReport, hasParameters = false): string {
  const lastCol = columnName(report.years.length + 1);
  const rows: string[] = [];
  rows.push(`<row r="1" ht="24" customHeight="1"><c r="A1" s="1" t="inlineStr"><is><t>${xml(report.title)}</t></is></c></row>`);
  rows.push(`<row r="2" ht="18" customHeight="1"><c r="A2" s="29" t="inlineStr"><is><t>${xml(report.subtitle)}</t></is></c></row>`);
  if (hasParameters) rows.push(`<row r="3" ht="18" customHeight="1"><c r="A3" s="29" t="inlineStr"><is><t>${xml('Trazabilidad completa disponible en la hoja “Parámetros completos”.')}</t></is></c></row>`);
  rows.push(`<row r="4" ht="20" customHeight="1"><c r="A4" s="2" t="inlineStr"><is><t>DETALLE</t></is></c>${report.years.map((year, index) => `<c r="${columnName(index + 2)}4" s="2" t="n"><v>${year}</v></c>`).join("")}</row>`);
  report.rows.forEach((row, rowIndex) => {
    const excelRow = rowIndex + 5;
    const labelStyle = styleForRow(row);
    const valueStyle = numericStyle(row);
    rows.push(`<row r="${excelRow}" ht="18" customHeight="1"><c r="A${excelRow}" s="${labelStyle}" t="inlineStr"><is><t>${xml(row.label)}</t></is></c>${row.values.map((value, index) => `<c r="${columnName(index + 2)}${excelRow}" s="${valueStyle}" t="n"><v>${Number.isFinite(value) ? value : 0}</v></c>`).join("")}</row>`);
  });

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<dimension ref="A1:${lastCol}${report.rows.length + 4}"/>
<sheetViews><sheetView workbookViewId="0"><pane ySplit="4" topLeftCell="A5" activePane="bottomLeft" state="frozen"/><selection pane="bottomLeft" activeCell="A5" sqref="A5"/></sheetView></sheetViews>
<sheetFormatPr defaultRowHeight="18"/>
<cols><col min="1" max="1" width="46" customWidth="1"/><col min="2" max="${report.years.length + 1}" width="17" customWidth="1"/></cols>
<sheetData>${rows.join("")}</sheetData>
<mergeCells count="${hasParameters ? 3 : 2}"><mergeCell ref="A1:${lastCol}1"/><mergeCell ref="A2:${lastCol}2"/>${hasParameters ? `<mergeCell ref="A3:${lastCol}3"/>` : ""}</mergeCells>
</worksheet>`;
}

function parameterValueCell(row: ParameterReportRow, cellRef: string): string {
  if (typeof row.value === "number") {
    const style = row.valueKind === "currency" ? 31 : row.valueKind === "percent" ? 33 : 32;
    return `<c r="${cellRef}" s="${style}" t="n"><v>${Number.isFinite(row.value) ? row.value : 0}</v></c>`;
  }
  return `<c r="${cellRef}" s="30" t="inlineStr"><is><t>${xml(row.value)}</t></is></c>`;
}

function buildParameterSheet(report: ParameterReport): string {
  const rows: string[] = [];
  rows.push(`<row r="1" ht="24" customHeight="1"><c r="A1" s="1" t="inlineStr"><is><t>${xml(report.title)}</t></is></c></row>`);
  rows.push(`<row r="2" ht="28" customHeight="1"><c r="A2" s="29" t="inlineStr"><is><t>${xml(report.subtitle)}</t></is></c></row>`);
  rows.push(`<row r="4" ht="22" customHeight="1"><c r="A4" s="2" t="inlineStr"><is><t>SECCIÓN</t></is></c><c r="B4" s="2" t="inlineStr"><is><t>PARÁMETRO</t></is></c><c r="C4" s="2" t="inlineStr"><is><t>PERIODO</t></is></c><c r="D4" s="2" t="inlineStr"><is><t>VALOR</t></is></c><c r="E4" s="2" t="inlineStr"><is><t>UNIDAD / DETALLE</t></is></c></row>`);

  report.rows.forEach((row, index) => {
    const excelRow = index + 5;
    const sectionChanged = index === 0 || report.rows[index - 1]?.section !== row.section;
    const textStyle = sectionChanged ? 34 : 30;
    const estimatedLines = Math.max(
      Math.ceil(row.section.length / 28),
      Math.ceil(row.parameter.length / 44),
      Math.ceil(row.period.length / 18),
      Math.ceil(String(row.value).length / 24),
      Math.ceil((row.detail ?? "").length / 54),
      1,
    );
    const rowHeight = Math.min(60, Math.max(22, estimatedLines * 15));
    rows.push(`<row r="${excelRow}" ht="${rowHeight}" customHeight="1">`+
      `<c r="A${excelRow}" s="${textStyle}" t="inlineStr"><is><t>${xml(row.section)}</t></is></c>`+
      `<c r="B${excelRow}" s="30" t="inlineStr"><is><t>${xml(row.parameter)}</t></is></c>`+
      `<c r="C${excelRow}" s="30" t="inlineStr"><is><t>${xml(row.period)}</t></is></c>`+
      parameterValueCell(row, `D${excelRow}`)+
      `<c r="E${excelRow}" s="30" t="inlineStr"><is><t>${xml(row.detail ?? "")}</t></is></c>`+
      `</row>`);
  });

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<dimension ref="A1:E${report.rows.length + 4}"/>
<sheetViews><sheetView workbookViewId="0"><pane ySplit="4" topLeftCell="A5" activePane="bottomLeft" state="frozen"/><selection pane="bottomLeft" activeCell="A5" sqref="A5"/></sheetView></sheetViews>
<sheetFormatPr defaultRowHeight="18"/>
<cols><col min="1" max="1" width="25" customWidth="1"/><col min="2" max="2" width="43" customWidth="1"/><col min="3" max="3" width="18" customWidth="1"/><col min="4" max="4" width="20" customWidth="1"/><col min="5" max="5" width="52" customWidth="1"/></cols>
<sheetData>${rows.join("")}</sheetData>
<mergeCells count="2"><mergeCell ref="A1:E1"/><mergeCell ref="A2:E2"/></mergeCells>

</worksheet>`;
}

/**
 * Hoja inicial autocontenida: muestra primero el flujo y, a continuación,
 * TODOS los parámetros utilizados en el cálculo. De esta forma la trazabilidad
 * queda visible incluso en visores que abren sólo la primera pestaña del XLSX.
 */
function buildCompleteBudgetSheet(report: FinancialReport, parameterReport: ParameterReport): string {
  const lastCol = columnName(Math.max(report.years.length + 1, 5));
  const rows: string[] = [];
  rows.push(`<row r="1" ht="26" customHeight="1"><c r="A1" s="1" t="inlineStr"><is><t>${xml(report.title)}</t></is></c></row>`);
  rows.push(`<row r="2" ht="22" customHeight="1"><c r="A2" s="29" t="inlineStr"><is><t>${xml(report.subtitle)}</t></is></c></row>`);
  rows.push(`<row r="3" ht="20" customHeight="1"><c r="A3" s="35" t="inlineStr"><is><t>FLUJO PRESUPUESTARIO</t></is></c></row>`);
  rows.push(`<row r="4" ht="20" customHeight="1"><c r="A4" s="2" t="inlineStr"><is><t>DETALLE</t></is></c>${report.years.map((year, index) => `<c r="${columnName(index + 2)}4" s="2" t="n"><v>${year}</v></c>`).join("")}</row>`);

  report.rows.forEach((row, rowIndex) => {
    const excelRow = rowIndex + 5;
    const labelStyle = styleForRow(row);
    const valueStyle = numericStyle(row);
    rows.push(`<row r="${excelRow}" ht="20" customHeight="1"><c r="A${excelRow}" s="${labelStyle}" t="inlineStr"><is><t>${xml(row.label)}</t></is></c>${row.values.map((value, index) => `<c r="${columnName(index + 2)}${excelRow}" s="${valueStyle}" t="n"><v>${Number.isFinite(value) ? value : 0}</v></c>`).join("")}</row>`);
  });

  const parameterTitleRow = report.rows.length + 7;
  const parameterHeaderRow = parameterTitleRow + 2;
  rows.push(`<row r="${parameterTitleRow}" ht="28" customHeight="1"><c r="A${parameterTitleRow}" s="1" t="inlineStr"><is><t>PARÁMETROS COMPLETOS UTILIZADOS EN EL CÁLCULO</t></is></c></row>`);
  rows.push(`<row r="${parameterTitleRow + 1}" ht="22" customHeight="1"><c r="A${parameterTitleRow + 1}" s="29" t="inlineStr"><is><t>${xml(parameterReport.subtitle)}</t></is></c></row>`);
  rows.push(`<row r="${parameterHeaderRow}" ht="22" customHeight="1"><c r="A${parameterHeaderRow}" s="2" t="inlineStr"><is><t>SECCIÓN</t></is></c><c r="B${parameterHeaderRow}" s="2" t="inlineStr"><is><t>PARÁMETRO</t></is></c><c r="C${parameterHeaderRow}" s="2" t="inlineStr"><is><t>PERIODO</t></is></c><c r="D${parameterHeaderRow}" s="2" t="inlineStr"><is><t>VALOR</t></is></c><c r="E${parameterHeaderRow}" s="2" t="inlineStr"><is><t>UNIDAD / DETALLE</t></is></c></row>`);

  parameterReport.rows.forEach((row, index) => {
    const excelRow = parameterHeaderRow + index + 1;
    const sectionChanged = index === 0 || parameterReport.rows[index - 1]?.section !== row.section;
    const textStyle = sectionChanged ? 34 : 30;
    const estimatedLines = Math.max(
      Math.ceil(row.section.length / 26),
      Math.ceil(row.parameter.length / 38),
      Math.ceil(row.period.length / 16),
      Math.ceil(String(row.value).length / 22),
      Math.ceil((row.detail ?? "").length / 48),
      1,
    );
    const rowHeight = Math.min(72, Math.max(22, estimatedLines * 15));
    rows.push(`<row r="${excelRow}" ht="${rowHeight}" customHeight="1">`+
      `<c r="A${excelRow}" s="${textStyle}" t="inlineStr"><is><t>${xml(row.section)}</t></is></c>`+
      `<c r="B${excelRow}" s="30" t="inlineStr"><is><t>${xml(row.parameter)}</t></is></c>`+
      `<c r="C${excelRow}" s="30" t="inlineStr"><is><t>${xml(row.period)}</t></is></c>`+
      parameterValueCell(row, `D${excelRow}`)+
      `<c r="E${excelRow}" s="30" t="inlineStr"><is><t>${xml(row.detail ?? "")}</t></is></c>`+
      `</row>`);
  });

  const finalRow = parameterHeaderRow + parameterReport.rows.length;
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<dimension ref="A1:${lastCol}${finalRow}"/>
<sheetViews><sheetView tabSelected="1" workbookViewId="0"><pane ySplit="4" topLeftCell="A5" activePane="bottomLeft" state="frozen"/><selection pane="bottomLeft" activeCell="A5" sqref="A5"/></sheetView></sheetViews>
<sheetFormatPr defaultRowHeight="18"/>
<cols><col min="1" max="1" width="39" customWidth="1"/><col min="2" max="2" width="38" customWidth="1"/><col min="3" max="3" width="18" customWidth="1"/><col min="4" max="4" width="21" customWidth="1"/><col min="5" max="5" width="48" customWidth="1"/>${report.years.length > 4 ? `<col min="6" max="${report.years.length + 1}" width="17" customWidth="1"/>` : ""}</cols>
<sheetData>${rows.join("")}</sheetData>
<mergeCells count="4"><mergeCell ref="A1:${lastCol}1"/><mergeCell ref="A2:${lastCol}2"/><mergeCell ref="A3:${lastCol}3"/><mergeCell ref="A${parameterTitleRow}:E${parameterTitleRow}"/></mergeCells>
</worksheet>`;
}

const styles = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<numFmts count="3"><numFmt numFmtId="164" formatCode="$ #,##0;($ #,##0);-"/><numFmt numFmtId="165" formatCode="0.##"/><numFmt numFmtId="166" formatCode="0.0%"/></numFmts>
<fonts count="3"><font><sz val="10"/><name val="Arial"/></font><font><b/><color rgb="FFFFFFFF"/><sz val="10"/><name val="Arial"/></font><font><b/><sz val="10"/><name val="Arial"/></font></fonts>
<fills count="6"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF1F4E78"/><bgColor indexed="64"/></patternFill></fill><fill><patternFill patternType="solid"><fgColor rgb="FFE2F0D9"/><bgColor indexed="64"/></patternFill></fill><fill><patternFill patternType="solid"><fgColor rgb="FFD9E2F3"/><bgColor indexed="64"/></patternFill></fill><fill><patternFill patternType="solid"><fgColor rgb="FFE7E6E6"/><bgColor indexed="64"/></patternFill></fill></fills>
<borders count="2"><border><left/><right/><top/><bottom/><diagonal/></border><border><left/><right/><top style="thin"><color rgb="FFB4C6E7"/></top><bottom style="thin"><color rgb="FFB4C6E7"/></bottom><diagonal/></border></borders>
<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
<cellXfs count="36">
<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>
<xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyAlignment="1"><alignment vertical="center"/></xf>
<xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf>
<xf numFmtId="164" fontId="0" fillId="3" borderId="0" xfId="0" applyNumberFormat="1"/>
<xf numFmtId="164" fontId="2" fillId="3" borderId="1" xfId="0" applyNumberFormat="1"/>
<xf numFmtId="164" fontId="0" fillId="4" borderId="0" xfId="0" applyNumberFormat="1"/>
<xf numFmtId="164" fontId="2" fillId="0" borderId="1" xfId="0" applyNumberFormat="1"/>
<xf numFmtId="164" fontId="0" fillId="5" borderId="0" xfId="0" applyNumberFormat="1"/>
<xf numFmtId="164" fontId="2" fillId="5" borderId="1" xfId="0" applyNumberFormat="1"/>
<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="165" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="165" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="165" fontId="0" fillId="3" borderId="0" xfId="0"/><xf numFmtId="165" fontId="2" fillId="3" borderId="1" xfId="0"/><xf numFmtId="165" fontId="0" fillId="4" borderId="0" xfId="0"/><xf numFmtId="165" fontId="2" fillId="0" borderId="1" xfId="0"/><xf numFmtId="165" fontId="0" fillId="5" borderId="0" xfId="0"/><xf numFmtId="165" fontId="2" fillId="5" borderId="1" xfId="0"/><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>
<xf numFmtId="166" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="166" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="166" fontId="0" fillId="3" borderId="0" xfId="0"/><xf numFmtId="166" fontId="2" fillId="3" borderId="1" xfId="0"/><xf numFmtId="166" fontId="0" fillId="4" borderId="0" xfId="0"/><xf numFmtId="166" fontId="2" fillId="0" borderId="1" xfId="0"/><xf numFmtId="166" fontId="0" fillId="5" borderId="0" xfId="0"/><xf numFmtId="166" fontId="2" fillId="5" borderId="1" xfId="0"/><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>
<xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyAlignment="1"><alignment vertical="center" wrapText="1"/></xf>
<xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyAlignment="1"><alignment vertical="center" wrapText="1"/></xf>
<xf numFmtId="164" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyAlignment="1"><alignment vertical="center"/></xf>
<xf numFmtId="165" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyAlignment="1"><alignment vertical="center"/></xf>
<xf numFmtId="166" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyAlignment="1"><alignment vertical="center"/></xf>
<xf numFmtId="0" fontId="2" fillId="5" borderId="1" xfId="0" applyAlignment="1"><alignment vertical="center" wrapText="1"/></xf>
<xf numFmtId="0" fontId="2" fillId="2" borderId="1" xfId="0" applyAlignment="1"><alignment vertical="center"/></xf>
</cellXfs>
<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>
</styleSheet>`;

function parameterSubset(report: ParameterReport, title: string, sections: string[]): ParameterReport {
  return {
    ...report,
    title,
    rows: report.rows.filter((row) => sections.includes(row.section)),
  };
}

interface WorkbookSheetSpec {
  name: string;
  xml: string;
}

/**
 * Exportación individual completa.
 *
 * El libro incluye siempre el flujo y, cuando se entrega parameterReport,
 * una hoja maestra con TODOS los parámetros más vistas separadas para
 * facilitar la revisión administrativa. Las vistas auxiliares no sustituyen
 * a "Parámetros completos"; sólo ordenan la misma información.
 */
/**
 * v10.17: OOXML compatible con Microsoft Excel.
 * Se evita autoFilter/pageSetup artesanal y se sanitizan caracteres XML 1.0.
 * La primera hoja mantiene el flujo + todos los parámetros completos.
 */
export function createFinancialReportXlsx(report: FinancialReport, parameterReport?: ParameterReport): Uint8Array {
  const now = new Date().toISOString();
  const sheets: WorkbookSheetSpec[] = parameterReport
    ? [
        { name: "Presupuesto completo", xml: buildCompleteBudgetSheet(report, parameterReport) },
        { name: "Flujo presupuestario", xml: buildFinancialSheet(report, true) },
      ]
    : [
        { name: "Flujo presupuestario", xml: buildFinancialSheet(report, false) },
      ];

  if (parameterReport) {
    sheets.push(
      { name: "Parámetros completos", xml: buildParameterSheet(parameterReport) },
      {
        name: "Parámetros anuales",
        xml: buildParameterSheet(parameterSubset(
          parameterReport,
          `Parámetros anuales · ${report.title}`,
          ["Parámetros institucionales generales", "Controles del presupuesto", "Parámetros anuales"],
        )),
      },
      {
        name: "Parámetros semestrales",
        xml: buildParameterSheet(parameterSubset(
          parameterReport,
          `Parámetros semestrales · ${report.title}`,
          ["Parámetros semestrales"],
        )),
      },
      {
        name: "Descuentos",
        xml: buildParameterSheet(parameterSubset(
          parameterReport,
          `Descuentos de arancel · ${report.title}`,
          ["Descuentos de arancel"],
        )),
      },
      {
        name: "Costos e ingresos",
        xml: buildParameterSheet(parameterSubset(
          parameterReport,
          `Costos e ingresos · ${report.title}`,
          ["Ingresos extraordinarios", "Costos y gastos registrados"],
        )),
      },
    );
  }

  const worksheetOverrides = sheets.map((_, index) =>
    `<Override PartName="/xl/worksheets/sheet${index + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`,
  ).join("");
  const workbookSheets = sheets.map((sheet, index) =>
    `<sheet name="${xml(sheet.name)}" sheetId="${index + 1}" r:id="rId${index + 1}"/>`,
  ).join("");
  const worksheetRelationships = sheets.map((_, index) =>
    `<Relationship Id="rId${index + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${index + 1}.xml"/>`,
  ).join("");
  const stylesRelId = `rId${sheets.length + 1}`;

  const files: Array<{ name: string; data: string | Uint8Array }> = [
    { name: "[Content_Types].xml", data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>${worksheetOverrides}<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/><Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/><Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/></Types>` },
    { name: "_rels/.rels", data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/><Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/></Relationships>` },
    { name: "docProps/core.xml", data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><dc:title>${xml(report.title)}</dc:title><dc:creator>UTEM · Escuela de Postgrado</dc:creator><dcterms:created xsi:type="dcterms:W3CDTF">${now}</dcterms:created></cp:coreProperties>` },
    { name: "docProps/app.xml", data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties"><Application>Sistema de Presupuestos de Postgrado UTEM</Application></Properties>` },
    { name: "xl/workbook.xml", data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><bookViews><workbookView activeTab="0" firstSheet="0"/></bookViews><sheets>${workbookSheets}</sheets></workbook>` },
    { name: "xl/_rels/workbook.xml.rels", data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${worksheetRelationships}<Relationship Id="${stylesRelId}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>` },
    { name: "xl/styles.xml", data: styles },
  ];

  sheets.forEach((sheet, index) => files.push({ name: `xl/worksheets/sheet${index + 1}.xml`, data: sheet.xml }));
  return zip(files);
}
