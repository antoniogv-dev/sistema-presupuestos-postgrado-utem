import type { BudgetResult, CohortBudget, InstitutionalParameters } from "../calculations/types";
import { calculateBreakEvenEquivalentEnrollments } from "../calculations/break-even";

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

function cellPattern(ref: string): RegExp {
  return new RegExp(`<c(?=[^>]*\\br="${ref}")([^>]*?)(?:\\/>|>[\\s\\S]*?<\\/c>)`, "m");
}
function rowPattern(row: number): RegExp {
  return new RegExp(`<row(?=[^>]*\\br="${row}")([^>]*)>[\\s\\S]*?<\\/row>`, "m");
}
function styleFromCell(sheetXml: string, ref: string): string {
  const match = sheetXml.match(cellPattern(ref));
  if (!match) return "";
  const style = match[1]?.match(/\bs="(\d+)"/);
  return style ? ` s="${style[1]}"` : "";
}
function styleFromCellXml(cellXml: string): string {
  const style = cellXml.match(/\bs="(\d+)"/);
  return style ? ` s="${style[1]}"` : "";
}
function typeFromCell(cellXml: string): string {
  const match = cellXml.match(/\bt="([^"]+)"/);
  return match ? ` t="${match[1]}"` : "";
}
function innerFromCell(cellXml: string): string {
  const match = cellXml.match(/<c\b[^>]*>([\s\S]*?)<\/c>/);
  return match?.[1] ?? "";
}
function replaceCell(sheetXml: string, ref: string, body: string, typeAttribute = ""): string {
  const pattern = cellPattern(ref);
  if (!pattern.test(sheetXml)) throw new Error(`El formato institucional no contiene la celda ${ref}.`);
  const style = styleFromCell(sheetXml, ref);
  return sheetXml.replace(pattern, () => `<c r="${ref}"${style}${typeAttribute}>${body}</c>`);
}
function insertCellInExistingRow(sheetXml: string, ref: string, cellXml: string): string {
  const rowMatch = ref.match(/(\d+)$/);
  if (!rowMatch) throw new Error(`Referencia de celda institucional inválida: ${ref}.`);
  const row = Number(rowMatch[1]);
  const targetRowPattern = rowPattern(row);
  const existingRow = sheetXml.match(targetRowPattern);
  let output = sheetXml;

  if (existingRow) {
    const expandedRow = existingRow[0].replace(/<\/row>$/, `${cellXml}</row>`);
    output = sheetXml.replace(targetRowPattern, () => expandedRow);
  } else {
    const sourceRow = sheetXml.match(rowPattern(row - 1));
    if (!sourceRow) throw new Error(`El formato institucional no contiene la fila ${row - 1} necesaria para crear la fila ${row}.`);
    const opening = sourceRow[0].match(/^<row\b([^>]*)>/);
    if (!opening) throw new Error(`No fue posible replicar el formato institucional de la fila ${row - 1}.`);
    const attrs = opening[1].replace(new RegExp(`\\br="${row - 1}"`), `r="${row}"`);
    const newRow = `<row${attrs}>${cellXml}</row>`;
    if (!/<\/sheetData>/.test(sheetXml)) throw new Error("El formato institucional no contiene sheetData para ampliar FLUJO TOTAL.");
    output = sheetXml.replace(/<\/sheetData>/, `${newRow}</sheetData>`);
  }

  output = output.replace(/<dimension ref="([A-Z]+)(\d+):([A-Z]+)(\d+)"\/>/, (_full, firstCol: string, firstRow: string, lastCol: string, lastRow: string) =>
    `<dimension ref="${firstCol}${firstRow}:${lastCol}${Math.max(Number(lastRow), row)}"/>`);
  return output;
}
function setFormula(sheetXml: string, ref: string, formula: string, cached: number): string {
  return replaceCell(sheetXml, ref, `<f>${xml(formula)}</f><v>${Number.isFinite(cached) ? cached : 0}</v>`);
}
function setNumber(sheetXml: string, ref: string, value: number): string {
  return replaceCell(sheetXml, ref, `<v>${Number.isFinite(value) ? value : 0}</v>`);
}
function setText(sheetXml: string, ref: string, value: string): string {
  return replaceCell(sheetXml, ref, `<is><t>${xml(value)}</t></is>`, ` t="inlineStr"`);
}

// La fila se mueve conservando literalmente su fórmula. No se reescriben referencias aquí:
// las fórmulas locales que cambian de posición se reconstruyen después de insertar la fila 7.
function shiftFlowCellDown(sheetXml: string, column: string, sourceRow: number, targetRow: number): string {
  const sourceMatch = sheetXml.match(cellPattern(`${column}${sourceRow}`));
  if (!sourceMatch) throw new Error(`El formato institucional no contiene ${column}${sourceRow}.`);
  const sourceCell = sourceMatch[0];
  const body = innerFromCell(sourceCell);
  const targetRef = `${column}${targetRow}`;
  if (cellPattern(targetRef).test(sheetXml)) return replaceCell(sheetXml, targetRef, body, typeFromCell(sourceCell));
  const newCell = `<c r="${targetRef}"${styleFromCellXml(sourceCell)}${typeFromCell(sourceCell)}>${body}</c>`;
  return insertCellInExistingRow(sheetXml, targetRef, newCell);
}

/**
 * Ajuste final del XLSX institucional.
 *
 * La hoja FLUJO TOTAL debe ser una representación del mismo BudgetResult que ve el usuario
 * en la plataforma. Las hojas auxiliares se conservan como respaldo de detalle, pero no son
 * una segunda fuente de cálculo para los totales: si una malla, prorrateo o fórmula histórica
 * difiere del motor financiero, prevalece el resultado de la aplicación.
 */
export async function alignInstitutionalBreakEvenFormula(
  workbookBytes: Uint8Array,
  budget: CohortBudget,
  result: BudgetResult,
  parameters: InstitutionalParameters,
): Promise<Uint8Array> {
  if (budget.program.type !== "MAGISTER_PROFESIONAL" || !result.years.length) return workbookBytes;

  const files = await unzipPackage(workbookBytes);
  const studentSheetName = "xl/worksheets/sheet2.xml";
  const totalSheetName = "xl/worksheets/sheet4.xml";
  const parameterSheetName = "xl/worksheets/sheet1.xml";
  const staffSheetName = "xl/worksheets/sheet5.xml";
  if (!files.has(studentSheetName) || !files.has(totalSheetName)) {
    throw new Error("XLSX institucional incompleto: faltan Flujo estudiantes o FLUJO TOTAL.");
  }

  const discounts = budget.discounts.filter((discount) => Math.max(0, Math.min(1, discount.percentage)) > 0 && discount.target !== "ENROLLMENT");
  const discountSlots = Math.max(2, discounts.length);
  const equivalentStudentsRow = 5 + discountSlots;
  const equilibriumRow = 10 + (2 * discountSlots);
  const firstYearColumn = "B";
  const lastYearColumn = yearColumn(result.years.length - 1);
  const equilibrium = calculateBreakEvenEquivalentEnrollments(budget, parameters);

  let totalFlow = decoder.decode(files.get(totalSheetName)!);

  // Inserta Reconocimiento de Matrícula en la fila 7 y materializa la fila final 42.
  for (let row = 41; row >= 7; row -= 1) {
    if (cellPattern(`A${row}`).test(totalFlow)) totalFlow = shiftFlowCellDown(totalFlow, "A", row, row + 1);
  }
  totalFlow = setText(totalFlow, "A7", "Reconocimiento de Matrícula");

  // Los rótulos principales quedan alineados con la nomenclatura de la plataforma.
  if (cellPattern("A9").test(totalFlow)) totalFlow = setText(totalFlow, "A9", budget.deliveryModality === "PRESENCIAL" ? "Horas docentes presenciales" : "Docencia directa / sincrónica / asincrónica");
  if (cellPattern("A10").test(totalFlow)) totalFlow = setText(totalFlow, "A10", "Horas docentes de reemplazo");
  if (cellPattern("A11").test(totalFlow)) totalFlow = setText(totalFlow, "A11", "Guía de tesis");
  if (cellPattern("A12").test(totalFlow)) totalFlow = setText(totalFlow, "A12", "HONORARIOS ACADÉMICOS (SUBTOTAL)");
  if (cellPattern("A13").test(totalFlow)) totalFlow = setText(totalFlow, "A13", "Dirección");
  if (cellPattern("A14").test(totalFlow)) totalFlow = setText(totalFlow, "A14", "Asistencia de dirección");
  if (cellPattern("A16").test(totalFlow)) totalFlow = setText(totalFlow, "A16", "Otros honorarios no académicos");
  if (cellPattern("A17").test(totalFlow)) totalFlow = setText(totalFlow, "A17", "HONORARIOS NO ACADÉMICOS (SUBTOTAL)");
  if (cellPattern("A38").test(totalFlow)) totalFlow = setText(totalFlow, "A38", "TOTAL COSTOS Y GASTOS");
  if (cellPattern("A39").test(totalFlow)) totalFlow = setText(totalFlow, "A39", "FLUJO NETO");

  for (let index = 0; index < result.years.length; index += 1) {
    const col = yearColumn(index);
    const flow = result.annualFlows.find((item) => item.year === result.years[index]);
    if (!flow) continue;

    // Se copia la estructura una fila hacia abajo; inmediatamente después todos los valores
    // financieros visibles se reemplazan por los del BudgetResult de la plataforma.
    for (let row = 41; row >= 7; row -= 1) totalFlow = shiftFlowCellDown(totalFlow, col, row, row + 1);

    // INGRESOS. Matrícula bruta se informa, pero el ingreso efectivo de matrícula es la fila 7.
    totalFlow = setNumber(totalFlow, `${col}4`, flow.grossEnrollmentFee);
    totalFlow = setNumber(totalFlow, `${col}5`, flow.tuitionAfterBenefits);
    totalFlow = setNumber(totalFlow, `${col}6`, -flow.badDebt);
    totalFlow = setNumber(totalFlow, `${col}7`, flow.recognizedEnrollmentFee);
    const extraIncome = flow.externalIncome + flow.institutionalFinancing + flow.otherIncome;
    totalFlow = setFormula(totalFlow, `${col}8`, extraIncome ? `SUM(${col}5:${col}7)+${extraIncome}` : `SUM(${col}5:${col}7)`, flow.totalIncome);

    // HONORARIOS ACADÉMICOS: nunca se vuelven a calcular desde la hoja de malla.
    totalFlow = setNumber(totalFlow, `${col}9`, -flow.directTeachingCost);
    totalFlow = setNumber(totalFlow, `${col}10`, -flow.replacementTeachingCost);
    totalFlow = setNumber(totalFlow, `${col}11`, -flow.thesisGuidanceCost);
    totalFlow = setFormula(totalFlow, `${col}12`, `SUM(${col}9:${col}11)`, -flow.academicHonoraria);

    // HONORARIOS NO ACADÉMICOS: misma asignación/prorrateo que utiliza el motor.
    totalFlow = setNumber(totalFlow, `${col}13`, -flow.direction);
    totalFlow = setNumber(totalFlow, `${col}14`, -flow.assistance);
    totalFlow = setNumber(totalFlow, `${col}15`, 0);
    totalFlow = setNumber(totalFlow, `${col}16`, -flow.otherNonAcademicHonoraria);
    totalFlow = setFormula(totalFlow, `${col}17`, `SUM(${col}13:${col}16)`, -flow.nonAcademicHonoraria);

    // OTROS GASTOS. Se mantiene el formato institucional histórico, pero cada bloque proviene
    // de las mismas categorías que forman otherExpenses/equipment/scholarshipsAndAid en la app.
    totalFlow = setNumber(totalFlow, `${col}18`, -flow.equipment);
    totalFlow = setNumber(totalFlow, `${col}19`, -flow.booksPublications);
    totalFlow = setFormula(totalFlow, `${col}20`, `SUM(${col}18:${col}19)`, -(flow.equipment + flow.booksPublications));

    totalFlow = setNumber(totalFlow, `${col}21`, -flow.diffusion);
    totalFlow = setFormula(totalFlow, `${col}22`, `SUM(${col}21)`, -flow.diffusion);

    totalFlow = setNumber(totalFlow, `${col}23`, -flow.travelFreight);
    totalFlow = setNumber(totalFlow, `${col}24`, 0);
    totalFlow = setFormula(totalFlow, `${col}25`, `SUM(${col}23:${col}24)`, -flow.travelFreight);

    totalFlow = setNumber(totalFlow, `${col}26`, -flow.perDiem);
    totalFlow = setFormula(totalFlow, `${col}27`, `SUM(${col}26)`, -flow.perDiem);

    totalFlow = setNumber(totalFlow, `${col}28`, -flow.software);
    totalFlow = setFormula(totalFlow, `${col}29`, `SUM(${col}28)`, -flow.software);

    totalFlow = setNumber(totalFlow, `${col}30`, -(flow.operational + flow.otherCosts));
    totalFlow = setNumber(totalFlow, `${col}31`, -flow.foodBeverages);
    totalFlow = setFormula(totalFlow, `${col}32`, `SUM(${col}30:${col}31)`, -(flow.operational + flow.otherCosts + flow.foodBeverages));

    totalFlow = setNumber(totalFlow, `${col}33`, -(flow.congressesInternships + flow.scholarshipsAndAid));
    totalFlow = setFormula(totalFlow, `${col}34`, `SUM(${col}33)`, -(flow.congressesInternships + flow.scholarshipsAndAid));

    // OVERHEAD / RETENCIONES y resultados finales.
    totalFlow = setNumber(totalFlow, `${col}35`, -flow.centralOverhead);
    totalFlow = setNumber(totalFlow, `${col}36`, -flow.facultyOverhead);
    totalFlow = setFormula(totalFlow, `${col}37`, `SUM(${col}35:${col}36)`, -(flow.centralOverhead + flow.facultyOverhead));
    totalFlow = setFormula(totalFlow, `${col}38`, `SUM(${col}12,${col}17,${col}20,${col}22,${col}25,${col}27,${col}29,${col}32,${col}34,${col}37)`, -flow.totalExpenses);
    totalFlow = setFormula(totalFlow, `${col}39`, `+${col}8+${col}38`, flow.netFlow);

    if (index === 0) {
      totalFlow = setNumber(totalFlow, `${col}40`, flow.startingCarryover);
    } else {
      const previousCol = yearColumn(index - 1);
      totalFlow = setFormula(totalFlow, `${col}40`, `+${previousCol}41`, flow.startingCarryover);
    }
    totalFlow = setFormula(totalFlow, `${col}41`, `+SUM(${col}39:${col}40)`, flow.accumulatedFlow);
    totalFlow = setFormula(totalFlow, `${col}42`, `IFERROR((${col}8+${col}38)/${col}8,0)`, flow.operatingMargin ?? 0);
  }
  files.set(totalSheetName, encoder.encode(totalFlow));

  // Asegura los rótulos del modelo de referencia cuando la plantilla histórica los traiga distintos.
  if (files.has(parameterSheetName)) {
    let parametersSheet = decoder.decode(files.get(parameterSheetName)!);
    const otherHonorariaRow = 15 + discountSlots;
    if (cellPattern(`A${otherHonorariaRow}`).test(parametersSheet)) parametersSheet = setText(parametersSheet, `A${otherHonorariaRow}`, "Asistencia técnica ");
    files.set(parameterSheetName, encoder.encode(parametersSheet));
  }
  if (files.has(staffSheetName)) {
    let staffSheet = decoder.decode(files.get(staffSheetName)!);
    const extraYears = Math.max(0, result.years.length - 2);
    const thirdTitleRow = 20 + 6 * extraYears;
    if (cellPattern(`A${thirdTitleRow}`).test(staffSheet)) staffSheet = setText(staffSheet, `A${thirdTitleRow}`, "Asistencia técnica ");
    files.set(staffSheetName, encoder.encode(staffSheet));
  }

  // Punto de equilibrio = costos fijos / aporte unitario, usando el mismo flujo autoritativo.
  const fixedCosts = `ABS(SUM('FLUJO TOTAL'!${firstYearColumn}38:${lastYearColumn}38)-SUM('FLUJO TOTAL'!${firstYearColumn}37:${lastYearColumn}37)-SUM('FLUJO TOTAL'!${firstYearColumn}11:${lastYearColumn}11))`;
  const netContribution = `SUM('FLUJO TOTAL'!${firstYearColumn}5:${lastYearColumn}5)+SUM('FLUJO TOTAL'!${firstYearColumn}6:${lastYearColumn}6)+SUM('FLUJO TOTAL'!${firstYearColumn}7:${lastYearColumn}7)+SUM('FLUJO TOTAL'!${firstYearColumn}37:${lastYearColumn}37)+SUM('FLUJO TOTAL'!${firstYearColumn}11:${lastYearColumn}11)`;
  const formula = `IFERROR(${fixedCosts}*${firstYearColumn}${equivalentStudentsRow}/(${netContribution}),0)`;

  let studentSheet = decoder.decode(files.get(studentSheetName)!);
  studentSheet = setFormula(studentSheet, `${firstYearColumn}${equilibriumRow}`, formula, equilibrium.minimumEquivalentEnrollmentsExact ?? 0);
  files.set(studentSheetName, encoder.encode(studentSheet));

  files.delete("xl/calcChain.xml");
  const workbookName = "xl/workbook.xml";
  if (files.has(workbookName)) {
    const workbookXml = decoder.decode(files.get(workbookName)!);
    files.set(workbookName, encoder.encode(workbookXml.replace(/<calcPr[^>]*\/>/, '<calcPr calcMode="auto" fullCalcOnLoad="1" forceFullCalc="1"/>')));
  }
  const relsName = "xl/_rels/workbook.xml.rels";
  if (files.has(relsName)) files.set(relsName, encoder.encode(decoder.decode(files.get(relsName)!).replace(/<Relationship[^>]*calcChain[^>]*\/>/g, "")));
  const contentTypesName = "[Content_Types].xml";
  if (files.has(contentTypesName)) files.set(contentTypesName, encoder.encode(decoder.decode(files.get(contentTypesName)!).replace(/<Override[^>]*calcChain[^>]*\/>/g, "")));

  return zip(files);
}
