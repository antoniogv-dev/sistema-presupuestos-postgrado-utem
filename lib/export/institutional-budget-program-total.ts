import type { BudgetResult, CohortBudget, InstitutionalParameters } from "../calculations/types";
import { resolvedAnnualOverrideForYear } from "../calculations/budget-engine";

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

function cellPattern(ref: string): RegExp {
  return new RegExp(`<c(?=[^>]*\\br="${ref}")([^>]*?)(?:\\/>|>[\\s\\S]*?<\\/c>)`, "m");
}
function styleFromCell(sheetXml: string, ref: string): string {
  const match = sheetXml.match(cellPattern(ref));
  if (!match) return "";
  const style = match[1]?.match(/\bs="(\d+)"/);
  return style ? ` s="${style[1]}"` : "";
}
function setNumber(sheetXml: string, ref: string, value: number): string {
  const pattern = cellPattern(ref);
  if (!pattern.test(sheetXml)) throw new Error(`El formato institucional no contiene la celda ${ref}.`);
  const style = styleFromCell(sheetXml, ref);
  return sheetXml.replace(pattern, () => `<c r="${ref}"${style}><v>${Number.isFinite(value) ? value : 0}</v></c>`);
}
function columnName(index: number): string {
  let result = "";
  let current = index;
  while (current > 0) { current -= 1; result = String.fromCharCode(65 + (current % 26)) + result; current = Math.floor(current / 26); }
  return result;
}
function yearColumn(index: number): string { return columnName(index + 2); }

function programTotalUnitForYear(budget: CohortBudget, result: BudgetResult, year: number): number {
  const flow = result.annualFlows.find((item) => item.year === year);
  if (!flow) return 0;
  return Math.max(0, budget.programTotalTuition ?? 0) * Math.max(0, flow.tuitionDistributionShare);
}

/**
 * La plantilla institucional histórica está construida sobre un arancel anual.
 * Para PROGRAM_TOTAL se crea una vista de exportación equivalente, sin modificar el
 * presupuesto real: cada año recibe un arancel anual de compatibilidad tal que,
 * multiplicado por tuitionFactor, reproduce exactamente la participación anual del
 * precio total del programa.
 */
export function institutionalBudgetForExport(
  budget: CohortBudget,
  result: BudgetResult,
  parameters: InstitutionalParameters,
): CohortBudget {
  if (budget.tuitionPricingMode !== "PROGRAM_TOTAL") return budget;

  const annualOverrides = result.years.map((year) => {
    const original = resolvedAnnualOverrideForYear(budget, parameters, year);
    const flow = result.annualFlows.find((item) => item.year === year);
    const unit = programTotalUnitForYear(budget, result, year);
    const factor = Math.max(0, flow?.tuitionFactor ?? 0);
    return {
      ...original,
      annualTuition: factor > 0 ? unit / factor : unit,
    };
  });

  return {
    ...budget,
    tuitionPricingMode: "ANNUAL_LEGACY",
    annualOverrides,
  };
}

/**
 * Después de extender el XLSX a todos los años, fija en Parámetros!fila 4 el valor
 * unitario realmente reconocido en cada año del modelo PROGRAM_TOTAL. De este modo
 * una distribución 25% / 50% / 25% de $6.000.000 se exporta como $1.500.000 /
 * $3.000.000 / $1.500.000, conservando el formato institucional aportado por Postgrado.
 */
export async function normalizeInstitutionalProgramTotalTuition(
  workbookBytes: Uint8Array,
  budget: CohortBudget,
  result: BudgetResult,
): Promise<Uint8Array> {
  if (budget.tuitionPricingMode !== "PROGRAM_TOTAL") return workbookBytes;
  const files = await unzipPackage(workbookBytes);
  const parameterSheetName = "xl/worksheets/sheet1.xml";
  if (!files.has(parameterSheetName)) throw new Error("XLSX institucional incompleto: falta la hoja Parámetros.");

  let parametersSheet = decoder.decode(files.get(parameterSheetName)!);
  result.years.forEach((year, index) => {
    parametersSheet = setNumber(parametersSheet, `${yearColumn(index)}4`, programTotalUnitForYear(budget, result, year));
  });
  files.set(parameterSheetName, encoder.encode(parametersSheet));
  return zip(files);
}
