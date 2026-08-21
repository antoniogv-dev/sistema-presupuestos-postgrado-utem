import { formatCLP } from "../calculations/currency";
import { resolvedAnnualOverrideForYear } from "../calculations/budget-engine";
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
  return `<w:r><w:rPr><w:rFonts w:ascii="Arial" w:hAnsi="Arial"/><w:sz w:val="20"/><w:szCs w:val="20"/>${bold ? "<w:b/>" : ""}<w:lang w:val="es-CL"/></w:rPr><w:t xml:space="preserve">${xml(text)}</w:t></w:r>`;
}
function paragraph(parts: Array<{ text: string; bold?: boolean }> | string, options: { align?: "left" | "right" | "both" | "center"; before?: number; after?: number; line?: number; indentLeft?: number; indentHanging?: number } = {}): string {
  const content = typeof parts === "string" ? run(parts) : parts.map((part) => run(part.text, part.bold)).join("");
  const align = options.align ?? "both";
  const spacing = `<w:spacing w:before="${options.before ?? 0}" w:after="${options.after ?? 60}" w:line="${options.line ?? 220}" w:lineRule="auto"/>`;
  const indent = options.indentLeft != null ? `<w:ind w:left="${options.indentLeft}"${options.indentHanging != null ? ` w:hanging="${options.indentHanging}"` : ""}/>` : "";
  return `<w:p><w:pPr>${spacing}<w:jc w:val="${align}"/>${indent}<w:rPr><w:rFonts w:ascii="Arial" w:hAnsi="Arial"/><w:sz w:val="20"/><w:szCs w:val="20"/><w:lang w:val="es-CL"/></w:rPr></w:pPr>${content}</w:p>`;
}
function bullet(heading: string, body: string): string {
  return `<w:p><w:pPr><w:numPr><w:ilvl w:val="0"/><w:numId w:val="1"/></w:numPr><w:spacing w:after="45" w:line="220" w:lineRule="auto"/><w:jc w:val="both"/><w:rPr><w:rFonts w:ascii="Arial" w:hAnsi="Arial"/><w:sz w:val="20"/><w:szCs w:val="20"/></w:rPr></w:pPr>${run(`${heading}. `, true)}${run(body)}</w:p>`;
}
function tableCell(content: string, width: number, bold = false): string {
  return `<w:tc><w:tcPr><w:tcW w:w="${width}" w:type="dxa"/><w:vAlign w:val="top"/></w:tcPr>${paragraph([{ text: content, bold }], { align: "left", after: 0 })}</w:tc>`;
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
    const valueParagraphs = lines.map((line) => paragraph([{ text: line, bold: true }], { align: "left", after: 0 })).join("");
    return `<w:tr>${tableCell(label, 1800, true)}<w:tc><w:tcPr><w:tcW w:w="7300" w:type="dxa"/><w:vAlign w:val="top"/></w:tcPr>${valueParagraphs}</w:tc></w:tr>`;
  }).join("");
  return `<w:tbl><w:tblPr><w:tblW w:w="9100" w:type="dxa"/><w:tblLayout w:type="fixed"/><w:tblBorders><w:top w:val="nil"/><w:left w:val="nil"/><w:bottom w:val="single" w:sz="8" w:color="555555"/><w:right w:val="nil"/><w:insideH w:val="nil"/><w:insideV w:val="nil"/></w:tblBorders></w:tblPr><w:tblGrid><w:gridCol w:w="1800"/><w:gridCol w:w="7300"/></w:tblGrid>${rowXml}</w:tbl>`;
}
function defaultDateText(date = new Date()): string {
  return `SANTIAGO, ${date.getDate()} DE ${MONTHS[date.getMonth()]} DE ${date.getFullYear()}`;
}
function typeLabel(budget: CohortBudget): string {
  if (budget.program.type === "DOCTORADO") return "programa doctoral";
  if (budget.program.type === "MAGISTER_ACADEMICO") return "magíster académico";
  if (budget.program.type === "MAGISTER_PROFESIONAL") return "magíster profesional";
  return "programa de postgrado";
}
function totalTeachingHours(budget: CohortBudget, year: number): number {
  return budget.semesters.filter((semester) => semester.year === year).reduce((total, semester) => total + Math.max(0, semester.directTeachingHours) + Math.max(0, semester.synchronousTeachingHours) + Math.max(0, semester.asynchronousTeachingHours), 0);
}
function annualList(result: BudgetResult, label: (year: number, index: number) => string): string {
  return result.years.map((year, index) => label(year, index)).join(", ");
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
    greeting: "Estimado Vicerrector (s),",
    initials: "JRB/agv",
  };
}

export function buildMemorandumBody(budget: CohortBudget, result: BudgetResult, parameters: InstitutionalParameters, metadata = defaultMemorandumMetadata(budget)): string {
  const firstYear = result.years[0] ?? budget.startYear;
  const lastYear = result.years.at(-1) ?? firstYear;
  const firstAnnual = resolvedAnnualOverrideForYear(budget, parameters, firstYear);
  const totalIncome = sum(result.annualFlows.map((flow) => flow.totalIncome));
  const totalExpenses = sum(result.annualFlows.map((flow) => flow.totalExpenses));
  const totalResult = totalIncome - totalExpenses;
  const totalDiscounts = sum(result.annualFlows.map((flow) => flow.discounts + flow.internalTuitionScholarships));
  const totalMaintenance = sum(result.annualFlows.map((flow) => flow.scholarshipsAndAid));
  const totalOperational = sum(result.annualFlows.map((flow) => flow.otherExpenses + flow.equipment));
  const totalTeaching = sum(result.annualFlows.map((flow) => flow.directTeachingCost + flow.replacementTeachingCost));
  const totalAcademic = sum(result.annualFlows.map((flow) => flow.academicHonoraria));
  const totalStaff = sum(result.annualFlows.map((flow) => flow.nonAcademicHonoraria));
  const totalOverhead = sum(result.annualFlows.map((flow) => flow.centralOverhead + flow.facultyOverhead));
  const activeByYear = result.years.map((year) => {
    const periods = budget.semesters.filter((semester) => semester.year === year);
    return periods.length ? Math.max(...periods.map((semester) => semester.activeStudents)) : 0;
  });

  const intro = `Junto con saludar, remito para su revisión y aprobación la proyección presupuestaria correspondiente a la cohorte ${budget.startYear} del ${budget.program.name} (${budget.program.code}), considerando su ciclo regular de ejecución durante los años ${firstYear}${lastYear !== firstYear ? ` a ${lastYear}` : ""}. Con el objeto de facilitar su revisión y dejar claramente establecidos los supuestos contenidos en la formulación, se detallan a continuación los principales criterios de cálculo y su efecto en el flujo presupuestario.`;

  const incomeText = `La formulación considera ${budget.initialStudents} estudiante(s) al inicio de la cohorte. La proyección anual de estudiantes activos es ${annualList(result, (year, index) => `${activeByYear[index]} en ${year}`)}. El arancel bruto proyectado asciende a ${annualList(result, (year, index) => `${money(result.annualFlows[index].grossTuition)} en ${year}`)}. Las becas y descuentos de arancel totalizan ${money(totalDiscounts)} durante el ciclo, mientras que la incobrabilidad proyectada alcanza ${money(sum(result.annualFlows.map((flow) => flow.badDebt)))}. Los ingresos presupuestarios efectivos, excluyendo la matrícula informativa, corresponden a ${annualList(result, (year, index) => `${money(result.annualFlows[index].totalIncome)} en ${year}`)}.`;

  const baseText = `Para ${firstYear} se utiliza un arancel anual de ${money(firstAnnual.annualTuition)}, matrícula anual de ${money(firstAnnual.annualEnrollmentFee)}, valor hora de docencia de ${money(firstAnnual.directTeachingHourValue)}, guía o revisión de tesis de ${money(firstAnnual.thesisGuidancePerGraduatingStudent)} por estudiante cuando corresponde, Dirección de Programa por ${money(firstAnnual.annualDirection)} y Asistencia de Dirección por ${money(firstAnnual.annualAssistance)}. La incobrabilidad aplicada es ${(result.annualFlows[0]?.badDebt && result.annualFlows[0]?.tuitionAfterBenefits ? (result.annualFlows[0].badDebt / result.annualFlows[0].tuitionAfterBenefits) * 100 : 0).toLocaleString("es-CL", { maximumFractionDigits: 1 })}%. Los valores de años posteriores corresponden a los parámetros efectivos registrados en la formulación.`;

  const teachingText = `La programación académica contempla ${annualList(result, (year) => `${totalTeachingHours(budget, year).toLocaleString("es-CL")} horas en ${year}`)}, con costos directos de docencia y reemplazo por ${annualList(result, (year, index) => `${money(result.annualFlows[index].directTeachingCost + result.annualFlows[index].replacementTeachingCost)} en ${year}`)}. Considerando además guía o revisión de tesis cuando corresponde, los honorarios académicos del ciclo ascienden a ${money(totalAcademic)}.`;

  const staffText = `Los honorarios no académicos asociados a Dirección, Asistencia de Dirección y otros apoyos totalizan ${money(totalStaff)} en el período. Los prorrateos aplicados en cada año corresponden a las tasas efectivas registradas en la formulación. Asimismo, los overhead central y de facultad totalizan ${money(totalOverhead)} durante el ciclo y se calculan sobre la base presupuestaria definida para cada ejercicio.`;

  const aidText = totalMaintenance > 0 ? `Las becas de manutención y otras ayudas incorporadas al presupuesto representan ${money(totalMaintenance)} durante el horizonte de ejecución, de acuerdo con la cantidad de estudiantes, meses y valores mensuales registrados en cada período.` : "";
  const operationsText = totalOperational > 0 ? `Los gastos operacionales, software, difusión, congresos o pasantías, bibliografía, pasajes, viáticos, alimentos y bebidas, equipamiento y otras partidas de operación registradas suman ${money(totalOperational)} durante el ciclo, distribuidos conforme a los años y periodicidades definidos en el presupuesto.` : "";

  const resultText = `Con los supuestos actualmente contenidos en la formulación, los costos y gastos totales ascienden a ${annualList(result, (year, index) => `${money(result.annualFlows[index].totalExpenses)} en ${year}`)}, mientras que los ingresos proyectados alcanzan ${annualList(result, (year, index) => `${money(result.annualFlows[index].totalIncome)} en ${year}`)}. Los flujos netos anuales son ${annualList(result, (year, index) => `${money(result.annualFlows[index].netFlow)} en ${year}`)}. En términos acumulados, el ciclo proyecta ingresos por ${money(totalIncome)}, costos por ${money(totalExpenses)} y un resultado económico de ${money(totalResult)}. Este resultado refleja la estructura de ingresos, beneficios, costos y financiamiento registrada para este ${typeLabel(budget)}.`;

  const closing = `En consideración a lo anterior, agradeceré revisar y aprobar la proyección presupuestaria que se acompaña, teniendo presentes los criterios y condiciones señalados, a fin de avanzar oportunamente con las acciones administrativas, académicas y presupuestarias requeridas para la ejecución de la cohorte ${budget.startYear} del ${budget.program.name}.`;

  const bullets = [
    bullet("Flujo de estudiantes e ingresos", incomeText),
    bullet("Valores base y reajustes", baseText),
    bullet("Costos académicos y docencia", teachingText),
    bullet("Prorrateos, staff y overhead", staffText),
    ...(aidText ? [bullet("Becas y ayudas", aidText)] : []),
    ...(operationsText ? [bullet("Costos de operación", operationsText)] : []),
  ].join("");

  return [
    `<w:tbl><w:tblPr><w:tblW w:w="9100" w:type="dxa"/><w:tblBorders><w:top w:val="single" w:sz="8" w:color="777777"/><w:left w:val="single" w:sz="8" w:color="777777"/><w:bottom w:val="single" w:sz="8" w:color="777777"/><w:right w:val="single" w:sz="8" w:color="777777"/><w:insideH w:val="nil"/><w:insideV w:val="nil"/></w:tblBorders></w:tblPr><w:tblGrid><w:gridCol w:w="9100"/></w:tblGrid><w:tr><w:tc><w:tcPr><w:tcW w:w="9100" w:type="dxa"/></w:tcPr>${paragraph([{ text: `MEMORÁNDUM N.º ${metadata.number}`, bold: false }], { align: "left", after: 0 })}</w:tc></w:tr></w:tbl>`,
    paragraph("", { after: 70 }),
    metadataTable(metadata),
    paragraph("", { after: 80 }),
    paragraph(metadata.greeting, { align: "left", after: 130 }),
    paragraph(intro, { align: "both", after: 100 }),
    paragraph("Los principales parámetros y criterios considerados son los siguientes:", { align: "left", after: 80 }),
    bullets,
    paragraph(resultText, { align: "both", before: 60, after: 100 }),
    paragraph(closing, { align: "both", after: 100 }),
    paragraph("Sin otro particular, le saluda atentamente,", { align: "left", after: 80 }),
    paragraph([{ text: metadata.senderName, bold: true }], { align: "right", after: 0 }),
    paragraph(metadata.senderRole, { align: "right", after: 100 }),
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
