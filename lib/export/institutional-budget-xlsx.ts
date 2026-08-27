import type { BudgetResult, CohortBudget, InstitutionalParameters, SemesterParameters } from "../calculations/types";
import { resolvedAnnualOverrideForYear } from "../calculations/budget-engine";
import { calculateBreakEvenEquivalentEnrollments } from "../calculations/break-even";
import { genericCurriculumCourses, payableCurriculumCourses } from "../curriculum/budget-load";
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

/** Unzip mínimo OOXML. Soporta STORE (0) y DEFLATE (8), que son los métodos usados por XLSX. */
async function unzipPackage(bytes: Uint8Array): Promise<Map<string, Uint8Array>> {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let eocd = -1;
  for (let offset = bytes.byteLength - 22; offset >= Math.max(0, bytes.byteLength - 65557); offset -= 1) {
    if (readU32(view, offset) === 0x06054b50) { eocd = offset; break; }
  }
  if (eocd < 0) throw new Error("La plantilla XLSX no contiene un directorio ZIP válido.");
  const totalEntries = readU16(view, eocd + 10);
  let centralOffset = readU32(view, eocd + 16);
  const files = new Map<string, Uint8Array>();

  for (let index = 0; index < totalEntries; index += 1) {
    if (readU32(view, centralOffset) !== 0x02014b50) throw new Error("Directorio ZIP inválido en la plantilla XLSX.");
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
    const local = concat([
      u32(0x04034b50), u16(20), u16(0), u16(0), u16(0), u16(0), u32(crc), u32(data.length), u32(data.length), u16(name.length), u16(0), name, data,
    ]);
    locals.push(local);
    const central = concat([
      u32(0x02014b50), u16(20), u16(20), u16(0), u16(0), u16(0), u16(0), u32(crc), u32(data.length), u32(data.length), u16(name.length), u16(0), u16(0), u16(0), u16(0), u32(0), u32(offset), name,
    ]);
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
  if (!pattern.test(sheetXml)) throw new Error(`La plantilla institucional no contiene la celda ${ref}.`);
  const style = styleFromCell(sheetXml, ref);
  const replacement = `<c r="${ref}"${style}${typeAttribute}>${body}</c>`;
  // Use a function replacer so Excel formulas containing $1, $10, etc. are not
  // interpreted as JavaScript String.replace capture references.
  return sheetXml.replace(pattern, () => replacement);
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
function clearCell(sheetXml: string, ref: string): string { return replaceCell(sheetXml, ref, ""); }


function rowPattern(row: number): RegExp {
  return new RegExp(`<row(?=[^>]*\\br="${row}")([^>]*?)>[\\s\\S]*?<\\/row>`, "m");
}
function shiftFormulaRowReferences(formula: string, startRow: number, delta: number): string {
  if (!formula || delta === 0) return formula;
  return formula.replace(/(\$?[A-Z]{1,3})(\$?)(\d+)/g, (full, col: string, absolute: string, rowText: string) => {
    const row = Number(rowText);
    return row >= startRow ? `${col}${absolute}${row + delta}` : full;
  });
}
function rebaseRowXml(rowXml: string, sourceRow: number, targetRow: number, formulaShiftStart?: number, formulaShift = 0): string {
  let output = rowXml.replace(new RegExp(`(<row\\b[^>]*\\br=")${sourceRow}("[^>]*>)`), `$1${targetRow}$2`);
  output = output.replace(new RegExp(`(<c\\b[^>]*\\br="[A-Z]{1,3})${sourceRow}("[^>]*>)`, "g"), `$1${targetRow}$2`);
  if (formulaShiftStart != null && formulaShift !== 0) {
    output = output.replace(/<f([^>]*)>([\s\S]*?)<\/f>/g, (_full, attrs: string, formula: string) => `<f${attrs}>${shiftFormulaRowReferences(formula, formulaShiftStart, formulaShift)}</f>`);
  }
  return output;
}
function insertRowsFromTemplate(sheetXml: string, afterRow: number, count: number, templateRow: number): string {
  if (count <= 0) return sheetXml;
  const source = sheetXml.match(rowPattern(templateRow));
  if (!source) throw new Error(`La plantilla institucional no contiene la fila ${templateRow} necesaria para ampliar la malla.`);
  const startShift = afterRow + 1;
  const rowRegex = /<row\b[^>]*\br="(\d+)"[^>]*>[\s\S]*?<\/row>/g;
  const shifted = sheetXml.replace(rowRegex, (rowXml: string, rowText: string) => {
    const row = Number(rowText);
    return row >= startShift ? rebaseRowXml(rowXml, row, row + count, startShift, count) : rowXml;
  });
  const anchor = shifted.match(rowPattern(afterRow));
  if (!anchor) throw new Error(`La plantilla institucional no contiene la fila ${afterRow} donde debe ampliarse la malla.`);
  const inserted = Array.from({ length: count }, (_, index) => rebaseRowXml(source[0], templateRow, afterRow + 1 + index)).join("");
  let output = shifted.replace(anchor[0], `${anchor[0]}${inserted}`);
  output = output.replace(/<dimension ref="([A-Z]+)(\d+):([A-Z]+)(\d+)"\/>/, (_full, c1: string, r1: string, c2: string, r2: string) => `<dimension ref="${c1}${r1}:${c2}${Number(r2) + count}"/>`);
  return output;
}

function yearFlow(result: BudgetResult, year: number) {
  const flow = result.annualFlows.find((candidate) => candidate.year === year);
  if (!flow) throw new Error(`No existe flujo calculado para ${year}.`);
  return flow;
}
function periodsForYear(budget: CohortBudget, year: number): SemesterParameters[] {
  return budget.semesters.filter((semester) => semester.year === year).sort((a, b) => a.semester - b.semester);
}
function periodOrdinal(year: number, semester: 1 | 2): number { return year * 2 + semester; }
function discountApplies(discount: CohortBudget["discounts"][number], semester: SemesterParameters): boolean {
  const value = periodOrdinal(semester.year, semester.semester);
  return value >= periodOrdinal(discount.startYear, discount.startSemester) && value <= periodOrdinal(discount.endYear, discount.endSemester);
}
function exportableDiscounts(budget: CohortBudget): CohortBudget["discounts"] {
  return budget.discounts.filter((discount) => Math.max(0, Math.min(1, discount.percentage)) > 0);
}
function weightedDiscountStudentsForItem(budget: CohortBudget, year: number, discount: CohortBudget["discounts"][number]): number {
  return periodsForYear(budget, year).reduce((total, semester) =>
    total + (discountApplies(discount, semester) ? Math.max(0, discount.students) * 0.5 : 0), 0);
}
function weightedStudents(budget: CohortBudget, year: number): number {
  return periodsForYear(budget, year).reduce((total, semester) => total + Math.max(0, semester.activeStudents) * 0.5, 0);
}
function annualEnrollmentStudents(budget: CohortBudget, year: number, grossFee: number, annualFee: number): number {
  if (annualFee > 0) return grossFee / annualFee;
  const first = periodsForYear(budget, year)[0];
  return first ? Math.max(0, first.activeStudents) : 0;
}
function teachingHoursForSemester(budget: CohortBudget, semester: SemesterParameters): number {
  if (budget.program.type !== "MAGISTER_PROFESIONAL") return Math.max(0, semester.directTeachingHours);
  // La malla profesional puede combinar tipos de docencia por asignatura. El Excel
  // institucional debe reflejar todas las horas equivalentes que efectivamente generan costo.
  return Math.max(0, semester.directTeachingHours)
    + Math.max(0, semester.synchronousTeachingHours)
    + Math.max(0, semester.asynchronousTeachingHours);
}
function effectiveTeachingRate(budget: CohortBudget, parameters: InstitutionalParameters, year: number): number {
  const override = resolvedAnnualOverrideForYear(budget, parameters, year);
  if (budget.program.type === "MAGISTER_PROFESIONAL" && budget.deliveryModality !== "PRESENCIAL") return Math.max(0, override.synchronousTeachingHourValue);
  return Math.max(0, override.directTeachingHourValue);
}
function replacementHoursForYear(budget: CohortBudget, year: number): number {
  return periodsForYear(budget, year).reduce((total, semester) => total + Math.max(0, semester.replacementTeachingHours), 0);
}
function maybeProjectionFormula(base: number, next: number, adjustment: number, baseRef: string): string | null {
  const projected = Math.ceil(base * (1 + adjustment) - 1e-9);
  return Math.abs(projected - next) < 1 ? `ROUNDUP(${baseRef}*(1+${adjustment}),0)` : null;
}

/**
 * Fórmula Excel trazable del punto de equilibrio para el formato institucional de dos años.
 *
 * Replica la lógica económica del motor de punto de equilibrio: neutraliza descuentos y becas
 * de arancel, mantiene costos fijos/arrastre/otros ingresos y considera como variables por
 * matrícula equivalente el arancel neto de incobrabilidad y overhead, la matrícula reconocida
 * y la guía de tesis hasta el tope de estudiantes en graduación de cada año.
 *
 * La fórmula se construye sin LET/LAMBDA para mantener compatibilidad con versiones de Excel
 * anteriores a Microsoft 365.
 */
function breakEvenExcelFormula(
  budget: CohortBudget,
  flow1: BudgetResult["annualFlows"][number],
  flow2: BudgetResult["annualFlows"][number],
  graduationStudentsRow: number,
  badDebtParameterRow: number,
  centralOverheadParameterRow: number,
  facultyOverheadParameterRow: number,
): string {
  const recognitionRate = Math.max(0, Math.min(1, budget.enrollmentRecognitionRate));
  const n = (value: number) => Number.isFinite(value) ? String(value) : "0";

  const fixedIncome1 = `('FLUJO TOTAL'!$B$7-('FLUJO TOTAL'!$B$5+'FLUJO TOTAL'!$B$6)-'FLUJO TOTAL'!$B$4*${n(recognitionRate)})`;
  const fixedIncome2 = `('FLUJO TOTAL'!$C$7-('FLUJO TOTAL'!$C$5+'FLUJO TOTAL'!$C$6)-'FLUJO TOTAL'!$C$4*${n(recognitionRate)})`;
  const fixedExpense1 = `('FLUJO TOTAL'!$B$37-'FLUJO TOTAL'!$B$10-'FLUJO TOTAL'!$B$36+${n(flow1.maintenanceScholarships)})`;
  const fixedExpense2 = `('FLUJO TOTAL'!$C$37-'FLUJO TOTAL'!$C$10-'FLUJO TOTAL'!$C$36+${n(flow2.maintenanceScholarships)})`;
  const fixedBalance = `('FLUJO TOTAL'!$B$39+${fixedIncome1}+${fixedIncome2}+${fixedExpense1}+${fixedExpense2})`;

  const contribution1 = `(Parámetros!$B$4*${n(flow1.tuitionFactor)}*(1-Parámetros!$B$${badDebtParameterRow})*(1-Parámetros!$B$${centralOverheadParameterRow}-Parámetros!$B$${facultyOverheadParameterRow})+Parámetros!$B$5*${n(flow1.tuitionFactor)}*${n(recognitionRate)})`;
  const contribution2 = `(Parámetros!$C$4*${n(flow2.tuitionFactor)}*(1-Parámetros!$C$${badDebtParameterRow})*(1-Parámetros!$C$${centralOverheadParameterRow}-Parámetros!$C$${facultyOverheadParameterRow})+Parámetros!$C$5*${n(flow2.tuitionFactor)}*${n(recognitionRate)})`;
  const contribution = `(${contribution1}+${contribution2})`;

  const graduation1 = `$B$${graduationStudentsRow}`;
  const graduation2 = `$C$${graduationStudentsRow}`;
  const capLow = `MIN(${graduation1},${graduation2})`;
  const capHigh = `MAX(${graduation1},${graduation2})`;
  const guideLow = `IF(${graduation1}<=${graduation2},Parámetros!$B$8,Parámetros!$C$8)`;
  const guideHigh = `IF(${graduation1}<=${graduation2},Parámetros!$C$8,Parámetros!$B$8)`;

  const slope0 = `(${contribution}-${guideLow}-${guideHigh})`;
  const root0 = `((0-${fixedBalance})/${slope0})`;
  const slope1 = `(${contribution}-${guideHigh})`;
  const root1 = `((${capLow}*${guideLow}-${fixedBalance})/${slope1})`;
  const root2 = `((${capLow}*${guideLow}+${capHigh}*${guideHigh}-${fixedBalance})/${contribution})`;

  return `IFERROR(ROUNDUP(MAX(0,IF(${fixedBalance}>=0,0,IF(AND(${slope0}>0,${root0}<=${capLow}),${root0},IF(AND(${slope1}>0,${root1}>=${capLow},${root1}<=${capHigh}),${root1},${root2})))),2),0)`;
}

function modalityLabel(budget: CohortBudget): string {
  return budget.deliveryModality === "SEMIPRESENCIAL" ? "Semipresencial" : budget.deliveryModality === "E_LEARNING" ? "E-learning" : "Presencial";
}
export function institutionalTemplateCompatibilityIssue(budget: CohortBudget, result: BudgetResult): string | null {
  if (budget.program.type !== "MAGISTER_PROFESIONAL") return "El formato Excel institucional mejorado se utiliza para Magísteres Profesionales.";
  if (result.years.length !== 2) return "El formato Excel institucional mejorado requiere exactamente dos años presupuestarios.";
  const payable = payableCurriculumCourses(budget.program).length;
  const generic = genericCurriculumCourses(budget.program).length;
  if (payable > 120) return `La malla contiene ${payable} asignaturas valorizables; excede el máximo técnico de 120 filas para una exportación institucional legible.`;
  if (generic > 40) return `La malla contiene ${generic} competencias genéricas; excede el máximo técnico de 40 filas para una exportación institucional legible.`;
  return null;
}

export function canUseFormulaTemplate(budget: CohortBudget, result: BudgetResult): boolean {
  return institutionalTemplateCompatibilityIssue(budget, result) === null;
}

export async function createInstitutionalFormulaBudgetXlsx(
  templateBytes: Uint8Array,
  budget: CohortBudget,
  result: BudgetResult,
  parameters: InstitutionalParameters,
): Promise<Uint8Array> {
  const compatibilityIssue = institutionalTemplateCompatibilityIssue(budget, result);
  if (compatibilityIssue) throw new Error(compatibilityIssue);
  const files = await unzipPackage(templateBytes);
  const required = ["xl/worksheets/sheet1.xml", "xl/worksheets/sheet2.xml", "xl/worksheets/sheet3.xml", "xl/worksheets/sheet4.xml", "xl/worksheets/sheet5.xml", "xl/styles.xml"];
  for (const name of required) if (!files.has(name)) throw new Error(`Plantilla XLSX incompleta: falta ${name}.`);
  const templateChecks = [
    { file: "xl/worksheets/sheet1.xml", refs: ["B17", "C17"] },
    { file: "xl/worksheets/sheet3.xml", refs: ["G17", "H17", "G18", "H18"] },
    { file: "xl/worksheets/sheet4.xml", refs: ["B40", "C40"] },
    { file: "xl/worksheets/sheet5.xml", refs: ["F22", "F25"] },
  ];
  for (const check of templateChecks) {
    const content = decoder.decode(files.get(check.file)!);
    for (const ref of check.refs) {
      if (!cellPattern(ref).test(content)) {
        throw new Error(`PLANTILLA_INSTITUCIONAL_OBSOLETA: falta ${ref} en ${check.file}. Actualice la plantilla institucional y vuelva a exportar.`);
      }
    }
  }

  const [year1, year2] = result.years;
  const flow1 = yearFlow(result, year1); const flow2 = yearFlow(result, year2);
  const override1 = resolvedAnnualOverrideForYear(budget, parameters, year1); const override2 = resolvedAnnualOverrideForYear(budget, parameters, year2);
  const discounts = exportableDiscounts(budget);
  const discountSlots = Math.max(2, discounts.length);
  const extraDiscountRows = Math.max(0, discountSlots - 2);
  const parameterDiscountStartRow = 10;
  const badDebtParameterRow = 10 + discountSlots;
  const centralOverheadParameterRow = 11 + discountSlots;
  const facultyOverheadParameterRow = 12 + discountSlots;
  const directionParameterRow = 13 + discountSlots;
  const assistanceParameterRow = 14 + discountSlots;
  const otherHonorariaParameterRow = 15 + discountSlots;
  const studentDiscountStartRow = 4;
  const totalStudentsRow = 4 + discountSlots;
  const equivalentStudentsRow = 5 + discountSlots;
  const graduationStudentsRow = 6 + discountSlots;
  const enrollmentIncomeRow = 7 + discountSlots;
  const noDiscountIncomeRow = 8 + discountSlots;
  const discountIncomeStartRow = 9 + discountSlots;
  const totalTuitionIncomeRow = 9 + (2 * discountSlots);
  const equilibriumRow = 10 + (2 * discountSlots);
  const equilibriumWholeStudentsRow = 11 + (2 * discountSlots);
  const adjustment = Math.max(0, parameters.annualAdjustmentRate || 0);
  const teachingRate1 = effectiveTeachingRate(budget, parameters, year1); const teachingRate2 = effectiveTeachingRate(budget, parameters, year2);
  const modality = modalityLabel(budget);

  // 1. Parámetros: reproduce la versión mejorada aportada por Postgrado.
  let s1 = decoder.decode(files.get("xl/worksheets/sheet1.xml")!);
  s1 = setText(s1, "A1", `${budget.program.name} - ${budget.startYear}-${budget.startSemester}`);
  s1 = setText(s1, "A2", modality);
  s1 = setNumber(s1, "B3", year1); s1 = setNumber(s1, "C3", year2);
  s1 = setNumber(s1, "B4", override1.annualTuition); s1 = setNumber(s1, "C4", override2.annualTuition);
  s1 = setNumber(s1, "B5", override1.annualEnrollmentFee); s1 = setNumber(s1, "C5", override2.annualEnrollmentFee);
  s1 = setNumber(s1, "B6", teachingRate1); s1 = setNumber(s1, "C6", teachingRate2);
  s1 = setNumber(s1, "B7", parameters.replacementHour); s1 = setNumber(s1, "C7", parameters.replacementHour);
  s1 = setNumber(s1, "B8", override1.thesisGuidancePerGraduatingStudent); s1 = setNumber(s1, "C8", override2.thesisGuidancePerGraduatingStudent);
  s1 = setText(s1, "B9", `${budget.startYear}-${budget.startSemester}S`); s1 = clearCell(s1, "C9");
  if (extraDiscountRows > 0) s1 = insertRowsFromTemplate(s1, 11, extraDiscountRows, 11);
  for (let index = 0; index < discountSlots; index += 1) {
    const row = parameterDiscountStartRow + index;
    const discount = discounts[index];
    const rate = discount ? Math.max(0, Math.min(1, discount.percentage)) : 0;
    s1 = setText(s1, `A${row}`, discount?.name?.trim() || `Beneficio / descuento ${index + 1}`);
    s1 = setNumber(s1, `B${row}`, rate);
    s1 = setFormula(s1, `C${row}`, `+B${row}`, rate);
  }
  s1 = setNumber(s1, `B${badDebtParameterRow}`, flow1.tuitionAfterBenefits > 0 ? flow1.badDebt / flow1.tuitionAfterBenefits : 0); s1 = setNumber(s1, `C${badDebtParameterRow}`, flow2.tuitionAfterBenefits > 0 ? flow2.badDebt / flow2.tuitionAfterBenefits : 0);
  s1 = setNumber(s1, `B${centralOverheadParameterRow}`, flow1.centralOverheadRate); s1 = setNumber(s1, `C${centralOverheadParameterRow}`, flow2.centralOverheadRate);
  s1 = setNumber(s1, `B${facultyOverheadParameterRow}`, flow1.facultyOverheadRate); s1 = setNumber(s1, `C${facultyOverheadParameterRow}`, flow2.facultyOverheadRate);
  s1 = setNumber(s1, `B${directionParameterRow}`, override1.annualDirection);
  const directionProjection = maybeProjectionFormula(override1.annualDirection, override2.annualDirection, adjustment, `B${directionParameterRow}`); s1 = directionProjection ? setFormula(s1, `C${directionParameterRow}`, directionProjection, override2.annualDirection) : setNumber(s1, `C${directionParameterRow}`, override2.annualDirection);
  s1 = setNumber(s1, `B${assistanceParameterRow}`, override1.annualAssistance);
  const assistanceProjection = maybeProjectionFormula(override1.annualAssistance, override2.annualAssistance, adjustment, `B${assistanceParameterRow}`); s1 = assistanceProjection ? setFormula(s1, `C${assistanceParameterRow}`, assistanceProjection, override2.annualAssistance) : setNumber(s1, `C${assistanceParameterRow}`, override2.annualAssistance);
  s1 = setNumber(s1, `B${otherHonorariaParameterRow}`, override1.annualOtherNonAcademicHonoraria);
  const otherProjection = maybeProjectionFormula(override1.annualOtherNonAcademicHonoraria, override2.annualOtherNonAcademicHonoraria, adjustment, `B${otherHonorariaParameterRow}`); s1 = otherProjection ? setFormula(s1, `C${otherHonorariaParameterRow}`, otherProjection, override2.annualOtherNonAcademicHonoraria) : setNumber(s1, `C${otherHonorariaParameterRow}`, override2.annualOtherNonAcademicHonoraria);
  files.set("xl/worksheets/sheet1.xml", encoder.encode(s1));

  // 2. Flujo estudiantes: incorpora matrículas equivalentes y punto de equilibrio sin el texto "flujo simulado".
  let s2 = decoder.decode(files.get("xl/worksheets/sheet2.xml")!);
  if (extraDiscountRows > 0) {
    s2 = insertRowsFromTemplate(s2, 5, extraDiscountRows, 5);
    s2 = insertRowsFromTemplate(s2, 12 + extraDiscountRows, extraDiscountRows, 12 + extraDiscountRows);
  }
  s2 = setText(s2, "B2", `año ${year1}`); s2 = setText(s2, "C2", `año ${year2}`);
  const discountStudents1 = discounts.map((discount) => weightedDiscountStudentsForItem(budget, year1, discount));
  const discountStudents2 = discounts.map((discount) => weightedDiscountStudentsForItem(budget, year2, discount));
  const discounted1 = discountStudents1.reduce((total, value) => total + value, 0);
  const discounted2 = discountStudents2.reduce((total, value) => total + value, 0);
  const no1 = Math.max(0, weightedStudents(budget, year1) - discounted1);
  const no2 = Math.max(0, weightedStudents(budget, year2) - discounted2);
  const continuationFormula = (baseRef: string, base: number, next: number) => { const delta = next - base; if (Math.abs(delta) < 1e-9) return `+${baseRef}`; return delta > 0 ? `${baseRef}+${delta}` : `${baseRef}-${Math.abs(delta)}`; };
  s2 = setNumber(s2, "B3", no1); s2 = setFormula(s2, "C3", continuationFormula("B3", no1, no2), no2);
  for (let index = 0; index < discountSlots; index += 1) {
    const studentRow = studentDiscountStartRow + index;
    const parameterRow = parameterDiscountStartRow + index;
    const discount = discounts[index];
    const students1 = discountStudents1[index] ?? 0;
    const students2 = discountStudents2[index] ?? 0;
    const rate = discount ? Math.max(0, Math.min(1, discount.percentage)) : 0;
    const fallback = `Descuento ${index + 1}`;
    const label = discount?.name?.trim() || (rate > 0 ? `Descuento ${(rate * 100).toLocaleString("es-CL", { maximumFractionDigits: 2 })}%` : fallback);
    s2 = setText(s2, `A${studentRow}`, label);
    s2 = setNumber(s2, `B${studentRow}`, students1);
    s2 = setFormula(s2, `C${studentRow}`, continuationFormula(`B${studentRow}`, students1, students2), students2);
    const incomeRow = discountIncomeStartRow + index;
    s2 = setText(s2, `A${incomeRow}`, `Ingresos arancel ${label}`);
    s2 = setFormula(s2, `B${incomeRow}`, `(B${studentRow})*Parámetros!$B$4*(1-Parámetros!$B$${parameterRow})`, students1 * override1.annualTuition * (1 - rate));
    s2 = setFormula(s2, `C${incomeRow}`, `(C${studentRow})*Parámetros!$C$4*(1-Parámetros!$C$${parameterRow})`, students2 * override2.annualTuition * (1 - rate));
  }
  s2 = setFormula(s2, `B${totalStudentsRow}`, `SUM(B3:B${studentDiscountStartRow + discountSlots - 1})`, no1 + discounted1); s2 = setFormula(s2, `C${totalStudentsRow}`, `SUM(C3:C${studentDiscountStartRow + discountSlots - 1})`, no2 + discounted2);
  const equivalentFormula = (column: "B" | "C") => [`${column}3`, ...Array.from({ length: discountSlots }, (_, index) => `${column}${studentDiscountStartRow + index}*(1-Parámetros!${column}${parameterDiscountStartRow + index})`)].join("+");
  s2 = setFormula(s2, `B${equivalentStudentsRow}`, equivalentFormula("B"), flow1.equivalentEnrollments); s2 = setFormula(s2, `C${equivalentStudentsRow}`, equivalentFormula("C"), flow2.equivalentEnrollments);
  s2 = setFormula(s2, `B${graduationStudentsRow}`, `${flow1.graduatingStudents}`, flow1.graduatingStudents); const graduationFormula2 = Math.abs(flow2.graduatingStudents - (no2 + discounted2)) < 1e-9 ? `C${totalStudentsRow}` : `${flow2.graduatingStudents}`; s2 = setFormula(s2, `C${graduationStudentsRow}`, graduationFormula2, flow2.graduatingStudents);
  const enrollmentStudents1 = annualEnrollmentStudents(budget, year1, flow1.grossEnrollmentFee, override1.annualEnrollmentFee); const enrollmentStudents2 = annualEnrollmentStudents(budget, year2, flow2.grossEnrollmentFee, override2.annualEnrollmentFee);
  s2 = setFormula(s2, `B${enrollmentIncomeRow}`, Math.abs(enrollmentStudents1 - (no1 + discounted1)) < 1e-9 ? `B${totalStudentsRow}*Parámetros!$B$5` : `${enrollmentStudents1}*Parámetros!$B$5`, flow1.grossEnrollmentFee); s2 = setFormula(s2, `C${enrollmentIncomeRow}`, Math.abs(enrollmentStudents2 - (no2 + discounted2)) < 1e-9 ? `C${totalStudentsRow}*Parámetros!$C$5` : `${enrollmentStudents2}*Parámetros!$C$5`, flow2.grossEnrollmentFee);
  s2 = setFormula(s2, `B${noDiscountIncomeRow}`, `(B3)*Parámetros!$B$4`, no1 * override1.annualTuition); s2 = setFormula(s2, `C${noDiscountIncomeRow}`, `(C3)*Parámetros!$C$4`, no2 * override2.annualTuition);
  s2 = setFormula(s2, `B${totalTuitionIncomeRow}`, `SUM(B${noDiscountIncomeRow}:B${discountIncomeStartRow + discountSlots - 1})`, flow1.tuitionAfterBenefits); s2 = setFormula(s2, `C${totalTuitionIncomeRow}`, `SUM(C${noDiscountIncomeRow}:C${discountIncomeStartRow + discountSlots - 1})`, flow2.tuitionAfterBenefits);
  const equilibrium = calculateBreakEvenEquivalentEnrollments(budget, parameters);
  const equilibriumFormula = breakEvenExcelFormula(
    budget, flow1, flow2, graduationStudentsRow, badDebtParameterRow, centralOverheadParameterRow, facultyOverheadParameterRow,
  );
  s2 = setFormula(s2, `B${equilibriumRow}`, equilibriumFormula, equilibrium.minimumEquivalentEnrollments ?? 0);
  s2 = setText(s2, `C${equilibriumRow}`, "matrículas equivalentes (fórmula)");
  s2 = setFormula(s2, `B${equilibriumWholeStudentsRow}`, `ROUNDUP(B${equilibriumRow},0)`, equilibrium.minimumWholeStudents ?? 0);
  s2 = setText(s2, `C${equilibriumWholeStudentsRow}`, "estudiantes (redondeo fórmula)");
  files.set("xl/worksheets/sheet2.xml", encoder.encode(s2));

  // 3. Costo Directo de Docencia: utiliza la malla real del programa cuando está disponible.
  // v11.0.3: la hoja se amplía dinámicamente y los descuentos también se exportan como filas variables.
  let s3 = decoder.decode(files.get("xl/worksheets/sheet3.xml")!);
  const activePeriods = getActivePeriods(budget.startYear, budget.startSemester, budget.durationSemesters);
  const courses = payableCurriculumCourses(budget.program);
  const generic = genericCurriculumCourses(budget.program);
  const extraCourseRows = Math.max(0, courses.length - 13);
  if (extraCourseRows > 0) s3 = insertRowsFromTemplate(s3, 16, extraCourseRows, 16);
  const genericBaseStart = 22 + extraCourseRows;
  const genericBaseEnd = 24 + extraCourseRows;
  const extraGenericRows = Math.max(0, generic.length - 3);
  if (extraGenericRows > 0) s3 = insertRowsFromTemplate(s3, genericBaseEnd, extraGenericRows, genericBaseStart + 1);
  const courseEndRow = 16 + extraCourseRows;
  const totalHoursRow = 17 + extraCourseRows;
  const directCostRow = 18 + extraCourseRows;
  const genericStartRow = 22 + extraCourseRows;
  const genericEndRow = 24 + extraCourseRows + extraGenericRows;
  const thesisHeaderRow = 28 + extraCourseRows + extraGenericRows;
  const thesisRow = 29 + extraCourseRows + extraGenericRows;
  s3 = setNumber(s3, "G3", year1); s3 = setNumber(s3, "H3", year2);
  if (courses.length) {
    for (let row = 4; row <= courseEndRow; row += 1) {
      const course = courses[row - 4];
      if (!course) { s3 = clearCell(s3, `A${row}`); s3 = clearCell(s3, `B${row}`); s3 = setNumber(s3, `C${row}`, 18); s3 = setNumber(s3, `D${row}`, 1); s3 = setNumber(s3, `E${row}`, 0); s3 = setNumber(s3, `F${row}`, 0); s3 = setFormula(s3, `G${row}`, `+$C$${row}*$D$${row}*E${row}`, 0); s3 = setFormula(s3, `H${row}`, `+$C$${row}*$D$${row}*F${row}`, 0); continue; }
      const period = activePeriods[course.semester - 1]; const participants = 1 + course.sharedWithProgramIds.filter((id) => id !== budget.program.id).length; const allocation = participants > 1 ? Math.max(0, Math.min(1, course.allocationRate || 1 / participants)) : 1;
      const modeFactor = course.teachingMode === "ASINCRONICA" ? Math.max(0, Math.min(1, course.asynchronousRateFactor)) : 1;
      const weeklyPaid = Math.max(0, course.directWeeklyHours) * modeFactor * allocation;
      const detail = `${course.name}${course.teachingMode === "ASINCRONICA" ? ` · asincrónica ${Math.round(course.asynchronousRateFactor * 100)}%` : ""}${participants > 1 ? ` · compartida ${Math.round(allocation * 10000) / 100}%` : ""}`;
      s3 = setNumber(s3, `A${row}`, course.semester); s3 = setText(s3, `B${row}`, detail); s3 = setNumber(s3, `C${row}`, course.weeks); s3 = setNumber(s3, `D${row}`, course.sections);
      s3 = setNumber(s3, `E${row}`, period?.year === year1 ? weeklyPaid : 0); s3 = setNumber(s3, `F${row}`, period?.year === year2 ? weeklyPaid : 0);
      const total1Hours = period?.year === year1 ? course.weeks * course.sections * weeklyPaid : 0; const total2Hours = period?.year === year2 ? course.weeks * course.sections * weeklyPaid : 0;
      s3 = setFormula(s3, `G${row}`, `+$C$${row}*$D$${row}*E${row}`, total1Hours); s3 = setFormula(s3, `H${row}`, `+$C$${row}*$D$${row}*F${row}`, total2Hours);
    }
  } else {
    const semesters = [...budget.semesters].sort((a, b) => periodOrdinal(a.year, a.semester) - periodOrdinal(b.year, b.semester));
    const effectiveAnnualHours = new Map<number, number>([[year1, teachingRate1 > 0 ? flow1.directTeachingCost / teachingRate1 : 0], [year2, teachingRate2 > 0 ? flow2.directTeachingCost / teachingRate2 : 0]]);
    const rawAnnualHours = new Map<number, number>([[year1, periodsForYear(budget, year1).reduce((t, item) => t + teachingHoursForSemester(budget, item), 0)], [year2, periodsForYear(budget, year2).reduce((t, item) => t + teachingHoursForSemester(budget, item), 0)]]);
    for (let row = 4; row <= courseEndRow; row += 1) { const semester = semesters[row - 4]; if (!semester) { s3 = clearCell(s3, `A${row}`); s3 = clearCell(s3, `B${row}`); s3 = setNumber(s3, `C${row}`, 18); s3 = setNumber(s3, `D${row}`, 1); s3 = setNumber(s3, `E${row}`, 0); s3 = setNumber(s3, `F${row}`, 0); s3 = setFormula(s3, `G${row}`, `+$C$${row}*$D$${row}*E${row}`, 0); s3 = setFormula(s3, `H${row}`, `+$C$${row}*$D$${row}*F${row}`, 0); continue; } const raw = teachingHoursForSemester(budget, semester); const annualRaw = rawAnnualHours.get(semester.year) ?? 0; const effective = annualRaw > 0 ? raw * (effectiveAnnualHours.get(semester.year) ?? 0) / annualRaw : 0; const weekly = effective / 18; s3 = setNumber(s3, `A${row}`, semester.semester); s3 = setText(s3, `B${row}`, `Docencia ${semester.year}-${semester.semester}S`); s3 = setNumber(s3, `C${row}`, 18); s3 = setNumber(s3, `D${row}`, 1); s3 = setNumber(s3, `E${row}`, semester.year === year1 ? weekly : 0); s3 = setNumber(s3, `F${row}`, semester.year === year2 ? weekly : 0); s3 = setFormula(s3, `G${row}`, `+$C$${row}*$D$${row}*E${row}`, semester.year === year1 ? effective : 0); s3 = setFormula(s3, `H${row}`, `+$C$${row}*$D$${row}*F${row}`, semester.year === year2 ? effective : 0); }
  }
  s3 = setFormula(s3, `G${totalHoursRow}`, `SUM(G4:G${courseEndRow})`, teachingRate1 > 0 ? flow1.directTeachingCost / teachingRate1 : 0); s3 = setFormula(s3, `H${totalHoursRow}`, `SUM(H4:H${courseEndRow})`, teachingRate2 > 0 ? flow2.directTeachingCost / teachingRate2 : 0);
  s3 = setFormula(s3, `G${directCostRow}`, `+G${totalHoursRow}*Parámetros!B6`, flow1.directTeachingCost); s3 = setFormula(s3, `H${directCostRow}`, `+H${totalHoursRow}*Parámetros!C6`, flow2.directTeachingCost);
  for (let row = genericStartRow; row <= genericEndRow; row += 1) { const course = generic[row - genericStartRow]; if (!course) { s3 = clearCell(s3, `A${row}`); s3 = clearCell(s3, `B${row}`); s3 = setNumber(s3, `C${row}`, 0); s3 = setNumber(s3, `D${row}`, 0); } else { s3 = setText(s3, `A${row}`, course.code ?? ""); s3 = setText(s3, `B${row}`, course.name); s3 = setNumber(s3, `C${row}`, course.directWeeklyHours); s3 = setNumber(s3, `D${row}`, 0); } }
  s3 = setText(s3, `B${thesisHeaderRow}`, `Base estudiantes ${year2}`); s3 = setText(s3, `C${thesisHeaderRow}`, `Valor unitario ${year2}`); s3 = setText(s3, `D${thesisHeaderRow}`, `Costo ${year2}`);
  s3 = setFormula(s3, `B${thesisRow}`, `+'Flujo estudiantes'!C${graduationStudentsRow}`, flow2.graduatingStudents); s3 = setFormula(s3, `C${thesisRow}`, "+Parámetros!C8", override2.thesisGuidancePerGraduatingStudent); s3 = setFormula(s3, `D${thesisRow}`, `B${thesisRow}*C${thesisRow}`, flow2.thesisGuidanceCost);
  files.set("xl/worksheets/sheet3.xml", encoder.encode(s3));

  // 4. Prorrateo Staff de la versión mejorada: Factor, Valor y Monto prorrateado.
  let s5 = decoder.decode(files.get("xl/worksheets/sheet5.xml")!);
  const staffBlocks = [
    { titleRow: 2, rows: [4,5,6,7,8,9], paramRow: directionParameterRow, label: "Dirección del programa", rates: [override1.directionProrated ? override1.directionAllocationRate : 1, override2.directionProrated ? override2.directionAllocationRate : 1], bases: [override1.annualDirection, override2.annualDirection] },
    { titleRow: 11, rows: [13,14,15,16,17,18], paramRow: assistanceParameterRow, label: "Asistente de Dirección", rates: [override1.assistanceProrated ? override1.assistanceAllocationRate : 1, override2.assistanceProrated ? override2.assistanceAllocationRate : 1], bases: [override1.annualAssistance, override2.annualAssistance] },
    { titleRow: 20, rows: [22,23,24,25,26,27], paramRow: otherHonorariaParameterRow, label: "Otros honorarios no académicos", rates: [override1.otherNonAcademicProrated ? override1.otherNonAcademicAllocationRate : 1, override2.otherNonAcademicProrated ? override2.otherNonAcademicAllocationRate : 1], bases: [override1.annualOtherNonAcademicHonoraria, override2.annualOtherNonAcademicHonoraria] },
  ] as const;
  for (const block of staffBlocks) { s5 = setText(s5, `A${block.titleRow}`, block.label); const [current1, other1, total1Row, current2, other2, total2Row] = block.rows; const configs = [{ year: year1, current: current1, other: other1, total: total1Row, rate: Math.max(0, Math.min(1, block.rates[0])), base: block.bases[0], paramCol: "B" }, { year: year2, current: current2, other: other2, total: total2Row, rate: Math.max(0, Math.min(1, block.rates[1])), base: block.bases[1], paramCol: "C" }]; for (const config of configs) { s5 = setNumber(s5, `A${config.current}`, config.year); s5 = setText(s5, `B${config.current}`, `Cohorte ${budget.startYear}`); s5 = setText(s5, `C${config.current}`, "primer y segundo semestre "); s5 = setNumber(s5, `D${config.current}`, config.rate); s5 = setNumber(s5, `A${config.other}`, config.year); s5 = setText(s5, `B${config.other}`, "Otras cohortes / versiones"); s5 = clearCell(s5, `C${config.other}`); s5 = setNumber(s5, `D${config.other}`, Math.max(0, 1 - config.rate)); s5 = setNumber(s5, `A${config.total}`, config.year); s5 = setText(s5, `B${config.total}`, `Total ${config.year}`); s5 = setFormula(s5, `C${config.total}`, `+Parámetros!${config.paramCol}${block.paramRow}`, config.base); s5 = setFormula(s5, `D${config.total}`, `SUM(D${config.current}:D${config.other})`, 1); s5 = setFormula(s5, `E${config.current}`, `+$C$${config.total}/$D$${config.total}`, config.base); s5 = setFormula(s5, `E${config.other}`, `+$C$${config.total}/$D$${config.total}`, config.base); s5 = setFormula(s5, `F${config.current}`, `D${config.current}*E${config.current}`, config.base * config.rate); s5 = setFormula(s5, `F${config.other}`, `D${config.other}*E${config.other}`, config.base * Math.max(0, 1 - config.rate)); s5 = setFormula(s5, `F${config.total}`, `SUM(F${config.current}:F${config.other})`, config.base); } }
  files.set("xl/worksheets/sheet5.xml", encoder.encode(s5));

  // 5. Flujo Total: referencias actualizadas a la estructura mejorada.
  let s4 = decoder.decode(files.get("xl/worksheets/sheet4.xml")!); s4 = setText(s4, "A1", `${budget.program.name} (${budget.startYear}-${budget.startSemester})`); s4 = setText(s4, "A2", modality); s4 = setNumber(s4, "B3", year1); s4 = setNumber(s4, "C3", year2);
  s4 = setFormula(s4, "B4", `'Flujo estudiantes'!B${enrollmentIncomeRow}`, flow1.grossEnrollmentFee); s4 = setFormula(s4, "C4", `'Flujo estudiantes'!C${enrollmentIncomeRow}`, flow2.grossEnrollmentFee);
  s4 = setFormula(s4, "B5", `'Flujo estudiantes'!B${totalTuitionIncomeRow}`, flow1.tuitionAfterBenefits); s4 = setFormula(s4, "C5", `'Flujo estudiantes'!C${totalTuitionIncomeRow}`, flow2.tuitionAfterBenefits);
  s4 = setFormula(s4, "B6", `-B5*Parámetros!B${badDebtParameterRow}`, -flow1.badDebt); s4 = setFormula(s4, "C6", `-C5*Parámetros!C${badDebtParameterRow}`, -flow2.badDebt);
  const ext1 = flow1.recognizedEnrollmentFee + flow1.externalIncome + flow1.institutionalFinancing + flow1.otherIncome; const ext2 = flow2.recognizedEnrollmentFee + flow2.externalIncome + flow2.institutionalFinancing + flow2.otherIncome; s4 = setFormula(s4, "B7", ext1 ? `SUM(B5:B6)+${ext1}` : "SUM(B5:B6)", flow1.totalIncome); s4 = setFormula(s4, "C7", ext2 ? `SUM(C5:C6)+${ext2}` : "SUM(C5:C6)", flow2.totalIncome);
  s4 = setFormula(s4, "B8", `-'Costo Directo de Docencia'!G${directCostRow}`, -flow1.directTeachingCost); s4 = setFormula(s4, "C8", `-'Costo Directo de Docencia'!H${directCostRow}`, -flow2.directTeachingCost);
  const repHours1 = replacementHoursForYear(budget, year1); const repHours2 = replacementHoursForYear(budget, year2); s4 = setFormula(s4, "B9", `-${repHours1}*Parámetros!B7`, -flow1.replacementTeachingCost); s4 = setFormula(s4, "C9", `-${repHours2}*Parámetros!C7`, -flow2.replacementTeachingCost);
  s4 = setFormula(s4, "B10", `-'Flujo estudiantes'!B${graduationStudentsRow}*Parámetros!$B$8`, -flow1.thesisGuidanceCost); s4 = setFormula(s4, "C10", `-'Flujo estudiantes'!C${graduationStudentsRow}*Parámetros!$C$8`, -flow2.thesisGuidanceCost); s4 = setFormula(s4, "B11", "SUM(B8:B10)", -flow1.academicHonoraria); s4 = setFormula(s4, "C11", "SUM(C8:C10)", -flow2.academicHonoraria);
  s4 = setFormula(s4, "B12", "-'Prorrateo Staff'!F4", -flow1.direction); s4 = setFormula(s4, "C12", "-'Prorrateo Staff'!F7", -flow2.direction); s4 = setFormula(s4, "B13", "-'Prorrateo Staff'!F13", -flow1.assistance); s4 = setFormula(s4, "C13", "-'Prorrateo Staff'!F16", -flow2.assistance); s4 = setNumber(s4, "B14", 0); s4 = setNumber(s4, "C14", 0); s4 = setFormula(s4, "B15", "-'Prorrateo Staff'!F22", -flow1.otherNonAcademicHonoraria); s4 = setFormula(s4, "C15", "-'Prorrateo Staff'!F25", -flow2.otherNonAcademicHonoraria); s4 = setFormula(s4, "B16", "SUM(B12:B15)", -flow1.nonAcademicHonoraria); s4 = setFormula(s4, "C16", "SUM(C12:C15)", -flow2.nonAcademicHonoraria);
  s4 = setNumber(s4, "B17", -flow1.equipment); s4 = setNumber(s4, "C17", -flow2.equipment); s4 = setNumber(s4, "B18", -flow1.booksPublications); s4 = setNumber(s4, "C18", -flow2.booksPublications); s4 = setNumber(s4, "B20", -flow1.diffusion); s4 = setNumber(s4, "C20", -flow2.diffusion); s4 = setNumber(s4, "B22", -flow1.travelFreight); s4 = setNumber(s4, "C22", -flow2.travelFreight); s4 = setNumber(s4, "B23", 0); s4 = setNumber(s4, "C23", 0); s4 = setNumber(s4, "B25", -flow1.perDiem); s4 = setNumber(s4, "C25", -flow2.perDiem); s4 = setNumber(s4, "B27", -flow1.software); s4 = setNumber(s4, "C27", -flow2.software); s4 = setNumber(s4, "B29", -(flow1.operational + flow1.otherCosts)); s4 = setNumber(s4, "C29", -(flow2.operational + flow2.otherCosts)); s4 = setNumber(s4, "B30", -flow1.foodBeverages); s4 = setNumber(s4, "C30", -flow2.foodBeverages); s4 = setNumber(s4, "B32", -(flow1.congressesInternships + flow1.scholarshipsAndAid)); s4 = setNumber(s4, "C32", -(flow2.congressesInternships + flow2.scholarshipsAndAid));
  s4 = setFormula(s4, "B19", "SUM(B17:B18)", -(flow1.equipment + flow1.booksPublications)); s4 = setFormula(s4, "C19", "SUM(C17:C18)", -(flow2.equipment + flow2.booksPublications)); s4 = setFormula(s4, "B21", "SUM(B20)", -flow1.diffusion); s4 = setFormula(s4, "C21", "SUM(C20)", -flow2.diffusion); s4 = setFormula(s4, "B24", "SUM(B22:B23)", -flow1.travelFreight); s4 = setFormula(s4, "C24", "SUM(C22:C23)", -flow2.travelFreight); s4 = setFormula(s4, "B26", "SUM(B25)", -flow1.perDiem); s4 = setFormula(s4, "C26", "SUM(C25)", -flow2.perDiem); s4 = setFormula(s4, "B28", "SUM(B27)", -flow1.software); s4 = setFormula(s4, "C28", "SUM(C27)", -flow2.software); s4 = setFormula(s4, "B31", "SUM(B29:B30)", -(flow1.operational + flow1.otherCosts + flow1.foodBeverages)); s4 = setFormula(s4, "C31", "SUM(C29:C30)", -(flow2.operational + flow2.otherCosts + flow2.foodBeverages)); s4 = setFormula(s4, "B33", "SUM(B32)", -(flow1.congressesInternships + flow1.scholarshipsAndAid)); s4 = setFormula(s4, "C33", "SUM(C32)", -(flow2.congressesInternships + flow2.scholarshipsAndAid));
  s4 = setFormula(s4, "B34", `-(B5+B6)*Parámetros!B${centralOverheadParameterRow}`, -flow1.centralOverhead); s4 = setFormula(s4, "C34", `-(C5+C6)*Parámetros!C${centralOverheadParameterRow}`, -flow2.centralOverhead); s4 = setFormula(s4, "B35", `-(B5+B6)*Parámetros!B${facultyOverheadParameterRow}`, -flow1.facultyOverhead); s4 = setFormula(s4, "C35", `-(C5+C6)*Parámetros!C${facultyOverheadParameterRow}`, -flow2.facultyOverhead); s4 = setFormula(s4, "B36", "SUM(B34:B35)", -(flow1.centralOverhead + flow1.facultyOverhead)); s4 = setFormula(s4, "C36", "SUM(C34:C35)", -(flow2.centralOverhead + flow2.facultyOverhead)); s4 = setFormula(s4, "B37", "SUM(B11,B16,B19,B21,B24,B26,B28,B31,B33,B36)", -flow1.totalExpenses); s4 = setFormula(s4, "C37", "SUM(C11,C16,C19,C21,C24,C26,C28,C31,C33,C36)", -flow2.totalExpenses); s4 = setFormula(s4, "B38", "+B7+B37", flow1.netFlow); s4 = setFormula(s4, "C38", "+C7+C37", flow2.netFlow); s4 = setNumber(s4, "B39", flow1.startingCarryover); s4 = setFormula(s4, "C39", "+B40", flow2.startingCarryover); s4 = setFormula(s4, "B40", "+SUM(B38:B39)", flow1.accumulatedFlow); s4 = setFormula(s4, "C40", "+SUM(C38:C39)", flow2.accumulatedFlow); s4 = setFormula(s4, "B41", "IFERROR((B7+B37)/B7,0)", flow1.operatingMargin ?? 0); s4 = setFormula(s4, "C41", "IFERROR((C7+C37)/C7,0)", flow2.operatingMargin ?? 0);
  files.set("xl/worksheets/sheet4.xml", encoder.encode(s4));

  files.delete("xl/calcChain.xml"); const workbookXml = decoder.decode(files.get("xl/workbook.xml")!); files.set("xl/workbook.xml", encoder.encode(workbookXml.replace(/<calcPr[^>]*\/>/, '<calcPr calcMode="auto" fullCalcOnLoad="1" forceFullCalc="1"/>'))); const relsName = "xl/_rels/workbook.xml.rels"; files.set(relsName, encoder.encode(decoder.decode(files.get(relsName)!).replace(/<Relationship[^>]*calcChain[^>]*\/>/g, ""))); files.set("[Content_Types].xml", encoder.encode(decoder.decode(files.get("[Content_Types].xml")!).replace(/<Override[^>]*calcChain[^>]*\/>/g, "")));
  return zip(files);
}
