import type { BudgetResult, CohortBudget, InstitutionalParameters } from "../calculations/types";
import { resolvedAnnualOverrideForYear } from "../calculations/budget-engine";
import { getActivePeriods } from "../calculations/periods";

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
function cellPattern(ref: string): RegExp {
  return new RegExp(`<c(?=[^>]*\\br="${ref}")([^>]*?)(?:\\/>|>[\\s\\S]*?<\\/c>)`, "m");
}
function styleFromCell(sheetXml: string, ref: string): string {
  const match = sheetXml.match(cellPattern(ref));
  if (!match) return "";
  const style = match[1]?.match(/\bs="(\d+)"/);
  return style ? ` s="${style[1]}"` : "";
}
function replaceCell(sheetXml: string, ref: string, body: string, typeAttribute = ""): string {
  const pattern = cellPattern(ref);
  if (!pattern.test(sheetXml)) throw new Error(`El formato institucional no contiene la celda ${ref}.`);
  const style = styleFromCell(sheetXml, ref);
  return sheetXml.replace(pattern, () => `<c r="${ref}"${style}${typeAttribute}>${body}</c>`);
}
function setNumber(sheetXml: string, ref: string, value: number): string {
  return replaceCell(sheetXml, ref, `<v>${Number.isFinite(value) ? value : 0}</v>`);
}
function setText(sheetXml: string, ref: string, value: string): string {
  return replaceCell(sheetXml, ref, `<is><t>${xml(value)}</t></is>`, ` t="inlineStr"`);
}
function setFormula(sheetXml: string, ref: string, formula: string, cached: number): string {
  return replaceCell(sheetXml, ref, `<f>${xml(formula)}</f><v>${Number.isFinite(cached) ? cached : 0}</v>`);
}

function rowPattern(row: number): RegExp {
  return new RegExp(`<row(?=[^>]*\\br="${row}")([^>]*?)>[\\s\\S]*?<\\/row>`, "m");
}
function rebaseRowXml(rowXml: string, sourceRow: number, targetRow: number): string {
  let output = rowXml.replace(new RegExp(`(<row\\b[^>]*\\br=")${sourceRow}("[^>]*>)`), `$1${targetRow}$2`);
  output = output.replace(new RegExp(`(<c\\b[^>]*\\br="[A-Z]{1,3})${sourceRow}("[^>]*>)`, "g"), `$1${targetRow}$2`);
  return output;
}
function shiftMergeRows(sheetXml: string, startRow: number, delta: number): string {
  return sheetXml.replace(/<mergeCell ref="([A-Z]+)(\d+):([A-Z]+)(\d+)"\/>/g, (full, c1: string, r1Text: string, c2: string, r2Text: string) => {
    const r1 = Number(r1Text); const r2 = Number(r2Text);
    if (r1 < startRow && r2 < startRow) return full;
    return `<mergeCell ref="${c1}${r1 >= startRow ? r1 + delta : r1}:${c2}${r2 >= startRow ? r2 + delta : r2}"/>`;
  });
}
function insertYearBlocks(sheetXml: string, afterRow: number, blockCount: number, templateStartRow: number): string {
  if (blockCount <= 0) return sheetXml;
  const templates = [0, 1, 2].map((offset) => {
    const row = templateStartRow + offset;
    const match = sheetXml.match(rowPattern(row));
    if (!match) throw new Error(`El formato institucional no contiene la fila ${row} para ampliar el prorrateo.`);
    return { row, xml: match[0] };
  });
  const count = blockCount * 3;
  const startShift = afterRow + 1;
  const rowRegex = /<row\b[^>]*\br="(\d+)"[^>]*>[\s\S]*?<\/row>/g;
  let output = sheetXml.replace(rowRegex, (rowXml: string, rowText: string) => {
    const row = Number(rowText);
    return row >= startShift ? rebaseRowXml(rowXml, row, row + count) : rowXml;
  });
  output = shiftMergeRows(output, startShift, count);
  const anchor = output.match(rowPattern(afterRow));
  if (!anchor) throw new Error(`El formato institucional no contiene la fila ${afterRow} para ampliar el prorrateo.`);
  const inserted = Array.from({ length: blockCount }, (_, blockIndex) => templates.map((template, offset) =>
    rebaseRowXml(template.xml, template.row, afterRow + 1 + blockIndex * 3 + offset)).join("")).join("");
  output = output.replace(anchor[0], `${anchor[0]}${inserted}`);
  output = output.replace(/<dimension ref="([A-Z]+)(\d+):([A-Z]+)(\d+)"\/>/, (_full, c1: string, r1: string, c2: string, r2: string) => `<dimension ref="${c1}${r1}:${c2}${Number(r2) + count}"/>`);
  return output;
}

function activeSemesterLabel(budget: CohortBudget, year: number): string {
  const semesters = getActivePeriods(budget.startYear, budget.startSemester, budget.durationSemesters)
    .filter((period) => period.year === year)
    .map((period) => period.semester);
  if (semesters.length === 2) return "primer y segundo semestre";
  if (semesters[0] === 1) return "primer semestre";
  if (semesters[0] === 2) return "segundo semestre";
  return "sin actividad";
}
function exportableDiscountCount(budget: CohortBudget): number {
  return budget.discounts.filter((discount) => Math.max(0, Math.min(1, discount.percentage)) > 0).length;
}
function parameterRows(budget: CohortBudget) {
  const discountSlots = Math.max(2, exportableDiscountCount(budget));
  return {
    direction: 13 + discountSlots,
    assistance: 14 + discountSlots,
    other: 15 + discountSlots,
  };
}
function staffRate(budget: CohortBudget, year: number, kind: "direction" | "assistance" | "other", parameters: InstitutionalParameters): number {
  const annual = resolvedAnnualOverrideForYear(budget, parameters, year);
  if (kind === "direction") return annual.directionProrated ? Math.max(0, Math.min(1, annual.directionAllocationRate)) : 1;
  if (kind === "assistance") return annual.assistanceProrated ? Math.max(0, Math.min(1, annual.assistanceAllocationRate)) : 1;
  return annual.otherNonAcademicProrated ? Math.max(0, Math.min(1, annual.otherNonAcademicAllocationRate)) : 1;
}
function staffBase(budget: CohortBudget, year: number, kind: "direction" | "assistance" | "other", parameters: InstitutionalParameters): number {
  const annual = resolvedAnnualOverrideForYear(budget, parameters, year);
  if (kind === "direction") return Math.max(0, annual.annualDirection);
  if (kind === "assistance") return Math.max(0, annual.annualAssistance);
  return Math.max(0, annual.annualOtherNonAcademicHonoraria);
}
function fillStaffSection(
  sheetXml: string,
  budget: CohortBudget,
  result: BudgetResult,
  parameters: InstitutionalParameters,
  kind: "direction" | "assistance" | "other",
  startRow: number,
  parameterRow: number,
): string {
  let output = sheetXml;
  result.years.forEach((year, index) => {
    const currentRow = startRow + index * 3;
    const otherRow = currentRow + 1;
    const totalRow = currentRow + 2;
    const rate = staffRate(budget, year, kind, parameters);
    const base = staffBase(budget, year, kind, parameters);
    const paramCol = yearColumn(index);
    output = setNumber(output, `A${currentRow}`, year);
    output = setText(output, `B${currentRow}`, `Cohorte ${budget.startYear}-${budget.startSemester}S`);
    output = setText(output, `C${currentRow}`, activeSemesterLabel(budget, year));
    output = setNumber(output, `D${currentRow}`, rate);
    output = setFormula(output, `E${currentRow}`, `+$C$${totalRow}/$D$${totalRow}`, base);
    output = setFormula(output, `F${currentRow}`, `D${currentRow}*E${currentRow}`, base * rate);

    output = setNumber(output, `A${otherRow}`, year);
    output = setText(output, `B${otherRow}`, "Otras cohortes / versiones / programas / proyectos");
    output = setText(output, `C${otherRow}`, "actividades paralelas del año");
    output = setNumber(output, `D${otherRow}`, Math.max(0, 1 - rate));
    output = setFormula(output, `E${otherRow}`, `+$C$${totalRow}/$D$${totalRow}`, base);
    output = setFormula(output, `F${otherRow}`, `D${otherRow}*E${otherRow}`, base * Math.max(0, 1 - rate));

    output = setNumber(output, `A${totalRow}`, year);
    output = setText(output, `B${totalRow}`, `Total ${year}`);
    output = setFormula(output, `C${totalRow}`, `+Parámetros!${paramCol}${parameterRow}`, base);
    output = setFormula(output, `D${totalRow}`, `SUM(D${currentRow}:D${otherRow})`, 1);
    output = setFormula(output, `F${totalRow}`, `SUM(F${currentRow}:F${otherRow})`, base);
  });
  return output;
}
function updateTotalFlowStaff(
  sheetXml: string,
  budget: CohortBudget,
  result: BudgetResult,
  parameters: InstitutionalParameters,
  directionStart: number,
  assistanceStart: number,
  otherStart: number,
): string {
  let output = sheetXml;
  result.years.forEach((year, index) => {
    const col = yearColumn(index);
    const flow = result.annualFlows.find((item) => item.year === year);
    if (!flow) return;
    const annual = resolvedAnnualOverrideForYear(budget, parameters, year);
    const directionRate = annual.directionProrated ? Math.max(0, Math.min(1, annual.directionAllocationRate)) : 1;
    const assistanceRate = annual.assistanceProrated ? Math.max(0, Math.min(1, annual.assistanceAllocationRate)) : 1;
    const otherRate = annual.otherNonAcademicProrated ? Math.max(0, Math.min(1, annual.otherNonAcademicAllocationRate)) : 1;
    const directionApplied = Math.max(0, annual.annualDirection) * directionRate;
    const assistanceApplied = Math.max(0, annual.annualAssistance) * assistanceRate;
    const otherApplied = Math.max(0, annual.annualOtherNonAcademicHonoraria) * otherRate;
    const directionExtra = Math.max(0, flow.direction - directionApplied);
    const assistanceExtra = Math.max(0, flow.assistance - assistanceApplied);
    const otherExtra = Math.max(0, flow.otherNonAcademicHonoraria - otherApplied);
    const directionRow = directionStart + index * 3;
    const assistanceRow = assistanceStart + index * 3;
    const otherRow = otherStart + index * 3;
    output = setFormula(output, `${col}12`, `-'Prorrateo Staff'!F${directionRow}${directionExtra ? `-${directionExtra}` : ""}`, -flow.direction);
    output = setFormula(output, `${col}13`, `-'Prorrateo Staff'!F${assistanceRow}${assistanceExtra ? `-${assistanceExtra}` : ""}`, -flow.assistance);
    output = setNumber(output, `${col}14`, 0);
    output = setFormula(output, `${col}15`, `-'Prorrateo Staff'!F${otherRow}${otherExtra ? `-${otherExtra}` : ""}`, -flow.otherNonAcademicHonoraria);
    output = setFormula(output, `${col}16`, `SUM(${col}12:${col}15)`, -flow.nonAcademicHonoraria);
  });
  return output;
}
function extendProrationPrintArea(workbookXml: string, finalRow: number): string {
  return workbookXml.replace(/('Prorrateo Staff'!\$A\$\d+:\$F\$)\d+/g, `$1${finalRow}`);
}

/**
 * Extiende la hoja institucional "Prorrateo Staff" a todos los años calendario activos.
 * Para una cohorte 2026-2S de cuatro semestres quedan 2026 (2S), 2027 (1S+2S)
 * y 2028 (1S). Cada año conserva un bloque de cohorte, actividades paralelas y total.
 * El bloque de "otras" agrega cualquier cantidad de versiones, programas o proyectos
 * paralelos mediante el complemento del porcentaje de imputación configurado.
 */
export async function extendInstitutionalStaffProration(
  workbookBytes: Uint8Array,
  budget: CohortBudget,
  result: BudgetResult,
  parameters: InstitutionalParameters,
): Promise<Uint8Array> {
  if (result.years.length <= 2) return workbookBytes;
  const files = await unzipPackage(workbookBytes);
  const staffSheetName = "xl/worksheets/sheet5.xml";
  const totalSheetName = "xl/worksheets/sheet4.xml";
  const workbookName = "xl/workbook.xml";
  if (!files.has(staffSheetName) || !files.has(totalSheetName) || !files.has(workbookName)) {
    throw new Error("XLSX institucional incompleto para ampliar el prorrateo de staff.");
  }

  const extraYears = result.years.length - 2;
  let staff = decoder.decode(files.get(staffSheetName)!);
  // Se amplía de abajo hacia arriba para conservar la estructura y los estilos originales.
  staff = insertYearBlocks(staff, 27, extraYears, 25); // Otros honorarios
  staff = insertYearBlocks(staff, 18, extraYears, 16); // Asistencia
  staff = insertYearBlocks(staff, 9, extraYears, 7);   // Dirección

  const directionStart = 4;
  const assistanceStart = 13 + 3 * extraYears;
  const otherStart = 22 + 6 * extraYears;
  const rows = parameterRows(budget);
  staff = fillStaffSection(staff, budget, result, parameters, "direction", directionStart, rows.direction);
  staff = fillStaffSection(staff, budget, result, parameters, "assistance", assistanceStart, rows.assistance);
  staff = fillStaffSection(staff, budget, result, parameters, "other", otherStart, rows.other);

  let totalFlow = decoder.decode(files.get(totalSheetName)!);
  totalFlow = updateTotalFlowStaff(totalFlow, budget, result, parameters, directionStart, assistanceStart, otherStart);

  const finalStaffRow = 27 + 9 * extraYears;
  files.set(staffSheetName, encoder.encode(staff));
  files.set(totalSheetName, encoder.encode(totalFlow));
  files.set(workbookName, encoder.encode(extendProrationPrintArea(decoder.decode(files.get(workbookName)!), finalStaffRow)));
  return zip(files);
}
