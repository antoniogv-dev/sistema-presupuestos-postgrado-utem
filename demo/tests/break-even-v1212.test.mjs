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

test("v12.1.2 concilia la fórmula institucional completa del punto de equilibrio", () => {
  const budget = clone(demoBudget);
  const result = calculateBudget(budget, institutionalParameters);
  const equilibrium = calculateBreakEvenEquivalentEnrollments(budget, institutionalParameters);

  const fixedCosts = Math.abs(result.annualFlows.reduce(
    (total, flow) => total + flow.totalExpenses - flow.centralOverhead - flow.facultyOverhead - flow.thesisGuidanceCost,
    0,
  ));
  const tuitionContribution = result.annualFlows.reduce((total, flow) => {
    const badDebtRate = flow.tuitionAfterBenefits > 0 ? flow.badDebt / flow.tuitionAfterBenefits : 0;
    return total + flow.annualTuition * flow.tuitionFactor
      * (1 - badDebtRate)
      * (1 - flow.centralOverheadRate - flow.facultyOverheadRate);
  }, 0);
  const enrollmentContribution = (
    equilibrium.components.enrollmentPerActualStudent - equilibrium.components.thesisGuidancePerActualStudent
  ) * equilibrium.components.actualStudentsPerEquivalentEnrollment;
  const expected = fixedCosts / (tuitionContribution + enrollmentContribution);

  assert.ok(equilibrium.minimumEquivalentEnrollmentsExact !== null);
  assert.ok(Math.abs(equilibrium.minimumEquivalentEnrollmentsExact - expected) < 1e-9);
  assert.ok(Math.abs(equilibrium.components.fixedCosts - fixedCosts) < 1e-9);
  assert.ok(Math.abs(equilibrium.components.tuitionContribution - tuitionContribution) < 1e-9);
  assert.ok(Math.abs(equilibrium.components.enrollmentContribution - enrollmentContribution) < 1e-9);
});

test("v12.1.2 reconoce la matrícula como aporte: una matrícula mayor reduce el umbral", () => {
  const base = clone(demoBudget);
  const higher = clone(demoBudget);
  const years = [...new Set(higher.semesters.map((semester) => semester.year))];
  higher.annualOverrides = years.map((year) => ({
    ...defaultAnnualOverrideForYear(higher, institutionalParameters, year),
    annualEnrollmentFee: 900000,
  }));

  const before = calculateBreakEvenEquivalentEnrollments(base, institutionalParameters);
  const after = calculateBreakEvenEquivalentEnrollments(higher, institutionalParameters);

  assert.ok(before.minimumEquivalentEnrollmentsExact !== null);
  assert.ok(after.minimumEquivalentEnrollmentsExact !== null);
  assert.ok(after.components.enrollmentPerActualStudent > before.components.enrollmentPerActualStudent);
  assert.ok(after.components.enrollmentContribution > before.components.enrollmentContribution);
  assert.ok(after.minimumEquivalentEnrollmentsExact < before.minimumEquivalentEnrollmentsExact);
});

test("v12.1.2 reclasifica guía de tesis como costo variable por estudiante", () => {
  const base = clone(demoBudget);
  const higherThesis = clone(demoBudget);
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
