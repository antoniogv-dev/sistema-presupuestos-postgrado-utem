import type { BudgetResult, CohortBudget, InstitutionalParameters, SemesterParameters } from "../calculations/types";
import { resolvedAnnualOverrideForYear } from "../calculations/budget-engine";
import { calculateBreakEvenEquivalentEnrollments } from "../calculations/break-even";
import { genericCurriculumCourses, payableCurriculumCourses } from "../curriculum/budget-load";
import { getActivePeriods } from "../calculations/periods";
import { breakEvenExcelFormula } from "./institutional-budget-xlsx";

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
function columnNumber(column: string): number {
  return column.split("").reduce((value, char) => value * 26 + char.charCodeAt(0) - 64, 0);
}
function yearColumn(index: number): string { return columnName(index + 2); }
function teachingYearColumn(index: number): string { return columnName(index + 7); }

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
function clearCell(sheetXml: string, ref: string): string { return replaceCell(sheetXml, ref, ""); }

function extendDimensionToColumn(sheetXml: string, targetColumn: string): string {
  return sheetXml.replace(/<dimension ref="([A-Z]+)(\d+):([A-Z]+)(\d+)"\/>/, (_full, startCol: string, startRow: string, endCol: string, endRow: string) => {
    const finalCol = Math.max(columnNumber(endCol), columnNumber(targetColumn));
    return `<dimension ref="${startCol}${startRow}:${columnName(finalCol)}${endRow}"/>`;
  });
}
function cloneColumnDefinition(sheetXml: string, sourceColumn: string, targetColumn: string): string {
  if (!sheetXml.includes("<cols>")) return sheetXml;
  const source = columnNumber(sourceColumn);
  const target = columnNumber(targetColumn);
  let sourceDefinition = "";
  let targetCovered = false;
  for (const match of sheetXml.matchAll(/<col\b([^>]*)\/>/g)) {
    const attrs = match[1] ?? "";
    const min = Number(attrs.match(/\bmin="(\d+)"/)?.[1] ?? 0);
    const max = Number(attrs.match(/\bmax="(\d+)"/)?.[1] ?? min);
    if (target >= min && target <= max) targetCovered = true;
    if (!sourceDefinition && source >= min && source <= max) sourceDefinition = match[0];
  }
  if (targetCovered || !sourceDefinition) return sheetXml;
  const clone = sourceDefinition.replace(/\bmin="\d+"/, `min="${target}"`).replace(/\bmax="\d+"/, `max="${target}"`);
  return sheetXml.replace("</cols>", `${clone}</cols>`);
}
function extendMergeRows(sheetXml: string, sourceColumn: string, targetColumn: string, rows: number[]): string {
  let output = sheetXml;
  for (const row of rows) {
    output = output.replace(new RegExp(`<mergeCell ref="([A-Z]+)${row}:${sourceColumn}${row}"\\/>`, "g"), `<mergeCell ref="$1${row}:${targetColumn}${row}"/>`);
  }
  return output;
}
function extendWorksheetColumn(sheetXml: string, sourceColumn: string, targetColumn: string, mergeRows: number[] = []): string {
  const rowRegex = /<row\b[^>]*\br="(\d+)"[^>]*>[\s\S]*?<\/row>/g;
  let output = sheetXml.replace(rowRegex, (rowXml: string, rowText: string) => {
    const row = Number(rowText);
    const sourceRef = `${sourceColumn}${row}`;
    const targetRef = `${targetColumn}${row}`;
    if (cellPattern(targetRef).test(rowXml) || !cellPattern(sourceRef).test(rowXml)) return rowXml;
    const style = styleFromCell(rowXml, sourceRef);
    return rowXml.replace("</row>", `<c r="${targetRef}"${style}></c></row>`);
  });
  output = cloneColumnDefinition(output, sourceColumn, targetColumn);
  output = extendDimensionToColumn(output, targetColumn);
  output = extendMergeRows(output, sourceColumn, targetColumn, mergeRows);
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
  return periodsForYear(budget, year).reduce((total, semester) => total + (discountApplies(discount, semester) ? Math.max(0, discount.students) * 0.5 : 0), 0);
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
  return Math.max(0, semester.directTeachingHours) + Math.max(0, semester.synchronousTeachingHours) + Math.max(0, semester.asynchronousTeachingHours);
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

function rowLayout(budget: CohortBudget) {
  const discounts = exportableDiscounts(budget);
  const discountSlots = Math.max(2, discounts.length);
  return {
    discounts,
    discountSlots,
    parameterDiscountStartRow: 10,
    badDebtParameterRow: 10 + discountSlots,
    centralOverheadParameterRow: 11 + discountSlots,
    facultyOverheadParameterRow: 12 + discountSlots,
    directionParameterRow: 13 + discountSlots,
    assistanceParameterRow: 14 + discountSlots,
    otherHonorariaParameterRow: 15 + discountSlots,
    studentDiscountStartRow: 4,
    totalStudentsRow: 4 + discountSlots,
    equivalentStudentsRow: 5 + discountSlots,
    graduationStudentsRow: 6 + discountSlots,
    enrollmentIncomeRow: 7 + discountSlots,
    noDiscountIncomeRow: 8 + discountSlots,
    discountIncomeStartRow: 9 + discountSlots,
    totalTuitionIncomeRow: 9 + (2 * discountSlots),
    equilibriumRow: 10 + (2 * discountSlots),
    equilibriumWholeStudentsRow: 11 + (2 * discountSlots),
  };
}

function extendParametersSheet(sheetXml: string, budget: CohortBudget, result: BudgetResult, parameters: InstitutionalParameters): string {
  const rows = rowLayout(budget);
  const adjustment = Math.max(0, parameters.annualAdjustmentRate || 0);
  let output = sheetXml;
  for (let index = 2; index < result.years.length; index += 1) {
    const year = result.years[index];
    const previousYear = result.years[index - 1];
    const col = yearColumn(index);
    const previousCol = yearColumn(index - 1);
    output = extendWorksheetColumn(output, previousCol, col, [1, 2]);
    const flow = yearFlow(result, year);
    const override = resolvedAnnualOverrideForYear(budget, parameters, year);
    const previousOverride = resolvedAnnualOverrideForYear(budget, parameters, previousYear);
    output = setNumber(output, `${col}3`, year);
    output = setNumber(output, `${col}4`, override.annualTuition);
    output = setNumber(output, `${col}5`, override.annualEnrollmentFee);
    output = setNumber(output, `${col}6`, effectiveTeachingRate(budget, parameters, year));
    output = setNumber(output, `${col}7`, parameters.replacementHour);
    output = setNumber(output, `${col}8`, override.thesisGuidancePerGraduatingStudent);
    output = clearCell(output, `${col}9`);
    for (let discountIndex = 0; discountIndex < rows.discountSlots; discountIndex += 1) {
      const row = rows.parameterDiscountStartRow + discountIndex;
      const rate = rows.discounts[discountIndex] ? Math.max(0, Math.min(1, rows.discounts[discountIndex].percentage)) : 0;
      output = setFormula(output, `${col}${row}`, `+${previousCol}${row}`, rate);
    }
    output = setNumber(output, `${col}${rows.badDebtParameterRow}`, flow.tuitionAfterBenefits > 0 ? flow.badDebt / flow.tuitionAfterBenefits : 0);
    output = setNumber(output, `${col}${rows.centralOverheadParameterRow}`, flow.centralOverheadRate);
    output = setNumber(output, `${col}${rows.facultyOverheadParameterRow}`, flow.facultyOverheadRate);
    const directionProjection = maybeProjectionFormula(previousOverride.annualDirection, override.annualDirection, adjustment, `${previousCol}${rows.directionParameterRow}`);
    output = directionProjection ? setFormula(output, `${col}${rows.directionParameterRow}`, directionProjection, override.annualDirection) : setNumber(output, `${col}${rows.directionParameterRow}`, override.annualDirection);
    const assistanceProjection = maybeProjectionFormula(previousOverride.annualAssistance, override.annualAssistance, adjustment, `${previousCol}${rows.assistanceParameterRow}`);
    output = assistanceProjection ? setFormula(output, `${col}${rows.assistanceParameterRow}`, assistanceProjection, override.annualAssistance) : setNumber(output, `${col}${rows.assistanceParameterRow}`, override.annualAssistance);
    const otherProjection = maybeProjectionFormula(previousOverride.annualOtherNonAcademicHonoraria, override.annualOtherNonAcademicHonoraria, adjustment, `${previousCol}${rows.otherHonorariaParameterRow}`);
    output = otherProjection ? setFormula(output, `${col}${rows.otherHonorariaParameterRow}`, otherProjection, override.annualOtherNonAcademicHonoraria) : setNumber(output, `${col}${rows.otherHonorariaParameterRow}`, override.annualOtherNonAcademicHonoraria);
  }
  return output;
}

function extendStudentFlowSheet(sheetXml: string, budget: CohortBudget, result: BudgetResult, parameters: InstitutionalParameters): string {
  const rows = rowLayout(budget);
  let output = sheetXml;
  const continuationFormula = (baseRef: string, base: number, next: number) => {
    const delta = next - base;
    if (Math.abs(delta) < 1e-9) return `+${baseRef}`;
    return delta > 0 ? `${baseRef}+${delta}` : `${baseRef}-${Math.abs(delta)}`;
  };
  for (let index = 2; index < result.years.length; index += 1) {
    const year = result.years[index];
    const previousYear = result.years[index - 1];
    const col = yearColumn(index);
    const previousCol = yearColumn(index - 1);
    output = extendWorksheetColumn(output, previousCol, col, [1]);
    const flow = yearFlow(result, year);
    const override = resolvedAnnualOverrideForYear(budget, parameters, year);
    const discountStudents = rows.discounts.map((discount) => weightedDiscountStudentsForItem(budget, year, discount));
    const previousDiscountStudents = rows.discounts.map((discount) => weightedDiscountStudentsForItem(budget, previousYear, discount));
    const discounted = discountStudents.reduce((total, value) => total + value, 0);
    const previousDiscounted = previousDiscountStudents.reduce((total, value) => total + value, 0);
    const noDiscount = Math.max(0, weightedStudents(budget, year) - discounted);
    const previousNoDiscount = Math.max(0, weightedStudents(budget, previousYear) - previousDiscounted);
    output = setText(output, `${col}2`, `año ${year}`);
    output = setFormula(output, `${col}3`, continuationFormula(`${previousCol}3`, previousNoDiscount, noDiscount), noDiscount);
    for (let discountIndex = 0; discountIndex < rows.discountSlots; discountIndex += 1) {
      const studentRow = rows.studentDiscountStartRow + discountIndex;
      const parameterRow = rows.parameterDiscountStartRow + discountIndex;
      const students = discountStudents[discountIndex] ?? 0;
      const previousStudents = previousDiscountStudents[discountIndex] ?? 0;
      const rate = rows.discounts[discountIndex] ? Math.max(0, Math.min(1, rows.discounts[discountIndex].percentage)) : 0;
      output = setFormula(output, `${col}${studentRow}`, continuationFormula(`${previousCol}${studentRow}`, previousStudents, students), students);
      const incomeRow = rows.discountIncomeStartRow + discountIndex;
      output = setFormula(output, `${col}${incomeRow}`, `(${col}${studentRow})*Parámetros!$${col}$4*(1-Parámetros!$${col}$${parameterRow})`, students * override.annualTuition * (1 - rate));
    }
    output = setFormula(output, `${col}${rows.totalStudentsRow}`, `SUM(${col}3:${col}${rows.studentDiscountStartRow + rows.discountSlots - 1})`, noDiscount + discounted);
    const equivalentFormula = [`${col}3`, ...Array.from({ length: rows.discountSlots }, (_, discountIndex) => `${col}${rows.studentDiscountStartRow + discountIndex}*(1-Parámetros!${col}${rows.parameterDiscountStartRow + discountIndex})`)].join("+");
    output = setFormula(output, `${col}${rows.equivalentStudentsRow}`, equivalentFormula, flow.equivalentEnrollments);
    const graduationFormula = Math.abs(flow.graduatingStudents - (noDiscount + discounted)) < 1e-9 ? `${col}${rows.totalStudentsRow}` : `${flow.graduatingStudents}`;
    output = setFormula(output, `${col}${rows.graduationStudentsRow}`, graduationFormula, flow.graduatingStudents);
    const enrollmentStudents = annualEnrollmentStudents(budget, year, flow.grossEnrollmentFee, override.annualEnrollmentFee);
    output = setFormula(output, `${col}${rows.enrollmentIncomeRow}`, Math.abs(enrollmentStudents - (noDiscount + discounted)) < 1e-9 ? `${col}${rows.totalStudentsRow}*Parámetros!$${col}$5` : `${enrollmentStudents}*Parámetros!$${col}$5`, flow.grossEnrollmentFee);
    output = setFormula(output, `${col}${rows.noDiscountIncomeRow}`, `(${col}3)*Parámetros!$${col}$4`, noDiscount * override.annualTuition);
    output = setFormula(output, `${col}${rows.totalTuitionIncomeRow}`, `SUM(${col}${rows.noDiscountIncomeRow}:${col}${rows.discountIncomeStartRow + rows.discountSlots - 1})`, flow.tuitionAfterBenefits);
    output = clearCell(output, `${col}${rows.equilibriumRow}`);
    output = clearCell(output, `${col}${rows.equilibriumWholeStudentsRow}`);
  }
  const equilibrium = calculateBreakEvenEquivalentEnrollments(budget, parameters);
  output = setFormula(output, `B${rows.equilibriumRow}`, breakEvenExcelFormula(
    result.years.map((_year, index) => yearColumn(index)),
    rows.badDebtParameterRow,
    rows.centralOverheadParameterRow,
    rows.facultyOverheadParameterRow,
  ), equilibrium.minimumEquivalentEnrollments ?? 0);
  output = setFormula(output, `B${rows.equilibriumWholeStudentsRow}`, `ROUNDUP(B${rows.equilibriumRow},0)`, equilibrium.minimumWholeStudents ?? 0);
  return output;
}

function extendDirectTeachingSheet(sheetXml: string, budget: CohortBudget, result: BudgetResult, parameters: InstitutionalParameters): string {
  let output = sheetXml;
  const activePeriods = getActivePeriods(budget.startYear, budget.startSemester, budget.durationSemesters);
  const courses = payableCurriculumCourses(budget.program);
  const generic = genericCurriculumCourses(budget.program);
  const extraCourseRows = Math.max(0, courses.length - 13);
  const extraGenericRows = Math.max(0, generic.length - 3);
  const courseEndRow = 16 + extraCourseRows;
  const totalHoursRow = 17 + extraCourseRows;
  const directCostRow = 18 + extraCourseRows;
  const thesisHeaderRow = 28 + extraCourseRows + extraGenericRows;
  const thesisRow = 29 + extraCourseRows + extraGenericRows;
  const semesters = [...budget.semesters].sort((a, b) => periodOrdinal(a.year, a.semester) - periodOrdinal(b.year, b.semester));

  for (let index = 2; index < result.years.length; index += 1) {
    const year = result.years[index];
    const col = teachingYearColumn(index);
    const previousCol = teachingYearColumn(index - 1);
    const parameterCol = yearColumn(index);
    const flow = yearFlow(result, year);
    output = extendWorksheetColumn(output, previousCol, col);
    output = setNumber(output, `${col}3`, year);
    if (courses.length) {
      for (let row = 4; row <= courseEndRow; row += 1) {
        const course = courses[row - 4];
        if (!course) { output = setNumber(output, `${col}${row}`, 0); continue; }
        const period = activePeriods[course.semester - 1];
        const participants = 1 + course.sharedWithProgramIds.filter((id) => id !== budget.program.id).length;
        const allocation = participants > 1 ? Math.max(0, Math.min(1, course.allocationRate || 1 / participants)) : 1;
        const modeFactor = course.teachingMode === "ASINCRONICA" ? Math.max(0, Math.min(1, course.asynchronousRateFactor)) : 1;
        const weeklyPaid = Math.max(0, course.directWeeklyHours) * modeFactor * allocation;
        output = setNumber(output, `${col}${row}`, period?.year === year ? course.weeks * course.sections * weeklyPaid : 0);
      }
    } else {
      const teachingRate = effectiveTeachingRate(budget, parameters, year);
      const effectiveAnnualHours = teachingRate > 0 ? flow.directTeachingCost / teachingRate : 0;
      const annualRawHours = periodsForYear(budget, year).reduce((total, semester) => total + teachingHoursForSemester(budget, semester), 0);
      for (let row = 4; row <= courseEndRow; row += 1) {
        const semester = semesters[row - 4];
        if (!semester || semester.year !== year) { output = setNumber(output, `${col}${row}`, 0); continue; }
        const raw = teachingHoursForSemester(budget, semester);
        output = setNumber(output, `${col}${row}`, annualRawHours > 0 ? raw * effectiveAnnualHours / annualRawHours : 0);
      }
    }
    const teachingRate = effectiveTeachingRate(budget, parameters, year);
    output = setFormula(output, `${col}${totalHoursRow}`, `SUM(${col}4:${col}${courseEndRow})`, teachingRate > 0 ? flow.directTeachingCost / teachingRate : 0);
    output = setFormula(output, `${col}${directCostRow}`, `+${col}${totalHoursRow}*Parámetros!${parameterCol}6`, flow.directTeachingCost);
  }

  const lastIndex = result.years.length - 1;
  const lastYear = result.years[lastIndex];
  const lastFlow = yearFlow(result, lastYear);
  const lastOverride = resolvedAnnualOverrideForYear(budget, parameters, lastYear);
  const lastStudentColumn = yearColumn(lastIndex);
  output = setText(output, `B${thesisHeaderRow}`, `Base estudiantes ${lastYear}`);
  output = setText(output, `C${thesisHeaderRow}`, `Valor unitario ${lastYear}`);
  output = setText(output, `D${thesisHeaderRow}`, `Costo ${lastYear}`);
  output = setFormula(output, `B${thesisRow}`, `+'Flujo estudiantes'!${lastStudentColumn}${rowLayout(budget).graduationStudentsRow}`, lastFlow.graduatingStudents);
  output = setFormula(output, `C${thesisRow}`, `+Parámetros!${lastStudentColumn}8`, lastOverride.thesisGuidancePerGraduatingStudent);
  output = setFormula(output, `D${thesisRow}`, `B${thesisRow}*C${thesisRow}`, lastFlow.thesisGuidanceCost);
  return output;
}

function extendTotalFlowSheet(sheetXml: string, budget: CohortBudget, result: BudgetResult): string {
  const rows = rowLayout(budget);
  let output = sheetXml;
  for (let index = 2; index < result.years.length; index += 1) {
    const year = result.years[index];
    const col = yearColumn(index);
    const previousCol = yearColumn(index - 1);
    const parameterCol = col;
    const teachingCol = teachingYearColumn(index);
    const flow = yearFlow(result, year);
    const ext = flow.recognizedEnrollmentFee + flow.externalIncome + flow.institutionalFinancing + flow.otherIncome;
    const repHours = replacementHoursForYear(budget, year);
    output = extendWorksheetColumn(output, previousCol, col, [1, 2]);
    output = setNumber(output, `${col}3`, year);
    output = setFormula(output, `${col}4`, `'Flujo estudiantes'!${col}${rows.enrollmentIncomeRow}`, flow.grossEnrollmentFee);
    output = setFormula(output, `${col}5`, `'Flujo estudiantes'!${col}${rows.totalTuitionIncomeRow}`, flow.tuitionAfterBenefits);
    output = setFormula(output, `${col}6`, `-${col}5*Parámetros!${parameterCol}${rows.badDebtParameterRow}`, -flow.badDebt);
    output = setFormula(output, `${col}7`, ext ? `SUM(${col}5:${col}6)+${ext}` : `SUM(${col}5:${col}6)`, flow.totalIncome);
    output = setFormula(output, `${col}8`, `-'Costo Directo de Docencia'!${teachingCol}${18 + Math.max(0, payableCurriculumCourses(budget.program).length - 13)}`, -flow.directTeachingCost);
    output = setFormula(output, `${col}9`, `-${repHours}*Parámetros!${parameterCol}7`, -flow.replacementTeachingCost);
    output = setFormula(output, `${col}10`, `-'Flujo estudiantes'!${col}${rows.graduationStudentsRow}*Parámetros!$${parameterCol}$8`, -flow.thesisGuidanceCost);
    output = setFormula(output, `${col}11`, `SUM(${col}8:${col}10)`, -flow.academicHonoraria);
    // El formato de Prorrateo Staff validado se conserva intacto; para años adicionales
    // el flujo usa los importes calculados por el motor, sin crear una estructura nueva.
    output = setNumber(output, `${col}12`, -flow.direction);
    output = setNumber(output, `${col}13`, -flow.assistance);
    output = setNumber(output, `${col}14`, 0);
    output = setNumber(output, `${col}15`, -flow.otherNonAcademicHonoraria);
    output = setFormula(output, `${col}16`, `SUM(${col}12:${col}15)`, -flow.nonAcademicHonoraria);
    output = setNumber(output, `${col}17`, -flow.equipment);
    output = setNumber(output, `${col}18`, -flow.booksPublications);
    output = setFormula(output, `${col}19`, `SUM(${col}17:${col}18)`, -(flow.equipment + flow.booksPublications));
    output = setNumber(output, `${col}20`, -flow.diffusion);
    output = setFormula(output, `${col}21`, `SUM(${col}20)`, -flow.diffusion);
    output = setNumber(output, `${col}22`, -flow.travelFreight);
    output = setNumber(output, `${col}23`, 0);
    output = setFormula(output, `${col}24`, `SUM(${col}22:${col}23)`, -flow.travelFreight);
    output = setNumber(output, `${col}25`, -flow.perDiem);
    output = setFormula(output, `${col}26`, `SUM(${col}25)`, -flow.perDiem);
    output = setNumber(output, `${col}27`, -flow.software);
    output = setFormula(output, `${col}28`, `SUM(${col}27)`, -flow.software);
    output = setNumber(output, `${col}29`, -(flow.operational + flow.otherCosts));
    output = setNumber(output, `${col}30`, -flow.foodBeverages);
    output = setFormula(output, `${col}31`, `SUM(${col}29:${col}30)`, -(flow.operational + flow.otherCosts + flow.foodBeverages));
    output = setNumber(output, `${col}32`, -(flow.congressesInternships + flow.scholarshipsAndAid));
    output = setFormula(output, `${col}33`, `SUM(${col}32)`, -(flow.congressesInternships + flow.scholarshipsAndAid));
    output = setFormula(output, `${col}34`, `-(${col}5+${col}6)*Parámetros!${parameterCol}${rows.centralOverheadParameterRow}`, -flow.centralOverhead);
    output = setFormula(output, `${col}35`, `-(${col}5+${col}6)*Parámetros!${parameterCol}${rows.facultyOverheadParameterRow}`, -flow.facultyOverhead);
    output = setFormula(output, `${col}36`, `SUM(${col}34:${col}35)`, -(flow.centralOverhead + flow.facultyOverhead));
    output = setFormula(output, `${col}37`, `SUM(${col}11,${col}16,${col}19,${col}21,${col}24,${col}26,${col}28,${col}31,${col}33,${col}36)`, -flow.totalExpenses);
    output = setFormula(output, `${col}38`, `+${col}7+${col}37`, flow.netFlow);
    output = setFormula(output, `${col}39`, `+${previousCol}40`, flow.startingCarryover);
    output = setFormula(output, `${col}40`, `+SUM(${col}38:${col}39)`, flow.accumulatedFlow);
    output = setFormula(output, `${col}41`, `IFERROR((${col}7+${col}37)/${col}7,0)`, flow.operatingMargin ?? 0);
  }
  return output;
}

function extendWorkbookPrintAreas(workbookXml: string, result: BudgetResult): string {
  if (result.years.length <= 2) return workbookXml;
  const lastYearCol = yearColumn(result.years.length - 1);
  const lastTeachingCol = teachingYearColumn(result.years.length - 1);
  let output = workbookXml;
  for (const sheetName of ["Parámetros", "Flujo estudiantes", "FLUJO TOTAL"]) {
    const escaped = sheetName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const pattern = new RegExp(`(('${escaped}'|${escaped})!\\$A\\$)(\\d+)(:\\$)[A-Z]+(\\$\\d+)`, "g");
    output = output.replace(pattern, (_full, prefix: string, _sheet: string, startRow: string, colon: string, endRow: string) => `${prefix}${startRow}${colon}${lastYearCol}${endRow}`);
  }
  output = output.replace(/(('Costo Directo de Docencia'|Costo Directo de Docencia)!\$A\$)(\d+)(:\$)[A-Z]+(\$\d+)/g, (_full, prefix: string, _sheet: string, startRow: string, colon: string, endRow: string) => `${prefix}${startRow}${colon}${lastTeachingCol}${endRow}`);
  return output;
}

/**
 * Parte del XLSX institucional ya validado para dos años y agrega únicamente
 * las columnas de años presupuestarios posteriores en las mismas hojas y flujos.
 * No genera un formato alternativo.
 */
export async function extendInstitutionalBudgetXlsx(
  baseWorkbookBytes: Uint8Array,
  budget: CohortBudget,
  result: BudgetResult,
  parameters: InstitutionalParameters,
): Promise<Uint8Array> {
  if (result.years.length <= 2) return baseWorkbookBytes;
  const files = await unzipPackage(baseWorkbookBytes);
  const required = ["xl/worksheets/sheet1.xml", "xl/worksheets/sheet2.xml", "xl/worksheets/sheet3.xml", "xl/worksheets/sheet4.xml", "xl/workbook.xml"];
  for (const name of required) if (!files.has(name)) throw new Error(`XLSX institucional incompleto: falta ${name}.`);

  let parametersSheet = decoder.decode(files.get("xl/worksheets/sheet1.xml")!);
  let studentsSheet = decoder.decode(files.get("xl/worksheets/sheet2.xml")!);
  let teachingSheet = decoder.decode(files.get("xl/worksheets/sheet3.xml")!);
  let totalFlowSheet = decoder.decode(files.get("xl/worksheets/sheet4.xml")!);

  parametersSheet = extendParametersSheet(parametersSheet, budget, result, parameters);
  studentsSheet = extendStudentFlowSheet(studentsSheet, budget, result, parameters);
  teachingSheet = extendDirectTeachingSheet(teachingSheet, budget, result, parameters);
  totalFlowSheet = extendTotalFlowSheet(totalFlowSheet, budget, result);

  files.set("xl/worksheets/sheet1.xml", encoder.encode(parametersSheet));
  files.set("xl/worksheets/sheet2.xml", encoder.encode(studentsSheet));
  files.set("xl/worksheets/sheet3.xml", encoder.encode(teachingSheet));
  files.set("xl/worksheets/sheet4.xml", encoder.encode(totalFlowSheet));
  files.set("xl/workbook.xml", encoder.encode(extendWorkbookPrintAreas(decoder.decode(files.get("xl/workbook.xml")!), result)));
  return zip(files);
}
