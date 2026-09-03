import type { BudgetResult, CohortBudget, InstitutionalParameters, SemesterParameters } from "../calculations/types";
import { resolvedAnnualOverrideForYear } from "../calculations/budget-engine";
import { getAnnualEnrollmentChargePeriods, getAnnualTuitionChargePeriods } from "../calculations/periods";

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
function setFormula(sheetXml: string, ref: string, formula: string, cached: number): string {
  return replaceCell(sheetXml, ref, `<f>${xml(formula)}</f><v>${Number.isFinite(cached) ? cached : 0}</v>`);
}

function periodOrdinal(year: number, semester: 1 | 2): number { return year * 2 + semester; }
function discountApplies(discount: CohortBudget["discounts"][number], semester: SemesterParameters): boolean {
  const value = periodOrdinal(semester.year, semester.semester);
  return value >= periodOrdinal(discount.startYear, discount.startSemester) && value <= periodOrdinal(discount.endYear, discount.endSemester);
}
function exportableDiscounts(budget: CohortBudget): CohortBudget["discounts"] {
  return budget.discounts.filter((discount) => discount.target !== "ENROLLMENT" && Math.max(0, Math.min(1, discount.percentage)) > 0);
}
function semesterForPeriod(budget: CohortBudget, year: number, semester: 1 | 2): SemesterParameters | undefined {
  return budget.semesters.find((item) => item.year === year && item.semester === semester);
}
function tuitionChargeSemesterForYear(budget: CohortBudget, year: number): SemesterParameters | undefined {
  const period = getAnnualTuitionChargePeriods(budget.startYear, budget.startSemester, budget.durationSemesters).find((item) => item.year === year);
  return period ? semesterForPeriod(budget, period.year, period.semester) : undefined;
}
function enrollmentChargeSemesterForYear(budget: CohortBudget, year: number): SemesterParameters | undefined {
  const period = getAnnualEnrollmentChargePeriods(budget.startYear, budget.startSemester, budget.durationSemesters).find((item) => item.year === year);
  return period ? semesterForPeriod(budget, period.year, period.semester) : undefined;
}
function tuitionStudentsForYear(budget: CohortBudget, year: number): number {
  return Math.max(0, tuitionChargeSemesterForYear(budget, year)?.activeStudents ?? 0);
}
function discountStudentsForTuitionYear(budget: CohortBudget, year: number, discount: CohortBudget["discounts"][number]): number {
  const semester = tuitionChargeSemesterForYear(budget, year);
  return semester && discountApplies(discount, semester) ? Math.max(0, discount.students) : 0;
}
function enrollmentStudentsForYear(budget: CohortBudget, year: number, grossEnrollmentFee: number, annualEnrollmentFee: number): number {
  const semester = enrollmentChargeSemesterForYear(budget, year);
  if (!semester) return 0;
  if (annualEnrollmentFee > 0 && grossEnrollmentFee > 0) return grossEnrollmentFee / annualEnrollmentFee;
  return Math.max(0, semester.activeStudents);
}
function rowLayout(budget: CohortBudget) {
  const discounts = exportableDiscounts(budget);
  const discountSlots = Math.max(2, discounts.length);
  return {
    discounts,
    discountSlots,
    parameterDiscountStartRow: 10,
    studentDiscountStartRow: 4,
    totalStudentsRow: 4 + discountSlots,
    equivalentStudentsRow: 5 + discountSlots,
    graduationStudentsRow: 6 + discountSlots,
    enrollmentIncomeRow: 7 + discountSlots,
    noDiscountIncomeRow: 8 + discountSlots,
    discountIncomeStartRow: 9 + discountSlots,
    totalTuitionIncomeRow: 9 + (2 * discountSlots),
  };
}

/**
 * Normaliza la hoja "Flujo estudiantes" del formato institucional validado.
 * La matrícula anual se cobra completa una vez al inicio de cada bloque de dos semestres
 * (por ejemplo, 2026-2S y 2027-2S para una cohorte 2026-2S de cuatro semestres).
 * Los estudiantes no se prorratean por 0,5 por caer en un año calendario parcial.
 */
export async function normalizeInstitutionalAnnualEnrollment(
  workbookBytes: Uint8Array,
  budget: CohortBudget,
  result: BudgetResult,
  parameters: InstitutionalParameters,
): Promise<Uint8Array> {
  const files = await unzipPackage(workbookBytes);
  const sheetName = "xl/worksheets/sheet2.xml";
  if (!files.has(sheetName)) throw new Error("XLSX institucional incompleto: falta la hoja Flujo estudiantes.");

  const rows = rowLayout(budget);
  let sheet = decoder.decode(files.get(sheetName)!);

  for (let index = 0; index < result.years.length; index += 1) {
    const year = result.years[index];
    const col = yearColumn(index);
    const flow = result.annualFlows.find((item) => item.year === year);
    if (!flow) continue;
    const override = resolvedAnnualOverrideForYear(budget, parameters, year);
    const discountStudents = rows.discounts.map((discount) => discountStudentsForTuitionYear(budget, year, discount));
    const discounted = discountStudents.reduce((total, value) => total + value, 0);
    const tuitionStudents = tuitionStudentsForYear(budget, year);
    const noDiscount = Math.max(0, tuitionStudents - discounted);

    sheet = setNumber(sheet, `${col}3`, noDiscount);
    for (let discountIndex = 0; discountIndex < rows.discountSlots; discountIndex += 1) {
      const studentRow = rows.studentDiscountStartRow + discountIndex;
      const parameterRow = rows.parameterDiscountStartRow + discountIndex;
      const incomeRow = rows.discountIncomeStartRow + discountIndex;
      const students = discountStudents[discountIndex] ?? 0;
      const rate = rows.discounts[discountIndex] ? Math.max(0, Math.min(1, rows.discounts[discountIndex].percentage)) : 0;
      sheet = setNumber(sheet, `${col}${studentRow}`, students);
      sheet = setFormula(sheet, `${col}${incomeRow}`, `(${col}${studentRow})*Parámetros!$${col}$4*(1-Parámetros!$${col}$${parameterRow})`, students * override.annualTuition * (1 - rate));
    }

    sheet = setFormula(sheet, `${col}${rows.totalStudentsRow}`, `SUM(${col}3:${col}${rows.studentDiscountStartRow + rows.discountSlots - 1})`, tuitionStudents);
    const equivalentFormula = [`${col}3`, ...Array.from({ length: rows.discountSlots }, (_, discountIndex) => `${col}${rows.studentDiscountStartRow + discountIndex}*(1-Parámetros!${col}${rows.parameterDiscountStartRow + discountIndex})`)].join("+");
    sheet = setFormula(sheet, `${col}${rows.equivalentStudentsRow}`, equivalentFormula, flow.equivalentEnrollments);
    sheet = setNumber(sheet, `${col}${rows.graduationStudentsRow}`, flow.graduatingStudents);

    const enrollmentStudents = enrollmentStudentsForYear(budget, year, flow.grossEnrollmentFee, override.annualEnrollmentFee);
    sheet = setFormula(sheet, `${col}${rows.enrollmentIncomeRow}`, `${enrollmentStudents}*Parámetros!$${col}$5`, flow.grossEnrollmentFee);
    sheet = setFormula(sheet, `${col}${rows.noDiscountIncomeRow}`, `(${col}3)*Parámetros!$${col}$4`, noDiscount * override.annualTuition);
    sheet = setFormula(sheet, `${col}${rows.totalTuitionIncomeRow}`, `SUM(${col}${rows.noDiscountIncomeRow}:${col}${rows.discountIncomeStartRow + rows.discountSlots - 1})`, flow.tuitionAfterBenefits);
  }

  files.set(sheetName, encoder.encode(sheet));
  return zip(files);
}
