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
function distinctDiscountRates(budget: CohortBudget): number[] {
  const rates: number[] = [];
  for (const discount of budget.discounts) {
    const rate = Math.max(0, Math.min(1, discount.percentage));
    if (rate <= 0) continue;
    if (!rates.some((candidate) => Math.abs(candidate - rate) < 1e-9)) rates.push(rate);
  }
  return rates;
}
function tuitionChargeSemesterForYear(budget: CohortBudget, year: number): SemesterParameters | undefined {
  return periodsForYear(budget, year)[0];
}
function annualDiscountStudents(budget: CohortBudget, year: number, rate: number): number {
  const semester = tuitionChargeSemesterForYear(budget, year);
  if (!semester) return 0;
  // Los descuentos se expresan en personas completas y se aplican una sola vez al
  // arancel anual del año. Nunca se transforman 5 estudiantes en 2,5 por tener un
  // solo semestre activo en ese año calendario.
  return budget.discounts
    .filter((discount) => Math.abs(discount.percentage - rate) < 1e-9 && discountApplies(discount, semester))
    .reduce((subtotal, discount) => subtotal + Math.max(0, Math.round(discount.students)), 0);
}
function annualStudents(budget: CohortBudget, year: number): number {
  const semester = tuitionChargeSemesterForYear(budget, year);
  return semester ? Math.max(0, Math.round(semester.activeStudents)) : 0;
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

function modalityLabel(budget: CohortBudget): string {
  return budget.deliveryModality === "SEMIPRESENCIAL" ? "Semipresencial" : budget.deliveryModality === "E_LEARNING" ? "E-learning" : "Presencial";
}
function discountNameForRate(budget: CohortBudget, rate: number, fallback: string): string {
  const names = [...new Set(budget.discounts.filter((discount) => Math.abs(discount.percentage - rate) < 1e-9).map((discount) => discount.name.trim()).filter(Boolean))];
  return names.length ? names.join("\n") : fallback;
}
export function institutionalTemplateCompatibilityIssue(budget: CohortBudget, result: BudgetResult): string | null {
  if (budget.program.type !== "MAGISTER_PROFESIONAL") return "El formato Excel institucional mejorado se utiliza para Magísteres Profesionales.";
  if (result.years.length !== 2) return "El formato Excel institucional mejorado requiere exactamente dos años presupuestarios.";
  if (distinctDiscountRates(budget).length > 2) return "El formato Excel institucional mejorado admite hasta dos tasas de descuento diferentes.";
  const payable = payableCurriculumCourses(budget.program).length;
  const generic = genericCurriculumCourses(budget.program).length;
  if (payable > 13) return `La malla contiene ${payable} asignaturas valorizables; la plantilla institucional actual admite hasta 13. No se utilizará silenciosamente el formato antiguo.`;
  if (generic > 3) return `La malla contiene ${generic} competencias genéricas; la plantilla institucional actual admite hasta 3. No se utilizará silenciosamente el formato antiguo.`;
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
  const rates = distinctDiscountRates(budget); const rate1 = rates[0] ?? 0; const rate2 = rates[1] ?? 0;
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
  s1 = setText(s1, "A10", discountNameForRate(budget, rate1, "Beneficio / descuento 1"));
  s1 = setText(s1, "A11", discountNameForRate(budget, rate2, "Beneficio / descuento 2"));
  s1 = setNumber(s1, "B10", rate1); s1 = setFormula(s1, "C10", "+B10", rate1);
  s1 = setNumber(s1, "B11", rate2); s1 = setFormula(s1, "C11", "+B11", rate2);
  s1 = setNumber(s1, "B12", flow1.tuitionAfterBenefits > 0 ? flow1.badDebt / flow1.tuitionAfterBenefits : 0); s1 = setNumber(s1, "C12", flow2.tuitionAfterBenefits > 0 ? flow2.badDebt / flow2.tuitionAfterBenefits : 0);
  s1 = setNumber(s1, "B13", flow1.centralOverheadRate); s1 = setNumber(s1, "C13", flow2.centralOverheadRate);
  s1 = setNumber(s1, "B14", flow1.facultyOverheadRate); s1 = setNumber(s1, "C14", flow2.facultyOverheadRate);
  s1 = setNumber(s1, "B15", override1.annualDirection);
  const directionProjection = maybeProjectionFormula(override1.annualDirection, override2.annualDirection, adjustment, "B15"); s1 = directionProjection ? setFormula(s1, "C15", directionProjection, override2.annualDirection) : setNumber(s1, "C15", override2.annualDirection);
  s1 = setNumber(s1, "B16", override1.annualAssistance);
  const assistanceProjection = maybeProjectionFormula(override1.annualAssistance, override2.annualAssistance, adjustment, "B16"); s1 = assistanceProjection ? setFormula(s1, "C16", assistanceProjection, override2.annualAssistance) : setNumber(s1, "C16", override2.annualAssistance);
  s1 = setNumber(s1, "B17", override1.annualOtherNonAcademicHonoraria);
  const otherProjection = maybeProjectionFormula(override1.annualOtherNonAcademicHonoraria, override2.annualOtherNonAcademicHonoraria, adjustment, "B17"); s1 = otherProjection ? setFormula(s1, "C17", otherProjection, override2.annualOtherNonAcademicHonoraria) : setNumber(s1, "C17", override2.annualOtherNonAcademicHonoraria);
  files.set("xl/worksheets/sheet1.xml", encoder.encode(s1));

  // 2. Flujo estudiantes: incorpora matrículas equivalentes y punto de equilibrio sin el texto "flujo simulado".
  let s2 = decoder.decode(files.get("xl/worksheets/sheet2.xml")!);
  s2 = setText(s2, "B2", `año ${year1}`); s2 = setText(s2, "C2", `año ${year2}`);
  const d11 = annualDiscountStudents(budget, year1, rate1); const d12 = annualDiscountStudents(budget, year2, rate1);
  const d21 = annualDiscountStudents(budget, year1, rate2); const d22 = annualDiscountStudents(budget, year2, rate2);
  const no1 = Math.max(0, annualStudents(budget, year1) - d11 - d21); const no2 = Math.max(0, annualStudents(budget, year2) - d12 - d22);
  const continuationFormula = (baseRef: string, base: number, next: number) => { const delta = next - base; if (Math.abs(delta) < 1e-9) return `+${baseRef}`; return delta > 0 ? `${baseRef}+${delta}` : `${baseRef}-${Math.abs(delta)}`; };
  s2 = setNumber(s2, "B3", no1); s2 = setFormula(s2, "C3", continuationFormula("B3", no1, no2), no2);
  s2 = setNumber(s2, "B4", d11); s2 = setFormula(s2, "C4", continuationFormula("B4", d11, d12), d12);
  s2 = setNumber(s2, "B5", d21); s2 = setFormula(s2, "C5", continuationFormula("B5", d21, d22), d22);
  const rateLabel = (rate: number, fallback: string) => rate > 0 ? `${(rate * 100).toLocaleString("es-CL", { maximumFractionDigits: 2 })}%` : fallback;
  s2 = setText(s2, "A4", rate1 > 0 ? `Descuento ${rateLabel(rate1, "1")}` : "Descuento 1"); s2 = setText(s2, "A5", rate2 > 0 ? `Descuento ${rateLabel(rate2, "2")}` : "Descuento 2");
  s2 = setText(s2, "A11", rate1 > 0 ? `Ingresos arancel descuento ${rateLabel(rate1, "1")}` : "Ingresos arancel descuento 1"); s2 = setText(s2, "A12", rate2 > 0 ? `Ingresos arancel descuento ${rateLabel(rate2, "2")}` : "Ingresos arancel descuento 2");
  const total1 = no1 + d11 + d21; const total2 = no2 + d12 + d22;
  s2 = setFormula(s2, "B6", "SUM(B3:B5)", total1); s2 = setFormula(s2, "C6", "SUM(C3:C5)", total2);
  s2 = setFormula(s2, "B7", "B3+B4*(1-Parámetros!B10)+B5*(1-Parámetros!B11)", flow1.equivalentEnrollments); s2 = setFormula(s2, "C7", "C3+C4*(1-Parámetros!C10)+C5*(1-Parámetros!C11)", flow2.equivalentEnrollments);
  s2 = setFormula(s2, "B8", `${flow1.graduatingStudents}`, flow1.graduatingStudents); const graduationFormula2 = Math.abs(flow2.graduatingStudents - total2) < 1e-9 ? "C6" : `${flow2.graduatingStudents}`; s2 = setFormula(s2, "C8", graduationFormula2, flow2.graduatingStudents);
  const enrollmentStudents1 = annualEnrollmentStudents(budget, year1, flow1.grossEnrollmentFee, override1.annualEnrollmentFee); const enrollmentStudents2 = annualEnrollmentStudents(budget, year2, flow2.grossEnrollmentFee, override2.annualEnrollmentFee);
  s2 = setFormula(s2, "B9", Math.abs(enrollmentStudents1 - total1) < 1e-9 ? "B6*Parámetros!$B$5" : `${enrollmentStudents1}*Parámetros!$B$5`, flow1.grossEnrollmentFee); s2 = setFormula(s2, "C9", Math.abs(enrollmentStudents2 - total2) < 1e-9 ? "C6*Parámetros!$C$5" : `${enrollmentStudents2}*Parámetros!$C$5`, flow2.grossEnrollmentFee);
  s2 = setFormula(s2, "B10", `(B3)*Parámetros!$B$4`, no1 * override1.annualTuition); s2 = setFormula(s2, "C10", `(C3)*Parámetros!$C$4`, no2 * override2.annualTuition);
  s2 = setFormula(s2, "B11", `(B4)*Parámetros!$B$4*(1-Parámetros!$B$10)`, d11 * override1.annualTuition * (1 - rate1)); s2 = setFormula(s2, "C11", `(C4)*Parámetros!$C$4*(1-Parámetros!$C$10)`, d12 * override2.annualTuition * (1 - rate1));
  s2 = setFormula(s2, "B12", `(B5)*Parámetros!$B$4*(1-Parámetros!$B$11)`, d21 * override1.annualTuition * (1 - rate2)); s2 = setFormula(s2, "C12", `(C5)*Parámetros!$C$4*(1-Parámetros!$C$11)`, d22 * override2.annualTuition * (1 - rate2));
  s2 = setFormula(s2, "B13", "SUM(B10:B12)", flow1.tuitionAfterBenefits); s2 = setFormula(s2, "C13", "SUM(C10:C12)", flow2.tuitionAfterBenefits);
  const equilibrium = calculateBreakEvenEquivalentEnrollments(budget, parameters);
  if (equilibrium) { s2 = setNumber(s2, "B14", equilibrium.minimumEquivalentEnrollments ?? 0); s2 = setText(s2, "C14", "matrículas equivalentes"); s2 = setNumber(s2, "B15", equilibrium.minimumWholeStudents ?? 0); s2 = setText(s2, "C15", "estudiantes"); }
  else { s2 = setNumber(s2, "B14", 0); s2 = setText(s2, "C14", "matrículas equivalentes"); s2 = setNumber(s2, "B15", 0); s2 = setText(s2, "C15", "estudiantes"); }
  files.set("xl/worksheets/sheet2.xml", encoder.encode(s2));

  // 3. Costo Directo de Docencia: utiliza la malla real del programa cuando está disponible.
  let s3 = decoder.decode(files.get("xl/worksheets/sheet3.xml")!); s3 = setNumber(s3, "G3", year1); s3 = setNumber(s3, "H3", year2);
  const activePeriods = getActivePeriods(budget.startYear, budget.startSemester, budget.durationSemesters);
  const courses = payableCurriculumCourses(budget.program);
  if (courses.length) {
    for (let row = 4; row <= 16; row += 1) {
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
    for (let row = 4; row <= 16; row += 1) { const semester = semesters[row - 4]; if (!semester) { s3 = clearCell(s3, `A${row}`); s3 = clearCell(s3, `B${row}`); s3 = setNumber(s3, `C${row}`, 18); s3 = setNumber(s3, `D${row}`, 1); s3 = setNumber(s3, `E${row}`, 0); s3 = setNumber(s3, `F${row}`, 0); s3 = setFormula(s3, `G${row}`, `+$C$${row}*$D$${row}*E${row}`, 0); s3 = setFormula(s3, `H${row}`, `+$C$${row}*$D$${row}*F${row}`, 0); continue; } const raw = teachingHoursForSemester(budget, semester); const annualRaw = rawAnnualHours.get(semester.year) ?? 0; const effective = annualRaw > 0 ? raw * (effectiveAnnualHours.get(semester.year) ?? 0) / annualRaw : 0; const weekly = effective / 18; s3 = setNumber(s3, `A${row}`, semester.semester); s3 = setText(s3, `B${row}`, `Docencia ${semester.year}-${semester.semester}S`); s3 = setNumber(s3, `C${row}`, 18); s3 = setNumber(s3, `D${row}`, 1); s3 = setNumber(s3, `E${row}`, semester.year === year1 ? weekly : 0); s3 = setNumber(s3, `F${row}`, semester.year === year2 ? weekly : 0); s3 = setFormula(s3, `G${row}`, `+$C$${row}*$D$${row}*E${row}`, semester.year === year1 ? effective : 0); s3 = setFormula(s3, `H${row}`, `+$C$${row}*$D$${row}*F${row}`, semester.year === year2 ? effective : 0); }
  }
  s3 = setFormula(s3, "G17", "SUM(G4:G16)", teachingRate1 > 0 ? flow1.directTeachingCost / teachingRate1 : 0); s3 = setFormula(s3, "H17", "SUM(H4:H16)", teachingRate2 > 0 ? flow2.directTeachingCost / teachingRate2 : 0);
  s3 = setFormula(s3, "G18", "+G17*Parámetros!B6", flow1.directTeachingCost); s3 = setFormula(s3, "H18", "+H17*Parámetros!C6", flow2.directTeachingCost);
  const generic = genericCurriculumCourses(budget.program);
  for (let row = 22; row <= 24; row += 1) { const course = generic[row - 22]; if (!course) { s3 = clearCell(s3, `A${row}`); s3 = clearCell(s3, `B${row}`); s3 = setNumber(s3, `C${row}`, 0); s3 = setNumber(s3, `D${row}`, 0); } else { s3 = setText(s3, `A${row}`, course.code ?? ""); s3 = setText(s3, `B${row}`, course.name); s3 = setNumber(s3, `C${row}`, course.directWeeklyHours); s3 = setNumber(s3, `D${row}`, 0); } }
  s3 = setText(s3, "B28", `Base estudiantes ${year2}`); s3 = setText(s3, "C28", `Valor unitario ${year2}`); s3 = setText(s3, "D28", `Costo ${year2}`);
  s3 = setFormula(s3, "B29", "+'Flujo estudiantes'!C8", flow2.graduatingStudents); s3 = setFormula(s3, "C29", "+Parámetros!C8", override2.thesisGuidancePerGraduatingStudent); s3 = setFormula(s3, "D29", "B29*C29", flow2.thesisGuidanceCost);
  files.set("xl/worksheets/sheet3.xml", encoder.encode(s3));

  // 4. Prorrateo Staff de la versión mejorada: Factor, Valor y Monto prorrateado.
  let s5 = decoder.decode(files.get("xl/worksheets/sheet5.xml")!);
  const staffBlocks = [
    { titleRow: 2, rows: [4,5,6,7,8,9], paramRow: 15, label: "Dirección del programa", rates: [override1.directionProrated ? override1.directionAllocationRate : 1, override2.directionProrated ? override2.directionAllocationRate : 1], bases: [override1.annualDirection, override2.annualDirection] },
    { titleRow: 11, rows: [13,14,15,16,17,18], paramRow: 16, label: "Asistente de Dirección", rates: [override1.assistanceProrated ? override1.assistanceAllocationRate : 1, override2.assistanceProrated ? override2.assistanceAllocationRate : 1], bases: [override1.annualAssistance, override2.annualAssistance] },
    { titleRow: 20, rows: [22,23,24,25,26,27], paramRow: 17, label: "Otros honorarios no académicos", rates: [override1.otherNonAcademicProrated ? override1.otherNonAcademicAllocationRate : 1, override2.otherNonAcademicProrated ? override2.otherNonAcademicAllocationRate : 1], bases: [override1.annualOtherNonAcademicHonoraria, override2.annualOtherNonAcademicHonoraria] },
  ] as const;
  for (const block of staffBlocks) { s5 = setText(s5, `A${block.titleRow}`, block.label); const [current1, other1, total1Row, current2, other2, total2Row] = block.rows; const configs = [{ year: year1, current: current1, other: other1, total: total1Row, rate: Math.max(0, Math.min(1, block.rates[0])), base: block.bases[0], paramCol: "B" }, { year: year2, current: current2, other: other2, total: total2Row, rate: Math.max(0, Math.min(1, block.rates[1])), base: block.bases[1], paramCol: "C" }]; for (const config of configs) { s5 = setNumber(s5, `A${config.current}`, config.year); s5 = setText(s5, `B${config.current}`, `Cohorte ${budget.startYear}`); s5 = setText(s5, `C${config.current}`, "primer y segundo semestre "); s5 = setNumber(s5, `D${config.current}`, config.rate); s5 = setNumber(s5, `A${config.other}`, config.year); s5 = setText(s5, `B${config.other}`, "Otras cohortes / versiones"); s5 = clearCell(s5, `C${config.other}`); s5 = setNumber(s5, `D${config.other}`, Math.max(0, 1 - config.rate)); s5 = setNumber(s5, `A${config.total}`, config.year); s5 = setText(s5, `B${config.total}`, `Total ${config.year}`); s5 = setFormula(s5, `C${config.total}`, `+Parámetros!${config.paramCol}${block.paramRow}`, config.base); s5 = setFormula(s5, `D${config.total}`, `SUM(D${config.current}:D${config.other})`, 1); s5 = setFormula(s5, `E${config.current}`, `+$C$${config.total}/$D$${config.total}`, config.base); s5 = setFormula(s5, `E${config.other}`, `+$C$${config.total}/$D$${config.total}`, config.base); s5 = setFormula(s5, `F${config.current}`, `D${config.current}*E${config.current}`, config.base * config.rate); s5 = setFormula(s5, `F${config.other}`, `D${config.other}*E${config.other}`, config.base * Math.max(0, 1 - config.rate)); s5 = setFormula(s5, `F${config.total}`, `SUM(F${config.current}:F${config.other})`, config.base); } }
  files.set("xl/worksheets/sheet5.xml", encoder.encode(s5));

  // 5. Flujo Total: referencias actualizadas a la estructura mejorada.
  let s4 = decoder.decode(files.get("xl/worksheets/sheet4.xml")!); s4 = setText(s4, "A1", `${budget.program.name} (${budget.startYear}-${budget.startSemester})`); s4 = setText(s4, "A2", modality); s4 = setNumber(s4, "B3", year1); s4 = setNumber(s4, "C3", year2);
  s4 = setFormula(s4, "B4", "'Flujo estudiantes'!B9", flow1.grossEnrollmentFee); s4 = setFormula(s4, "C4", "'Flujo estudiantes'!C9", flow2.grossEnrollmentFee);
  s4 = setFormula(s4, "B5", "'Flujo estudiantes'!B13", flow1.tuitionAfterBenefits); s4 = setFormula(s4, "C5", "'Flujo estudiantes'!C13", flow2.tuitionAfterBenefits);
  s4 = setFormula(s4, "B6", "-B5*Parámetros!B12", -flow1.badDebt); s4 = setFormula(s4, "C6", "-C5*Parámetros!C12", -flow2.badDebt);
  const ext1 = flow1.externalIncome + flow1.otherIncome; const ext2 = flow2.externalIncome + flow2.otherIncome; s4 = setFormula(s4, "B7", ext1 ? `SUM(B5:B6)+${ext1}` : "SUM(B5:B6)", flow1.totalIncome); s4 = setFormula(s4, "C7", ext2 ? `SUM(C5:C6)+${ext2}` : "SUM(C5:C6)", flow2.totalIncome);
  s4 = setFormula(s4, "B8", "-'Costo Directo de Docencia'!G18", -flow1.directTeachingCost); s4 = setFormula(s4, "C8", "-'Costo Directo de Docencia'!H18", -flow2.directTeachingCost);
  const repHours1 = replacementHoursForYear(budget, year1); const repHours2 = replacementHoursForYear(budget, year2); s4 = setFormula(s4, "B9", `-${repHours1}*Parámetros!B7`, -flow1.replacementTeachingCost); s4 = setFormula(s4, "C9", `-${repHours2}*Parámetros!C7`, -flow2.replacementTeachingCost);
  s4 = setFormula(s4, "B10", "-'Flujo estudiantes'!B8*Parámetros!$B$8", -flow1.thesisGuidanceCost); s4 = setFormula(s4, "C10", "-'Flujo estudiantes'!C8*Parámetros!$C$8", -flow2.thesisGuidanceCost); s4 = setFormula(s4, "B11", "SUM(B8:B10)", -flow1.academicHonoraria); s4 = setFormula(s4, "C11", "SUM(C8:C10)", -flow2.academicHonoraria);
  s4 = setFormula(s4, "B12", "-'Prorrateo Staff'!F4", -flow1.direction); s4 = setFormula(s4, "C12", "-'Prorrateo Staff'!F7", -flow2.direction); s4 = setFormula(s4, "B13", "-'Prorrateo Staff'!F13", -flow1.assistance); s4 = setFormula(s4, "C13", "-'Prorrateo Staff'!F16", -flow2.assistance); s4 = setNumber(s4, "B14", 0); s4 = setNumber(s4, "C14", 0); s4 = setFormula(s4, "B15", "-'Prorrateo Staff'!F22", -flow1.otherNonAcademicHonoraria); s4 = setFormula(s4, "C15", "-'Prorrateo Staff'!F25", -flow2.otherNonAcademicHonoraria); s4 = setFormula(s4, "B16", "SUM(B12:B15)", -flow1.nonAcademicHonoraria); s4 = setFormula(s4, "C16", "SUM(C12:C15)", -flow2.nonAcademicHonoraria);
  s4 = setNumber(s4, "B17", -flow1.equipment); s4 = setNumber(s4, "C17", -flow2.equipment); s4 = setNumber(s4, "B18", -flow1.booksPublications); s4 = setNumber(s4, "C18", -flow2.booksPublications); s4 = setNumber(s4, "B20", -flow1.diffusion); s4 = setNumber(s4, "C20", -flow2.diffusion); s4 = setNumber(s4, "B22", -flow1.travelFreight); s4 = setNumber(s4, "C22", -flow2.travelFreight); s4 = setNumber(s4, "B23", 0); s4 = setNumber(s4, "C23", 0); s4 = setNumber(s4, "B25", -flow1.perDiem); s4 = setNumber(s4, "C25", -flow2.perDiem); s4 = setNumber(s4, "B27", -flow1.software); s4 = setNumber(s4, "C27", -flow2.software); s4 = setNumber(s4, "B29", -(flow1.operational + flow1.otherCosts)); s4 = setNumber(s4, "C29", -(flow2.operational + flow2.otherCosts)); s4 = setNumber(s4, "B30", -flow1.foodBeverages); s4 = setNumber(s4, "C30", -flow2.foodBeverages); s4 = setNumber(s4, "B32", -(flow1.congressesInternships + flow1.scholarshipsAndAid)); s4 = setNumber(s4, "C32", -(flow2.congressesInternships + flow2.scholarshipsAndAid));
  s4 = setFormula(s4, "B19", "SUM(B17:B18)", -(flow1.equipment + flow1.booksPublications)); s4 = setFormula(s4, "C19", "SUM(C17:C18)", -(flow2.equipment + flow2.booksPublications)); s4 = setFormula(s4, "B21", "SUM(B20)", -flow1.diffusion); s4 = setFormula(s4, "C21", "SUM(C20)", -flow2.diffusion); s4 = setFormula(s4, "B24", "SUM(B22:B23)", -flow1.travelFreight); s4 = setFormula(s4, "C24", "SUM(C22:C23)", -flow2.travelFreight); s4 = setFormula(s4, "B26", "SUM(B25)", -flow1.perDiem); s4 = setFormula(s4, "C26", "SUM(C25)", -flow2.perDiem); s4 = setFormula(s4, "B28", "SUM(B27)", -flow1.software); s4 = setFormula(s4, "C28", "SUM(C27)", -flow2.software); s4 = setFormula(s4, "B31", "SUM(B29:B30)", -(flow1.operational + flow1.otherCosts + flow1.foodBeverages)); s4 = setFormula(s4, "C31", "SUM(C29:C30)", -(flow2.operational + flow2.otherCosts + flow2.foodBeverages)); s4 = setFormula(s4, "B33", "SUM(B32)", -(flow1.congressesInternships + flow1.scholarshipsAndAid)); s4 = setFormula(s4, "C33", "SUM(C32)", -(flow2.congressesInternships + flow2.scholarshipsAndAid));
  s4 = setFormula(s4, "B34", "-(B5+B6)*Parámetros!B13", -flow1.centralOverhead); s4 = setFormula(s4, "C34", "-(C5+C6)*Parámetros!C13", -flow2.centralOverhead); s4 = setFormula(s4, "B35", "-(B5+B6)*Parámetros!B14", -flow1.facultyOverhead); s4 = setFormula(s4, "C35", "-(C5+C6)*Parámetros!C14", -flow2.facultyOverhead); s4 = setFormula(s4, "B36", "SUM(B34:B35)", -(flow1.centralOverhead + flow1.facultyOverhead)); s4 = setFormula(s4, "C36", "SUM(C34:C35)", -(flow2.centralOverhead + flow2.facultyOverhead)); s4 = setFormula(s4, "B37", "SUM(B11,B16,B19,B21,B24,B26,B28,B31,B33,B36)", -flow1.totalExpenses); s4 = setFormula(s4, "C37", "SUM(C11,C16,C19,C21,C24,C26,C28,C31,C33,C36)", -flow2.totalExpenses); s4 = setFormula(s4, "B38", "+B7+B37", flow1.netFlow); s4 = setFormula(s4, "C38", "+C7+C37", flow2.netFlow); s4 = setNumber(s4, "B39", flow1.startingCarryover); s4 = setFormula(s4, "C39", "+B40", flow2.startingCarryover); s4 = setFormula(s4, "B40", "+SUM(B38:B39)", flow1.accumulatedFlow); s4 = setFormula(s4, "C40", "+SUM(C38:C39)", flow2.accumulatedFlow); s4 = setFormula(s4, "B41", "IFERROR((B7+B37)/B7,0)", flow1.operatingMargin ?? 0); s4 = setFormula(s4, "C41", "IFERROR((C7+C37)/C7,0)", flow2.operatingMargin ?? 0);
  files.set("xl/worksheets/sheet4.xml", encoder.encode(s4));

  files.delete("xl/calcChain.xml"); const workbookXml = decoder.decode(files.get("xl/workbook.xml")!); files.set("xl/workbook.xml", encoder.encode(workbookXml.replace(/<calcPr[^>]*\/>/, '<calcPr calcMode="auto" fullCalcOnLoad="1" forceFullCalc="1"/>'))); const relsName = "xl/_rels/workbook.xml.rels"; files.set(relsName, encoder.encode(decoder.decode(files.get(relsName)!).replace(/<Relationship[^>]*calcChain[^>]*\/>/g, ""))); files.set("[Content_Types].xml", encoder.encode(decoder.decode(files.get("[Content_Types].xml")!).replace(/<Override[^>]*calcChain[^>]*\/>/g, "")));
  return zip(files);
}
