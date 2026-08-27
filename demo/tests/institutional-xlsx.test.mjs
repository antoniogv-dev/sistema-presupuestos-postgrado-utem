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
const { calculateBreakEvenEquivalentEnrollments } = await import(path.join(root, ".engine-build/lib/calculations/break-even.js"));
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
function formulaForCell(sheet, ref) {
  const match = sheet.match(new RegExp(`<c(?=[^>]*\\br="${ref}")[^>]*>[\\s\\S]*?<f(?: [^>]*)?>([\\s\\S]*?)<\\/f>[\\s\\S]*?<\\/c>`));
  assert.ok(match, `No se encontró fórmula ${ref}`);
  return match[1];
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

test("v11.0.2 amplía dinámicamente la hoja para 14 o más asignaturas valorizables", async () => {
  const extended = structuredClone(budget);
  extended.program.curriculumCourses = Array.from({ length: 14 }, (_, index) => ({
    id: `curr-dyn-${index + 1}`,
    code: `DYN${String(index + 1).padStart(3, "0")}`,
    name: `Asignatura dinámica ${index + 1}`,
    semester: ((index % 4) + 1),
    kind: index === 13 ? "ELECTIVA" : "OBLIGATORIA",
    weeks: 18,
    sections: index === 13 ? 2 : 1,
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
  const flowXml = text(out, "xl/worksheets/sheet4.xml");
  assert.ok(teachingXml.includes("Asignatura dinámica 14"), "la fila dinámica 17 debe contener la asignatura 14");
  assert.match(teachingXml, /<dimension ref="A2:H30"\/>/);
  assert.match(teachingXml, /<c(?=[^>]*\br="G18")[^>]*>[\s\S]*?<f>SUM\(G4:G17\)<\/f>/);
  assert.match(teachingXml, /<c(?=[^>]*\br="G19")[^>]*>[\s\S]*?<f>\+G18\*Parámetros!B6<\/f>/);
  assert.match(flowXml, /<c(?=[^>]*\br="B8")[^>]*>[\s\S]*?<f>-'Costo Directo de Docencia'!G19<\/f>/);
  assert.ok(Math.abs(cachedNumber(teachingXml, "G19") - extendedResult.annualFlows[0].directTeachingCost) < 0.01, "la malla dinámica no concilia con el costo docente 2027");
});

test("v11.0.2 amplía también competencias genéricas sin afectar el costo docente", async () => {
  const extended = structuredClone(budget);
  extended.program.curriculumCourses = [
    ...Array.from({ length: 14 }, (_, index) => ({
      id: `curr-pay-${index + 1}`, code: `PAY${index + 1}`, name: `Asignatura ${index + 1}`, semester: ((index % 4) + 1), kind: "OBLIGATORIA", weeks: 18, sections: 1,
      theoryWeeklyHours: 2, laboratoryWeeklyHours: 0, workshopWeeklyHours: 2, directWeeklyHours: 4, autonomousWeeklyHours: 4, teachingMode: "SINCRONICA", asynchronousRateFactor: 0.5,
      sharedWithProgramIds: [], allocationRate: 1, sctCredits: 4, position: index,
    })),
    ...Array.from({ length: 5 }, (_, index) => ({
      id: `curr-gen-${index + 1}`, code: `GEN${index + 1}`, name: `Competencia genérica ${index + 1}`, semester: 1, kind: "COMPETENCIA_GENERICA", weeks: 18, sections: 1,
      theoryWeeklyHours: 0, laboratoryWeeklyHours: 0, workshopWeeklyHours: 0, directWeeklyHours: 0, autonomousWeeklyHours: 4, teachingMode: "SINCRONICA", asynchronousRateFactor: 0.5,
      sharedWithProgramIds: [], allocationRate: 1, sctCredits: 1, position: 14 + index,
    })),
  ];
  const applied = applyProgramCurriculumToBudget(extended);
  const extendedResult = calculateBudget(applied, institutionalParameters);
  assert.equal(canUseFormulaTemplate(applied, extendedResult), true);
  const generated = await createInstitutionalFormulaBudgetXlsx(template, applied, extendedResult, institutionalParameters);
  const out = unzip(generated);
  const teachingXml = text(out, "xl/worksheets/sheet3.xml");
  assert.ok(teachingXml.includes("Competencia genérica 5"));
  assert.match(teachingXml, /<dimension ref="A2:H32"\/>/);
  assert.match(teachingXml, /<c(?=[^>]*\br="B32")[^>]*>[\s\S]*?<f>\+'Flujo estudiantes'!C8<\/f>/);
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
  const studentFormulas = formulaMap(studentXml);
  const equilibriumFormula = formulaForCell(studentXml, "B14");
  assert.match(equilibriumFormula, /^IFERROR\(ROUNDUP\(MAX\(0,/);
  assert.match(equilibriumFormula, /'FLUJO TOTAL'!\$B\$39/);
  assert.match(equilibriumFormula, /Parámetros!\$B\$4/);
  assert.match(equilibriumFormula, /Parámetros!\$B\$12/);
  assert.match(equilibriumFormula, /Parámetros!\$B\$13/);
  assert.match(equilibriumFormula, /Parámetros!\$B\$14/);
  assert.equal(formulaForCell(studentXml, "B15"), "ROUNDUP(B14,0)");
  const equilibrium = calculateBreakEvenEquivalentEnrollments(budget, institutionalParameters);
  assert.ok(Math.abs(cachedNumber(studentXml, "B14") - (equilibrium.minimumEquivalentEnrollments ?? 0)) < 0.01, "el valor cacheado del punto de equilibrio no concilia con el motor");
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

test("v11.0.7 exporta el punto de equilibrio como fórmula Excel trazable y recalculable", async () => {
  const formulaBudget = structuredClone(budget);
  formulaBudget.enrollmentRecognitionRate = 0.5;
  formulaBudget.badDebtRate = 0.08;
  formulaBudget.externalIncome = [{
    id: "fi-equilibrio", type: "Financiamiento institucional", description: "Aporte interno",
    year: result.years[0], semester: 1, students: 0, amountPerStudent: 3500000, source: "UTEM",
  }];
  const formulaResult = calculateBudget(formulaBudget, institutionalParameters);
  const expected = calculateBreakEvenEquivalentEnrollments(formulaBudget, institutionalParameters);
  const generated = await createInstitutionalFormulaBudgetXlsx(template, formulaBudget, formulaResult, institutionalParameters);
  const studentXml = text(unzip(generated), "xl/worksheets/sheet2.xml");
  const formula = formulaForCell(studentXml, "B14");
  assert.match(formula, /^IFERROR\(ROUNDUP\(MAX\(0,/);
  assert.match(formula, /'FLUJO TOTAL'!\$B\$39/);
  assert.match(formula, /'FLUJO TOTAL'!\$B\$37/);
  assert.match(formula, /Parámetros!\$B\$4/);
  assert.match(formula, /Parámetros!\$B\$12/);
  assert.match(formula, /Parámetros!\$B\$13/);
  assert.match(formula, /Parámetros!\$B\$14/);
  assert.match(formula, /\*0\.5/);
  assert.match(formula, /MIN\(\$B\$8,\$C\$8\)/);
  assert.equal(formulaForCell(studentXml, "B15"), "ROUNDUP(B14,0)");
  assert.ok(Math.abs(cachedNumber(studentXml, "B14") - (expected.minimumEquivalentEnrollments ?? 0)) < 0.01);
  assert.equal(cachedNumber(studentXml, "B15"), expected.minimumWholeStudents ?? 0);
});

test("v11.0.3 exporta N descuentos como filas independientes y mantiene las fórmulas conciliadas", async () => {
  const many = structuredClone(budget);
  many.initialStudents = 20;
  many.semesters = many.semesters.map((semester) => ({ ...semester, activeStudents: 20 }));
  many.discounts = [
    { id: "disc-1", name: "Funcionarios públicos", percentage: 0.1, students: 2, startYear: 2027, startSemester: 1, endYear: 2028, endSemester: 2 },
    { id: "disc-2", name: "Convenio institucional A", percentage: 0.2, students: 2, startYear: 2027, startSemester: 1, endYear: 2028, endSemester: 2 },
    { id: "disc-3", name: "Convenio institucional B", percentage: 0.2, students: 2, startYear: 2027, startSemester: 1, endYear: 2028, endSemester: 2 },
    { id: "disc-4", name: "Beneficio especial", percentage: 0.3, students: 2, startYear: 2027, startSemester: 1, endYear: 2028, endSemester: 2 },
    { id: "disc-5", name: "Beca parcial", percentage: 0.4, students: 2, startYear: 2027, startSemester: 1, endYear: 2028, endSemester: 2 },
  ];
  const manyResult = calculateBudget(many, institutionalParameters);
  assert.equal(canUseFormulaTemplate(many, manyResult), true);
  const generated = await createInstitutionalFormulaBudgetXlsx(template, many, manyResult, institutionalParameters);
  const out = unzip(generated);
  const parameterXml = text(out, "xl/worksheets/sheet1.xml");
  const studentXml = text(out, "xl/worksheets/sheet2.xml");
  const flowXml = text(out, "xl/worksheets/sheet4.xml");
  for (const label of ["Funcionarios públicos", "Convenio institucional A", "Convenio institucional B", "Beneficio especial", "Beca parcial"]) {
    assert.ok(parameterXml.includes(label), `Parámetros no contiene ${label}`);
    assert.ok(studentXml.includes(label), `Flujo estudiantes no contiene ${label}`);
  }
  assert.match(parameterXml, /<dimension ref="A1:C20"\/>/);
  assert.match(studentXml, /<dimension ref="A1:C21"\/>/);
  assert.match(studentXml, /<c(?=[^>]*\br="B19")[^>]*>[\s\S]*?<f>SUM\(B13:B18\)<\/f>/);
  const manyStudentFormulas = formulaMap(studentXml);
  assert.match(formulaForCell(studentXml, "B20"), /^IFERROR\(ROUNDUP\(MAX\(0,/);
  assert.equal(formulaForCell(studentXml, "B21"), "ROUNDUP(B20,0)");
  assert.match(flowXml, /<c(?=[^>]*\br="B5")[^>]*>[\s\S]*?<f>'Flujo estudiantes'!B19<\/f>/);
  assert.match(flowXml, /<c(?=[^>]*\br="B6")[^>]*>[\s\S]*?<f>-B5\*Parámetros!B15<\/f>/);
  assert.ok(Math.abs(cachedNumber(studentXml, "B19") - manyResult.annualFlows[0].tuitionAfterBenefits) < 0.01, "los descuentos múltiples no concilian con el ingreso neto 2027");
  assert.equal(/#REF!|#NAME\?|#DIV\/0!|#VALUE!/.test(parameterXml + studentXml + flowXml), false);
});

test("v11.0.4 suma matrícula reconocida y financiamiento institucional fijo sin alterar la base de overhead", async () => {
  const financed = structuredClone(budget);
  financed.enrollmentRecognitionRate = 1;
  financed.externalIncome = [{
    id: "fi-v1104", type: "Financiamiento institucional", description: "Aporte interno proyecto",
    year: result.years[0], semester: 2, students: 99, amountPerStudent: 12500000, source: "UTEM",
  }];
  const financedResult = calculateBudget(financed, institutionalParameters);
  const first = financedResult.annualFlows[0];
  assert.equal(first.institutionalFinancing, 12500000);
  assert.equal(first.externalIncome, 0);
  assert.ok(first.recognizedEnrollmentFee > 0);
  assert.equal(first.totalIncome, first.netTuitionIncome + first.recognizedEnrollmentFee + first.institutionalFinancing + first.otherIncome);
  assert.ok(Math.abs(first.overheadBase - (first.grossTuition - first.discounts - first.badDebt)) < 0.01);
  const generated = await createInstitutionalFormulaBudgetXlsx(template, financed, financedResult, institutionalParameters);
  const flowXml = text(unzip(generated), "xl/worksheets/sheet4.xml");
  assert.ok(Math.abs(cachedNumber(flowXml, "B7") - first.totalIncome) < 0.01, "FLUJO TOTAL no incorpora matrícula reconocida y financiamiento institucional");
  assert.ok(Math.abs(cachedNumber(flowXml, "B34") + first.centralOverhead) < 0.01, "overhead central alterado por ingresos no arancelarios");
});
