import type { BudgetResult, CohortBudget } from "../calculations/types";
import { manualItemAmountForYear } from "../finance/cost-engine";
import { payableCurriculumCourses } from "../curriculum/budget-load";

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
function teachingColumn(index: number): string { return columnName(index + 7); }
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
  if (!pattern.test(sheetXml)) throw new Error(`XLSX institucional incompleto: falta la celda ${ref} para la conciliación contable.`);
  const style = styleFromCell(sheetXml, ref);
  return sheetXml.replace(pattern, () => `<c r="${ref}"${style}${typeAttribute}>${body}</c>`);
}
function setNumber(sheetXml: string, ref: string, value: number): string {
  return replaceCell(sheetXml, ref, `<v>${Number.isFinite(value) ? value : 0}</v>`);
}
function setFormula(sheetXml: string, ref: string, formula: string, cached: number): string {
  return replaceCell(sheetXml, ref, `<f>${xml(formula)}</f><v>${Number.isFinite(cached) ? cached : 0}</v>`);
}
function setText(sheetXml: string, ref: string, value: string): string {
  return replaceCell(sheetXml, ref, `<is><t>${xml(value)}</t></is>`, ` t="inlineStr"`);
}
function clampRate(value: number): number { return Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0)); }

function exportableDiscountCount(budget: CohortBudget): number {
  return budget.discounts.filter((discount) => discount.target !== "ENROLLMENT" && clampRate(discount.percentage) > 0).length;
}
function studentRows(budget: CohortBudget) {
  const discountSlots = Math.max(2, exportableDiscountCount(budget));
  return {
    graduationStudentsRow: 6 + discountSlots,
    enrollmentIncomeRow: 7 + discountSlots,
    totalTuitionIncomeRow: 9 + (2 * discountSlots),
  };
}
function manualAmount(budget: CohortBudget, year: number, categories: CohortBudget["manualItems"][number]["category"][]): number {
  return budget.manualItems
    .filter((item) => categories.includes(item.category))
    .reduce((total, item) => total + manualItemAmountForYear(item, budget, year), 0);
}
function replacementHours(budget: CohortBudget, year: number): number {
  return budget.semesters.filter((semester) => semester.year === year)
    .reduce((total, semester) => total + Math.max(0, semester.replacementTeachingHours), 0);
}

export interface InstitutionalAccountingProjection {
  manualAcademicHonoraria: number;
  manualOtherNonAcademicHonoraria: number;
  baseOtherNonAcademicHonoraria: number;
  academicSubtotal: number;
  nonAcademicSubtotal: number;
  equipmentBooksSubtotal: number;
  diffusionSubtotal: number;
  travelSubtotal: number;
  perDiemSubtotal: number;
  softwareSubtotal: number;
  otherServicesSubtotal: number;
  aidInternshipsSubtotal: number;
  overheadSubtotal: number;
  totalExpenses: number;
}

export function institutionalAccountingProjection(
  budget: CohortBudget,
  flow: BudgetResult["annualFlows"][number],
): InstitutionalAccountingProjection {
  const year = flow.year;
  const manualAcademicHonoraria = manualAmount(budget, year, ["Honorarios académicos"]);
  const manualOtherNonAcademicHonoraria = manualAmount(budget, year, ["Honorarios no académicos", "Otros honorarios no académicos"]);
  const baseOtherNonAcademicHonoraria = Math.max(0, flow.otherNonAcademicHonoraria - manualOtherNonAcademicHonoraria);
  const academicSubtotal = flow.directTeachingCost + manualAcademicHonoraria + flow.replacementTeachingCost + flow.thesisGuidanceCost;
  const nonAcademicSubtotal = flow.direction + flow.assistance + manualOtherNonAcademicHonoraria + baseOtherNonAcademicHonoraria;
  const equipmentBooksSubtotal = flow.equipment + flow.booksPublications;
  const diffusionSubtotal = flow.diffusion;
  const travelSubtotal = flow.travelFreight;
  const perDiemSubtotal = flow.perDiem;
  const softwareSubtotal = flow.software;
  const otherServicesSubtotal = flow.operational + flow.otherCosts + flow.foodBeverages;
  const aidInternshipsSubtotal = flow.congressesInternships + flow.scholarshipsAndAid;
  const overheadSubtotal = flow.centralOverhead + flow.facultyOverhead;
  const totalExpenses = academicSubtotal + nonAcademicSubtotal + equipmentBooksSubtotal + diffusionSubtotal
    + travelSubtotal + perDiemSubtotal + softwareSubtotal + otherServicesSubtotal + aidInternshipsSubtotal + overheadSubtotal;
  return {
    manualAcademicHonoraria,
    manualOtherNonAcademicHonoraria,
    baseOtherNonAcademicHonoraria,
    academicSubtotal,
    nonAcademicSubtotal,
    equipmentBooksSubtotal,
    diffusionSubtotal,
    travelSubtotal,
    perDiemSubtotal,
    softwareSubtotal,
    otherServicesSubtotal,
    aidInternshipsSubtotal,
    overheadSubtotal,
    totalExpenses,
  };
}

function assertReconciled(flow: BudgetResult["annualFlows"][number], projection: InstitutionalAccountingProjection): void {
  const tolerance = 0.5;
  if (Math.abs(projection.academicSubtotal - flow.academicHonoraria) > tolerance) {
    throw new Error(`XLSX_NO_CONCILIA_HONORARIOS_ACADEMICOS_${flow.year}: ${projection.academicSubtotal} != ${flow.academicHonoraria}`);
  }
  if (Math.abs(projection.nonAcademicSubtotal - flow.nonAcademicHonoraria) > tolerance) {
    throw new Error(`XLSX_NO_CONCILIA_HONORARIOS_NO_ACADEMICOS_${flow.year}: ${projection.nonAcademicSubtotal} != ${flow.nonAcademicHonoraria}`);
  }
  if (Math.abs(projection.totalExpenses - flow.totalExpenses) > tolerance) {
    throw new Error(`XLSX_NO_CONCILIA_TOTAL_COSTOS_${flow.year}: ${projection.totalExpenses} != ${flow.totalExpenses}`);
  }
}

const LABELS: Record<number, string> = {
  4: "Matrícula",
  5: "Aranceles",
  6: "Incobrables",
  7: "Reconocimiento de Matrícula Escuela de Postgrado",
  8: "INGRESOS TOTAL",
  9: "Docentes convenio y otros honorarios académicos",
  10: "Docentes hora de reemplazo",
  11: "Docente tesista / guía de tesis",
  12: "COSTOS ACADÉMICOS",
  13: "Director programa",
  14: "Asistente de Dirección",
  15: "Otros honorarios no académicos adicionales",
  16: "Asistencia técnica / otros honorarios base",
  17: "HONORARIOS NO ACADÉMICOS",
  18: "Equipamiento / materiales básicos de enseñanza",
  19: "Libros y publicaciones técnicas",
  20: "EQUIPAMIENTO, LIBROS Y PUBLICACIONES TÉCNICAS",
  21: "Difusión propia del programa",
  22: "DIFUSIÓN",
  23: "Pasajes y fletes",
  24: "Hospedaje nacional e internacional",
  25: "PASAJES, FLETES Y HOSPEDAJE",
  26: "Viáticos honorarios",
  27: "VIÁTICOS HONORARIOS NACIONALES",
  28: "Licencias de software",
  29: "ADQUISICIÓN DE PROGRAMAS O LICENCIAS",
  30: "Gastos operacionales / otros servicios",
  31: "Alimentos y bebidas",
  32: "OTROS SERVICIOS",
  33: "Congresos, pasantías, becas y ayudas",
  34: "CONGRESOS, PASANTÍAS Y AYUDAS",
  35: "Over Head Central",
  36: "Over Head Facultad",
  37: "RETENCIONES",
  38: "TOTAL COSTOS Y GASTOS DE ADM.",
  39: "FLUJO DE CAJA NETO",
  40: "Arrastre inicial anual",
  41: "SALDO FINAL ACUMULADO",
  42: "RENDIMIENTO OPERACIONAL",
};

/**
 * Última etapa obligatoria del XLSX institucional.
 *
 * No inventa un segundo cálculo: toma el AnnualFlow del motor y vuelve a escribir el bloque
 * FLUJO TOTAL con una única clasificación contable. Los subtotales visibles se calculan
 * desde sus filas detalle y se validan contra academicHonoraria, nonAcademicHonoraria y
 * totalExpenses. Si existe una divergencia, la exportación se bloquea en vez de entregar
 * silenciosamente una planilla incorrecta.
 */
export async function reconcileInstitutionalBudgetXlsx(
  workbookBytes: Uint8Array,
  budget: CohortBudget,
  result: BudgetResult,
): Promise<Uint8Array> {
  if (budget.program.type !== "MAGISTER_PROFESIONAL" || !result.years.length) return workbookBytes;
  const files = await unzipPackage(workbookBytes);
  const totalSheetName = "xl/worksheets/sheet4.xml";
  if (!files.has(totalSheetName)) throw new Error("XLSX institucional incompleto: falta FLUJO TOTAL.");
  let sheet = decoder.decode(files.get(totalSheetName)!);

  for (const [rowText, label] of Object.entries(LABELS)) sheet = setText(sheet, `A${rowText}`, label);

  const rows = studentRows(budget);
  const directCostRow = 18 + Math.max(0, payableCurriculumCourses(budget.program).length - 13);
  const recognition = clampRate(budget.enrollmentRecognitionRate);

  result.years.forEach((year, index) => {
    const flow = result.annualFlows.find((item) => item.year === year);
    if (!flow) return;
    const projection = institutionalAccountingProjection(budget, flow);
    assertReconciled(flow, projection);
    const col = yearColumn(index);
    const teachingCol = teachingColumn(index);
    const badDebtRate = flow.tuitionAfterBenefits > 0 ? flow.badDebt / flow.tuitionAfterBenefits : 0;
    const extraIncome = flow.externalIncome + flow.institutionalFinancing + flow.otherIncome;
    const academicDirect = flow.directTeachingCost + projection.manualAcademicHonoraria;

    sheet = setFormula(sheet, `${col}4`, `'Flujo estudiantes'!${col}${rows.enrollmentIncomeRow}`, flow.grossEnrollmentFee);
    sheet = setFormula(sheet, `${col}5`, `'Flujo estudiantes'!${col}${rows.totalTuitionIncomeRow}`, flow.tuitionAfterBenefits);
    sheet = setFormula(sheet, `${col}6`, `-${col}5*${badDebtRate}`, -flow.badDebt);
    sheet = setFormula(sheet, `${col}7`, `${col}4*${recognition}`, flow.recognizedEnrollmentFee);
    sheet = setFormula(sheet, `${col}8`, extraIncome ? `SUM(${col}5:${col}6)+${col}7+${extraIncome}` : `SUM(${col}5:${col}6)+${col}7`, flow.totalIncome);

    const directFormula = projection.manualAcademicHonoraria > 0
      ? `-'Costo Directo de Docencia'!${teachingCol}${directCostRow}-${projection.manualAcademicHonoraria}`
      : `-'Costo Directo de Docencia'!${teachingCol}${directCostRow}`;
    sheet = setFormula(sheet, `${col}9`, directFormula, -academicDirect);
    sheet = setFormula(sheet, `${col}10`, `-${replacementHours(budget, year)}*Parámetros!${col}7`, -flow.replacementTeachingCost);
    sheet = setFormula(sheet, `${col}11`, `-'Flujo estudiantes'!${col}${rows.graduationStudentsRow}*Parámetros!$${col}$8`, -flow.thesisGuidanceCost);
    sheet = setFormula(sheet, `${col}12`, `SUM(${col}9:${col}11)`, -flow.academicHonoraria);

    sheet = setNumber(sheet, `${col}13`, -flow.direction);
    sheet = setNumber(sheet, `${col}14`, -flow.assistance);
    sheet = setNumber(sheet, `${col}15`, -projection.manualOtherNonAcademicHonoraria);
    sheet = setNumber(sheet, `${col}16`, -projection.baseOtherNonAcademicHonoraria);
    sheet = setFormula(sheet, `${col}17`, `SUM(${col}13:${col}16)`, -flow.nonAcademicHonoraria);

    sheet = setNumber(sheet, `${col}18`, -flow.equipment);
    sheet = setNumber(sheet, `${col}19`, -flow.booksPublications);
    sheet = setFormula(sheet, `${col}20`, `SUM(${col}18:${col}19)`, -projection.equipmentBooksSubtotal);
    sheet = setNumber(sheet, `${col}21`, -flow.diffusion);
    sheet = setFormula(sheet, `${col}22`, `SUM(${col}21)`, -projection.diffusionSubtotal);
    sheet = setNumber(sheet, `${col}23`, -flow.travelFreight);
    sheet = setNumber(sheet, `${col}24`, 0);
    sheet = setFormula(sheet, `${col}25`, `SUM(${col}23:${col}24)`, -projection.travelSubtotal);
    sheet = setNumber(sheet, `${col}26`, -flow.perDiem);
    sheet = setFormula(sheet, `${col}27`, `SUM(${col}26)`, -projection.perDiemSubtotal);
    sheet = setNumber(sheet, `${col}28`, -flow.software);
    sheet = setFormula(sheet, `${col}29`, `SUM(${col}28)`, -projection.softwareSubtotal);
    sheet = setNumber(sheet, `${col}30`, -(flow.operational + flow.otherCosts));
    sheet = setNumber(sheet, `${col}31`, -flow.foodBeverages);
    sheet = setFormula(sheet, `${col}32`, `SUM(${col}30:${col}31)`, -projection.otherServicesSubtotal);
    sheet = setNumber(sheet, `${col}33`, -projection.aidInternshipsSubtotal);
    sheet = setFormula(sheet, `${col}34`, `SUM(${col}33)`, -projection.aidInternshipsSubtotal);
    sheet = setNumber(sheet, `${col}35`, -flow.centralOverhead);
    sheet = setNumber(sheet, `${col}36`, -flow.facultyOverhead);
    sheet = setFormula(sheet, `${col}37`, `SUM(${col}35:${col}36)`, -projection.overheadSubtotal);
    sheet = setFormula(sheet, `${col}38`, `SUM(${col}12,${col}17,${col}20,${col}22,${col}25,${col}27,${col}29,${col}32,${col}34,${col}37)`, -flow.totalExpenses);
    sheet = setFormula(sheet, `${col}39`, `+${col}8+${col}38`, flow.netFlow);
    if (index === 0) sheet = setNumber(sheet, `${col}40`, flow.startingCarryover);
    else sheet = setFormula(sheet, `${col}40`, `+${yearColumn(index - 1)}41`, flow.startingCarryover);
    sheet = setFormula(sheet, `${col}41`, `SUM(${col}39:${col}40)`, flow.accumulatedFlow);
    sheet = setFormula(sheet, `${col}42`, `IFERROR(${col}39/${col}8,0)`, flow.operatingMargin);
  });

  files.set(totalSheetName, encoder.encode(sheet));
  files.delete("xl/calcChain.xml");
  return zip(files);
}
