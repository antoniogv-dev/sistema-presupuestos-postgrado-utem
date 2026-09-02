import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const { calculateBudget } = await import(pathToFileURL(path.join(root, ".engine-build/lib/calculations/budget-engine.js")).href);
const { normalizedTuitionDistribution } = await import(pathToFileURL(path.join(root, ".engine-build/lib/calculations/billing.js")).href);
const { demoBudget, institutionalParameters } = await import(pathToFileURL(path.join(root, ".engine-build/lib/demo-data.js")).href);

function threeSemester(startSemester = 1) {
  const b = structuredClone(demoBudget);
  b.startYear = 2027;
  b.startSemester = startSemester;
  b.durationSemesters = 3;
  b.initialStudents = 10;
  b.tuitionPricingMode = "PROGRAM_TOTAL";
  b.enrollmentBillingMode = "SINGLE_SPECIAL";
  b.programTotalTuition = 6_000_000;
  b.singleEnrollmentFee = 200_000;
  b.semesterEnrollmentFee = 100_000;
  b.tuitionInstallments = 18;
  b.tuitionDistributionMode = "PROPORTIONAL";
  b.tuitionSemesterDistribution = [1/3, 1/3, 1/3];
  b.enrollmentRecognitionRate = 1;
  b.badDebtRate = 0;
  b.facultyOverheadRate = 0.1;
  b.scholarshipsEnabled = false;
  b.discounts = [];
  const periods = startSemester === 1
    ? [[2027,1],[2027,2],[2028,1]]
    : [[2027,2],[2028,1],[2028,2]];
  b.semesters = periods.map(([year, semester], index) => ({
    ...structuredClone(demoBudget.semesters[Math.min(index, demoBudget.semesters.length - 1)]),
    year, semester, activeStudents: 10, graduatingStudents: index === 2 ? 10 : 0,
    directTeachingHours: 0, synchronousTeachingHours: 0, asynchronousTeachingHours: 0, replacementTeachingHours: 0,
  }));
  b.annualOverrides = [];
  b.manualItems = [];
  b.externalIncome = [];
  b.sharedCourses = [];
  return b;
}

test("v11.1.0: arancel total de 3 semestres iniciado en 1S se distribuye 2/3 y 1/3 por año", () => {
  const b = threeSemester(1);
  const r = calculateBudget(b, institutionalParameters);
  assert.deepEqual(r.years, [2027, 2028]);
  assert.equal(Math.round(r.annualFlows[0].grossTuition), 40_000_000);
  assert.equal(Math.round(r.annualFlows[1].grossTuition), 20_000_000);
  assert.equal(Math.round(r.annualFlows.reduce((s, f) => s + f.grossTuition, 0)), 60_000_000);
  assert.equal(Math.round(r.annualFlows[0].grossEnrollmentFee), 2_000_000);
  assert.equal(Math.round(r.annualFlows[1].grossEnrollmentFee), 0);
});

test("v11.1.0: arancel total iniciado en 2S se distribuye 1/3 y 2/3 por año", () => {
  const b = threeSemester(2);
  const r = calculateBudget(b, institutionalParameters);
  assert.equal(Math.round(r.annualFlows[0].grossTuition), 20_000_000);
  assert.equal(Math.round(r.annualFlows[1].grossTuition), 40_000_000);
  assert.equal(Math.round(r.annualFlows.reduce((s, f) => s + f.grossTuition, 0)), 60_000_000);
});

test("v11.1.0: matrícula semestral cobra cada semestre sin alterar el arancel total", () => {
  const b = threeSemester(1);
  b.enrollmentBillingMode = "SEMESTER";
  const r = calculateBudget(b, institutionalParameters);
  assert.equal(Math.round(r.annualFlows[0].grossEnrollmentFee), 2_000_000);
  assert.equal(Math.round(r.annualFlows[1].grossEnrollmentFee), 1_000_000);
  assert.equal(Math.round(r.annualFlows.reduce((s, f) => s + f.grossEnrollmentFee, 0)), 3_000_000);
  assert.equal(Math.round(r.annualFlows.reduce((s, f) => s + f.grossTuition, 0)), 60_000_000);
});

test("v11.1.0: descuento de arancel no descuenta matrícula y descuento de matrícula no descuenta arancel", () => {
  const tuitionDiscount = threeSemester(1);
  tuitionDiscount.discounts = [{ id:"t", name:"20% arancel", target:"TUITION", percentage:0.20, students:10, startYear:2027, startSemester:1, endYear:2028, endSemester:1 }];
  let r = calculateBudget(tuitionDiscount, institutionalParameters);
  assert.equal(Math.round(r.annualFlows.reduce((s, f) => s + f.discounts, 0)), 12_000_000);
  assert.equal(Math.round(r.annualFlows.reduce((s, f) => s + f.tuitionAfterBenefits, 0)), 48_000_000);
  assert.equal(Math.round(r.annualFlows.reduce((s, f) => s + f.grossEnrollmentFee, 0)), 2_000_000);

  const enrollmentDiscount = threeSemester(1);
  enrollmentDiscount.discounts = [{ id:"m", name:"50% matrícula", target:"ENROLLMENT", percentage:0.50, students:10, startYear:2027, startSemester:1, endYear:2028, endSemester:1 }];
  r = calculateBudget(enrollmentDiscount, institutionalParameters);
  assert.equal(Math.round(r.annualFlows.reduce((s, f) => s + f.discounts, 0)), 0);
  assert.equal(Math.round(r.annualFlows.reduce((s, f) => s + f.enrollmentDiscounts, 0)), 1_000_000);
  assert.equal(Math.round(r.annualFlows.reduce((s, f) => s + f.netEnrollmentFee, 0)), 1_000_000);
  assert.equal(Math.round(r.annualFlows.reduce((s, f) => s + f.grossTuition, 0)), 60_000_000);
});

test("v11.1.0: distribución personalizada 40/35/25 conserva el arancel total", () => {
  const b = threeSemester(1);
  b.tuitionDistributionMode = "CUSTOM";
  b.tuitionSemesterDistribution = [0.40, 0.35, 0.25];
  const distribution = normalizedTuitionDistribution(b);
  assert.deepEqual(distribution.map((p) => Math.round(p.share * 100)), [40,35,25]);
  const r = calculateBudget(b, institutionalParameters);
  assert.equal(Math.round(r.annualFlows[0].grossTuition), 45_000_000);
  assert.equal(Math.round(r.annualFlows[1].grossTuition), 15_000_000);
  assert.equal(Math.round(r.annualFlows.reduce((s, f) => s + f.grossTuition, 0)), 60_000_000);
});

test("v11.1.0: número de cuotas no altera los ingresos", () => {
  const a = threeSemester(1); a.tuitionInstallments = 3;
  const b = threeSemester(1); b.tuitionInstallments = 18;
  const ra = calculateBudget(a, institutionalParameters);
  const rb = calculateBudget(b, institutionalParameters);
  assert.equal(ra.annualFlows.reduce((s,f)=>s+f.totalIncome,0), rb.annualFlows.reduce((s,f)=>s+f.totalIncome,0));
});

test("v11.1.0: presupuesto histórico sin nuevas propiedades conserva la lógica anual", () => {
  const legacy = structuredClone(demoBudget);
  delete legacy.tuitionPricingMode;
  delete legacy.enrollmentBillingMode;
  delete legacy.programTotalTuition;
  delete legacy.singleEnrollmentFee;
  delete legacy.semesterEnrollmentFee;
  delete legacy.tuitionInstallments;
  delete legacy.tuitionDistributionMode;
  delete legacy.tuitionSemesterDistribution;
  const explicit = structuredClone(legacy);
  explicit.tuitionPricingMode = "ANNUAL_LEGACY";
  explicit.enrollmentBillingMode = "ANNUAL";
  const a = calculateBudget(legacy, institutionalParameters);
  const b = calculateBudget(explicit, institutionalParameters);
  assert.deepEqual(a.annualFlows.map(f=>[f.grossTuition,f.grossEnrollmentFee,f.totalIncome]), b.annualFlows.map(f=>[f.grossTuition,f.grossEnrollmentFee,f.totalIncome]));
});
