import { apiError, requireApiIdentity } from "@/lib/auth/api-access";
import { analyzeCurriculumMatrix, type CurriculumImportAnalysis } from "@/lib/import/curriculum-file-import";

type CellValue = string | number | boolean | null;
type SheetMatrix = { name: string; rows: CellValue[][] };
interface ZipEntry { method: number; compressedSize: number; localOffset: number }

const decoder = new TextDecoder("utf-8");
const MAX_FILE_BYTES = 15 * 1024 * 1024;

function xmlEntityDecode(value: string): string {
  return value
    .replace(/&#x([0-9a-f]+);/gi, (_, code: string) => String.fromCodePoint(Number.parseInt(code, 16)))
    .replace(/&#([0-9]+);/g, (_, code: string) => String.fromCodePoint(Number.parseInt(code, 10)))
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
}

function attribute(source: string, name: string): string | null {
  const escaped = name.replace(/[.*+?^$()|[\]\\{}]/g, "\\$&");
  const match = source.match(new RegExp("(?:^|\\s)" + escaped + "=[\"']([^\"']*)[\"']", "i"));
  return match ? xmlEntityDecode(match[1]) : null;
}

function textNodes(xml: string): string {
  const values: string[] = [];
  const pattern = /<t\b[^>]*>([\s\S]*?)<\/t>/gi;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(xml))) values.push(xmlEntityDecode(match[1].replace(/<[^>]+>/g, "")));
  return values.join("");
}

function zipEntries(buffer: ArrayBuffer): Map<string, ZipEntry> {
  const view = new DataView(buffer);
  const bytes = new Uint8Array(buffer);
  let eocd = -1;
  for (let offset = bytes.length - 22; offset >= Math.max(0, bytes.length - 65557); offset -= 1) {
    if (view.getUint32(offset, true) === 0x06054b50) { eocd = offset; break; }
  }
  if (eocd < 0) throw new Error("CURRICULUM_INVALID_XLSX");
  const count = view.getUint16(eocd + 10, true);
  let offset = view.getUint32(eocd + 16, true);
  const entries = new Map<string, ZipEntry>();
  for (let index = 0; index < count; index += 1) {
    if (view.getUint32(offset, true) !== 0x02014b50) throw new Error("CURRICULUM_INVALID_XLSX");
    const method = view.getUint16(offset + 10, true);
    const compressedSize = view.getUint32(offset + 20, true);
    const fileNameLength = view.getUint16(offset + 28, true);
    const extraLength = view.getUint16(offset + 30, true);
    const commentLength = view.getUint16(offset + 32, true);
    const localOffset = view.getUint32(offset + 42, true);
    const name = decoder.decode(bytes.slice(offset + 46, offset + 46 + fileNameLength));
    entries.set(name.replace(/^\//, ""), { method, compressedSize, localOffset });
    offset += 46 + fileNameLength + extraLength + commentLength;
  }
  return entries;
}

async function readZipText(buffer: ArrayBuffer, entries: Map<string, ZipEntry>, path: string): Promise<string | null> {
  const entry = entries.get(path.replace(/^\//, ""));
  if (!entry) return null;
  const view = new DataView(buffer);
  const nameLength = view.getUint16(entry.localOffset + 26, true);
  const extraLength = view.getUint16(entry.localOffset + 28, true);
  const start = entry.localOffset + 30 + nameLength + extraLength;
  const compressed = buffer.slice(start, start + entry.compressedSize);
  if (entry.method === 0) return decoder.decode(new Uint8Array(compressed));
  if (entry.method !== 8) throw new Error("CURRICULUM_UNSUPPORTED_COMPRESSION");
  const stream = new Blob([compressed]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
  return decoder.decode(await new Response(stream).arrayBuffer());
}

function columnIndex(reference: string): number {
  const letters = reference.match(/^[A-Z]+/i)?.[0]?.toUpperCase() ?? "A";
  let result = 0;
  for (const char of letters) result = result * 26 + char.charCodeAt(0) - 64;
  return Math.max(0, result - 1);
}

function parseSheetRows(xml: string, shared: string[]): CellValue[][] {
  const rows: CellValue[][] = [];
  const rowPattern = /<row\b[^>]*>([\s\S]*?)<\/row>/gi;
  let rowMatch: RegExpExecArray | null;
  while ((rowMatch = rowPattern.exec(xml))) {
    const row: CellValue[] = [];
    const cellPattern = /<c\b([^>]*)>([\s\S]*?)<\/c>/gi;
    let cellMatch: RegExpExecArray | null;
    while ((cellMatch = cellPattern.exec(rowMatch[1]))) {
      const attrs = cellMatch[1];
      const body = cellMatch[2];
      const ref = attribute(attrs, "r") ?? "A1";
      const type = attribute(attrs, "t") ?? "n";
      const valueMatch = body.match(/<v\b[^>]*>([\s\S]*?)<\/v>/i);
      const raw = valueMatch ? xmlEntityDecode(valueMatch[1]) : "";
      let value: CellValue = raw;
      if (type === "s") value = shared[Number(raw)] ?? "";
      else if (type === "inlineStr") value = textNodes(body);
      else if (type === "b") value = raw === "1";
      else if (raw !== "" && Number.isFinite(Number(raw))) value = Number(raw);
      row[columnIndex(ref)] = value;
    }
    rows.push(row);
  }
  return rows;
}

async function parseXlsx(buffer: ArrayBuffer): Promise<SheetMatrix[]> {
  const entries = zipEntries(buffer);
  const workbookXml = await readZipText(buffer, entries, "xl/workbook.xml");
  const relsXml = await readZipText(buffer, entries, "xl/_rels/workbook.xml.rels");
  if (!workbookXml || !relsXml) throw new Error("CURRICULUM_INVALID_XLSX");

  const relationMap = new Map<string, string>();
  const relPattern = /<Relationship\b([^>]*)\/?\s*>/gi;
  let relMatch: RegExpExecArray | null;
  while ((relMatch = relPattern.exec(relsXml))) {
    const id = attribute(relMatch[1], "Id");
    const target = attribute(relMatch[1], "Target");
    if (id && target) relationMap.set(id, target);
  }

  const sharedXml = await readZipText(buffer, entries, "xl/sharedStrings.xml");
  const shared: string[] = [];
  if (sharedXml) {
    const itemPattern = /<si\b[^>]*>([\s\S]*?)<\/si>/gi;
    let itemMatch: RegExpExecArray | null;
    while ((itemMatch = itemPattern.exec(sharedXml))) shared.push(textNodes(itemMatch[1]));
  }

  const sheets: SheetMatrix[] = [];
  const sheetPattern = /<sheet\b([^>]*)\/?\s*>/gi;
  let sheetMatch: RegExpExecArray | null;
  while ((sheetMatch = sheetPattern.exec(workbookXml))) {
    const attrs = sheetMatch[1];
    const name = attribute(attrs, "name") ?? "Hoja";
    const relationId = attribute(attrs, "r:id");
    const target = relationId ? relationMap.get(relationId) : null;
    if (!target) continue;
    const normalizedPath = target.startsWith("/")
      ? target.slice(1)
      : target.startsWith("xl/")
        ? target
        : "xl/" + target.replace(/^\.\//, "");
    const xml = await readZipText(buffer, entries, normalizedPath);
    if (!xml) continue;
    sheets.push({ name, rows: parseSheetRows(xml, shared) });
  }
  return sheets;
}

function parseCsv(content: string): CellValue[][] {
  const first = content.split(/\r?\n/, 1)[0] ?? "";
  const delimiter = (first.match(/;/g)?.length ?? 0) > (first.match(/,/g)?.length ?? 0) ? ";" : ",";
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  for (let index = 0; index < content.length; index += 1) {
    const char = content[index];
    if (char === '"') {
      if (quoted && content[index + 1] === '"') { field += '"'; index += 1; }
      else quoted = !quoted;
    } else if (char === delimiter && !quoted) {
      row.push(field); field = "";
    } else if ((char === "\n" || char === "\r") && !quoted) {
      if (char === "\r" && content[index + 1] === "\n") index += 1;
      row.push(field); rows.push(row); row = []; field = "";
    } else {
      field += char;
    }
  }
  if (field || row.length) { row.push(field); rows.push(row); }
  return rows;
}

function chooseAnalysis(analyses: Array<CurriculumImportAnalysis | null>): CurriculumImportAnalysis {
  const valid = analyses
    .filter((item): item is CurriculumImportAnalysis => Boolean(item))
    .sort((a, b) => b.confidence - a.confidence);
  if (!valid.length) throw new Error("CURRICULUM_NOT_RECOGNIZED");
  return valid[0];
}

async function analysisFromFile(file: File): Promise<CurriculumImportAnalysis> {
  if (file.size > MAX_FILE_BYTES) throw new Error("CURRICULUM_FILE_TOO_LARGE");
  const extension = file.name.toLowerCase().split(".").pop();
  if (!["xlsx", "xlsm", "csv"].includes(extension ?? "")) throw new Error("CURRICULUM_UNSUPPORTED_FORMAT");
  if (extension === "csv") {
    const analysis = chooseAnalysis([analyzeCurriculumMatrix(parseCsv(await file.text()), "CSV")]);
    return { ...analysis, fileName: file.name, format: "csv" };
  }
  const sheets = await parseXlsx(await file.arrayBuffer());
  const analysis = chooseAnalysis(sheets.map((sheet) => analyzeCurriculumMatrix(sheet.rows, sheet.name)));
  return { ...analysis, fileName: file.name, format: "xlsx" };
}

function errorResponse(error: unknown): Response {
  const message = error instanceof Error ? error.message : "";
  if (message === "CURRICULUM_FILE_TOO_LARGE") return Response.json({ error: "El archivo de malla supera el máximo de 15 MB." }, { status: 413 });
  if (message === "CURRICULUM_UNSUPPORTED_FORMAT") return Response.json({ error: "La malla debe estar en formato .xlsx, .xlsm o .csv." }, { status: 400 });
  if (message === "CURRICULUM_INVALID_XLSX") return Response.json({ error: "El archivo XLSX no contiene una estructura válida." }, { status: 400 });
  if (message === "CURRICULUM_UNSUPPORTED_COMPRESSION") return Response.json({ error: "El XLSX utiliza un método de compresión no soportado." }, { status: 400 });
  if (message === "CURRICULUM_NOT_RECOGNIZED") return Response.json({ error: "No se encontró una tabla de malla curricular reconocible." }, { status: 422 });
  return apiError(error);
}

export async function POST(request: Request) {
  try {
    await requireApiIdentity(request);
    const contentType = request.headers.get("content-type") ?? "";

    let analysis: CurriculumImportAnalysis;
    if (contentType.includes("application/json")) {
      const payload = await request.json() as { rows?: CellValue[][]; sheetName?: string };
      if (!Array.isArray(payload.rows)) return Response.json({ error: "Falta la matriz de malla curricular." }, { status: 400 });
      analysis = chooseAnalysis([analyzeCurriculumMatrix(payload.rows, payload.sheetName || "Malla curricular")]);
    } else {
      const form = await request.formData();
      const preferred = form.get("file") ?? form.get("curriculum") ?? form.get("malla");
      const fallback = [...form.values()].find((value): value is File => value instanceof File);
      const file = preferred instanceof File ? preferred : fallback;
      if (!file) return Response.json({ error: "No se recibió un archivo de malla curricular." }, { status: 400 });
      analysis = await analysisFromFile(file);
    }

    return Response.json({ ...analysis, analysis });
  } catch (error) {
    return errorResponse(error);
  }
}
