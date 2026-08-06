'use strict';

function buildFinancialReport(budget, result) {
  const f = result.annualFlows;
  const positive = (key) => f.map((flow) => Number(flow[key] || 0));
  const negative = (key) => f.map((flow) => -Number(flow[key] || 0));
  return {
    title: `${budget.program.name} (inicio ${budget.startYear}-${budget.startSemester}S)`,
    subtitle: `${budget.program.code} · ${budget.cohortName} · Versión ${budget.version} · ${budget.status}`,
    years: result.years,
    generatedAt: new Date().toISOString(),
    rows: [
      { label: 'Matrícula', values: positive('enrollment'), tone: 'income', kind: 'currency' },
      { label: 'Arancel bruto', values: positive('grossTuition'), tone: 'income', kind: 'currency' },
      { label: 'Descuentos', values: negative('discounts'), tone: 'income', kind: 'currency' },
      { label: 'Beca de excelencia académica (arancel)', values: negative('tuitionScholarships'), tone: 'income', kind: 'currency' },
      { label: 'Arancel después de beneficios', values: positive('tuitionAfterBenefits'), tone: 'income', kind: 'currency' },
      { label: 'Incobrables (15%)', values: negative('badDebt'), tone: 'income', kind: 'currency' },
      { label: 'Ingreso neto por arancel', values: positive('netTuitionIncome'), tone: 'income', kind: 'currency' },
      { label: 'Ingresos extraordinarios', values: positive('externalIncome'), tone: 'income', kind: 'currency' },
      { label: 'INGRESOS TOTAL', values: positive('totalIncome'), tone: 'income', bold: true, kind: 'currency' },
      { label: 'Docentes convenio / honorario', values: negative('directTeachingCost'), tone: 'expense', kind: 'currency' },
      { label: 'Docentes hora de reemplazo', values: negative('replacementTeachingCost'), tone: 'expense', kind: 'currency' },
      { label: 'Pago docente tesista / guía de tesis', values: negative('thesisGuidanceCost'), tone: 'expense', kind: 'currency' },
      { label: 'COSTOS ACADÉMICOS', values: negative('academicHonoraria'), tone: 'section', bold: true, kind: 'currency' },
      { label: 'Director programa', values: negative('direction'), tone: 'expense', kind: 'currency' },
      { label: 'Asistente de Dirección', values: negative('assistance'), tone: 'expense', kind: 'currency' },
      { label: 'Honorarios no académicos', values: negative('nonAcademicHonoraria'), tone: 'expense', kind: 'currency' },
      { label: 'HONORARIOS NO ACADÉMICOS', values: f.map((x) => -(x.direction + x.assistance + x.nonAcademicHonoraria)), tone: 'section', bold: true, kind: 'currency' },
      { label: 'LIBROS Y PUBLICACIONES TÉCNICAS', values: negative('books'), tone: 'section', bold: true, kind: 'currency' },
      { label: 'Difusión propia del programa', values: negative('diffusion'), tone: 'expense', kind: 'currency' },
      { label: 'DIFUSIÓN', values: negative('diffusion'), tone: 'section', bold: true, kind: 'currency' },
      { label: 'Pasajes nacionales e internacionales', values: negative('travel'), tone: 'expense', kind: 'currency' },
      { label: 'PASAJES Y FLETES', values: negative('travel'), tone: 'section', bold: true, kind: 'currency' },
      { label: 'Viáticos honorarios', values: negative('perDiem'), tone: 'expense', kind: 'currency' },
      { label: 'VIÁTICOS HONORARIOS NACIONALES', values: negative('perDiem'), tone: 'section', bold: true, kind: 'currency' },
      { label: 'Licencias, APIs y servicios de nube', values: negative('software'), tone: 'expense', kind: 'currency' },
      { label: 'ADQUISICIÓN DE PROGRAMAS, LICENCIAS Y NUBE', values: negative('software'), tone: 'section', bold: true, kind: 'currency' },
      { label: 'Giro para rendir / gastos menores', values: negative('operational'), tone: 'expense', kind: 'currency' },
      { label: 'OTROS SERVICIOS', values: f.map((x) => -(x.operational + x.other)), tone: 'section', bold: true, kind: 'currency' },
      { label: 'Becas por pasantías y manutención', values: f.map((x) => -(x.maintenance + x.congresses)), tone: 'expense', kind: 'currency' },
      { label: 'AYUDAS INTERNAS', values: f.map((x) => -(x.maintenance + x.congresses)), tone: 'section', bold: true, kind: 'currency' },
      { label: 'Overhead Central', values: negative('centralOverhead'), tone: 'expense', kind: 'currency' },
      { label: 'Overhead Facultad', values: negative('facultyOverhead'), tone: 'expense', kind: 'currency' },
      { label: 'RETENCIONES', values: f.map((x) => -(x.centralOverhead + x.facultyOverhead)), tone: 'section', bold: true, kind: 'currency' },
      { label: 'TOTAL COSTOS Y GASTOS DE ADM.', values: negative('totalExpenses'), tone: 'result', bold: true, kind: 'currency' },
      { label: 'FLUJO DE CAJA NETO', values: positive('netFlow'), tone: 'result', bold: true, kind: 'currency' },
      { label: 'Arrastre inicial anual', values: positive('startingCarryover'), tone: 'result', kind: 'currency' },
      { label: 'SALDO FINAL ACUMULADO', values: positive('accumulatedFlow'), tone: 'result', bold: true, kind: 'currency' },
      { label: 'MATRÍCULAS EQUIVALENTES', values: positive('equivalentEnrollments'), tone: 'result', bold: true, kind: 'number' },
      { label: 'ESTUDIANTES EQUIVALENTES APROX.', values: positive('roundedEquivalentStudents'), tone: 'result', bold: true, kind: 'number' },
      { label: 'RENDIMIENTO OPERACIONAL', values: positive('operatingMargin'), tone: 'result', bold: true, kind: 'percent' },
    ],
  };
}

const exportEncoder = new TextEncoder();
const exportCrcTable = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = (c & 1) ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();
function exportCrc32(data) { let crc = 0xffffffff; for (const byte of data) crc = exportCrcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8); return (crc ^ 0xffffffff) >>> 0; }
function exportU16(value) { return new Uint8Array([value & 0xff, (value >>> 8) & 0xff]); }
function exportU32(value) { return new Uint8Array([value & 0xff, (value >>> 8) & 0xff, (value >>> 16) & 0xff, (value >>> 24) & 0xff]); }
function exportConcat(parts) { const size = parts.reduce((total, part) => total + part.length, 0); const output = new Uint8Array(size); let offset = 0; for (const part of parts) { output.set(part, offset); offset += part.length; } return output; }
function exportDosDateTime(date = new Date()) { const year = Math.max(1980, date.getFullYear()); return { time: (date.getHours() << 11) | (date.getMinutes() << 5) | Math.floor(date.getSeconds() / 2), date: ((year - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate() }; }
function exportZip(files) {
  const locals = []; const centrals = []; let offset = 0; const stamp = exportDosDateTime();
  for (const file of files) {
    const name = exportEncoder.encode(file.name); const data = typeof file.data === 'string' ? exportEncoder.encode(file.data) : file.data; const crc = exportCrc32(data);
    const local = exportConcat([exportU32(0x04034b50), exportU16(20), exportU16(0), exportU16(0), exportU16(stamp.time), exportU16(stamp.date), exportU32(crc), exportU32(data.length), exportU32(data.length), exportU16(name.length), exportU16(0), name, data]);
    locals.push(local);
    centrals.push(exportConcat([exportU32(0x02014b50), exportU16(20), exportU16(20), exportU16(0), exportU16(0), exportU16(stamp.time), exportU16(stamp.date), exportU32(crc), exportU32(data.length), exportU32(data.length), exportU16(name.length), exportU16(0), exportU16(0), exportU16(0), exportU16(0), exportU32(0), exportU32(offset), name]));
    offset += local.length;
  }
  const centralData = exportConcat(centrals);
  return exportConcat([...locals, centralData, exportConcat([exportU32(0x06054b50), exportU16(0), exportU16(0), exportU16(files.length), exportU16(files.length), exportU32(centralData.length), exportU32(offset), exportU16(0)])]);
}
function exportXml(value) { return String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;'); }
function exportColumn(index) { let result = ''; let current = index; while (current > 0) { current -= 1; result = String.fromCharCode(65 + (current % 26)) + result; current = Math.floor(current / 26); } return result; }
function exportBaseStyle(row) { if (row.tone === 'income') return row.bold ? 4 : 3; if (row.tone === 'expense') return 5; if (row.tone === 'section') return 6; if (row.tone === 'result') return row.bold ? 8 : 7; return 2; }
function exportNumericStyle(row) { const base = exportBaseStyle(row); const numberStyles = { 3: 12, 4: 13, 5: 14, 6: 15, 7: 16, 8: 17 }; const percentStyles = { 3: 22, 4: 23, 5: 24, 6: 25, 7: 26, 8: 27 }; if (row.kind === 'percent') return percentStyles[base] || 20; if (row.kind === 'number') return numberStyles[base] || 10; return base; }
function exportSheet(report) {
  const lastCol = exportColumn(report.years.length + 1); const rows = [];
  rows.push(`<row r="1" ht="24" customHeight="1"><c r="A1" s="1" t="inlineStr"><is><t>${exportXml(report.title)}</t></is></c></row>`);
  rows.push(`<row r="2" ht="18" customHeight="1"><c r="A2" s="2" t="inlineStr"><is><t>${exportXml(report.subtitle)}</t></is></c></row>`);
  rows.push(`<row r="4" ht="20" customHeight="1"><c r="A4" s="2" t="inlineStr"><is><t>DETALLE</t></is></c>${report.years.map((year, index) => `<c r="${exportColumn(index + 2)}4" s="2" t="n"><v>${year}</v></c>`).join('')}</row>`);
  report.rows.forEach((row, rowIndex) => { const r = rowIndex + 5; rows.push(`<row r="${r}" ht="18" customHeight="1"><c r="A${r}" s="${exportBaseStyle(row)}" t="inlineStr"><is><t>${exportXml(row.label)}</t></is></c>${row.values.map((value, index) => `<c r="${exportColumn(index + 2)}${r}" s="${exportNumericStyle(row)}" t="n"><v>${Number.isFinite(value) ? value : 0}</v></c>`).join('')}</row>`); });
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><dimension ref="A1:${lastCol}${report.rows.length + 4}"/><sheetViews><sheetView workbookViewId="0"><pane ySplit="4" topLeftCell="A5" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews><cols><col min="1" max="1" width="46" customWidth="1"/><col min="2" max="${report.years.length + 1}" width="17" customWidth="1"/></cols><sheetData>${rows.join('')}</sheetData><mergeCells count="2"><mergeCell ref="A1:${lastCol}1"/><mergeCell ref="A2:${lastCol}2"/></mergeCells><pageMargins left="0.25" right="0.25" top="0.35" bottom="0.35" header="0.2" footer="0.2"/><pageSetup orientation="landscape" fitToWidth="1" fitToHeight="1" paperSize="9"/></worksheet>`;
}
const exportStyles = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><numFmts count="3"><numFmt numFmtId="164" formatCode="$ #,##0;($ #,##0);-"/><numFmt numFmtId="165" formatCode="0.0"/><numFmt numFmtId="166" formatCode="0.0%"/></numFmts><fonts count="3"><font><sz val="10"/><name val="Arial"/></font><font><b/><color rgb="FFFFFFFF"/><sz val="10"/><name val="Arial"/></font><font><b/><sz val="10"/><name val="Arial"/></font></fonts><fills count="6"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF1F4E78"/></patternFill></fill><fill><patternFill patternType="solid"><fgColor rgb="FFE2F0D9"/></patternFill></fill><fill><patternFill patternType="solid"><fgColor rgb="FFD9E2F3"/></patternFill></fill><fill><patternFill patternType="solid"><fgColor rgb="FFE7E6E6"/></patternFill></fill></fills><borders count="2"><border><left/><right/><top/><bottom/><diagonal/></border><border><left/><right/><top style="thin"><color rgb="FFB4C6E7"/></top><bottom style="thin"><color rgb="FFB4C6E7"/></bottom><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="29"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyAlignment="1"><alignment horizontal="center"/></xf><xf numFmtId="164" fontId="0" fillId="3" borderId="0" xfId="0" applyNumberFormat="1"/><xf numFmtId="164" fontId="2" fillId="3" borderId="1" xfId="0" applyNumberFormat="1"/><xf numFmtId="164" fontId="0" fillId="4" borderId="0" xfId="0" applyNumberFormat="1"/><xf numFmtId="164" fontId="2" fillId="0" borderId="1" xfId="0" applyNumberFormat="1"/><xf numFmtId="164" fontId="0" fillId="5" borderId="0" xfId="0" applyNumberFormat="1"/><xf numFmtId="164" fontId="2" fillId="5" borderId="1" xfId="0" applyNumberFormat="1"/><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="165" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="165" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="165" fontId="0" fillId="3" borderId="0" xfId="0"/><xf numFmtId="165" fontId="2" fillId="3" borderId="1" xfId="0"/><xf numFmtId="165" fontId="0" fillId="4" borderId="0" xfId="0"/><xf numFmtId="165" fontId="2" fillId="0" borderId="1" xfId="0"/><xf numFmtId="165" fontId="0" fillId="5" borderId="0" xfId="0"/><xf numFmtId="165" fontId="2" fillId="5" borderId="1" xfId="0"/><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="166" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="166" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="166" fontId="0" fillId="3" borderId="0" xfId="0"/><xf numFmtId="166" fontId="2" fillId="3" borderId="1" xfId="0"/><xf numFmtId="166" fontId="0" fillId="4" borderId="0" xfId="0"/><xf numFmtId="166" fontId="2" fillId="0" borderId="1" xfId="0"/><xf numFmtId="166" fontId="0" fillId="5" borderId="0" xfId="0"/><xf numFmtId="166" fontId="2" fillId="5" borderId="1" xfId="0"/><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`;
function createFinancialReportXlsx(report) {
  const now = new Date().toISOString();
  return exportZip([
    { name: '[Content_Types].xml', data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/><Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/><Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/></Types>` },
    { name: '_rels/.rels', data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/><Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/></Relationships>` },
    { name: 'docProps/core.xml', data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><dc:title>${exportXml(report.title)}</dc:title><dc:creator>UTEM · Escuela de Postgrado</dc:creator><dcterms:created xsi:type="dcterms:W3CDTF">${now}</dcterms:created></cp:coreProperties>` },
    { name: 'docProps/app.xml', data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties"><Application>Sistema de Presupuestos de Postgrado UTEM</Application></Properties>` },
    { name: 'xl/workbook.xml', data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Flujo presupuestario" sheetId="1" r:id="rId1"/></sheets></workbook>` },
    { name: 'xl/_rels/workbook.xml.rels', data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>` },
    { name: 'xl/styles.xml', data: exportStyles },
    { name: 'xl/worksheets/sheet1.xml', data: exportSheet(report) },
  ]);
}

const PDF_W = 842, PDF_H = 595, PDF_MARGIN = 24, PDF_TITLE = 28, PDF_SUBTITLE = 18, PDF_HEADER = 18, PDF_ROW = 13;
const PDF_COLORS = { navy: [0.12, 0.31, 0.47], income: [0.89, 0.94, 0.85], expense: [0.85, 0.89, 0.95], result: [0.91, 0.90, 0.90], white: [1, 1, 1], black: [0, 0, 0], border: [0.72, 0.78, 0.86] };
function pdfLatin1(value) { const normalized = value.normalize('NFC'); const out = new Uint8Array(normalized.length); for (let i = 0; i < normalized.length; i += 1) out[i] = normalized.charCodeAt(i) <= 255 ? normalized.charCodeAt(i) : 63; return out; }
function pdfEscape(value) { return value.replaceAll('\\', '\\\\').replaceAll('(', '\\(').replaceAll(')', '\\)'); }
function pdfMoney(value) { if (Math.abs(value) < 0.5) return '-'; const formatted = Math.round(Math.abs(value)).toLocaleString('es-CL'); return value < 0 ? `($ ${formatted})` : `$ ${formatted}`; }
function pdfNumber(value) { return value.toLocaleString('es-CL', { minimumFractionDigits: Number.isInteger(value) ? 0 : 1, maximumFractionDigits: 1 }); }
function pdfDisplay(row, value) { if (row.kind === 'percent') return `${(value * 100).toLocaleString('es-CL', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`; if (row.kind === 'number') return pdfNumber(value); return pdfMoney(value); }
function pdfFill(tone) { if (tone === 'income') return PDF_COLORS.income; if (tone === 'expense') return PDF_COLORS.expense; if (tone === 'result') return PDF_COLORS.result; return PDF_COLORS.white; }
function pdfText(text, x, y, size, bold = false) { return `BT /${bold ? 'F2' : 'F1'} ${size} Tf ${x.toFixed(2)} ${y.toFixed(2)} Td (${pdfEscape(text)}) Tj ET\n`; }
function pdfRight(text, right, y, size, bold = false) { return pdfText(text, right - text.length * size * 0.48, y, size, bold); }
function pdfRect(x, y, width, height, fill, stroke = PDF_COLORS.border) { return `${fill[0]} ${fill[1]} ${fill[2]} rg ${stroke[0]} ${stroke[1]} ${stroke[2]} RG ${x} ${y} ${width} ${height} re B\n`; }
function pdfPage(report, rows, pageNumber, totalPages) {
  const tableWidth = PDF_W - PDF_MARGIN * 2; const labelWidth = Math.min(370, tableWidth * 0.55); const valueWidth = (tableWidth - labelWidth) / report.years.length; let y = PDF_H - PDF_MARGIN - PDF_TITLE; let content = '';
  content += pdfRect(PDF_MARGIN, y, tableWidth, PDF_TITLE, PDF_COLORS.navy, PDF_COLORS.navy); content += `1 1 1 rg\n${pdfText(report.title, PDF_MARGIN + 6, y + 9, 10, true)}`;
  y -= PDF_SUBTITLE; content += pdfRect(PDF_MARGIN, y, tableWidth, PDF_SUBTITLE, PDF_COLORS.white); content += `0 0 0 rg\n${pdfText(`${report.subtitle} · Página ${pageNumber}/${totalPages}`, PDF_MARGIN + 6, y + 5, 7)}`;
  y -= PDF_HEADER; content += pdfRect(PDF_MARGIN, y, labelWidth, PDF_HEADER, PDF_COLORS.navy, PDF_COLORS.navy); content += `1 1 1 rg\n${pdfText('DETALLE', PDF_MARGIN + labelWidth / 2 - 18, y + 5, 8, true)}`;
  report.years.forEach((year, index) => { const x = PDF_MARGIN + labelWidth + valueWidth * index; content += pdfRect(x, y, valueWidth, PDF_HEADER, PDF_COLORS.navy, PDF_COLORS.navy); content += `1 1 1 rg\n${pdfRight(String(year), x + valueWidth - 6, y + 5, 8, true)}`; });
  for (const row of rows) { y -= PDF_ROW; const fill = pdfFill(row.tone); content += pdfRect(PDF_MARGIN, y, labelWidth, PDF_ROW, fill); content += `0 0 0 rg\n${pdfText(row.label, PDF_MARGIN + 4, y + 4, 7, Boolean(row.bold || row.tone === 'section'))}`; row.values.forEach((value, index) => { const x = PDF_MARGIN + labelWidth + valueWidth * index; content += pdfRect(x, y, valueWidth, PDF_ROW, fill); content += `0 0 0 rg\n${pdfRight(pdfDisplay(row, value), x + valueWidth - 4, y + 4, 7, Boolean(row.bold || row.tone === 'section'))}`; }); }
  return content;
}
function buildPdfObjects(objects) { const header = pdfLatin1('%PDF-1.4\n%âãÏÓ\n'); const chunks = [header]; const offsets = [0]; let offset = header.length; objects.forEach((object, index) => { offsets.push(offset); const prefix = pdfLatin1(`${index + 1} 0 obj\n`); const body = typeof object === 'string' ? pdfLatin1(object) : object; const suffix = pdfLatin1('\nendobj\n'); chunks.push(prefix, body, suffix); offset += prefix.length + body.length + suffix.length; }); const xrefOffset = offset; let xref = `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`; for (let i = 1; i <= objects.length; i += 1) xref += `${String(offsets[i]).padStart(10, '0')} 00000 n \n`; xref += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`; chunks.push(pdfLatin1(xref)); return exportConcat(chunks); }
function createFinancialReportPdf(report) {
  const maxRows = Math.max(1, Math.floor((PDF_H - PDF_MARGIN * 2 - PDF_TITLE - PDF_SUBTITLE - PDF_HEADER) / PDF_ROW)); const pages = []; for (let i = 0; i < report.rows.length; i += maxRows) pages.push(report.rows.slice(i, i + maxRows)); const objects = ['<< /Type /Catalog /Pages 2 0 R >>']; const pageIds = pages.map((_, index) => 5 + index * 2); objects.push(`<< /Type /Pages /Count ${pages.length} /Kids [${pageIds.map((id) => `${id} 0 R`).join(' ')}] >>`); objects.push('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>'); objects.push('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>'); pages.forEach((rows, index) => { const pageId = 5 + index * 2; const contentId = pageId + 1; const content = pdfLatin1(pdfPage(report, rows, index + 1, pages.length)); objects.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PDF_W} ${PDF_H}] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${contentId} 0 R >>`); objects.push(exportConcat([pdfLatin1(`<< /Length ${content.length} >>\nstream\n`), content, pdfLatin1('\nendstream')])); }); return buildPdfObjects(objects);
}
function downloadBytes(bytes, type, filename) { const blob = new Blob([bytes], { type }); const url = URL.createObjectURL(blob); const anchor = document.createElement('a'); anchor.href = url; anchor.download = filename; document.body.append(anchor); anchor.click(); anchor.remove(); setTimeout(() => URL.revokeObjectURL(url), 500); }
function exportSlug(value) { return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''); }
function downloadBudgetXlsx(budget, result) { downloadBytes(createFinancialReportXlsx(buildFinancialReport(budget, result)), 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', `${exportSlug(budget.program.code)}-${budget.startYear}-${budget.startSemester}s-v${budget.version}.xlsx`); }
function downloadBudgetPdf(budget, result) { downloadBytes(createFinancialReportPdf(buildFinancialReport(budget, result)), 'application/pdf', `${exportSlug(budget.program.code)}-${budget.startYear}-${budget.startSemester}s-v${budget.version}.pdf`); }
