import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { inflateRawSync } from "node:zlib";
import { createHash } from "node:crypto";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "../..");
const { demoBudget, institutionalParameters } = await import(path.join(root, ".engine-build/lib/demo-data.js"));
const { calculateBudget } = await import(path.join(root, ".engine-build/lib/calculations/budget-engine.js"));
const { createInstitutionalFormulaBudgetXlsx, canUseFormulaTemplate } = await import(path.join(root, ".engine-build/lib/export/institutional-budget-xlsx.js"));

const templatePath = path.join(root, "public/templates/presupuesto-profesional-formula-base.xlsx");
const template = new Uint8Array(readFileSync(templatePath));

function u16(view, offset) { return view.getUint16(offset, true); }
function u32(view, offset) { return view.getUint32(offset, true); }
function unzip(bytes) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let eocd = -1;
  for (let offset = bytes.byteLength - 22; offset >= Math.max(0, bytes.byteLength - 65557); offset -= 1) {
    if (u32(view, offset) === 0x06054b50) { eocd = offset; break; }
  }
  assert.notEqual(eocd, -1, "XLSX sin EOCD");
  const count = u16(view, eocd + 10);
  let central = u32(view, eocd + 16);
  const files = new Map();
  const decoder = new TextDecoder();
  for (let i = 0; i < count; i += 1) {
    assert.equal(u32(view, central), 0x02014b50, "directorio ZIP inválido");
    const method = u16(view, central + 10);
    const compressedSize = u32(view, central + 20);
    const nameLength = u16(view, central + 28);
    const extraLength = u16(view, central + 30);
    const commentLength = u16(view, central + 32);
    const local = u32(view, central + 42);
    const name = decoder.decode(bytes.subarray(central + 46, central + 46 + nameLength));
    const localNameLength = u16(view, local + 26);
    const localExtraLength = u16(view, local + 28);
    const start = local + 30 + localNameLength + localExtraLength;
    const compressed = bytes.subarray(start, start + compressedSize);
    const content = method === 0 ? new Uint8Array(compressed) : new Uint8Array(inflateRawSync(compressed));
    files.set(name, content);
    central += 46 + nameLength + extraLength + commentLength;
  }
  return files;
}
function text(files, name) { return new TextDecoder().decode(files.get(name)); }
function sha(bytes) { return createHash("sha256").update(bytes).digest("hex"); }
function formulaMap(sheet) {
  const map = new Map();
  for (const match of sheet.matchAll(/<c[^>]*\br="([A-Z]+\d+)"[^>]*>[\s\S]*?<f(?: [^>]*)?>([\s\S]*?)<\/f>[\s\S]*?<\/c>/g)) map.set(match[1], match[2]);
  return map;
}
function cachedNumber(sheet, ref) {
  const match = sheet.match(new RegExp(`<c(?=[^>]*\\br="${ref}")[^>]*>[\\s\\S]*?<v>([-+0-9.eE]+)<\\/v>[\\s\\S]*?<\\/c>`));
  assert.ok(match, `No se encontró valor cacheado ${ref}`);
  return Number(match[1]);
}
function stripSheetData(xml) { return xml.replace(/<sheetData>[\s\S]*?<\/sheetData>/, "<sheetData/>"); }

const budget = structuredClone(demoBudget);
budget.deliveryModality = "SEMIPRESENCIAL";
budget.semesters = budget.semesters.map((semester) => ({
  ...semester,
  directTeachingHours: 0,
  synchronousTeachingHours: semester.directTeachingHours,
  asynchronousTeachingHours: 0,
}));
budget.externalIncome = [];
budget.manualItems = [];
const result = calculateBudget(budget, institutionalParameters);

test("v10.25 genera XLSX institucional formulado, estructuralmente fiel al modelo", async () => {
  assert.equal(canUseFormulaTemplate(budget, result), true);
  const generated = await createInstitutionalFormulaBudgetXlsx(template, budget, result, institutionalParameters);
  assert.ok(generated.byteLength > template.byteLength, "el XLSX generado debe contener fórmulas/cachés dinámicos");

  const ref = unzip(template);
  const out = unzip(generated);
  const requiredSheets = [1,2,3,4,5].map((n) => `xl/worksheets/sheet${n}.xml`);
  for (const name of requiredSheets) assert.ok(out.has(name), `falta ${name}`);

  // Formato y estructura externa a las celdas: exactamente los del modelo institucional.
  assert.equal(sha(out.get("xl/styles.xml")), sha(ref.get("xl/styles.xml")), "styles.xml cambió");
  assert.equal(sha(out.get("xl/theme/theme1.xml")), sha(ref.get("xl/theme/theme1.xml")), "tema cambió");
  for (const name of requiredSheets) {
    assert.equal(stripSheetData(text(out, name)), stripSheetData(text(ref, name)), `${name}: cambió estructura fuera de sheetData`);
  }

  const workbook = text(out, "xl/workbook.xml");
  for (const name of ["Parámetros", "Flujo estudiantes", "Costo Directo de Docencia", "FLUJO TOTAL", "Prorrateo Staff"]) assert.ok(workbook.includes(`name="${name}"`));
  assert.match(workbook, /calcMode="auto"/);
  assert.match(workbook, /fullCalcOnLoad="1"/);
  assert.match(workbook, /forceFullCalc="1"/);
  assert.equal(out.has("xl/calcChain.xml"), false, "calcChain obsoleto no debe sobrevivir");

  const formulas = requiredSheets.flatMap((name) => [...formulaMap(text(out, name)).values()]);
  assert.ok(formulas.length >= 120, `se esperaban fórmulas institucionales; encontradas ${formulas.length}`);
  assert.equal(formulas.some((formula) => /#REF!|#NAME\?|#DIV\/0!|#VALUE!/.test(formula)), false);
  assert.ok(formulas.includes("B6*Parámetros!$B$4"), "referencia absoluta de matrícula dañada");
  assert.ok(formulas.includes("SUM(B11,B16,B19,B21,B24,B26,B28,B31,B33,B36)"), "subtotal de costos institucional faltante");
  assert.ok(formulas.includes("+SUM(B38:B39)"), "saldo acumulado institucional faltante");

  const flowXml = text(out, "xl/worksheets/sheet4.xml");
  const first = result.annualFlows[0];
  const second = result.annualFlows[1];
  assert.ok(Math.abs(cachedNumber(flowXml, "B7") - first.totalIncome) < 0.01);
  assert.ok(Math.abs(cachedNumber(flowXml, "C7") - second.totalIncome) < 0.01);
  assert.ok(Math.abs(cachedNumber(flowXml, "B37") + first.totalExpenses) < 0.01);
  assert.ok(Math.abs(cachedNumber(flowXml, "C37") + second.totalExpenses) < 0.01);
  assert.ok(Math.abs(cachedNumber(flowXml, "B38") - first.netFlow) < 0.01);
  assert.ok(Math.abs(cachedNumber(flowXml, "C38") - second.netFlow) < 0.01);
  assert.ok(Math.abs(cachedNumber(flowXml, "C40") - second.accumulatedFlow) < 0.01);
});
