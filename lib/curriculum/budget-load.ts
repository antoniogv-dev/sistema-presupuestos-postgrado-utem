import { getActivePeriods } from "../calculations/periods";
import type { CohortBudget, DeliveryModality, Program, ProgramCourse, SemesterParameters, SharedCourseEconomyRule, TeachingMode } from "../calculations/types";

export function payableCurriculumCourses(program: Program): ProgramCourse[] {
  return (program.curriculumCourses ?? []).filter((course) => course.kind !== "COMPETENCIA_GENERICA").sort((a, b) => a.semester - b.semester || a.position - b.position);
}
export function genericCurriculumCourses(program: Program): ProgramCourse[] {
  return (program.curriculumCourses ?? []).filter((course) => course.kind === "COMPETENCIA_GENERICA").sort((a, b) => a.position - b.position);
}
export function curriculumCourseWeeklyDirectHours(course: ProgramCourse): number {
  const explicit = Math.max(0, course.directWeeklyHours);
  if (explicit > 0) return explicit;
  // Compatibilidad con mallas importadas antes de v10.28: si el total directo quedó en 0
  // pero los componentes sí fueron persistidos, se reconstruye desde teoría/lab/taller.
  return Math.max(0, course.theoryWeeklyHours) + Math.max(0, course.laboratoryWeeklyHours) + Math.max(0, course.workshopWeeklyHours);
}
export function curriculumCourseRawHours(course: ProgramCourse): number {
  return Math.max(0, course.weeks) * Math.max(1, course.sections) * curriculumCourseWeeklyDirectHours(course);
}
export function curriculumCourseEffectiveHours(course: ProgramCourse, _modality?: DeliveryModality): number {
  const raw = curriculumCourseRawHours(course);
  // El factor asincrónico pertenece a la asignatura, no a la modalidad global del programa.
  // Así, una asignatura de 72 horas con factor 50% equivale financieramente a 36 horas
  // pagables, incluso si la cohorte combina actividades presenciales/sincrónicas.
  if (course.teachingMode === "ASINCRONICA") return raw * Math.max(0, Math.min(1, course.asynchronousRateFactor));
  return raw;
}
export function curriculumCourseAppliedMode(course: ProgramCourse, modality?: DeliveryModality): TeachingMode {
  // En una cohorte presencial, las horas de trabajo directo de una asignatura se
  // consolidan en la bolsa "Horas docentes presenciales", salvo que la propia
  // asignatura esté declarada explícitamente como asincrónica. Esto permite usar
  // mallas de curriculistas que no traen una columna de modalidad (históricamente
  // importadas como SINCRONICA) sin perder la carga docente presencial.
  if (course.teachingMode === "ASINCRONICA") return "ASINCRONICA";
  if (modality === "PRESENCIAL") return "PRESENCIAL";
  if (course.teachingMode === "PRESENCIAL") return "PRESENCIAL";
  return "SINCRONICA";
}

export function curriculumLoadForBudget(
  program: Program,
  startYear: number,
  startSemester: 1 | 2,
  durationSemesters: number,
  modality: DeliveryModality,
): { loads: Map<number, Partial<SemesterParameters>>; sharedCourses: SharedCourseEconomyRule[] } {
  const periods = getActivePeriods(startYear, startSemester, durationSemesters);
  const loads = new Map<number, Partial<SemesterParameters>>();
  const sharedCourses: SharedCourseEconomyRule[] = [];
  for (const course of payableCurriculumCourses(program)) {
    const period = periods[course.semester - 1];
    if (!period) continue;
    const index = course.semester - 1;
    const current = loads.get(index) ?? { directTeachingHours: 0, synchronousTeachingHours: 0, asynchronousTeachingHours: 0 };
    const effectiveHours = curriculumCourseEffectiveHours(course, modality);
    const mode = curriculumCourseAppliedMode(course, modality);
    if (mode === "PRESENCIAL") current.directTeachingHours = Number(current.directTeachingHours ?? 0) + effectiveHours;
    else if (mode === "ASINCRONICA") current.asynchronousTeachingHours = Number(current.asynchronousTeachingHours ?? 0) + effectiveHours;
    else current.synchronousTeachingHours = Number(current.synchronousTeachingHours ?? 0) + effectiveHours;
    loads.set(index, current);

    const participants = [program.id, ...course.sharedWithProgramIds.filter((id) => id !== program.id)];
    if (participants.length >= 2) {
      const autoRate = 1 / participants.length;
      sharedCourses.push({
        id: `curriculum-${course.id}-${period.year}-${period.semester}`,
        courseName: course.name,
        year: period.year,
        semester: period.semester,
        teachingMode: mode,
        hours: effectiveHours,
        participantProgramIds: participants,
        allocationRate: course.allocationRate > 0 && course.allocationRate <= 1 ? course.allocationRate : autoRate,
        note: `Economía de escala derivada de la malla curricular · ${course.code ?? course.name}`,
      });
    }
  }
  return { loads, sharedCourses };
}

export function applyProgramCurriculumToBudget(budget: CohortBudget): CohortBudget {
  const curriculum = budget.program.curriculumCourses ?? [];
  if (!curriculum.length) return budget;
  const { loads, sharedCourses } = curriculumLoadForBudget(budget.program, budget.startYear, budget.startSemester, budget.durationSemesters, budget.deliveryModality);
  return {
    ...budget,
    semesters: budget.semesters.map((semester, index) => ({
      ...semester,
      directTeachingHours: Number(loads.get(index)?.directTeachingHours ?? 0),
      synchronousTeachingHours: Number(loads.get(index)?.synchronousTeachingHours ?? 0),
      asynchronousTeachingHours: Number(loads.get(index)?.asynchronousTeachingHours ?? 0),
    })),
    sharedCourses,
  };
}
