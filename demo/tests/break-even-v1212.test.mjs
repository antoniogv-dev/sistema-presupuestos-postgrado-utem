import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "../..");
const { demoBudget, institutionalParameters } = await import(path.join(root, ".engine-build/lib/demo-data.js"));
const { calculateBudget, defaultAnnualOverrideForYear } = await import(path.join(root, ".engine-build/lib/calculations/budget-engine.js"));
const { calculateBreakEvenEquivalentEnrollments } = await import(path.join(root, ".engine-build/lib/calculations/break-even.js"));

const clone = (value) => structuredClone(value);

test("v13.0.1 concilia punto de equilibrio y resultado operacional con una sola identidad", () => {
  const budget = clone(demoBudget);
  budget.enrollmentRecognitionRate = 1;
  const result = calculateBudget(budget, institutionalParameters);
  const equilibrium = calculateBreakEvenEquivalentEnrollments(budget, institutionalParameters);

  assert.ok(equilibrium.minimumEquivalentEnrollmentsExact !== null);
  const expectedOperationalResult = equilibrium.currentEquivalentEnrollments
    * equilibrium.components.contributionPerEquivalentEnrollment
    - equilibrium.components.fixedCosts;

  assert.ok(Math.abs(equilibrium.components.operationalResult - expectedOperationalResult) < 1e-6);
  assert.equal(result.viable, equilibrium.currentEquivalentEnrollments + 1e-9 >= equilibrium.minimumEquivalentEnrollmentsExact);
  assert.equal(equilibrium.reached, result.viable);
});

test("v13.0.1 reconoce matrícula sólo en la proporción configurada como ingreso", () => {
  const base = clone(demoBudget);
  const higher = clone(demoBudget);
  base.enrollmentRecognitionRate = 1;
  higher.enrollmentRecognitionRate = 1;
  const years = [...new Set(higher.semesters.map((semester) => semester.year))];
  higher.annualOverrides = years.map((year) => ({
    ...defaultAnnualOverrideForYear(higher, institutionalParameters, year),
    annualEnrollmentFee: 900000,
  }));

  const before = calculateBreakEvenEquivalentEnrollments(base, institutionalParameters);
  const after = calculateBreakEvenEquivalentEnrollments(higher, institutionalParameters);

  assert.ok(before.minimumEquivalentEnrollmentsExact !== null);
  assert.ok(after.minimumEquivalentEnrollmentsExact !== null);
  assert.ok(after.components.recognizedEnrollmentPerActualStudent > before.components.recognizedEnrollmentPerActualStudent);
  assert.ok(after.components.enrollmentContribution > before.components.enrollmentContribution);
  assert.ok(after.minimumEquivalentEnrollmentsExact < before.minimumEquivalentEnrollmentsExact);
});

test("v13.0.1 con reconocimiento de matrícula 0% no reduce artificialmente el equilibrio", () => {
  const base = clone(demoBudget);
  const higher = clone(demoBudget);
  base.enrollmentRecognitionRate = 0;
  higher.enrollmentRecognitionRate = 0;
  const years = [...new Set(higher.semesters.map((semester) => semester.year))];
  higher.annualOverrides = years.map((year) => ({
    ...defaultAnnualOverrideForYear(higher, institutionalParameters, year),
    annualEnrollmentFee: 900000,
  }));

  const before = calculateBreakEvenEquivalentEnrollments(base, institutionalParameters);
  const after = calculateBreakEvenEquivalentEnrollments(higher, institutionalParameters);

  assert.equal(before.components.recognizedEnrollmentPerActualStudent, 0);
  assert.equal(after.components.recognizedEnrollmentPerActualStudent, 0);
  assert.ok(Math.abs((before.minimumEquivalentEnrollmentsExact ?? 0) - (after.minimumEquivalentEnrollmentsExact ?? 0)) < 1e-9);
});

test("v13.0.1 si 8 equivalentes superan el equilibrio el presupuesto es viable", () => {
  const budget = clone(demoBudget);
  budget.enrollmentRecognitionRate = 1;
  budget.discounts = [];
  budget.initialStudents = 8;
  budget.semesters.forEach((semester) => { semester.activeStudents = 8; });

  const result = calculateBudget(budget, institutionalParameters);
  const equilibrium = calculateBreakEvenEquivalentEnrollments(budget, institutionalParameters);

  assert.equal(equilibrium.currentEquivalentEnrollments, 8);
  assert.ok(equilibrium.minimumEquivalentEnrollmentsExact !== null);
  assert.ok(equilibrium.minimumEquivalentEnrollmentsExact < 8);
  assert.ok(equilibrium.components.operationalResult > 0);
  assert.equal(equilibrium.reached, true);
  assert.equal(result.viable, true);
});

test("v13.0.1 mantiene guía de tesis como costo variable por estudiante", () => {
  const base = clone(demoBudget);
  const higherThesis = clone(demoBudget);
  base.enrollmentRecognitionRate = 1;
  higherThesis.enrollmentRecognitionRate = 1;
  const lastYear = Math.max(...higherThesis.semesters.map((semester) => semester.year));
  higherThesis.annualOverrides = [...new Set(higherThesis.semesters.map((semester) => semester.year))].map((year) => ({
    ...defaultAnnualOverrideForYear(higherThesis, institutionalParameters, year),
    thesisGuidancePerGraduatingStudent: year === lastYear ? 1200000 : defaultAnnualOverrideForYear(higherThesis, institutionalParameters, year).thesisGuidancePerGraduatingStudent,
  }));
  higherThesis.semesters.forEach((semester) => { semester.graduatingStudents = semester.year === lastYear ? Math.max(1, semester.activeStudents) : 0; });

  const before = calculateBreakEvenEquivalentEnrollments(base, institutionalParameters);
  const after = calculateBreakEvenEquivalentEnrollments(higherThesis, institutionalParameters);

  assert.ok(after.components.thesisGuidancePerActualStudent >= before.components.thesisGuidancePerActualStudent);
  assert.ok(after.components.fixedCosts <= calculateBudget(higherThesis, institutionalParameters).annualFlows.reduce((sum, flow) => sum + flow.totalExpenses, 0));
});
