import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "../..");
const { demoBudget, institutionalParameters, programs } = await import(path.join(root, ".engine-build/lib/demo-data.js"));
const { applyProgramCurriculumToBudget } = await import(path.join(root, ".engine-build/lib/curriculum/budget-load.js"));
const { calculateBudget, defaultAnnualOverrideForYear } = await import(path.join(root, ".engine-build/lib/calculations/budget-engine.js"));

function course(patch = {}) {
  return { id: "c1", code: "CURR001", name: "Asignatura", semester: 1, kind: "OBLIGATORIA", weeks: 18, sections: 1, theoryWeeklyHours: 2, laboratoryWeeklyHours: 0, workshopWeeklyHours: 2, directWeeklyHours: 4, autonomousWeeklyHours: 4, teachingMode: "SINCRONICA", asynchronousRateFactor: 0.5, sharedWithProgramIds: [], allocationRate: 1, sctCredits: 4, position: 0, ...patch };
}
function setRate(budget, value) {
  const years = [...new Set(budget.semesters.map((s) => s.year))];
  budget.annualOverrides = years.map((year) => ({ ...defaultAnnualOverrideForYear(budget, institutionalParameters, year), directTeachingHourValue: value, synchronousTeachingHourValue: value, asynchronousTeachingHourValue: value }));
}

test("v10.27 malla sincrónica se valoriza aunque la modalidad global sea presencial", () => {
  const budget = structuredClone(demoBudget);
  budget.deliveryModality = "PRESENCIAL";
  budget.program.curriculumCourses = [course({ teachingMode: "SINCRONICA" })];
  setRate(budget, 30_000);
  const applied = applyProgramCurriculumToBudget(budget);
  assert.equal(applied.semesters[0].directTeachingHours, 0);
  assert.equal(applied.semesters[0].synchronousTeachingHours, 72);
  const result = calculateBudget(applied, institutionalParameters);
  assert.equal(result.annualFlows[0].synchronousTeachingCost, 2_160_000);
  assert.equal(result.annualFlows[0].directTeachingCost, 2_160_000);
});

test("v10.26 factor asincrónico 50% transforma $30.000 en costo equivalente $15.000/h", () => {
  const budget = structuredClone(demoBudget);
  budget.deliveryModality = "SEMIPRESENCIAL";
  budget.program.curriculumCourses = [course({ teachingMode: "ASINCRONICA", asynchronousRateFactor: 0.5 })];
  setRate(budget, 30_000);
  const applied = applyProgramCurriculumToBudget(budget);
  assert.equal(applied.semesters[0].asynchronousTeachingHours, 36);
  const result = calculateBudget(applied, institutionalParameters);
  assert.equal(result.annualFlows[0].asynchronousTeachingCost, 1_080_000);
  assert.equal(result.annualFlows[0].directTeachingCost, 1_080_000);
});

test("v10.26 asignatura compartida imputa sólo el porcentaje definido", () => {
  const budget = structuredClone(demoBudget);
  budget.deliveryModality = "SEMIPRESENCIAL";
  budget.program.curriculumCourses = [course({ sections: 2, sharedWithProgramIds: [programs[1].id], allocationRate: 0.5 })];
  setRate(budget, 30_000);
  const applied = applyProgramCurriculumToBudget(budget);
  assert.equal(applied.semesters[0].synchronousTeachingHours, 144);
  const result = calculateBudget(applied, institutionalParameters);
  assert.equal(result.annualFlows[0].sharedCourseSavings, 2_160_000);
  assert.equal(result.annualFlows[0].synchronousTeachingCost, 2_160_000);
});

test("v10.26 competencias genéricas permanecen fuera del flujo financiero", () => {
  const budget = structuredClone(demoBudget);
  budget.program.curriculumCourses = [course({ kind: "COMPETENCIA_GENERICA", code: "HUMMX001", name: "Inglés", directWeeklyHours: 4 })];
  setRate(budget, 30_000);
  const applied = applyProgramCurriculumToBudget(budget);
  assert.equal(applied.semesters[0].directTeachingHours, 0);
  assert.equal(applied.semesters[0].synchronousTeachingHours, 0);
  assert.equal(applied.semesters[0].asynchronousTeachingHours, 0);
});
