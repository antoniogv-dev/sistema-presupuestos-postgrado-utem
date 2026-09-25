import { formatCLP } from "../calculations/currency";
import { effectiveBadDebtRate, resolvedAnnualOverrideForYear } from "../calculations/budget-engine";
import type { BudgetResult, CohortBudget, InstitutionalParameters } from "../calculations/types";

const encoder = new TextEncoder();
const decoder = new TextDecoder();

export interface MemorandumMetadata {
  number: string;
  recipientName: string;
  recipientRole: string;
  senderName: string;
  senderRole: string;
  reference: string;
  dateText: string;
  greeting: string;
  initials: string;
}

const MONTHS = ["ENERO", "FEBRERO", "MARZO", "ABRIL", "MAYO", "JUNIO", "JULIO", "AGOSTO", "SEPTIEMBRE", "OCTUBRE", "NOVIEMBRE", "DICIEMBRE"];
const money = (value: number) => formatCLP(Math.round(value));
const sum = (values: number[]) => values.reduce((total, value) => total + value, 0);

function xml(value: string): string {
  return String(value)
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\uFFFE\uFFFF]/g, "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}
function readU16(view: DataView, offset: number): number { return view.getUint16(offset, true); }
function readU32(view: DataView, offset: number): number { return view.getUint32(offset, true); }
async function inflateRaw(data: Uint8Array): Promise<Uint8Array> {
  const input = new Uint8Array(data.byteLength); input.set(data);
  const stream = new Blob([input.buffer]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}
async function unzipPackage(bytes: Uint8Array): Promise<Map<string, Uint8Array>> {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let eocd = -1;
  for (let offset = bytes.byteLength - 22; offset >= Math.max(0, bytes.byteLength - 65557); offset -= 1) {
    if (readU32(view, offset) === 0x06054b50) { eocd = offset; break; }
  }
  if (eocd < 0) throw new Error("La plantilla de memorándum no contiene un ZIP OOXML válido.");
  const totalEntries = readU16(view, eocd + 10);
  let centralOffset = readU32(view, eocd + 16);
  const files = new Map<string, Uint8Array>();
  for (let index = 0; index < totalEntries; index += 1) {
    if (readU32(view, centralOffset) !== 0x02014b50) throw new Error("Directorio ZIP inválido en la plantilla de memorándum.");
    const method = readU16(view, centralOffset + 10);
    const compressedSize = readU32(view, centralOffset + 20);
    const fileNameLength = readU16(view, centralOffset + 28);
    const extraLength = readU16(view, centralOffset + 30);
    const commentLength = readU16(view, centralOffset + 32);
    const localOffset = readU32(view, centralOffset + 42);
    const fileName = decoder.decode(bytes.subarray(centralOffset + 46, centralOffset + 46 + fileNameLength));
    const localNameLength = readU16(view, localOffset + 26);
    const localExtraLength = readU16(view, localOffset + 28);
    const dataStart = localOffset + 30 + localNameLength + localExtraLength;
    const compressed = bytes.subarray(dataStart, dataStart + compressedSize);
    let data: Uint8Array;
    if (method === 0) data = new Uint8Array(compressed);
    else if (method === 8) data = await inflateRaw(compressed);
    else throw new Error(`Método ZIP no soportado (${method}) en ${fileName}.`);
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
function crc32(data: Uint8Array): number { let crc = 0xffffffff; for (const byte of data) crc = crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8); return (crc ^ 0xffffffff) >>> 0; }
function u16(value: number): Uint8Array { return new Uint8Array([value & 0xff, (value >>> 8) & 0xff]); }
function u32(value: number): Uint8Array { return new Uint8Array([value & 0xff, (value >>> 8) & 0xff, (value >>> 16) & 0xff, (value >>> 24) & 0xff]); }
function concat(parts: Uint8Array[]): Uint8Array { const size = parts.reduce((total, part) => total + part.length, 0); const output = new Uint8Array(size); let offset = 0; for (const part of parts) { output.set(part, offset); offset += part.length; } return output; }
function zip(files: Map<string, Uint8Array>): Uint8Array {
  const locals: Uint8Array[] = []; const centrals: Uint8Array[] = []; let offset = 0;
  for (const [fileName, data] of files) {
    const name = encoder.encode(fileName); const crc = crc32(data);
    const local = concat([u32(0x04034b50), u16(20), u16(0), u16(0), u16(0), u16(0), u32(crc), u32(data.length), u32(data.length), u16(name.length), u16(0), name, data]);
    locals.push(local);
    centrals.push(concat([u32(0x02014b50), u16(20), u16(20), u16(0), u16(0), u16(0), u16(0), u32(crc), u32(data.length), u32(data.length), u16(name.length), u16(0), u16(0), u16(0), u16(0), u32(0), u32(offset), name]));
    offset += local.length;
  }
  const centralData = concat(centrals);
  const end = concat([u32(0x06054b50), u16(0), u16(0), u16(files.size), u16(files.size), u32(centralData.length), u32(offset), u16(0)]);
  return concat([...locals, centralData, end]);
}

function run(text: string, bold = false): string {
  return `<w:r><w:rPr><w:rFonts w:ascii="Arial" w:hAnsi="Arial" w:cs="Arial"/><w:sz w:val="20"/><w:szCs w:val="20"/>${bold ? "<w:b/>" : ""}<w:lang w:val="es-CL"/></w:rPr><w:t xml:space="preserve">${xml(text)}</w:t></w:r>`;
}
function paragraph(parts: Array<{ text: string; bold?: boolean }> | string, options: { align?: "left" | "right" | "both" | "center"; before?: number; after?: number; line?: number; indentLeft?: number; indentHanging?: number; keepNext?: boolean; pageBreakBefore?: boolean } = {}): string {
  const content = typeof parts === "string" ? run(parts) : parts.map((part) => run(part.text, part.bold)).join("");
  const align = options.align ?? "both";
  const spacing = `<w:spacing w:before="${options.before ?? 0}" w:after="${options.after ?? 100}" w:line="${options.line ?? 220}" w:lineRule="auto"/>`;
  const indent = options.indentLeft != null ? `<w:ind w:left="${options.indentLeft}"${options.indentHanging != null ? ` w:hanging="${options.indentHanging}"` : ""}/>` : "";
  return `<w:p><w:pPr>${options.keepNext ? "<w:keepNext/>" : ""}${options.pageBreakBefore ? "<w:pageBreakBefore/>" : ""}${spacing}<w:jc w:val="${align}"/>${indent}<w:rPr><w:rFonts w:ascii="Arial" w:hAnsi="Arial" w:cs="Arial"/><w:sz w:val="20"/><w:szCs w:val="20"/><w:lang w:val="es-CL"/></w:rPr></w:pPr>${content}</w:p>`;
}
function bullet(heading: string, body: string): string {
  return `<w:p><w:pPr><w:numPr><w:ilvl w:val="0"/><w:numId w:val="1"/></w:numPr><w:spacing w:after="0" w:line="220" w:lineRule="auto"/><w:jc w:val="both"/><w:rPr><w:rFonts w:ascii="Arial" w:hAnsi="Arial" w:cs="Arial"/><w:sz w:val="20"/><w:szCs w:val="20"/><w:lang w:val="es-CL"/></w:rPr></w:pPr>${run(`${heading}. `, true)}${run(body)}</w:p>`;
}
function tableCell(content: string, width: number, bold = false): string {
  return `<w:tc><w:tcPr><w:tcW w:w="${width}" w:type="dxa"/><w:vAlign w:val="top"/></w:tcPr>${paragraph([{ text: content, bold }], { align: "left", after: 0 })}</w:tc>`;
}
function titleTable(metadata: MemorandumMetadata): string {
  return `<w:tbl><w:tblPr><w:tblW w:w="9100" w:type="dxa"/><w:tblLayout w:type="fixed"/><w:tblBorders><w:top w:val="single" w:sz="8" w:color="777777"/><w:left w:val="single" w:sz="8" w:color="777777"/><w:bottom w:val="single" w:sz="8" w:color="777777"/><w:right w:val="single" w:sz="8" w:color="777777"/><w:insideH w:val="nil"/><w:insideV w:val="nil"/></w:tblBorders></w:tblPr><w:tblGrid><w:gridCol w:w="9100"/></w:tblGrid><w:tr><w:tc><w:tcPr><w:tcW w:w="9100" w:type="dxa"/><w:vAlign w:val="center"/></w:tcPr>${paragraph([{ text: `MEMORÁNDUM N.º ${metadata.number}`, bold: true }], { align: "center", after: 0, line: 220 })}</w:tc></w:tr></w:tbl>`;
}
function metadataTable(metadata: MemorandumMetadata): string {
  const rows = [
    ["A:", `${metadata.recipientName}\n${metadata.recipientRole}`],
    ["DE:", `${metadata.senderName}\n${metadata.senderRole}`],
    ["REFERENCIA:", metadata.reference],
    ["FECHA:", metadata.dateText],
  ];
  const rowXml = rows.map(([label, value]) => {
    const lines = value.split("\n");
    const valueParagraphs = lines.map((line) => paragraph([{ text: line, bold: true }], { align: "left", after: 0, line: 220 })).join("");
    return `<w:tr>${tableCell(label, 1800, true)}<w:tc><w:tcPr><w:tcW w:w="7300" w:type="dxa"/><w:vAlign w:val="top"/></w:tcPr>${valueParagraphs}</w:tc></w:tr>`;
  }).join("");
  return `<w:tbl><w:tblPr><w:tblW w:w="9100" w:type="dxa"/><w:tblLayout w:type="fixed"/><w:tblBorders><w:top w:val="nil"/><w:left w:val="nil"/><w:bottom w:val="single" w:sz="8" w:color="555555"/><w:right w:val="nil"/><w:insideH w:val="nil"/><w:insideV w:val="nil"/></w:tblBorders></w:tblPr><w:tblGrid><w:gridCol w:w="1800"/><w:gridCol w:w="7300"/></w:tblGrid>${rowXml}</w:tbl>`;
}
function defaultDateText(date = new Date()): string {
  return `SANTIAGO, ${date.getDate()} DE ${MONTHS[date.getMonth()]} DE ${date.getFullYear()}`;
}
function totalTeachingHours(budget: CohortBudget, year: number): number {
  return budget.semesters.filter((semester) => semester.year === year).reduce((total, semester) => total + Math.max(0, semester.directTeachingHours) + Math.max(0, semester.synchronousTeachingHours) + Math.max(0, semester.asynchronousTeachingHours), 0);
}
function joinSpanish(parts: string[]): string {
  if (parts.length <= 1) return parts[0] ?? "";
  if (parts.length === 2) return `${parts[0]} y ${parts[1]}`;
  return `${parts.slice(0, -1).join(", ")} y ${parts.at(-1)}`;
}
function annualMoneyPhrase(result: BudgetResult, getter: (index: number) => number): string {
  const values = result.years.map((_, index) => Math.round(getter(index)));
  if (values.length > 1 && values.every((value) => value === values[0])) return `${money(values[0])} en cada año`;
  return joinSpanish(result.years.map((year, index) => `${money(values[index])} en ${year}`));
}
function annualStudentPhrase(result: BudgetResult, activeByYear: number[]): string {
  if (result.years.length === 2 && activeByYear[0] === activeByYear[1]) return `${activeByYear[0]} estudiantes activos tanto en ${result.years[0]} como en ${result.years[1]}`;
  if (result.years.length > 1 && activeByYear.every((value) => value === activeByYear[0])) return `${activeByYear[0]} estudiantes activos durante ${joinSpanish(result.years.map(String))}`;
  return joinSpanish(result.years.map((year, index) => `${activeByYear[index]} estudiantes activos en ${year}`));
}
function annualFlowPhrase(result: BudgetResult): string {
  return joinSpanish(result.years.map((year, index) => `${money(result.annualFlows[index].netFlow)} en ${year}`));
}
function annualAccumulatedPhrase(result: BudgetResult): string {
  return joinSpanish(result.years.map((year, index) => `${money(result.annualFlows[index].accumulatedFlow)} al cierre de ${year}`));
}

function financialStructureDescription(budget: CohortBudget, result: BudgetResult, parameters: InstitutionalParameters): string {
  const firstYear = result.years[0] ?? budget.startYear;
  const firstAnnual = resolvedAnnualOverrideForYear(budget, parameters, firstYear);
  const isMaster = budget.program.type === "MAGISTER_PROFESIONAL" || budget.program.type === "MAGISTER_ACADEMICO";

  if (isMaster && budget.durationSemesters === 3) {
    const totalTuition = budget.programTotalTuition ?? 0;
    const tuitionText = totalTuition > 0
      ? `un arancel total para el programa completo de ${money(totalTuition)}`
      : "un arancel total para el programa completo";
    const enrollmentValue = budget.singleEnrollmentFee ?? 0;
    const enrollmentText = enrollmentValue > 0
      ? `una matrícula única de ${money(enrollmentValue)}, cobrada una sola vez al inicio del programa`
      : "una matrícula única, cobrada una sola vez al inicio del programa";
    return `Por tratarse de un Magíster de tres semestres, la estructura financiera considera ${tuitionText}, y no un arancel anual. Este arancel puede pagarse hasta en 18 cuotas. Asimismo, se contempla ${enrollmentText}.`;
  }

  if (budget.program.type === "DOCTORADO") {
    return `El programa mantiene una estructura anual de cobro, considerando matrícula anual durante cada año de permanencia y arancel anual conforme a los valores vigentes del respectivo período. Para ${firstYear}, la matrícula anual de referencia corresponde a ${money(firstAnnual.annualEnrollmentFee)}.`;
  }

  if (isMaster && budget.durationSemesters === 4) {
    return `Por tratarse de un Magíster de cuatro semestres, el modelo considera arancel anual y matrícula anual durante los dos años académicos del programa. Para ${firstYear}, la matrícula anual de referencia corresponde a ${money(firstAnnual.annualEnrollmentFee)}.`;
  }

  const enrollmentMode = budget.enrollmentBillingMode === "SINGLE_SPECIAL"
    ? "matrícula única al inicio del programa"
    : budget.enrollmentBillingMode === "SEMESTER"
      ? "matrícula semestral"
      : "matrícula anual";
  const tuitionMode = budget.tuitionPricingMode === "PROGRAM_TOTAL"
    ? `arancel total para el programa completo${budget.tuitionInstallments ? `, pagadero en hasta ${budget.tuitionInstallments} cuotas` : ""}`
    : "arancel anual";
  return `La estructura financiera registrada para la cohorte considera ${tuitionMode} y ${enrollmentMode}.`;
}
function prorationDescription(budget: CohortBudget, parameters: InstitutionalParameters, result: BudgetResult): string {
  const byYear = result.years.map((year) => {
    const override = resolvedAnnualOverrideForYear(budget, parameters, year);
    const parts: string[] = [];
    if (override.directionProrated || override.directionAllocationRate < 0.999) parts.push(`Dirección de Programa al ${(override.directionAllocationRate * 100).toLocaleString("es-CL", { maximumFractionDigits: 1 })}%`);
    if (override.assistanceProrated || override.assistanceAllocationRate < 0.999) parts.push(`Asistencia de Dirección al ${(override.assistanceAllocationRate * 100).toLocaleString("es-CL", { maximumFractionDigits: 1 })}%`);
    if (override.otherNonAcademicProrated || override.otherNonAcademicAllocationRate < 0.999) parts.push(`otros honorarios no académicos al ${(override.otherNonAcademicAllocationRate * 100).toLocaleString("es-CL", { maximumFractionDigits: 1 })}%`);
    return parts.length ? { year, parts } : null;
  }).filter((item): item is { year: number; parts: string[] } => item !== null);
  if (!byYear.length) return "Los costos de Dirección de Programa, Asistencia de Dirección y otros honorarios no académicos se imputan conforme a los valores completos definidos para la cohorte.";
  return `${byYear.map((item) => `En ${item.year}, se aplica ${joinSpanish(item.parts)}`).join(". ")}. En los años sin prorrateo registrado, estos costos se imputan íntegramente a la cohorte.`;
}
function introAdjustments(budget: CohortBudget, parameters: InstitutionalParameters, result: BudgetResult): string {
  const prorationYears = result.years.filter((year) => {
    const override = resolvedAnnualOverrideForYear(budget, parameters, year);
    return override.directionProrated || override.assistanceProrated || override.otherNonAcademicProrated || override.directionAllocationRate < 0.999 || override.assistanceAllocationRate < 0.999 || override.otherNonAcademicAllocationRate < 0.999;
  });
  const conditions: string[] = [];
  if (prorationYears.length) conditions.push(`los prorrateos de staff registrados para ${joinSpanish(prorationYears.map(String))}`);
  const carryover = result.annualFlows[0]?.startingCarryover ?? 0;
  if (carryover !== 0) conditions.push(`un saldo inicial ${carryover < 0 ? "negativo" : "positivo"} de ${money(Math.abs(carryover))} proveniente del período anterior`);
  if (!conditions.length) return "";
  return ` Esta estimación considera ${joinSpanish(conditions)}.`;
}
function firstYearTeachingValues(budget: CohortBudget, firstYear: number, firstAnnual: ReturnType<typeof resolvedAnnualOverrideForYear>): string {
  const semesters = budget.semesters.filter((semester) => semester.year === firstYear);
  const values: string[] = [];
  if (semesters.some((semester) => semester.directTeachingHours > 0)) values.push(`valor hora presencial de ${money(firstAnnual.directTeachingHourValue)}`);
  if (semesters.some((semester) => semester.synchronousTeachingHours > 0)) values.push(`valor hora sincrónica de ${money(firstAnnual.synchronousTeachingHourValue)}`);
  if (semesters.some((semester) => semester.asynchronousTeachingHours > 0)) values.push(`valor hora asincrónica de ${money(firstAnnual.asynchronousTeachingHourValue)}`);
  if (!values.length) values.push(`valor hora de docencia de ${money(firstAnnual.directTeachingHourValue)}`);
  return joinSpanish(values);
}

export function defaultMemorandumMetadata(budget: CohortBudget, date = new Date()): MemorandumMetadata {
  return {
    number: `XXX/${date.getFullYear()}`,
    recipientName: "SR. MAURICIO LOYOLA MORENILLA",
    recipientRole: "VICERRECTOR DE ADMINISTRACIÓN Y FINANZAS (S)",
    senderName: "DR. JORGE RODRÍGUEZ BECERRA",
    senderRole: "DIRECTOR DE ESCUELA DE POSTGRADO",
    reference: `SOLICITA APROBACIÓN DE PROYECCIÓN PRESUPUESTARIA DE LA COHORTE ${budget.startYear} DEL ${budget.program.name.toUpperCase()} (${budget.program.code}).`,
    dateText: defaultDateText(date),
    greeting: "Estimado Vicerrector (s):",
    initials: "JRB/agv",
  };
}

export function buildMemorandumBody(
  budget: CohortBudget,
  result: BudgetResult,
  parameters: InstitutionalParameters,
  metadata = defaultMemorandumMetadata(budget),
): string {
  const firstYear = result.years[0] ?? budget.startYear;
  const lastYear = result.years.at(-1) ?? firstYear;
  const activeByYear = result.years.map((year) => {
    const periods = budget.semesters.filter((semester) => semester.year === year);
    return periods.length ? Math.max(...periods.map((semester) => semester.activeStudents)) : 0;
  });
  const modality = budget.deliveryModality === "SEMIPRESENCIAL"
    ? "semipresencial"
    : budget.deliveryModality === "E_LEARNING"
      ? "e-learning"
      : "presencial";
  const semesterLabel = budget.startSemester === 1 ? "primer semestre" : "segundo semestre";
  const yearsLabel = firstYear === lastYear ? String(firstYear) : `${firstYear}-${lastYear}`;
  const badDebtRate = effectiveBadDebtRate(budget, parameters);

  const tuitionDiscounts = budget.discounts.filter(
    (discount) => (discount.target ?? "TUITION") === "TUITION"
      && Math.max(0, discount.students) > 0
      && Math.max(0, Math.min(1, discount.percentage)) > 0,
  );
  const discountedStudents = tuitionDiscounts.reduce((total, discount) => total + Math.max(0, discount.students), 0);
  const referenceStudents = activeByYear[0] ?? budget.initialStudents;
  const undiscountedStudents = Math.max(0, referenceStudents - discountedStudents);
  const discountParts = [
    ...(undiscountedStudents > 0 ? [`${undiscountedStudents} sin descuento`] : []),
    ...tuitionDiscounts.map(
      (discount) => `${Math.max(0, discount.students)} con un descuento del ${(Math.max(0, Math.min(1, discount.percentage)) * 100).toLocaleString("es-CL", { maximumFractionDigits: 1 })}%`,
    ),
  ];
  const discountSentence = discountParts.length
    ? `, de los cuales ${joinSpanish(discountParts)}`
    : ", sin descuentos de arancel registrados";

  const recognizedEnrollment = sum(result.annualFlows.map((flow) => flow.recognizedEnrollmentFee));
  const institutionalFinancing = sum(result.annualFlows.map((flow) => flow.institutionalFinancing));
  const externalIncome = sum(result.annualFlows.map((flow) => flow.externalIncome));
  const additionalIncomeParts: string[] = [];
  if (recognizedEnrollment > 0) additionalIncomeParts.push(`el reconocimiento de matrícula por ${money(recognizedEnrollment)}`);
  if (institutionalFinancing > 0) additionalIncomeParts.push(`financiamiento institucional por ${money(institutionalFinancing)}`);
  if (externalIncome > 0) additionalIncomeParts.push(`otros ingresos externos por ${money(externalIncome)}`);
  const additionalIncomeSentence = additionalIncomeParts.length
    ? ` Asimismo, se considera ${joinSpanish(additionalIncomeParts)} durante el ciclo.`
    : "";

  const carryover = result.annualFlows[0]?.startingCarryover ?? 0;
  const carryoverSentence = carryover !== 0
    ? ` La proyección incorpora además un saldo inicial ${carryover < 0 ? "negativo" : "positivo"} de ${money(Math.abs(carryover))} proveniente del período anterior.`
    : "";

  const finalBalance = result.finalAccumulatedFlow;
  const balanceLabel = finalBalance > 0 ? "positivo" : finalBalance < 0 ? "negativo" : "equilibrado";
  const balanceAmount = money(Math.abs(finalBalance));

  const intro = `Junto con saludar, remito para su revisión y aprobación la proyección presupuestaria de la cohorte ${budget.startYear} del ${budget.program.name} (${budget.program.code}), correspondiente al ciclo ${yearsLabel}, en modalidad ${modality}.`;

  const context = `Cabe señalar que la presente proyección se formula considerando el inicio de la cohorte durante el ${semesterLabel} de ${budget.startYear} y su ejecución hasta ${lastYear}, conforme a la calendarización académica y presupuestaria registrada para el programa.${carryoverSentence}`;

  const financialStructure = financialStructureDescription(budget, result, parameters);
  const assumptions = `La proyección considera ${annualStudentPhrase(result, activeByYear)}${discountSentence}. ${financialStructure} Asimismo, se incorpora una incobrabilidad estimada del ${(badDebtRate * 100).toLocaleString("es-CL", { maximumFractionDigits: 1 })}%, además de los costos de docencia, guía o revisión de tesis, staff, gastos de operación y overhead institucional correspondientes a ${joinSpanish(result.years.map(String))}.${additionalIncomeSentence}`;

  const financial = `Bajo estos supuestos, los ingresos efectivos proyectados ascienden a ${annualMoneyPhrase(result, (index) => result.annualFlows[index].totalIncome)}. Por su parte, los costos y gastos se estiman en ${annualMoneyPhrase(result, (index) => result.annualFlows[index].totalExpenses)}, y el resultado económico acumulado proyectado para el ciclo ${yearsLabel} alcanza un saldo ${balanceLabel} de ${balanceAmount}.`;

  const closing = "En virtud de lo anterior, solicito a usted revisar y, de estimarlo procedente, aprobar la proyección presupuestaria adjunta. Una vez confirmada la matrícula efectiva de la cohorte, se actualizará el análisis financiero del programa conforme a los antecedentes definitivos.";

  return [
    titleTable(metadata),
    paragraph("", { after: 70 }),
    metadataTable(metadata),
    paragraph("", { after: 80 }),
    paragraph(metadata.greeting, { align: "left", before: 220, after: 120 }),
    paragraph(intro, { align: "both", after: 120 }),
    paragraph(context, { align: "both", after: 120 }),
    paragraph(assumptions, { align: "both", after: 120 }),
    paragraph(financial, { align: "both", after: 120 }),
    paragraph(closing, { align: "both", after: 120 }),
    paragraph("Saluda atentamente,", { align: "left", before: 80, after: 60 }),
    paragraph("", { after: 0 }),
    paragraph("", { after: 0 }),
    paragraph("", { after: 0 }),
    paragraph([{ text: metadata.senderName, bold: true }], { align: "right", after: 0, keepNext: true }),
    paragraph(metadata.senderRole, { align: "right", after: 80 }),
  ].join("");
}

export async function createBudgetMemorandumDocx(
  templateBytes: Uint8Array,
  budget: CohortBudget,
  result: BudgetResult,
  parameters: InstitutionalParameters,
  metadata = defaultMemorandumMetadata(budget),
): Promise<Uint8Array> {
  const files = await unzipPackage(templateBytes);
  const documentBytes = files.get("word/document.xml");
  if (!documentBytes) throw new Error("La plantilla de memorándum no contiene word/document.xml.");
  let documentXml = decoder.decode(documentBytes);
  const bodyMatch = documentXml.match(/<w:body>([\s\S]*?)<\/w:body>/);
  if (!bodyMatch) throw new Error("La plantilla de memorándum no contiene un cuerpo Word válido.");
  const sectionMatch = bodyMatch[1].match(/<w:sectPr[\s\S]*?<\/w:sectPr>\s*$/);
  if (!sectionMatch) throw new Error("La plantilla de memorándum no contiene configuración de página válida.");
  const body = `${buildMemorandumBody(budget, result, parameters, metadata)}${sectionMatch[0]}`;
  documentXml = documentXml.replace(/<w:body>[\s\S]*?<\/w:body>/, `<w:body>${body}</w:body>`);
  files.set("word/document.xml", encoder.encode(documentXml));
  return zip(files);
}
