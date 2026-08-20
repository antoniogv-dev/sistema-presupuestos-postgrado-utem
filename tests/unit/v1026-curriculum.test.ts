import { describe, expect, it } from "vitest";
import { calculateBudget, defaultAnnualOverrideForYear } from "../../lib/calculations/budget-engine";
import { applyProgramCurriculumToBudget } from "../../lib/curriculum/budget-load";
import type { ProgramCourse } from "../../lib/calculations/types";
import { demoBudget, institutionalParameters, programs } from "../../lib/demo-data";

function course(overrides: Partial<ProgramCourse> = {}): ProgramCourse {
  return {
    id: "course-1",
    code: "CURR001",
    name: "Asignatura de prueba",
    semester: 1,
    kind: "OBLIGATORIA",
    weeks: 18,
    sections: 1,
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
    prerequisites: "",
    position: 0,
    ...overrides,
  };
}

function setProfessionalTeachingRate(budget: typeof demoBudget, value: number) {
  const years = [...new Set(budget.semesters.map((semester) => semester.year))];
  budget.annualOverrides = years.map((year) => ({
    ...defaultAnnualOverrideForYear(budget, institutionalParameters, year),
    synchronousTeachingHourValue: value,
    asynchronousTeachingHourValue: value,
    directTeachingHourValue: value,
  }));
}

describe("v10.26 malla curricular y valorización docente", () => {
  it("convierte la malla en carga docente por semestre", () => {
    const budget = structuredClone(demoBudget);
    budget.deliveryModality = "SEMIPRESENCIAL";
    budget.program.curriculumCourses = [course()];
    setProfessionalTeachingRate(budget, 30_000);
    const applied = applyProgramCurriculumToBudget(budget);
    expect(applied.semesters[0].synchronousTeachingHours).toBe(72);
    expect(applied.semesters[0].asynchronousTeachingHours).toBe(0);
    const result = calculateBudget(applied, institutionalParameters);
    expect(result.annualFlows[0].synchronousTeachingCost).toBe(72 * 30_000);
  });

  it("consolida una asignatura sincrónica de malla en horas presenciales cuando la cohorte es presencial", () => {
    const budget = structuredClone(demoBudget);
    budget.deliveryModality = "PRESENCIAL";
    budget.program.curriculumCourses = [course({ teachingMode: "SINCRONICA" })];
    setProfessionalTeachingRate(budget, 30_000);
    const applied = applyProgramCurriculumToBudget(budget);
    expect(applied.semesters[0].directTeachingHours).toBe(72);
    expect(applied.semesters[0].synchronousTeachingHours).toBe(0);
    const result = calculateBudget(applied, institutionalParameters);
    expect(result.annualFlows[0].directTeachingCost).toBe(72 * 30_000);
  });

  it("aplica el factor asincrónico al valor equivalente de horas", () => {
    const budget = structuredClone(demoBudget);
    budget.deliveryModality = "SEMIPRESENCIAL";
    budget.program.curriculumCourses = [course({ teachingMode: "ASINCRONICA", asynchronousRateFactor: 0.5 })];
    setProfessionalTeachingRate(budget, 30_000);
    const applied = applyProgramCurriculumToBudget(budget);
    // 4 horas semanales × 18 semanas × 50% = 36 horas equivalentes pagables.
    expect(applied.semesters[0].asynchronousTeachingHours).toBe(36);
    const result = calculateBudget(applied, institutionalParameters);
    expect(result.annualFlows[0].asynchronousTeachingCost).toBe(36 * 30_000);
  });

  it("respeta el factor asincrónico aunque la modalidad global sea presencial", () => {
    const budget = structuredClone(demoBudget);
    budget.deliveryModality = "PRESENCIAL";
    budget.program.curriculumCourses = [course({ teachingMode: "ASINCRONICA", asynchronousRateFactor: 0.5 })];
    setProfessionalTeachingRate(budget, 30_000);
    const applied = applyProgramCurriculumToBudget(budget);
    expect(applied.semesters[0].asynchronousTeachingHours).toBe(36);
    const result = calculateBudget(applied, institutionalParameters);
    expect(result.annualFlows[0].asynchronousTeachingCost).toBe(1_080_000);
    expect(result.annualFlows[0].directTeachingCost).toBe(1_080_000);
  });

  it("prorratea una asignatura compartida y excluye competencias genéricas del flujo", () => {
    const budget = structuredClone(demoBudget);
    budget.deliveryModality = "SEMIPRESENCIAL";
    budget.program.curriculumCourses = [
      course({ id: "shared", sections: 2, sharedWithProgramIds: [programs[1].id], allocationRate: 0.5 }),
      course({ id: "generic", code: "HUMMX001", name: "Inglés", kind: "COMPETENCIA_GENERICA", directWeeklyHours: 4, autonomousWeeklyHours: 4, sctCredits: 2 }),
    ];
    setProfessionalTeachingRate(budget, 30_000);
    const applied = applyProgramCurriculumToBudget(budget);
    // La carga conserva las 144 horas brutas; la economía de escala se descuenta en el motor al 50%.
    expect(applied.semesters[0].synchronousTeachingHours).toBe(144);
    expect(applied.sharedCourses).toHaveLength(1);
    expect(applied.sharedCourses[0].participantProgramIds).toContain(programs[1].id);
    const result = calculateBudget(applied, institutionalParameters);
    expect(result.annualFlows[0].sharedCourseSavings).toBe(72 * 30_000);
    expect(result.annualFlows[0].synchronousTeachingCost).toBe(72 * 30_000);
  });
});
