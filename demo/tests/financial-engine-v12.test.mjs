import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const { calculateBudget } = await import(pathToFileURL(path.join(root, ".engine-build/lib/calculations/budget-engine.js")).href);
const { demoBudget, institutionalParameters } = await import(pathToFileURL(path.join(root, ".engine-build/lib/demo-data.js")).href);

function threeSemester(startSemester = 1) {
  const budget = structuredClone(demoBudget);
  budget.startYear = 2027;
  budget.startSemester = startSemester;
  budget.durationSemesters = 3;
  budget.initialStudents = 10;
  budget.tuitionPricingMode = "PROGRAM_TOTAL";
  budget.enrollmentBillingMode = "SINGLE_SPECIAL";
  budget.programTotalTuition = 6_000_000;
  budget.singleEnrollmentFee = 200_000;
  budget.semesterEnrollmentFee = 100_000;
  budget.tuitionInstallments = 18;
  budget.tuitionDistributionMode = "PROPORTIONAL";
  budget.tuitionSemesterDistribution = [1/3, 1/3, 1/3];
  budget.enrollmentRecognitionRate = 1;
  budget.badDebtRate = 0;
  budget.facultyOverheadRate = 0.1;
  budget.scholarshipsEnabled = false;
  budget.discounts = [];
  const periods = startSemester === 1 ? [[2027,1],[2027,2],[2028,1]] : [[2027,2],[2028,1],[2028,2]];
  budget.semesters = periods.map(([year, semester], index) => ({
    ...structuredClone(demoBudget.semesters[Math.min(index, demoBudget.semesters.length - 1)]),
    year, semester, activeStudents: 10, graduatingStudents: index === 2 ? 10 : 0,
    directTeachingHours: 0, synchronousTeachingHours: 0, asynchronousTeachingHours: 0, replacementTeachingHours: 0,
  }));
  budget.annualOverrides = [];
  budget.manualItems = [];
  budget.externalIncome = [];
  budget.sharedCourses = [];
  return budget;
}

test("v12: presupuesto histórico conserva exactamente los principales resultados de v11.1.0", () => {
  const result = calculateBudget(structuredClone(demoBudget), institutionalParameters);
  assert.deepEqual(result.years, [2027, 2028]);
  assert.deepEqual(result.annualFlows.map((flow) => ({
    year: flow.year,
    grossTuition: flow.grossTuition,
    discounts: flow.discounts,
    badDebt: flow.badDebt,
    netTuitionIncome: flow.netTuitionIncome,
    grossEnrollmentFee: flow.grossEnrollmentFee,
    totalIncome: flow.totalIncome,
    totalExpenses: flow.totalExpenses,
    netFlow: flow.netFlow,
    accumulatedFlow: flow.accumulatedFlow,
  })), [
    { year: 2027, grossTuition: 68512500, discounts: 9135000, badDebt: 8906625, netTuitionIncome: 50470875, grossEnrollmentFee: 2882250, totalIncome: 50470875, totalExpenses: 29811953.5, netFlow: 20658921.5, accumulatedFlow: 20658921.5 },
    { year: 2028, grossTuition: 67142250, discounts: 9591750, badDebt: 8632575, netTuitionIncome: 48917925, grossEnrollmentFee: 2824612, totalIncome: 51317925, totalExpenses: 32813052.5, netFlow: 18504872.5, accumulatedFlow: 39163794 },
  ]);
  assert.equal(result.finalAccumulatedFlow, 39163794);
});

test("v12: el ledger semestral separa precio del programa de reconocimiento presupuestario", () => {
  const result = calculateBudget(threeSemester(1), institutionalParameters);
  assert.equal(result.pricing.pricingMode, "PROGRAM_TOTAL");
  assert.equal(result.pricing.programTotalTuition, 6_000_000);
  assert.equal(result.pricing.equivalentTuitionPerSemester, 2_000_000);
  assert.deepEqual(result.revenueLedger.map((line) => [line.year, line.semester, line.tuitionUnitPrice, line.grossTuition]), [
    [2027, 1, 2_000_000, 20_000_000],
    [2027, 2, 2_000_000, 20_000_000],
    [2028, 1, 2_000_000, 20_000_000],
  ]);
  assert.equal(result.revenueLedger.reduce((total, line) => total + line.grossTuition, 0), 60_000_000);
});

test("v12: iniciar en 2S cambia el año de reconocimiento pero no el precio total", () => {
  const result = calculateBudget(threeSemester(2), institutionalParameters);
  assert.deepEqual(result.revenueLedger.map((line) => [line.year, line.semester, line.tuitionUnitPrice]), [
    [2027, 2, 2_000_000],
    [2028, 1, 2_000_000],
    [2028, 2, 2_000_000],
  ]);
  assert.equal(result.pricing.programTotalTuition, 6_000_000);
  assert.deepEqual(result.annualFlows.map((flow) => Math.round(flow.grossTuition)), [20_000_000, 40_000_000]);
});

test("v12: distribución personalizada vive en el ledger y conserva 100% del arancel", () => {
  const budget = threeSemester(1);
  budget.tuitionDistributionMode = "CUSTOM";
  budget.tuitionSemesterDistribution = [0.40, 0.35, 0.25];
  const result = calculateBudget(budget, institutionalParameters);
  assert.deepEqual(result.revenueLedger.map((line) => Math.round(line.tuitionUnitPrice)), [2_400_000, 2_100_000, 1_500_000]);
  assert.equal(result.revenueLedger.reduce((total, line) => total + line.grossTuition, 0), 60_000_000);
});

test("v12: las cuotas son forma de pago y nunca modifican el ledger de ingresos", () => {
  const a = threeSemester(1); a.tuitionInstallments = 3;
  const b = threeSemester(1); b.tuitionInstallments = 18;
  const ra = calculateBudget(a, institutionalParameters);
  const rb = calculateBudget(b, institutionalParameters);
  assert.deepEqual(ra.revenueLedger, rb.revenueLedger);
  assert.notEqual(ra.pricing.tuitionInstallments, rb.pricing.tuitionInstallments);
});

test("v12: matrícula única y semestral se reconocen en periodos distintos sin tocar arancel", () => {
  const single = threeSemester(1);
  const semester = threeSemester(1); semester.enrollmentBillingMode = "SEMESTER";
  const a = calculateBudget(single, institutionalParameters);
  const b = calculateBudget(semester, institutionalParameters);
  assert.deepEqual(a.revenueLedger.map((line) => line.grossEnrollmentFee), [2_000_000, 0, 0]);
  assert.deepEqual(b.revenueLedger.map((line) => line.grossEnrollmentFee), [1_000_000, 1_000_000, 1_000_000]);
  assert.equal(a.revenueLedger.reduce((total, line) => total + line.grossTuition, 0), b.revenueLedger.reduce((total, line) => total + line.grossTuition, 0));
});
