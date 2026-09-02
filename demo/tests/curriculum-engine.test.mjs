import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "../..");
const { demoBudget, institutionalParameters, programs } = await import(pathToFileURL(path.join(root, ".engine-build/lib/demo-data.js")).href);
const { applyProgramCurriculumToBudget } = await import(pathToFileURL(path.join(root, ".engine-build/lib/curriculum/budget-load.js")).href);
const { calculateBudget, defaultAnnualOverrideForYear } = await import(pathToFileURL(path.join(root, ".engine-build/lib/calculations/budget-engine.js")).href);

function course(patch = {}) {
  return { id: "c1", code: "CURR001", name: "Asignatura", semester: 1, kind: "OBLIGATORIA", weeks: 18, sections: 1, theoryWeeklyHours: 2, laboratoryWeeklyHours: 0, workshopWeeklyHours: 2, directWeeklyHours: 4, autonomousWeeklyHours: 4, teachingMode: "SINCRONICA", asynchronousRateFactor: 0.5, sharedWithProgramIds: [], allocationRate: 1, sctCredits: 4, position: 0, ...patch };
}
function setRate(budget, value) {
  const years = [...new Set(budget.semesters.map((s) => s.year))];
  budget.annualOverrides = years.map((year) => ({ ...defaultAnnualOverrideForYear(budget, institutionalParameters, year), directTeachingHourValue: value, synchronousTeachingHourValue: value, asynchronousTeachingHourValue: value }));
}

test("v10.29 malla sincrónica se consolida como docencia presencial cuando la cohorte es presencial", () => {
  const budget = structuredClone(demoBudget);
  budget.deliveryModality = "PRESENCIAL";
  budget.program.curriculumCourses = [course({ teachingMode: "SINCRONICA" })];
  setRate(budget, 30_000);
  const applied = applyProgramCurriculumToBudget(budget);
  assert.equal(applied.semesters[0].directTeachingHours, 72);
  assert.equal(applied.semesters[0].synchronousTeachingHours, 0);
  const result = calculateBudget(applied, institutionalParameters);
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


test("v10.29 suma múltiples asignaturas por semestre en horas docentes presenciales", () => {
  const budget = structuredClone(demoBudget);
  budget.deliveryModality = "PRESENCIAL";
  budget.durationSemesters = 3;
  budget.semesters = budget.semesters.slice(0, 3);
  const mk = (id, semester, directWeeklyHours, patch = {}) => course({ id, semester, directWeeklyHours, theoryWeeklyHours: directWeeklyHours, workshopWeeklyHours: 0, laboratoryWeeklyHours: 0, ...patch });
  budget.program.curriculumCourses = [
    ...Array.from({ length: 5 }, (_, index) => mk(`s1-${index}`, 1, 4, { position: index })),
    ...Array.from({ length: 5 }, (_, index) => mk(`s2-${index}`, 2, 4, { position: 10 + index })),
    mk("s3-a", 3, 4, { position: 20 }),
    mk("s3-electivo", 3, 4, { kind: "ELECTIVA", sections: 2, position: 21 }),
    mk("s3-taller", 3, 8, { position: 22 }),
    mk("generic", 1, 4, { kind: "COMPETENCIA_GENERICA", position: 23 }),
  ];
  const applied = applyProgramCurriculumToBudget(budget);
  assert.equal(applied.semesters[0].directTeachingHours, 360);
  assert.equal(applied.semesters[1].directTeachingHours, 360);
  assert.equal(applied.semesters[2].directTeachingHours, 360);
});
