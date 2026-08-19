import type { BudgetAnnualOverride, BudgetItem, DeliveryModality, SemesterParameters } from "@/lib/calculations/types";

export interface ImportedDiscount {
  name: string;
  percentage: number;
  students: number;
  startYear: number;
  startSemester: 1 | 2;
  endYear: number;
  endSemester: 1 | 2;
  note?: string;
}

export interface ImportedExternalIncome {
  type: string;
  description: string;
  year: number;
  semester: 1 | 2;
  students: number;
  amountPerStudent: number;
  source: string;
  note?: string;
}

export interface ImportedBudgetAnalysis {
  fileName: string;
  format: "xlsx" | "csv" | "json";
  sheetNames: string[];
  confidence: number;
  programCode?: string;
  programName?: string;
  cohortName?: string;
  programVersionLabel?: string;
  startYear?: number;
  startSemester?: 1 | 2;
  durationSemesters?: number;
  initialStudents?: number;
  deliveryModality?: DeliveryModality;
  annualValues: Array<Partial<BudgetAnnualOverride> & { year: number }>;
  semesters: Array<Partial<SemesterParameters> & { year: number; semester: 1 | 2 }>;
  discounts: ImportedDiscount[];
  externalIncome: ImportedExternalIncome[];
  costs: Array<Omit<BudgetItem, "id">>;
  recognized: Array<{ field: string; period: string; value: string; source: string }>;
  warnings: string[];
}

type CellValue = string | number | boolean | null;
type SheetMatrix = { name: string; rows: CellValue[][] };

const textDecoder = new TextDecoder("utf-8");
const normalize = (value: unknown) => String(value ?? "")
  .normalize("NFD")
  .replace(/[\u0300-\u036f]/g, "")
  .toLowerCase()
  .replace(/[^a-z0-9%]+/g, " ")
  .trim();

function asText(value: CellValue | undefined): string {
  return value == null ? "" : String(value).trim();
}

function numberValue(value: CellValue | undefined): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "boolean" || value == null) return null;
  let raw = String(value).trim();
  if (!raw) return null;
  const isPercent = raw.includes("%");
  raw = raw.replace(/\$/g, "").replace(/CLP/gi, "").replace(/%/g, "").replace(/\s/g, "");
  if (/^-?\d{1,3}(?:\.\d{3})+(?:,\d+)?$/.test(raw)) raw = raw.replace(/\./g, "").replace(",", ".");
  else if (/^-?\d+(?:,\d+)?$/.test(raw)) raw = raw.replace(",", ".");
  else raw = raw.replace(/,/g, "");
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) return null;
  return isPercent ? parsed / 100 : parsed;
}

function intValue(value: CellValue | undefined): number | null {
  const numeric = numberValue(value);
  return numeric == null ? null : Math.round(numeric);
}

function clampRate(value: number | null): number | null {
  if (value == null) return null;
  if (value > 1 && value <= 100) return value / 100;
  return Math.min(1, Math.max(0, value));
}

function periodFromText(value: unknown): { year: number; semester: 1 | 2 } | null {
  const text = String(value ?? "");
  const match = text.match(/(20\d{2})\s*[-\/ ]?\s*([12])\s*S?/i);
  if (!match) return null;
  return { year: Number(match[1]), semester: Number(match[2]) as 1 | 2 };
}

function yearFromText(value: unknown): number | null {
  if (typeof value === "number" && value >= 2000 && value <= 2100) return Math.round(value);
  const match = String(value ?? "").match(/\b(20\d{2})\b/);
  return match ? Number(match[1]) : null;
}

function modalityFromText(value: unknown): DeliveryModality | undefined {
  const key = normalize(value);
  if (key.includes("semipresencial")) return "SEMIPRESENCIAL";
  if (key.includes("e learning") || key.includes("elearning") || key.includes("online")) return "E_LEARNING";
  if (key.includes("presencial")) return "PRESENCIAL";
  return undefined;
}

function parseCsv(text: string): CellValue[][] {
  const delimiter = (() => {
    const firstLine = text.split(/\r?\n/, 1)[0] ?? "";
    return (firstLine.match(/;/g)?.length ?? 0) > (firstLine.match(/,/g)?.length ?? 0) ? ";" : ",";
  })();
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (char === '"') {
      if (quoted && text[index + 1] === '"') { field += '"'; index += 1; }
      else quoted = !quoted;
    } else if (char === delimiter && !quoted) {
      row.push(field); field = "";
    } else if ((char === "\n" || char === "\r") && !quoted) {
      if (char === "\r" && text[index + 1] === "\n") index += 1;
      row.push(field); rows.push(row); row = []; field = "";
    } else field += char;
  }
  if (field || row.length) { row.push(field); rows.push(row); }
  return rows;
}

function columnIndex(reference: string): number {
  const letters = reference.match(/^[A-Z]+/i)?.[0]?.toUpperCase() ?? "A";
  let result = 0;
  for (const char of letters) result = result * 26 + char.charCodeAt(0) - 64;
  return result - 1;
}

interface ZipEntry { method: number; compressedSize: number; localOffset: number }

function zipEntries(buffer: ArrayBuffer): Map<string, ZipEntry> {
  const view = new DataView(buffer);
  const bytes = new Uint8Array(buffer);
  let eocd = -1;
  const minimum = Math.max(0, bytes.length - 65_557);
  for (let offset = bytes.length - 22; offset >= minimum; offset -= 1) {
    if (view.getUint32(offset, true) === 0x06054b50) { eocd = offset; break; }
  }
  if (eocd < 0) throw new Error("El archivo XLSX no contiene un directorio ZIP válido.");
  const count = view.getUint16(eocd + 10, true);
  let offset = view.getUint32(eocd + 16, true);
  const entries = new Map<string, ZipEntry>();
  for (let index = 0; index < count; index += 1) {
    if (view.getUint32(offset, true) !== 0x02014b50) throw new Error("El XLSX contiene una estructura ZIP no reconocida.");
    const method = view.getUint16(offset + 10, true);
    const compressedSize = view.getUint32(offset + 20, true);
    const fileNameLength = view.getUint16(offset + 28, true);
    const extraLength = view.getUint16(offset + 30, true);
    const commentLength = view.getUint16(offset + 32, true);
    const localOffset = view.getUint32(offset + 42, true);
    const name = textDecoder.decode(bytes.slice(offset + 46, offset + 46 + fileNameLength));
    entries.set(name.replace(/^\//, ""), { method, compressedSize, localOffset });
    offset += 46 + fileNameLength + extraLength + commentLength;
  }
  return entries;
}

async function readZipText(buffer: ArrayBuffer, entries: Map<string, ZipEntry>, path: string): Promise<string | null> {
  const entry = entries.get(path.replace(/^\//, ""));
  if (!entry) return null;
  const view = new DataView(buffer);
  if (view.getUint32(entry.localOffset, true) !== 0x04034b50) throw new Error(`Entrada XLSX inválida: ${path}`);
  const nameLength = view.getUint16(entry.localOffset + 26, true);
  const extraLength = view.getUint16(entry.localOffset + 28, true);
  const start = entry.localOffset + 30 + nameLength + extraLength;
  const compressedBuffer = buffer.slice(start, start + entry.compressedSize);
  const compressed = new Uint8Array(compressedBuffer);
  if (entry.method === 0) return textDecoder.decode(compressed);
  if (entry.method !== 8) throw new Error(`Método de compresión XLSX no soportado (${entry.method}).`);
  const stream = new Blob([compressedBuffer]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
  return textDecoder.decode(await new Response(stream).arrayBuffer());
}

function xmlDocument(xml: string, description: string): Document {
  const document = new DOMParser().parseFromString(xml, "application/xml");
  if (document.querySelector("parsererror")) throw new Error(`No fue posible leer ${description} del XLSX.`);
  return document;
}

async function parseXlsx(buffer: ArrayBuffer): Promise<SheetMatrix[]> {
  const entries = zipEntries(buffer);
  const workbookXml = await readZipText(buffer, entries, "xl/workbook.xml");
  const relationsXml = await readZipText(buffer, entries, "xl/_rels/workbook.xml.rels");
  if (!workbookXml || !relationsXml) throw new Error("El XLSX no contiene workbook.xml o sus relaciones.");
  const workbook = xmlDocument(workbookXml, "el libro");
  const relations = xmlDocument(relationsXml, "las relaciones del libro");
  const relationMap = new Map<string, string>();
  for (const relation of Array.from(relations.getElementsByTagName("Relationship"))) {
    const id = relation.getAttribute("Id");
    const target = relation.getAttribute("Target");
    if (id && target) relationMap.set(id, target);
  }
  const sharedXml = await readZipText(buffer, entries, "xl/sharedStrings.xml");
  const shared = sharedXml
    ? Array.from(xmlDocument(sharedXml, "los textos compartidos").getElementsByTagName("si")).map((item) => item.textContent ?? "")
    : [];
  const output: SheetMatrix[] = [];
  for (const sheet of Array.from(workbook.getElementsByTagName("sheet"))) {
    const name = sheet.getAttribute("name") ?? "Hoja";
    const relationId = sheet.getAttribute("r:id") ?? sheet.getAttributeNS("http://schemas.openxmlformats.org/officeDocument/2006/relationships", "id");
    const target = relationId ? relationMap.get(relationId) : null;
    if (!target) continue;
    const normalizedTarget = target.startsWith("/") ? target.slice(1) : target.startsWith("xl/") ? target : `xl/${target.replace(/^\.\//, "")}`;
    const sheetXml = await readZipText(buffer, entries, normalizedTarget);
    if (!sheetXml) continue;
    const document = xmlDocument(sheetXml, `la hoja ${name}`);
    const rows: CellValue[][] = [];
    for (const rowNode of Array.from(document.getElementsByTagName("row"))) {
      const row: CellValue[] = [];
      for (const cell of Array.from(rowNode.getElementsByTagName("c"))) {
        const ref = cell.getAttribute("r") ?? "A1";
        const index = columnIndex(ref);
        const type = cell.getAttribute("t") ?? "n";
        const raw = cell.getElementsByTagName("v")[0]?.textContent ?? "";
        let value: CellValue = raw;
        if (type === "s") value = shared[Number(raw)] ?? "";
        else if (type === "inlineStr") value = cell.getElementsByTagName("is")[0]?.textContent ?? "";
        else if (type === "b") value = raw === "1";
        else if (type === "n" || !type) value = raw === "" ? null : Number(raw);
        row[index] = value;
      }
      rows.push(row);
    }
    output.push({ name, rows });
  }
  return output;
}

const annualAliases: Array<[RegExp, keyof Omit<BudgetAnnualOverride, "year">, boolean?]> = [
  [/^arancel anual(?: por estudiante)?$/, "annualTuition"],
  [/^matricula anual(?: por estudiante)?$/, "annualEnrollmentFee"],
  [/hora docencia sincr|hora sincronica/, "synchronousTeachingHourValue"],
  [/hora docencia asincr|hora asincronica/, "asynchronousTeachingHourValue"],
  [/hora docencia presencial|hora docente directa/, "directTeachingHourValue"],
  [/beca de manutencion mensual/, "maintenanceScholarshipMonthlyValue"],
  [/guia de tesis/, "thesisGuidancePerGraduatingStudent"],
  [/^direccion anual base$|^direccion base$/, "annualDirection"],
  [/asistencia de direccion anual base|asistencia base/, "annualAssistance"],
  [/otros honorarios no academicos anuales base|otros honorarios no academicos$/, "annualOtherNonAcademicHonoraria"],
  [/gastos operacionales.*bienes y servicios|^gastos operacionales$/, "annualOperational"],
  [/software y licencias|^software$/, "annualSoftware"],
  [/^difusion(?: y admision)?$/, "annualDiffusion"],
  [/congresos y pasantias/, "annualCongressesInternships"],
  [/libros y publicaciones/, "annualBooksPublications"],
  [/pasajes y fletes/, "annualTravelFreight"],
  [/^viaticos$/, "annualPerDiem"],
  [/alimentos y bebidas/, "annualFoodBeverages"],
  [/otros costos y gastos/, "annualOtherCosts"],
  [/overhead central/, "centralOverheadRate", true],
  [/overhead facultad/, "facultyOverheadRate", true],
];

const semesterAliases: Array<[RegExp, keyof Omit<SemesterParameters, "year" | "semester" | "notes">, boolean?]> = [
  [/^estudiantes activos$/, "activeStudents"],
  [/estudiantes en graduacion/, "graduatingStudents"],
  [/horas docentes presenciales|horas docentes directas/, "directTeachingHours"],
  [/horas docentes sincronicas/, "synchronousTeachingHours"],
  [/horas docentes asincronicas/, "asynchronousTeachingHours"],
  [/horas docentes de reemplazo/, "replacementTeachingHours"],
  [/asignaturas electivas/, "electiveSubjects"],
  [/secciones de electivos/, "electiveSections"],
  [/cursos especializados/, "specializedCourses"],
  [/secciones de cursos especializados/, "specializedSections"],
  [/estudiantes con beca interna de arancel/, "internalTuitionScholarshipStudents"],
  [/cobertura de beca interna de arancel/, "internalTuitionScholarshipCoverage", true],
  [/estudiantes con beca de manutencion/, "maintenanceScholarshipStudents"],
  [/meses de beca de manutencion/, "maintenanceScholarshipMonths"],
];


function canonicalCostCategoryText(value: unknown): BudgetItem["category"] {
  const key = normalize(value);
  if (key.includes("equipamiento") || key.includes("bien de capital")) return "Equipamiento";
  if (key.includes("beca") || key.includes("ayuda")) return "Becas y ayudas";
  if (key.includes("alimento") || key.includes("coffee") || key.includes("bebida")) return "Alimentos y bebidas";
  if (key.includes("pasaje") || key.includes("flete")) return "Pasajes y fletes";
  if (key.includes("viatico")) return "Viáticos";
  if (key.includes("libro") || key.includes("publicacion")) return "Libros y publicaciones";
  if (key.includes("congreso") || key.includes("pasantia")) return "Congresos y pasantías";
  if (key.includes("difusion") || key.includes("admision")) return "Difusión";
  if (key.includes("software") || key.includes("licencia")) return "Software y licencias";
  if (key.includes("operacional") || key.includes("bien y servicio") || key.includes("bienes y servicios") || key.includes("gasto menor")) return "Gastos operacionales / Bienes y servicios";
  if (key.includes("direccion")) return "Dirección";
  if (key.includes("asistencia")) return "Asistencia de dirección";
  if (key.includes("honorario") || key.includes("staff") || key.includes("tutoria")) return "Otros honorarios no académicos";
  return "Otros costos y gastos";
}

function importedPeriodRange(analysis: ImportedBudgetAnalysis): { startYear: number; startSemester: 1 | 2; endYear: number; endSemester: 1 | 2 } | null {
  if (!analysis.startYear || !analysis.startSemester) return null;
  const duration = Math.max(1, Math.round(analysis.durationSemesters ?? analysis.semesters.length ?? 1));
  const ordinal = analysis.startYear * 2 + (analysis.startSemester - 1) + duration - 1;
  return {
    startYear: analysis.startYear,
    startSemester: analysis.startSemester,
    endYear: Math.floor(ordinal / 2),
    endSemester: ((ordinal % 2) + 1) as 1 | 2,
  };
}

function firstColumnMatching(headers: string[], patterns: RegExp[]): number {
  return headers.findIndex((header) => patterns.some((pattern) => pattern.test(header)));
}

function analyzeGenericDiscountTable(analysis: ImportedBudgetAnalysis, sheet: SheetMatrix) {
  for (let headerIndex = 0; headerIndex < sheet.rows.length; headerIndex += 1) {
    const headers = sheet.rows[headerIndex].map(normalize);
    const percentageCol = firstColumnMatching(headers, [/porcentaje/, /^%$/, /descuento %/, /beneficio %/]);
    const studentsCol = firstColumnMatching(headers, [/estudiantes/, /cantidad/, /^n$/]);
    const nameCol = firstColumnMatching(headers, [/nombre/, /tipo de descuento/, /^descuento$/, /beneficio/, /concepto/]);
    if (percentageCol < 0 || studentsCol < 0 || nameCol < 0) continue;
    const startCol = firstColumnMatching(headers, [/inicio/, /desde/]);
    const endCol = firstColumnMatching(headers, [/termino/, /fin/, /hasta/]);
    const periodCol = firstColumnMatching(headers, [/periodo/, /vigencia/]);
    const noteCol = firstColumnMatching(headers, [/observacion/, /nota/]);
    let found = 0;
    for (const row of sheet.rows.slice(headerIndex + 1)) {
      const name = asText(row[nameCol]);
      const percentage = clampRate(numberValue(row[percentageCol]));
      const students = intValue(row[studentsCol]);
      if (!name && percentage == null && students == null) { if (found) break; else continue; }
      if (!name || percentage == null || students == null) continue;
      const combinedPeriod = periodCol >= 0 ? asText(row[periodCol]) : "";
      const rangeMatch = combinedPeriod.match(/(20\d{2})\D*([12])\s*S?.*?(20\d{2})\D*([12])\s*S?/i);
      const start = startCol >= 0 ? periodFromText(row[startCol]) : null;
      const end = endCol >= 0 ? periodFromText(row[endCol]) : null;
      const fallback = importedPeriodRange(analysis);
      const range = rangeMatch ? {
        startYear: Number(rangeMatch[1]), startSemester: Number(rangeMatch[2]) as 1 | 2,
        endYear: Number(rangeMatch[3]), endSemester: Number(rangeMatch[4]) as 1 | 2,
      } : start && end ? { startYear: start.year, startSemester: start.semester, endYear: end.year, endSemester: end.semester } : fallback;
      if (!range) continue;
      analysis.discounts.push({ name, percentage, students, ...range, note: noteCol >= 0 ? asText(row[noteCol]) || undefined : undefined });
      recognize(analysis, `Descuento: ${name}`, `${range.startYear}-${range.startSemester}S → ${range.endYear}-${range.endSemester}S`, percentage, `${sheet.name}: tabla de descuentos`);
      found += 1;
    }
    if (found) return;
  }
}

function analyzeGenericCostTable(analysis: ImportedBudgetAnalysis, sheet: SheetMatrix) {
  for (let headerIndex = 0; headerIndex < sheet.rows.length; headerIndex += 1) {
    const headers = sheet.rows[headerIndex].map(normalize);
    const amountCol = firstColumnMatching(headers, [/^monto$/, /valor/, /importe/, /costo/]);
    const nameCol = firstColumnMatching(headers, [/nombre/, /descripcion/, /concepto/, /costo gasto/, /item/]);
    const categoryCol = firstColumnMatching(headers, [/categoria/, /tipo de gasto/, /clasificacion/]);
    if (amountCol < 0 || nameCol < 0 || categoryCol < 0) continue;
    const yearCol = firstColumnMatching(headers, [/^ano$/, /periodo/, /ejercicio/]);
    const periodicityCol = firstColumnMatching(headers, [/periodicidad/, /frecuencia/]);
    const scopeCol = firstColumnMatching(headers, [/alcance/, /tipo de costo/, /compartido/]);
    const noteCol = firstColumnMatching(headers, [/observacion/, /nota/]);
    let found = 0;
    for (const row of sheet.rows.slice(headerIndex + 1)) {
      const name = asText(row[nameCol]);
      const amount = numberValue(row[amountCol]);
      if (!name && amount == null) { if (found) break; else continue; }
      if (!name || amount == null) continue;
      const period = yearCol >= 0 ? periodFromText(row[yearCol]) : null;
      const year = (yearCol >= 0 ? yearFromText(row[yearCol]) : null) ?? period?.year ?? analysis.startYear ?? new Date().getFullYear();
      const periodicityText = periodicityCol >= 0 ? normalize(row[periodicityCol]) : "";
      const periodicity: BudgetItem["periodicity"] = periodicityText.includes("anual") ? "Anual" : periodicityText.includes("semes") ? "Semestral" : "Único";
      const scopeText = scopeCol >= 0 ? normalize(row[scopeCol]) : "";
      const costType: BudgetItem["costType"] = scopeText.includes("compart") ? "Compartido con otras cohortes" : "Único de esta versión";
      const category = canonicalCostCategoryText(row[categoryCol]);
      analysis.costs.push({ name, description: "", category, year, semester: period?.semester ?? 1, amount, costType, periodicity, note: noteCol >= 0 ? asText(row[noteCol]) || undefined : undefined });
      recognize(analysis, `Costo: ${name}`, String(year), amount, `${sheet.name}: tabla de costos`);
      found += 1;
    }
    if (found) return;
  }
}

function analyzeGenericIncomeTable(analysis: ImportedBudgetAnalysis, sheet: SheetMatrix) {
  for (let headerIndex = 0; headerIndex < sheet.rows.length; headerIndex += 1) {
    const headers = sheet.rows[headerIndex].map(normalize);
    const descriptionCol = firstColumnMatching(headers, [/descripcion/, /concepto/, /nombre/]);
    const amountCol = firstColumnMatching(headers, [/monto unitario/, /valor unitario/, /^monto$/, /^valor$/]);
    const sourceCol = firstColumnMatching(headers, [/fuente/, /origen/]);
    if (descriptionCol < 0 || amountCol < 0 || sourceCol < 0) continue;
    const typeCol = firstColumnMatching(headers, [/^tipo$/, /tipo de ingreso/]);
    const periodCol = firstColumnMatching(headers, [/periodo/, /semestre/, /^ano$/]);
    const studentsCol = firstColumnMatching(headers, [/estudiantes/, /cantidad/]);
    let found = 0;
    for (const row of sheet.rows.slice(headerIndex + 1)) {
      const description = asText(row[descriptionCol]);
      const amount = numberValue(row[amountCol]);
      const source = asText(row[sourceCol]);
      if (!description && amount == null && !source) { if (found) break; else continue; }
      if (!description || amount == null) continue;
      const period = periodCol >= 0 ? periodFromText(row[periodCol]) : null;
      const year = (periodCol >= 0 ? yearFromText(row[periodCol]) : null) ?? period?.year ?? analysis.startYear;
      if (!year) continue;
      const semester = period?.semester ?? 1;
      const students = Math.max(1, studentsCol >= 0 ? (intValue(row[studentsCol]) ?? 1) : 1);
      analysis.externalIncome.push({ type: typeCol >= 0 ? asText(row[typeCol]) || "Ingreso extraordinario" : "Ingreso extraordinario", description, year, semester, students, amountPerStudent: amount, source: source || "Archivo importado" });
      recognize(analysis, `Ingreso: ${description}`, `${year}-${semester}S`, amount, `${sheet.name}: tabla de ingresos`);
      found += 1;
    }
    if (found) return;
  }
}

function makeAnalysis(fileName: string, format: ImportedBudgetAnalysis["format"], sheetNames: string[]): ImportedBudgetAnalysis {
  return { fileName, format, sheetNames, confidence: 0, annualValues: [], semesters: [], discounts: [], externalIncome: [], costs: [], recognized: [], warnings: [] };
}

function getAnnual(analysis: ImportedBudgetAnalysis, year: number) {
  let record = analysis.annualValues.find((item) => item.year === year);
  if (!record) { record = { year }; analysis.annualValues.push(record); }
  return record;
}

function getSemester(analysis: ImportedBudgetAnalysis, year: number, semester: 1 | 2) {
  let record = analysis.semesters.find((item) => item.year === year && item.semester === semester);
  if (!record) { record = { year, semester }; analysis.semesters.push(record); }
  return record;
}

function recognize(analysis: ImportedBudgetAnalysis, field: string, period: string, value: unknown, source: string) {
  analysis.recognized.push({ field, period, value: String(value ?? ""), source });
}

function applyIdentification(analysis: ImportedBudgetAnalysis, parameter: string, value: CellValue, source: string) {
  const key = normalize(parameter);
  const text = asText(value);
  const numeric = intValue(value);
  if (key === "programa") { analysis.programName = text; recognize(analysis, "Programa", "General", text, source); }
  else if (key === "codigo del programa" || key === "codigo programa") { analysis.programCode = text; recognize(analysis, "Código programa", "General", text, source); }
  else if (key === "cohorte") { analysis.cohortName = text; recognize(analysis, "Cohorte", "General", text, source); }
  else if (key.includes("version del programa") || key === "version") { analysis.programVersionLabel = text; recognize(analysis, "Versión programa", "General", text, source); }
  else if (key === "ano de inicio" && numeric) { analysis.startYear = numeric; recognize(analysis, "Año inicio", "General", numeric, source); }
  else if (key === "semestre de inicio" && (numeric === 1 || numeric === 2)) { analysis.startSemester = numeric; recognize(analysis, "Semestre inicio", "General", numeric, source); }
  else if (key.includes("duracion presupuestada") && numeric) { analysis.durationSemesters = numeric; recognize(analysis, "Duración", "General", numeric, source); }
  else if (key === "estudiantes iniciales" && numeric != null) { analysis.initialStudents = numeric; recognize(analysis, "Estudiantes iniciales", "General", numeric, source); }
  else if (key === "modalidad") { const modality = modalityFromText(text); if (modality) { analysis.deliveryModality = modality; recognize(analysis, "Modalidad", "General", modality, source); } }
}

function analyzeParameterRows(analysis: ImportedBudgetAnalysis, sheet: SheetMatrix): boolean {
  const headerIndex = sheet.rows.findIndex((row) => {
    const keys = row.map(normalize);
    return keys.includes("seccion") && keys.includes("parametro") && keys.includes("periodo") && keys.includes("valor");
  });
  if (headerIndex < 0) return false;
  const header = sheet.rows[headerIndex].map(normalize);
  const sectionCol = header.indexOf("seccion");
  const parameterCol = header.indexOf("parametro");
  const periodCol = header.indexOf("periodo");
  const valueCol = header.indexOf("valor");
  const detailCol = header.indexOf("detalle");

  for (const row of sheet.rows.slice(headerIndex + 1)) {
    const section = asText(row[sectionCol]);
    const parameter = asText(row[parameterCol]);
    const period = asText(row[periodCol]);
    const value = row[valueCol];
    const detail = detailCol >= 0 ? asText(row[detailCol]) : "";
    if (!parameter) continue;
    const normalizedSection = normalize(section);
    const normalizedParameter = normalize(parameter);
    const source = `${sheet.name}: ${parameter}`;

    if (normalizedSection === "identificacion") {
      applyIdentification(analysis, parameter, value, source);
      continue;
    }
    if (normalizedSection === "parametros anuales") {
      const year = yearFromText(period);
      if (!year) continue;
      for (const [pattern, key, percent] of annualAliases) {
        if (!pattern.test(normalizedParameter)) continue;
        const numeric = numberValue(value);
        if (numeric == null) break;
        const effective = percent ? clampRate(numeric) : numeric;
        if (effective != null) (getAnnual(analysis, year) as unknown as Record<string, unknown>)[key] = effective;
        recognize(analysis, parameter, period, effective, source);
        break;
      }
      continue;
    }
    if (normalizedSection === "parametros semestrales") {
      const parsedPeriod = periodFromText(period);
      if (!parsedPeriod) continue;
      for (const [pattern, key, percent] of semesterAliases) {
        if (!pattern.test(normalizedParameter)) continue;
        const numeric = numberValue(value);
        if (numeric == null) break;
        const effective = percent ? clampRate(numeric) : numeric;
        if (effective != null) (getSemester(analysis, parsedPeriod.year, parsedPeriod.semester) as Record<string, unknown>)[key] = effective;
        recognize(analysis, parameter, period, effective, source);
        break;
      }
      if (/observaciones del periodo/.test(normalizedParameter)) getSemester(analysis, parsedPeriod.year, parsedPeriod.semester).notes = asText(value);
      continue;
    }
    if (normalizedSection === "descuentos de arancel" && /^descuento \d+/.test(normalizedParameter)) {
      const percentage = clampRate(numberValue(value));
      const range = period.match(/(20\d{2})\D*([12])\s*S?.*?(20\d{2})\D*([12])\s*S?/i);
      const students = Number(detail.match(/(\d+)\s+estudiante/i)?.[1] ?? 0);
      if (percentage != null && range) {
        analysis.discounts.push({
          name: parameter.replace(/^Descuento\s+\d+\s*:\s*/i, "") || "Descuento importado",
          percentage,
          students,
          startYear: Number(range[1]), startSemester: Number(range[2]) as 1 | 2,
          endYear: Number(range[3]), endSemester: Number(range[4]) as 1 | 2,
          note: detail || undefined,
        });
        recognize(analysis, parameter, period, percentage, source);
      }
      continue;
    }
    if (normalizedSection === "ingresos extraordinarios" && !normalizedParameter.includes("ingresos registrados")) {
      const parsedPeriod = periodFromText(period);
      const amount = numberValue(value);
      if (parsedPeriod && amount != null) {
        const students = Number(detail.match(/(\d+)\s+estudiante/i)?.[1] ?? 1);
        const sourceName = detail.match(/Fuente:\s*([^·]+)/i)?.[1]?.trim() ?? "Archivo importado";
        analysis.externalIncome.push({ type: "Ingreso extraordinario", description: parameter.replace(/^\d+\.\s*/, ""), ...parsedPeriod, students, amountPerStudent: amount, source: sourceName, note: detail || undefined });
        recognize(analysis, parameter, period, amount, source);
      }
      continue;
    }
    if (normalizedSection === "costos y gastos registrados" && !normalizedParameter.includes("costos manuales")) {
      const parsedPeriod = periodFromText(period) ?? { year: analysis.startYear ?? new Date().getFullYear(), semester: 1 as 1 | 2 };
      const amount = numberValue(value);
      if (amount != null) {
        const parts = detail.split("·").map((item) => item.trim()).filter(Boolean);
        const category = (parts[0] || "Otros costos y gastos") as BudgetItem["category"];
        const periodicity = (["Único", "Semestral", "Anual"].find((item) => parts.includes(item)) ?? "Único") as BudgetItem["periodicity"];
        const costType = (parts.find((item) => item.includes("Compartido")) ? "Compartido con otras cohortes" : "Único de esta versión") as BudgetItem["costType"];
        analysis.costs.push({ name: parameter.replace(/^\d+\.\s*/, ""), description: "", category, year: parsedPeriod.year, semester: parsedPeriod.semester, amount, costType, periodicity, note: detail || undefined });
        recognize(analysis, parameter, period, amount, source);
      }
    }
  }
  return true;
}

function analyzeGenericSheet(analysis: ImportedBudgetAnalysis, sheet: SheetMatrix) {
  // Pares etiqueta-valor para identificación y parámetros únicos.
  for (const row of sheet.rows) {
    const nonEmpty = row.map((value, index) => ({ value, index })).filter(({ value }) => asText(value) !== "");
    if (nonEmpty.length >= 2) applyIdentification(analysis, asText(nonEmpty[0].value), nonEmpty[1].value, `${sheet.name}: fila libre`);
  }

  // Detecta una cabecera con años y asocia filas de parámetros anuales por posición.
  let yearHeader: { rowIndex: number; columns: Array<{ index: number; year: number }> } | null = null;
  for (let rowIndex = 0; rowIndex < sheet.rows.length; rowIndex += 1) {
    const row = sheet.rows[rowIndex];
    const columns = row.map((value, index) => ({ index, year: yearFromText(value) })).filter((item): item is { index: number; year: number } => Boolean(item.year));
    if (columns.length && (!yearHeader || columns.length > yearHeader.columns.length)) yearHeader = { rowIndex, columns };
  }
  if (yearHeader) {
    for (const row of sheet.rows.slice(yearHeader.rowIndex + 1)) {
      const label = normalize(row.find((value) => asText(value) !== "") ?? "");
      for (const [pattern, key, percent] of annualAliases) {
        if (!pattern.test(label)) continue;
        for (const { index, year } of yearHeader.columns) {
          const numeric = numberValue(row[index]);
          if (numeric == null) continue;
          const effective = percent ? clampRate(numeric) : numeric;
          if (effective != null) (getAnnual(analysis, year) as unknown as Record<string, unknown>)[key] = effective;
          recognize(analysis, String(row[0] ?? key), String(year), effective, `${sheet.name}: tabla anual`);
        }
      }
    }
  }

  // Detecta tablas semestrales con columna Periodo + campos conocidos.
  sheet.rows.forEach((row, rowIndex) => {
    const normalized = row.map(normalize);
    const periodCol = normalized.findIndex((value) => value === "periodo" || value === "semestre");
    const activeCol = normalized.findIndex((value) => value.includes("estudiantes activos"));
    if (periodCol < 0 || activeCol < 0) return;
    for (const dataRow of sheet.rows.slice(rowIndex + 1)) {
      const parsed = periodFromText(dataRow[periodCol]);
      if (!parsed) break;
      const semester = getSemester(analysis, parsed.year, parsed.semester);
      normalized.forEach((label, column) => {
        for (const [pattern, key, percent] of semesterAliases) {
          if (!pattern.test(label)) continue;
          const numeric = numberValue(dataRow[column]);
          if (numeric == null) continue;
          const effective = percent ? clampRate(numeric) : numeric;
          if (effective != null) (semester as unknown as Record<string, unknown>)[key] = effective;
          recognize(analysis, label, `${parsed.year}-${parsed.semester}S`, effective, `${sheet.name}: tabla semestral`);
        }
      });
    }
  });

  analyzeGenericDiscountTable(analysis, sheet);
  analyzeGenericCostTable(analysis, sheet);
  analyzeGenericIncomeTable(analysis, sheet);
}

function finalizeAnalysis(analysis: ImportedBudgetAnalysis) {
  analysis.annualValues.sort((a, b) => a.year - b.year);
  analysis.semesters.sort((a, b) => a.year * 2 + a.semester - (b.year * 2 + b.semester));
  analysis.discounts = [...new Map(analysis.discounts.map((item) => [`${normalize(item.name)}|${item.percentage}|${item.students}|${item.startYear}-${item.startSemester}|${item.endYear}-${item.endSemester}`, item])).values()];
  analysis.externalIncome = [...new Map(analysis.externalIncome.map((item) => [`${normalize(item.description)}|${item.year}-${item.semester}|${item.amountPerStudent}|${item.source}`, item])).values()];
  analysis.costs = [...new Map(analysis.costs.map((item) => [`${normalize(item.name)}|${item.year}|${item.amount}|${item.category}`, item])).values()];
  if (!analysis.startYear && analysis.semesters.length) analysis.startYear = analysis.semesters[0].year;
  if (!analysis.startSemester && analysis.semesters.length) analysis.startSemester = analysis.semesters[0].semester;
  if (!analysis.durationSemesters && analysis.semesters.length) analysis.durationSemesters = analysis.semesters.length;
  if (analysis.initialStudents == null && analysis.semesters.length) analysis.initialStudents = Number(analysis.semesters[0].activeStudents ?? 0);
  const core = [analysis.programCode || analysis.programName, analysis.startYear, analysis.startSemester, analysis.durationSemesters, analysis.initialStudents].filter(Boolean).length;
  analysis.confidence = Math.min(100, Math.round(core * 10 + Math.min(50, analysis.recognized.length * 2)));
  if (!analysis.startYear) analysis.warnings.push("No se pudo identificar el año de inicio.");
  if (!analysis.initialStudents && analysis.initialStudents !== 0) analysis.warnings.push("No se pudo identificar la cantidad inicial de estudiantes.");
  if (!analysis.programCode && !analysis.programName) analysis.warnings.push("No se pudo identificar automáticamente el programa; deberá seleccionarlo manualmente.");
  if (!analysis.annualValues.some((item) => Number(item.annualTuition) > 0)) analysis.warnings.push("No se identificó un arancel anual; se utilizará el arancel vigente del programa seleccionado.");
  return analysis;
}

function analyzeSheets(fileName: string, format: ImportedBudgetAnalysis["format"], sheets: SheetMatrix[]): ImportedBudgetAnalysis {
  const analysis = makeAnalysis(fileName, format, sheets.map((sheet) => sheet.name));
  let exact = false;
  for (const sheet of sheets) if (normalize(sheet.name).includes("parametros completos")) exact = analyzeParameterRows(analysis, sheet) || exact;
  if (!exact) {
    for (const sheet of sheets) exact = analyzeParameterRows(analysis, sheet) || exact;
  }
  for (const sheet of sheets) analyzeGenericSheet(analysis, sheet);
  return finalizeAnalysis(analysis);
}

function analysisFromJson(fileName: string, value: unknown): ImportedBudgetAnalysis {
  const analysis = makeAnalysis(fileName, "json", ["JSON"]);
  const root = (typeof value === "object" && value !== null && "budget" in value ? (value as { budget: unknown }).budget : value) as Record<string, unknown>;
  if (!root || typeof root !== "object") throw new Error("El JSON no contiene un objeto de presupuesto reconocible.");
  analysis.programCode = typeof root.programCode === "string" ? root.programCode : undefined;
  if (typeof root.program === "object" && root.program) {
    const program = root.program as Record<string, unknown>;
    analysis.programCode ??= typeof program.code === "string" ? program.code : undefined;
    analysis.programName = typeof program.name === "string" ? program.name : undefined;
  }
  analysis.cohortName = typeof root.cohortName === "string" ? root.cohortName : undefined;
  analysis.programVersionLabel = typeof root.programVersionLabel === "string" ? root.programVersionLabel : undefined;
  analysis.startYear = typeof root.startYear === "number" ? root.startYear : undefined;
  analysis.startSemester = root.startSemester === 1 || root.startSemester === 2 ? root.startSemester : undefined;
  analysis.durationSemesters = typeof root.durationSemesters === "number" ? root.durationSemesters : undefined;
  analysis.initialStudents = typeof root.initialStudents === "number" ? root.initialStudents : undefined;
  analysis.deliveryModality = typeof root.deliveryModality === "string" ? modalityFromText(root.deliveryModality) : undefined;
  if (Array.isArray(root.annualOverrides)) analysis.annualValues = root.annualOverrides.filter((item): item is Record<string, unknown> => Boolean(item && typeof item === "object")).map((item) => ({ ...item, year: Number(item.year) })) as ImportedBudgetAnalysis["annualValues"];
  if (Array.isArray(root.semesters)) analysis.semesters = root.semesters.filter((item): item is Record<string, unknown> => Boolean(item && typeof item === "object")).map((item) => ({ ...item, year: Number(item.year), semester: Number(item.semester) as 1 | 2 })) as ImportedBudgetAnalysis["semesters"];
  analysis.recognized.push({ field: "Estructura JSON", period: "General", value: `${analysis.annualValues.length} anualidades · ${analysis.semesters.length} semestres`, source: "JSON" });
  return finalizeAnalysis(analysis);
}

export async function analyzeBudgetFile(file: File): Promise<ImportedBudgetAnalysis> {
  const extension = file.name.split(".").pop()?.toLowerCase();
  if (extension === "json") return analysisFromJson(file.name, JSON.parse(await file.text()));
  if (extension === "csv") return analyzeSheets(file.name, "csv", [{ name: "CSV", rows: parseCsv(await file.text()) }]);
  if (extension === "xlsx" || extension === "xlsm") return analyzeSheets(file.name, "xlsx", await parseXlsx(await file.arrayBuffer()));
  throw new Error("Formato no soportado. Use .xlsx, .xlsm, .csv o .json.");
}
