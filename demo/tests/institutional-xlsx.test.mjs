import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { inflateRawSync } from "node:zlib";
import { createHash } from "node:crypto";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "../..");
const { demoBudget, institutionalParameters, programs } = await import(path.join(root, ".engine-build/lib/demo-data.js"));
const { calculateBudget } = await import(path.join(root, ".engine-build/lib/calculations/budget-engine.js"));
const { applyProgramCurriculumToBudget } = await import(path.join(root, ".engine-build/lib/curriculum/budget-load.js"));
const { createInstitutionalFormulaBudgetXlsx, canUseFormulaTemplate } = await import(path.join(root, ".engine-build/lib/export/institutional-budget-xlsx.js"));

const templatePath = path.join(root, "public/templates/presupuesto-profesional-formula-base-v10-30.xlsx");
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

test("v10.30 usa exclusivamente la plantilla institucional mejorada y versionada", () => {
  assert.equal(sha(template), "24e7b6a886161646d2db9ff9015d261ecaebdb86b6548bd292baddbd5d89853e");
  const files = unzip(template);
  const parametersXml = text(files, "xl/worksheets/sheet1.xml");
  assert.match(parametersXml, /\br="B17"/);
  assert.match(parametersXml, /\br="C17"/);
});

let budget = structuredClone(demoBudget);
budget.deliveryModality = "SEMIPRESENCIAL";
budget.externalIncome = [];
budget.manualItems = [];
budget.program.curriculumCourses = [
  { id: "curr-sync", code: "MIT001", name: "Análisis territorial", semester: 1, kind: "OBLIGATORIA", weeks: 18, sections: 1, theoryWeeklyHours: 2, laboratoryWeeklyHours: 0, workshopWeeklyHours: 2, directWeeklyHours: 4, autonomousWeeklyHours: 4, teachingMode: "SINCRONICA", asynchronousRateFactor: 0.5, sharedWithProgramIds: [], allocationRate: 1, sctCredits: 4, position: 0 },
  { id: "curr-async", code: "MIT002", name: "Modelamiento asincrónico", semester: 2, kind: "ELECTIVA", weeks: 18, sections: 1, theoryWeeklyHours: 2, laboratoryWeeklyHours: 0, workshopWeeklyHours: 2, directWeeklyHours: 4, autonomousWeeklyHours: 4, teachingMode: "ASINCRONICA", asynchronousRateFactor: 0.5, sharedWithProgramIds: [programs[1].id], allocationRate: 0.5, sctCredits: 4, position: 1 },
  { id: "curr-generic", code: "HUMMX001", name: "Inglés", semester: 1, kind: "COMPETENCIA_GENERICA", weeks: 18, sections: 1, theoryWeeklyHours: 0, laboratoryWeeklyHours: 0, workshopWeeklyHours: 0, directWeeklyHours: 0, autonomousWeeklyHours: 4, teachingMode: "SINCRONICA", asynchronousRateFactor: 0.5, sharedWithProgramIds: [], allocationRate: 1, sctCredits: 2, position: 2 },
];
budget = applyProgramCurriculumToBudget(budget);
const result = calculateBudget(budget, institutionalParameters);

test("v10.31 no fracciona estudiantes ni arancel en un segundo año de un solo semestre", async () => {
  const partial = structuredClone(demoBudget);
  partial.durationSemesters = 3;
  partial.initialStudents = 11;
  partial.semesters = partial.semesters.slice(0, 3).map((semester) => ({ ...semester, activeStudents: 11, graduatingStudents: semester.year === 2028 ? 11 : 0 }));
  partial.program.annualTuition = { 2027: 3_937_500, 2028: 3_937_500 };
  partial.annualOverrides = [];
  partial.discounts = [
    { id: "d20", name: "Descuento 20%", percentage: 0.20, students: 5, startYear: 2027, startSemester: 1, endYear: 2028, endSemester: 1 },
    { id: "d30", name: "Descuento 30%", percentage: 0.30, students: 5, startYear: 2027, startSemester: 1, endYear: 2028, endSemester: 1 },
  ];
  partial.externalIncome = [];
  partial.manualItems = [];
  const partialResult = calculateBudget(partial, institutionalParameters);
  const second = partialResult.annualFlows.find((flow) => flow.year === 2028);
  assert.ok(second);
  assert.equal(second.grossTuition, 11 * 3_937_500);
  assert.equal(second.discounts, 5 * 3_937_500 * 0.20 + 5 * 3_937_500 * 0.30);
  assert.equal(second.equivalentEnrollments, 8.5);

  const generated = await createInstitutionalFormulaBudgetXlsx(template, partial, partialResult, institutionalParameters);
  const out = unzip(generated);
  const studentXml = text(out, "xl/worksheets/sheet2.xml");
  assert.equal(cachedNumber(studentXml, "C3"), 1);
  assert.equal(cachedNumber(studentXml, "C4"), 5);
  assert.equal(cachedNumber(studentXml, "C5"), 5);
  assert.equal(cachedNumber(studentXml, "C6"), 11);
  assert.equal(cachedNumber(studentXml, "C7"), 8.5);
  assert.equal(cachedNumber(studentXml, "C13"), 33_468_750);
});

test("v10.30 mantiene el formato institucional con 13 asignaturas valorizables", async () => {
  const extended = structuredClone(budget);
  extended.program.curriculumCourses = Array.from({ length: 13 }, (_, index) => ({
    id: `curr-${index + 1}`,
    code: `CUR${String(index + 1).padStart(3, "0")}`,
    name: `Asignatura ${index + 1}`,
    semester: ((index % 4) + 1),
    kind: index === 12 ? "ELECTIVA" : "OBLIGATORIA",
    weeks: 18,
    sections: index === 12 ? 2 : 1,
    theoryWeeklyHours: 2,
    laboratoryWeeklyHours: 0,
    workshopWeeklyHours: 2,
    directWeeklyHours: 4,
    autonomousWeeklyHours: 4,
    teachingMode: "SINCRONICA",
    asynchronousRateFactor: 0.5,
    sharedWithProgramIds: [],
    allocationRate: 1,
    sctCredits: 4,
    position: index,
  }));
  const applied = applyProgramCurriculumToBudget(extended);
  const extendedResult = calculateBudget(applied, institutionalParameters);
  assert.equal(canUseFormulaTemplate(applied, extendedResult), true);
  const generated = await createInstitutionalFormulaBudgetXlsx(template, applied, extendedResult, institutionalParameters);
  const out = unzip(generated);
  const teachingXml = text(out, "xl/worksheets/sheet3.xml");
  assert.ok(teachingXml.includes("Asignatura 13"), "la fila 16 debe admitir la asignatura valorizable 13");
  assert.match(teachingXml, /<c(?=[^>]*\br="G17")[^>]*>[\s\S]*?<f>SUM\(G4:G16\)<\/f>/);
  assert.match(teachingXml, /<c(?=[^>]*\br="H17")[^>]*>[\s\S]*?<f>SUM\(H4:H16\)<\/f>/);
});

test("v10.30 genera XLSX institucional mejorado, con malla y fórmulas coherentes", async () => {
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

  const parameterXml = text(out, "xl/worksheets/sheet1.xml");
  const studentXml = text(out, "xl/worksheets/sheet2.xml");
  const teachingXml = text(out, "xl/worksheets/sheet3.xml");
  assert.ok(parameterXml.includes("Semipresencial"), "modalidad faltante en Parámetros");
  assert.ok(studentXml.includes("matrículas equivalentes"), "punto de equilibrio no identifica matrículas equivalentes");
  assert.equal(/flujo(?: final)? simulado/i.test(studentXml), false, "no debe exportarse el texto flujo simulado");
  assert.ok(teachingXml.includes("Base estudiantes"), "sección de guía de tesis mejorada faltante");
  assert.ok(teachingXml.includes("Análisis territorial"), "la malla obligatoria no se exportó");
  assert.ok(teachingXml.includes("Modelamiento asincrónico"), "la asignatura asincrónica no se exportó");
  assert.ok(teachingXml.includes("asincrónica 50%"), "el factor asincrónico no quedó trazado");
  assert.ok(teachingXml.includes("compartida 50%"), "la imputación compartida no quedó trazada");
  assert.ok(teachingXml.includes("HUMMX001"), "la competencia genérica no se exportó");

  const formulas = requiredSheets.flatMap((name) => [...formulaMap(text(out, name)).values()]);
  assert.ok(formulas.length >= 120, `se esperaban fórmulas institucionales; encontradas ${formulas.length}`);
  assert.equal(formulas.some((formula) => /#REF!|#NAME\?|#DIV\/0!|#VALUE!/.test(formula)), false);
  assert.ok(formulas.includes("B6*Parámetros!$B$5"), "referencia absoluta de matrícula dañada");
  assert.ok(formulas.includes("SUM(B11,B16,B19,B21,B24,B26,B28,B31,B33,B36)"), "subtotal de costos institucional faltante");
  assert.ok(formulas.includes("+SUM(B38:B39)"), "saldo acumulado institucional faltante");

  const teachingRate = result.annualFlows[0].directTeachingCost > 0 ? result.annualFlows[0].directTeachingCost / cachedNumber(teachingXml, "G17") : 0;
  assert.ok(teachingRate > 0, "la tarifa docente efectiva debe ser positiva");
  assert.ok(Math.abs(cachedNumber(teachingXml, "G18") - result.annualFlows[0].directTeachingCost) < 0.01, "la malla no concilia con el costo docente 2027");

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
