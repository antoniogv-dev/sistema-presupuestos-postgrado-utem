import type { BudgetResult, CohortBudget, InstitutionalParameters } from "../calculations/types";
import { calculateBreakEvenEquivalentEnrollments } from "../calculations/break-even";

const encoder = new TextEncoder();
const decoder = new TextDecoder();

function readU16(view: DataView, offset: number): number { return view.getUint16(offset, true); }
function readU32(view: DataView, offset: number): number { return view.getUint32(offset, true); }

async function inflateRaw(data: Uint8Array): Promise<Uint8Array> {
  const input = new Uint8Array(data.byteLength);
  input.set(data);
  const stream = new Blob([input.buffer]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

async function unzipPackage(bytes: Uint8Array): Promise<Map<string, Uint8Array>> {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let eocd = -1;
  for (let offset = bytes.byteLength - 22; offset >= Math.max(0, bytes.byteLength - 65557); offset -= 1) {
    if (readU32(view, offset) === 0x06054b50) { eocd = offset; break; }
  }
  if (eocd < 0) throw new Error("El XLSX institucional no contiene un directorio ZIP válido.");
  const totalEntries = readU16(view, eocd + 10);
  let centralOffset = readU32(view, eocd + 16);
  const files = new Map<string, Uint8Array>();

  for (let index = 0; index < totalEntries; index += 1) {
    if (readU32(view, centralOffset) !== 0x02014b50) throw new Error("Directorio ZIP inválido en el XLSX institucional.");
    const method = readU16(view, centralOffset + 10);
    const compressedSize = readU32(view, centralOffset + 20);
    const fileNameLength = readU16(view, centralOffset + 28);
    const extraLength = readU16(view, centralOffset + 30);
    const commentLength = readU16(view, centralOffset + 32);
    const localOffset = readU32(view, centralOffset + 42);
    const fileName = decoder.decode(bytes.subarray(centralOffset + 46, centralOffset + 46 + fileNameLength));
    if (readU32(view, localOffset) !== 0x04034b50) throw new Error(`Cabecera ZIP local inválida: ${fileName}`);
    const localNameLength = readU16(view, localOffset + 26);
    const localExtraLength = readU16(view, localOffset + 28);
    const dataStart = localOffset + 30 + localNameLength + localExtraLength;
    const compressed = bytes.subarray(dataStart, dataStart + compressedSize);
    let data: Uint8Array;
    if (method === 0) data = new Uint8Array(compressed);
    else if (method === 8) data = await inflateRaw(compressed);
    else throw new Error(`Método de compresión ZIP no soportado (${method}) en ${fileName}.`);
    files.set(fileName, data);
    centralOffset += 46 + fileNameLength + extraLength + commentLength;
  }
  return files;
}

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
function u16(value: number): Uint8Array { return new Uint8Array([value & 0xff, (value >>> 8) & 0xff]); }
function u32(value: number): Uint8Array { return new Uint8Array([value & 0xff, (value >>> 8) & 0xff, (value >>> 16) & 0xff, (value >>> 24) & 0xff]); }
function concat(parts: Uint8Array[]): Uint8Array {
  const size = parts.reduce((total, part) => total + part.length, 0);
  const output = new Uint8Array(size);
  let offset = 0;
  for (const part of parts) { output.set(part, offset); offset += part.length; }
  return output;
}
function zip(files: Map<string, Uint8Array>): Uint8Array {
  const locals: Uint8Array[] = [];
  const centrals: Uint8Array[] = [];
  let offset = 0;
  for (const [fileName, data] of files) {
    const name = encoder.encode(fileName);
    const crc = crc32(data);
    const local = concat([u32(0x04034b50), u16(20), u16(0), u16(0), u16(0), u16(0), u32(crc), u32(data.length), u32(data.length), u16(name.length), u16(0), name, data]);
    locals.push(local);
    const central = concat([u32(0x02014b50), u16(20), u16(20), u16(0), u16(0), u16(0), u16(0), u32(crc), u32(data.length), u32(data.length), u16(name.length), u16(0), u16(0), u16(0), u16(0), u32(0), u32(offset), name]);
    centrals.push(central);
    offset += local.length;
  }
  const centralData = concat(centrals);
  const end = concat([u32(0x06054b50), u16(0), u16(0), u16(files.size), u16(files.size), u32(centralData.length), u32(offset), u16(0)]);
  return concat([...locals, centralData, end]);
}

function xml(value: string): string {
  return String(value)
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\uFFFE\uFFFF]/g, "")
    .replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
}
function columnName(index: number): string {
  let result = "";
  let current = index;
  while (current > 0) { current -= 1; result = String.fromCharCode(65 + (current % 26)) + result; current = Math.floor(current / 26); }
  return result;
}
function yearColumn(index: number): string { return columnName(index + 2); }
function clampRate(value: number): number { return Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0)); }

function cellPattern(ref: string): RegExp {
  return new RegExp(`<c(?=[^>]*\\br="${ref}")([^>]*?)(?:\\/>|>[\\s\\S]*?<\\/c>)`, "m");
}
function styleFromCell(sheetXml: string, ref: string): string {
  const match = sheetXml.match(cellPattern(ref));
  if (!match) return "";
  const style = match[1]?.match(/\bs="(\d+)"/);
  return style ? ` s="${style[1]}"` : "";
}
function typeFromCell(cellXml: string): string {
  const match = cellXml.match(/\bt="([^"]+)"/);
  return match ? ` t="${match[1]}"` : "";
}
function innerFromCell(cellXml: string): string {
  const match = cellXml.match(/<c\b[^>]*>([\s\S]*?)<\/c>/);
  return match?.[1] ?? "";
}
function replaceCell(sheetXml: string, ref: string, body: string, typeAttribute = ""): string {
  const pattern = cellPattern(ref);
  if (!pattern.test(sheetXml)) throw new Error(`El formato institucional no contiene la celda ${ref}.`);
  const style = styleFromCell(sheetXml, ref);
  return sheetXml.replace(pattern, () => `<c r="${ref}"${style}${typeAttribute}>${body}</c>`);
}
function setFormula(sheetXml: string, ref: string, formula: string, cached: number): string {
  return replaceCell(sheetXml, ref, `<f>${xml(formula)}</f><v>${Number.isFinite(cached) ? cached : 0}</v>`);
}
function setText(sheetXml: string, ref: string, value: string): string {
  return replaceCell(sheetXml, ref, `<is><t>${xml(value)}</t></is>`, ` t="inlineStr"`);
}

// Simula la inserción de la fila institucional faltante en el generador histórico:
// sólo desplaza referencias locales de FLUJO TOTAL; no toca referencias a otras hojas.
function shiftLocalFormulaRows(formula: string, startRow: number, delta: number): string {
  return formula.replace(/(?<!!)(\$?[A-Z]{1,3})(\$?)(\d+)/g, (full, column: string, absolute: string, rowText: string) => {
    const row = Number(rowText);
    return row >= startRow ? `${column}${absolute}${row + delta}` : full;
  });
}
function shiftFlowCellDown(sheetXml: string, column: string, sourceRow: number, targetRow: number): string {
  const sourceMatch = sheetXml.match(cellPattern(`${column}${sourceRow}`));
  if (!sourceMatch) throw new Error(`El formato institucional no contiene ${column}${sourceRow}.`);
  const sourceCell = sourceMatch[0];
  let body = innerFromCell(sourceCell);
  body = body.replace(/<f([^>]*)>([\s\S]*?)<\/f>/g, (_full, attrs: string, formula: string) =>
    `<f${attrs}>${xml(shiftLocalFormulaRows(formula, 7, 1))}</f>`);
  return replaceCell(sheetXml, `${column}${targetRow}`, body, typeFromCell(sourceCell));
}

/**
 * Ajuste final del XLSX institucional para conservar exactamente el formato operativo
 * utilizado por Postgrado (como el modelo MEES 2026 / Memorándum 227-2026).
 *
 * El generador histórico escribe el flujo una fila más arriba desde INGRESOS TOTAL.
 * Aquí se desplazan únicamente los contenidos de B:... una fila hacia abajo, manteniendo
 * intactas las filas, estilos, anchos, alturas, colores y rótulos de la plantilla.
 * Luego se escribe el reconocimiento de matrícula en la fila 7 y se alinea el punto de
 * equilibrio con la misma identidad financiera del motor, sin LET ni operador @.
 */
export async function alignInstitutionalBreakEvenFormula(
  workbookBytes: Uint8Array,
  budget: CohortBudget,
  result: BudgetResult,
  parameters: InstitutionalParameters,
): Promise<Uint8Array> {
  if (budget.program.type !== "MAGISTER_PROFESIONAL" || !result.years.length) return workbookBytes;

  const files = await unzipPackage(workbookBytes);
  const studentSheetName = "xl/worksheets/sheet2.xml";
  const totalSheetName = "xl/worksheets/sheet4.xml";
  const parameterSheetName = "xl/worksheets/sheet1.xml";
  const staffSheetName = "xl/worksheets/sheet5.xml";
  if (!files.has(studentSheetName) || !files.has(totalSheetName)) {
    throw new Error("XLSX institucional incompleto: faltan Flujo estudiantes o FLUJO TOTAL.");
  }

  const discounts = budget.discounts.filter((discount) => Math.max(0, Math.min(1, discount.percentage)) > 0 && discount.target !== "ENROLLMENT");
  const discountSlots = Math.max(2, discounts.length);
  const equivalentStudentsRow = 5 + discountSlots;
  const equilibriumRow = 10 + (2 * discountSlots);
  const firstYearColumn = "B";
  const lastYearColumn = yearColumn(result.years.length - 1);
  const recognition = clampRate(budget.enrollmentRecognitionRate);
  const equilibrium = calculateBreakEvenEquivalentEnrollments(budget, parameters);

  let totalFlow = decoder.decode(files.get(totalSheetName)!);
  for (let index = 0; index < result.years.length; index += 1) {
    const col = yearColumn(index);
    const flow = result.annualFlows.find((item) => item.year === result.years[index]);
    if (!flow) continue;

    // Se copia de abajo hacia arriba para no perder las celdas fuente.
    for (let row = 41; row >= 7; row -= 1) totalFlow = shiftFlowCellDown(totalFlow, col, row, row + 1);

    totalFlow = setFormula(totalFlow, `${col}7`, `${col}4*${recognition}`, flow.recognizedEnrollmentFee);
    const extraIncome = flow.externalIncome + flow.institutionalFinancing + flow.otherIncome;
    totalFlow = setFormula(totalFlow, `${col}8`, extraIncome ? `SUM(${col}5:${col}7)+${extraIncome}` : `SUM(${col}5:${col}7)`, flow.totalIncome);
  }
  files.set(totalSheetName, encoder.encode(totalFlow));

  // Asegura los rótulos del modelo de referencia cuando la plantilla histórica los traiga distintos.
  if (files.has(parameterSheetName)) {
    let parametersSheet = decoder.decode(files.get(parameterSheetName)!);
    const otherHonorariaRow = 15 + discountSlots;
    if (cellPattern(`A${otherHonorariaRow}`).test(parametersSheet)) parametersSheet = setText(parametersSheet, `A${otherHonorariaRow}`, "Asistencia técnica ");
    files.set(parameterSheetName, encoder.encode(parametersSheet));
  }
  if (files.has(staffSheetName)) {
    let staffSheet = decoder.decode(files.get(staffSheetName)!);
    const extraYears = Math.max(0, result.years.length - 2);
    const thirdTitleRow = 20 + 6 * extraYears;
    if (cellPattern(`A${thirdTitleRow}`).test(staffSheet)) staffSheet = setText(staffSheet, `A${thirdTitleRow}`, "Asistencia técnica ");
    files.set(staffSheetName, encoder.encode(staffSheet));
  }

  // Punto de equilibrio = costos fijos / aporte unitario, usando exactamente el mismo
  // ingreso operacional: arancel neto + matrícula reconocida; y los mismos costos variables:
  // retenciones + docente tesista. El valor actual de equivalentes está en B{equivalentStudentsRow}.
  const fixedCosts = `ABS(SUM('FLUJO TOTAL'!${firstYearColumn}38:${lastYearColumn}38)-SUM('FLUJO TOTAL'!${firstYearColumn}37:${lastYearColumn}37)-SUM('FLUJO TOTAL'!${firstYearColumn}11:${lastYearColumn}11))`;
  const netContribution = `SUM('FLUJO TOTAL'!${firstYearColumn}5:${lastYearColumn}5)+SUM('FLUJO TOTAL'!${firstYearColumn}6:${lastYearColumn}6)+SUM('FLUJO TOTAL'!${firstYearColumn}7:${lastYearColumn}7)+SUM('FLUJO TOTAL'!${firstYearColumn}37:${lastYearColumn}37)+SUM('FLUJO TOTAL'!${firstYearColumn}11:${lastYearColumn}11)`;
  const formula = `IFERROR(${fixedCosts}*${firstYearColumn}${equivalentStudentsRow}/(${netContribution}),0)`;

  let studentSheet = decoder.decode(files.get(studentSheetName)!);
  studentSheet = setFormula(studentSheet, `${firstYearColumn}${equilibriumRow}`, formula, equilibrium.minimumEquivalentEnrollmentsExact ?? 0);
  files.set(studentSheetName, encoder.encode(studentSheet));

  files.delete("xl/calcChain.xml");
  const workbookName = "xl/workbook.xml";
  if (files.has(workbookName)) {
    const workbookXml = decoder.decode(files.get(workbookName)!);
    files.set(workbookName, encoder.encode(workbookXml.replace(/<calcPr[^>]*\/>/, '<calcPr calcMode="auto" fullCalcOnLoad="1" forceFullCalc="1"/>')));
  }
  const relsName = "xl/_rels/workbook.xml.rels";
  if (files.has(relsName)) files.set(relsName, encoder.encode(decoder.decode(files.get(relsName)!).replace(/<Relationship[^>]*calcChain[^>]*\/>/g, "")));
  const contentTypesName = "[Content_Types].xml";
  if (files.has(contentTypesName)) files.set(contentTypesName, encoder.encode(decoder.decode(files.get(contentTypesName)!).replace(/<Override[^>]*calcChain[^>]*\/>/g, "")));

  return zip(files);
}
