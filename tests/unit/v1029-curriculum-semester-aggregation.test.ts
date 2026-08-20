import { describe, expect, it } from "vitest";
import { applyProgramCurriculumToBudget, curriculumCourseAppliedMode } from "../../lib/curriculum/budget-load";
import type { ProgramCourse } from "../../lib/calculations/types";
import { demoBudget } from "../../lib/demo-data";

function course(id: string, semester: number, hours: number, options: Partial<ProgramCourse> = {}): ProgramCourse {
  return {
    id, code: id.toUpperCase(), name: id, semester, kind: "OBLIGATORIA", weeks: 18, sections: 1,
    theoryWeeklyHours: hours, laboratoryWeeklyHours: 0, workshopWeeklyHours: 0, directWeeklyHours: hours,
    autonomousWeeklyHours: 0, teachingMode: "SINCRONICA", asynchronousRateFactor: 0.5,
    sharedWithProgramIds: [], allocationRate: 1, sctCredits: 0, prerequisites: "", position: 0,
    ...options,
  };
}

describe("v10.29 consolidación semestral desde malla", () => {
  it("consolida en horas docentes presenciales una cohorte presencial", () => {
    const budget = structuredClone(demoBudget);
    budget.deliveryModality = "PRESENCIAL";
    budget.durationSemesters = 3;
    budget.semesters = budget.semesters.slice(0, 3);
    budget.program.curriculumCourses = [
      ...Array.from({ length: 5 }, (_, i) => course(`s1-${i}`, 1, 4, { position: i })),
      ...Array.from({ length: 5 }, (_, i) => course(`s2-${i}`, 2, 4, { position: 10 + i })),
      course("s3-a", 3, 4, { position: 20 }),
      course("s3-electivo", 3, 4, { kind: "ELECTIVA", sections: 2, position: 21 }),
      course("s3-taller", 3, 8, { position: 22 }),
      course("generic", 1, 4, { kind: "COMPETENCIA_GENERICA", position: 23 }),
    ];
    const applied = applyProgramCurriculumToBudget(budget);
    expect(applied.semesters[0].directTeachingHours).toBe(360);
    expect(applied.semesters[1].directTeachingHours).toBe(360);
    expect(applied.semesters[2].directTeachingHours).toBe(360);
    expect(applied.semesters.every((semester) => semester.synchronousTeachingHours === 0)).toBe(true);
    expect(curriculumCourseAppliedMode(budget.program.curriculumCourses[0], budget.deliveryModality)).toBe("PRESENCIAL");
  });

  it("mantiene asincronía explícita y aplica su factor incluso en cohorte presencial", () => {
    const budget = structuredClone(demoBudget);
    budget.deliveryModality = "PRESENCIAL";
    budget.program.curriculumCourses = [course("async", 1, 4, { teachingMode: "ASINCRONICA", asynchronousRateFactor: 0.5 })];
    const applied = applyProgramCurriculumToBudget(budget);
    expect(applied.semesters[0].directTeachingHours).toBe(0);
    expect(applied.semesters[0].asynchronousTeachingHours).toBe(36);
  });

  it("mantiene las horas sincrónicas separadas en cohortes semipresenciales", () => {
    const budget = structuredClone(demoBudget);
    budget.deliveryModality = "SEMIPRESENCIAL";
    budget.program.curriculumCourses = [course("sync", 1, 4)];
    const applied = applyProgramCurriculumToBudget(budget);
    expect(applied.semesters[0].directTeachingHours).toBe(0);
    expect(applied.semesters[0].synchronousTeachingHours).toBe(72);
  });
});
