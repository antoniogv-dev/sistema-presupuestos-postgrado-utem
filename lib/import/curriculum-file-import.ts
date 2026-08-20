import type { CurriculumCourseKind, ProgramCourse, TeachingMode } from "../calculations/types";

export interface CurriculumImportAnalysis {
  fileName: string;
  format: "xlsx" | "csv";
  sheetName: string;
  courses: Array<Omit<ProgramCourse, "id">>;
  recognizedHeaders: string[];
  warnings: string[];
  confidence: number;
}

type CellValue = string | number | boolean | null;
type SheetMatrix = { name: string; rows: CellValue[][] };
const decoder = new TextDecoder("utf-8");

const normalize = (value: unknown) => String(value ?? "")
  .normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase()
  .replace(/[^a-z0-9]+/g, " ").trim();

function text(value: CellValue | undefined): string { return value == null ? "" : String(value).trim(); }
function num(value: CellValue | undefined): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (value == null || typeof value === "boolean") return null;
  let raw = String(value).trim().replace(/\s/g, "");
  if (!raw) return null;
  raw = raw.replace(/%/g, "");
  if (/^-?\d{1,3}(?:\.\d{3})+(?:,\d+)?$/.test(raw)) raw = raw.replace(/\./g, "").replace(",", ".");
  else raw = raw.replace(",", ".");
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}
function clamp(value: number, min: number, max: number) { return Math.min(max, Math.max(min, value)); }
function columnIndex(reference: string): number {
  const letters = reference.match(/^[A-Z]+/i)?.[0]?.toUpperCase() ?? "A";
  let result = 0; for (const char of letters) result = result * 26 + char.charCodeAt(0) - 64;
  return result - 1;
}
function parseCsv(content: string): CellValue[][] {
  const first = content.split(/\r?\n/, 1)[0] ?? "";
  const delimiter = (first.match(/;/g)?.length ?? 0) > (first.match(/,/g)?.length ?? 0) ? ";" : ",";
  const rows: string[][] = []; let row: string[] = []; let field = ""; let quoted = false;
  for (let i = 0; i < content.length; i += 1) {
    const ch = content[i];
    if (ch === '"') { if (quoted && content[i + 1] === '"') { field += '"'; i += 1; } else quoted = !quoted; }
    else if (ch === delimiter && !quoted) { row.push(field); field = ""; }
    else if ((ch === "\n" || ch === "\r") && !quoted) { if (ch === "\r" && content[i + 1] === "\n") i += 1; row.push(field); rows.push(row); row = []; field = ""; }
    else field += ch;
  }
  if (field || row.length) { row.push(field); rows.push(row); }
  return rows;
}
interface ZipEntry { method: number; compressedSize: number; localOffset: number }
function zipEntries(buffer: ArrayBuffer): Map<string, ZipEntry> {
  const view = new DataView(buffer); const bytes = new Uint8Array(buffer); let eocd = -1;
  for (let offset = bytes.length - 22; offset >= Math.max(0, bytes.length - 65557); offset -= 1) {
    if (view.getUint32(offset, true) === 0x06054b50) { eocd = offset; break; }
  }
  if (eocd < 0) throw new Error("El archivo XLSX no contiene un directorio ZIP válido.");
  const count = view.getUint16(eocd + 10, true); let offset = view.getUint32(eocd + 16, true); const entries = new Map<string, ZipEntry>();
  for (let i = 0; i < count; i += 1) {
    if (view.getUint32(offset, true) !== 0x02014b50) throw new Error("El XLSX contiene una estructura ZIP no reconocida.");
    const method = view.getUint16(offset + 10, true); const compressedSize = view.getUint32(offset + 20, true);
    const fileNameLength = view.getUint16(offset + 28, true); const extraLength = view.getUint16(offset + 30, true); const commentLength = view.getUint16(offset + 32, true); const localOffset = view.getUint32(offset + 42, true);
    const name = decoder.decode(bytes.slice(offset + 46, offset + 46 + fileNameLength)); entries.set(name.replace(/^\//, ""), { method, compressedSize, localOffset });
    offset += 46 + fileNameLength + extraLength + commentLength;
  }
  return entries;
}
async function readZipText(buffer: ArrayBuffer, entries: Map<string, ZipEntry>, path: string): Promise<string | null> {
  const entry = entries.get(path.replace(/^\//, "")); if (!entry) return null;
  const view = new DataView(buffer); const nameLength = view.getUint16(entry.localOffset + 26, true); const extraLength = view.getUint16(entry.localOffset + 28, true);
  const start = entry.localOffset + 30 + nameLength + extraLength; const compressedBuffer = buffer.slice(start, start + entry.compressedSize);
  if (entry.method === 0) return decoder.decode(new Uint8Array(compressedBuffer));
  if (entry.method !== 8) throw new Error(`Método de compresión XLSX no soportado (${entry.method}).`);
  const stream = new Blob([compressedBuffer]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
  return decoder.decode(await new Response(stream).arrayBuffer());
}
function xmlDoc(xml: string): Document {
  const doc = new DOMParser().parseFromString(xml, "application/xml");
  if (doc.querySelector("parsererror")) throw new Error("No fue posible interpretar el XML del XLSX.");
  return doc;
}
async function parseXlsx(buffer: ArrayBuffer): Promise<SheetMatrix[]> {
  const entries = zipEntries(buffer); const workbookXml = await readZipText(buffer, entries, "xl/workbook.xml"); const relsXml = await readZipText(buffer, entries, "xl/_rels/workbook.xml.rels");
  if (!workbookXml || !relsXml) throw new Error("El XLSX no contiene workbook.xml o sus relaciones.");
  const workbook = xmlDoc(workbookXml); const rels = xmlDoc(relsXml); const relMap = new Map<string, string>();
  for (const rel of Array.from(rels.getElementsByTagName("Relationship"))) { const id = rel.getAttribute("Id"); const target = rel.getAttribute("Target"); if (id && target) relMap.set(id, target); }
  const sharedXml = await readZipText(buffer, entries, "xl/sharedStrings.xml");
  const shared = sharedXml ? Array.from(xmlDoc(sharedXml).getElementsByTagName("si")).map((node) => node.textContent ?? "") : [];
  const sheets: SheetMatrix[] = [];
  for (const sheet of Array.from(workbook.getElementsByTagName("sheet"))) {
    const name = sheet.getAttribute("name") ?? "Hoja"; const rid = sheet.getAttribute("r:id") ?? sheet.getAttributeNS("http://schemas.openxmlformats.org/officeDocument/2006/relationships", "id");
    const target = rid ? relMap.get(rid) : null; if (!target) continue;
    const path = target.startsWith("/") ? target.slice(1) : target.startsWith("xl/") ? target : `xl/${target.replace(/^\.\//, "")}`;
    const xml = await readZipText(buffer, entries, path); if (!xml) continue; const doc = xmlDoc(xml); const rows: CellValue[][] = [];
    for (const rowNode of Array.from(doc.getElementsByTagName("row"))) {
      const row: CellValue[] = [];
      for (const cell of Array.from(rowNode.getElementsByTagName("c"))) {
        const ref = cell.getAttribute("r") ?? "A1"; const index = columnIndex(ref); const type = cell.getAttribute("t") ?? "n";
        const raw = cell.getElementsByTagName("v")[0]?.textContent ?? ""; let value: CellValue = raw;
        if (type === "s") value = shared[Number(raw)] ?? "";
        else if (type === "inlineStr") value = cell.getElementsByTagName("is")[0]?.textContent ?? "";
        else if (type === "b") value = raw === "1";
        else if (raw !== "" && Number.isFinite(Number(raw))) value = Number(raw);
        row[index] = value;
      }
      rows.push(row);
    }
    sheets.push({ name, rows });
  }
  return sheets;
}

const aliases: Record<string, RegExp[]> = {
  semester: [/^nivel semestre$/, /^nivel$/, /^semestre$/],
  code: [/^codigo$/],
  name: [/^nombre asignatura$/, /^asignatura$/, /^nombre de la asignatura$/],
  weeks: [/duracion.*semanas/, /^semanas$/],
  theory: [/(?:^| )teoria$/],
  lab: [/(?:^| )laboratorio$/],
  workshop: [/(?:^| )taller$/],
  direct: [/horas.*trabajo directo/, /horas directas.*semanales/],
  autonomous: [/horas.*trabajo autonomo/, /horas autonomas.*semanales/],
  sections: [/^secciones$/, /numero.*secciones/],
  sct: [/sct chile/, /^sct$/],
  requirements: [/requisitos/, /prerrequisitos/],
  mode: [/modalidad/, /tipo.*docencia/],
  factor: [/factor.*asincron/, /factor.*valor/],
};
function findColumn(headers: string[], key: string): number {
  return headers.findIndex((header) => (aliases[key] ?? []).some((pattern) => pattern.test(header)));
}

function combineHeaderRows(rows: CellValue[][], startRow: number, depth: number): string[] {
  const width = Math.max(0, ...rows.slice(startRow, startRow + depth).map((row) => row.length));
  return Array.from({ length: width }, (_, column) => {
    const labels: string[] = [];
    for (let rowIndex = startRow; rowIndex < Math.min(rows.length, startRow + depth); rowIndex += 1) {
      const label = normalize(rows[rowIndex]?.[column]);
      if (label && !labels.includes(label)) labels.push(label);
    }
    return labels.join(" ").trim();
  });
}

function recognizedHeaderKeys(headers: string[]): string[] {
  return Object.keys(aliases).filter((key) => findColumn(headers, key) >= 0);
}

function semesterFromLevel(value: CellValue | undefined): number | null {
  const n = num(value); if (n == null) return null; const rounded = Math.round(n);
  if (rounded >= 10) return Math.max(1, Math.floor(rounded / 10));
  return rounded >= 1 && rounded <= 16 ? rounded : null;
}
function kindFrom(name: string, semester: number | null, direct: number, code: string): CurriculumCourseKind {
  const key = normalize(name);
  if (semester == null || (direct === 0 && /^(humm|fitm)/i.test(code))) return "COMPETENCIA_GENERICA";
  if (key.includes("electivo")) return "ELECTIVA";
  if (key.includes("especializacion") || key.includes("especialidad")) return "ESPECIALIZACION";
  return "OBLIGATORIA";
}
function modeFrom(value: CellValue | undefined): TeachingMode {
  const key = normalize(value); if (key.includes("asincron")) return "ASINCRONICA"; if (key.includes("presencial")) return "PRESENCIAL"; return "SINCRONICA";
}
function analyzeSheet(sheet: SheetMatrix): CurriculumImportAnalysis | null {
  // Los planes de estudio de curriculistas suelen usar encabezados multinivel:
  // una primera fila con "Horas pedagógicas semanales" y una segunda con
  // "Teoría / Laboratorio / Taller / Horas trabajo directo / ...".  La v10.27
  // evaluaba una sola fila y por eso podía reconocer nombres/códigos, pero dejar
  // las horas en cero.  Se prueban ventanas de 1 a 3 filas y se combinan sus
  // etiquetas por columna antes de identificar cada campo.
  let best: { row: number; depth: number; score: number; headers: string[]; keys: string[] } | null = null;
  const preferredKeys = ["semester", "code", "name", "weeks", "theory", "lab", "workshop", "direct", "autonomous", "sections", "sct", "requirements"];
  for (let start = 0; start < sheet.rows.length; start += 1) {
    for (let depth = 1; depth <= 3 && start + depth <= sheet.rows.length; depth += 1) {
      const headers = combineHeaderRows(sheet.rows, start, depth);
      const keys = recognizedHeaderKeys(headers);
      const score = preferredKeys.filter((key) => keys.includes(key)).length;
      const hasIdentity = keys.includes("name") && (keys.includes("semester") || keys.includes("code"));
      if (!hasIdentity) continue;
      const candidate = { row: start, depth, score, headers, keys };
      if (!best || candidate.score > best.score || (candidate.score === best.score && candidate.depth < best.depth)) best = candidate;
    }
  }
  if (!best || best.score < 4 || findColumn(best.headers, "name") < 0) return null;
  const cols = Object.fromEntries(Object.keys(aliases).map((key) => [key, findColumn(best.headers, key)])) as Record<string, number>;
  const courses: Array<Omit<ProgramCourse, "id">> = []; const warnings: string[] = [];
  for (const row of sheet.rows.slice(best.row + best.depth)) {
    const name = text(row[cols.name]); if (!name) continue;
    const code = cols.code >= 0 ? text(row[cols.code]) : ""; const semester = cols.semester >= 0 ? semesterFromLevel(row[cols.semester]) : null;
    const theory = cols.theory >= 0 ? Math.max(0, num(row[cols.theory]) ?? 0) : 0; const lab = cols.lab >= 0 ? Math.max(0, num(row[cols.lab]) ?? 0) : 0; const workshop = cols.workshop >= 0 ? Math.max(0, num(row[cols.workshop]) ?? 0) : 0;
    const componentDirect = theory + lab + workshop;
    const directFromFile = cols.direct >= 0 ? num(row[cols.direct]) : null;
    // Si el archivo deja la celda directa vacía (o en 0) pero sí informa teoría/lab/taller,
    // se reconstruye la carga directa desde sus componentes en vez de guardar 0 horas.
    const direct = Math.max(0, directFromFile != null && directFromFile > 0 ? directFromFile : componentDirect);
    const kind = kindFrom(name, semester, direct, code); const finalSemester = semester ?? 1;
    const mode = cols.mode >= 0 ? modeFrom(row[cols.mode]) : "SINCRONICA"; let factor = cols.factor >= 0 ? num(row[cols.factor]) : null; if (factor != null && factor > 1) factor /= 100;
    const importedSections = Math.max(1, Math.round(cols.sections >= 0 ? (num(row[cols.sections]) ?? 1) : 1));
    const sections = kind === "OBLIGATORIA" || kind === "COMPETENCIA_GENERICA" ? 1 : importedSections;
    courses.push({
      code: code || undefined, name, semester: finalSemester, kind,
      weeks: Math.max(1, Math.round(cols.weeks >= 0 ? (num(row[cols.weeks]) ?? 18) : 18)), sections,
      theoryWeeklyHours: theory, laboratoryWeeklyHours: lab, workshopWeeklyHours: workshop, directWeeklyHours: direct,
      autonomousWeeklyHours: Math.max(0, cols.autonomous >= 0 ? (num(row[cols.autonomous]) ?? 0) : 0), teachingMode: mode,
      asynchronousRateFactor: clamp(factor ?? 0.5, 0, 1), sharedWithProgramIds: [], allocationRate: 1,
      sctCredits: Math.max(0, cols.sct >= 0 ? (num(row[cols.sct]) ?? 0) : 0), prerequisites: cols.requirements >= 0 ? text(row[cols.requirements]) || undefined : undefined,
      position: courses.length,
    });
  }
  if (!courses.length) return null;
  const recognizedHeaders = best.headers.filter(Boolean);
  const payable = courses.filter((course) => course.kind !== "COMPETENCIA_GENERICA");
  if (!courses.some((course) => course.kind === "COMPETENCIA_GENERICA")) warnings.push("No se identificaron competencias genéricas; puede agregarlas manualmente.");
  if (payable.length && payable.every((course) => course.directWeeklyHours <= 0)) warnings.push("Se reconocieron asignaturas, pero todas quedaron con 0 horas directas. Revise que el archivo incluya Teoría/Laboratorio/Taller u Horas trabajo directo.");
  if (courses.some((course) => course.semester > 16)) warnings.push("Se detectaron semestres fuera del rango habitual; revíselos antes de guardar.");
  return { fileName: "", format: "xlsx", sheetName: sheet.name, courses, recognizedHeaders, warnings, confidence: Math.min(1, 0.45 + best.score * 0.07 + Math.min(courses.length, 20) * 0.01) };
}

export function analyzeCurriculumMatrix(rows: CellValue[][], sheetName = "Malla curricular"): CurriculumImportAnalysis | null {
  return analyzeSheet({ name: sheetName, rows });
}

export async function analyzeCurriculumFile(file: File): Promise<CurriculumImportAnalysis> {
  const extension = file.name.toLowerCase().split(".").pop();
  if (extension !== "xlsx" && extension !== "xlsm" && extension !== "csv") throw new Error("La malla curricular debe estar en formato .xlsx, .xlsm o .csv.");
  const format: "xlsx" | "csv" = extension === "csv" ? "csv" : "xlsx";
  const sheets = format === "csv" ? [{ name: "CSV", rows: parseCsv(await file.text()) }] : await parseXlsx(await file.arrayBuffer());
  const analyses = sheets.map(analyzeSheet).filter((item): item is CurriculumImportAnalysis => Boolean(item)).sort((a, b) => b.confidence - a.confidence);
  if (!analyses.length) throw new Error("No se encontró una tabla de malla curricular reconocible. Se esperan columnas como Nivel (semestre), Código, Nombre asignatura, Semanas, Horas trabajo directo y SCT-Chile.");
  const best = analyses[0]; return { ...best, fileName: file.name, format };
}
