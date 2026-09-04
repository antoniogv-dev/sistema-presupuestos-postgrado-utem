import test from "node:test";
import assert from "node:assert/strict";
import { calculateBudget } from "../../.engine-build/lib/calculations/budget-engine.js";
import { buildAdaptiveCashflowColumns, adaptiveCashflowReconciliation } from "../../.engine-build/lib/finance/cashflow-view.js";
import { demoBudgets, institutionalParameters } from "../../.engine-build/lib/demo-data.js";

function threeSemesterBudget() {
  const b = structuredClone(demoBudgets[0]);
  b.startYear = 2027;
  b.startSemester = 1;
  b.durationSemesters = 3;
  b.initialStudents = 10;
  b.enrollmentBillingMode = "SEMESTER";
  b.semesterEnrollmentFee = 200000;
  b.semesters = [
    { ...b.semesters[0], year: 2027, semester: 1, activeStudents: 10 },
    { ...b.semesters[0], year: 2027, semester: 2, activeStudents: 10 },
    { ...b.semesters[0], year: 2028, semester: 1, activeStudents: 10 },
  ];
  b.annualOverrides = b.annualOverrides.filter((x) => x.year === 2027 || x.year === 2028);
  return b;
}

test("v13.0.0: cambia Semestral/Anual/Ciclo sin alterar el resultado", () => {
  const result = calculateBudget(threeSemesterBudget(), institutionalParameters);
  const sem = buildAdaptiveCashflowColumns(result, "SEMESTER");
  const annual = buildAdaptiveCashflowColumns(result, "ANNUAL");
  const cycle = buildAdaptiveCashflowColumns(result, "CYCLE");
  assert.deepEqual(sem.map((x) => x.label), ["2027-1S", "2027-2S", "2028-1S"]);
  assert.deepEqual(annual.map((x) => x.label), ["2027", "2028"]);
  assert.equal(cycle.length, 1);
  assert.equal(cycle[0].label, "Ciclo completo");
  const check = adaptiveCashflowReconciliation(result);
  assert.ok(Math.abs(check.semesterIncome - check.annualIncome) < 0.01);
  assert.ok(Math.abs(check.semesterExpenses - check.annualExpenses) < 0.01);
  assert.ok(Math.abs(check.semesterNet - check.annualNet) < 0.01);
  assert.ok(Math.abs((cycle[0].values.accumulatedFlow ?? 0) - result.finalAccumulatedFlow) < 0.01);
});

test("v13.0.0: matrícula semestral de 3 periodos se visualiza en los tres semestres", () => {
  const result = calculateBudget(threeSemesterBudget(), institutionalParameters);
  const sem = buildAdaptiveCashflowColumns(result, "SEMESTER");
  assert.deepEqual(sem.map((x) => x.values.grossEnrollmentFee), [2000000, 2000000, 2000000]);
});

test("v13.0.0: tres semestres admiten matrícula total, anual y semestral", async () => {
  const { enrollmentChargePeriodsForBudget } = await import("../../.engine-build/lib/calculations/billing.js");
  const base = threeSemesterBudget();
  base.startSemester = 1;
  base.durationSemesters = 3;
  base.enrollmentBillingMode = "SINGLE_SPECIAL";
  assert.equal(enrollmentChargePeriodsForBudget(base).length, 1);
  base.enrollmentBillingMode = "ANNUAL";
  assert.equal(enrollmentChargePeriodsForBudget(base).length, 2);
  base.enrollmentBillingMode = "SEMESTER";
  assert.equal(enrollmentChargePeriodsForBudget(base).length, 3);
});

test("v13.0.0: rechaza programas de un semestre porque la duración válida es de 2 a 8", async () => {
  const { getActivePeriods } = await import("../../.engine-build/lib/calculations/periods.js");
  assert.throws(
    () => getActivePeriods(2027, 2, 1),
    /La duración debe estar entre 2 y 8 semestres\./,
  );
});
