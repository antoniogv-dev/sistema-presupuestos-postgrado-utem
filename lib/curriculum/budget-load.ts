import { getActivePeriods } from "../calculations/periods";
import type { CohortBudget, DeliveryModality, Program, ProgramCourse, ProgramType, SemesterParameters, SharedCourseEconomyRule, TeachingMode } from "../calculations/types";

export function payableCurriculumCourses(program: Program): ProgramCourse[] {
  return (program.curriculumCourses ?? []).filter((course) => course.kind !== "COMPETENCIA_GENERICA").sort((a, b) => a.semester - b.semester || a.position - b.position);
}
export function genericCurriculumCourses(program: Program): ProgramCourse[] {
  return (program.curriculumCourses ?? []).filter((course) => course.kind === "COMPETENCIA_GENERICA").sort((a, b) => a.position - b.position);
}
export function curriculumCourseWeeklyDirectHours(course: ProgramCourse): number {
  const explicit = Math.max(0, course.directWeeklyHours);
  if (explicit > 0) return explicit;
  return Math.max(0, course.theoryWeeklyHours) + Math.max(0, course.laboratoryWeeklyHours) + Math.max(0, course.workshopWeeklyHours);
}
export function courseAllowsVariableSections(course: ProgramCourse): boolean {
  return course.kind === "ELECTIVA" || course.kind === "ESPECIALIZACION" || course.kind === "GRADUACION";
}
export function graduationSectionsFollowStudents(programType: ProgramType, course: ProgramCourse): boolean {
  return course.kind === "GRADUACION" && (programType === "DOCTORADO" || programType === "MAGISTER_ACADEMICO");
}
export function curriculumCourseSectionsForBudget(
  course: ProgramCourse,
  programType: ProgramType,
  activeStudents: number,
  overrides: Record<string, number> = {},
): number {
  const explicit = overrides[course.id];
  if (courseAllowsVariableSections(course) && Number.isFinite(explicit)) return Math.max(0, Math.round(explicit));
  if (graduationSectionsFollowStudents(programType, course)) return Math.max(0, Math.round(activeStudents));
  return Math.max(1, Math.round(course.sections || 1));
}
export function curriculumCourseRawHours(course: ProgramCourse, sections = Math.max(1, course.sections)): number {
  return Math.max(0, course.weeks) * Math.max(0, sections) * curriculumCourseWeeklyDirectHours(course);
}
export function curriculumCourseEffectiveHours(course: ProgramCourse, _modality?: DeliveryModality, sections?: number): number {
  const raw = curriculumCourseRawHours(course, sections ?? Math.max(1, course.sections));
  if (course.teachingMode === "ASINCRONICA") return raw * Math.max(0, Math.min(1, course.asynchronousRateFactor));
  return raw;
}
export function curriculumCourseAppliedMode(course: ProgramCourse, modality?: DeliveryModality): TeachingMode {
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
  semesterStudents: number[] = [],
  sectionOverrides: Record<string, number> = {},
): { loads: Map<number, Partial<SemesterParameters>>; sharedCourses: SharedCourseEconomyRule[]; resolvedSections: Record<string, number> } {
  const periods = getActivePeriods(startYear, startSemester, durationSemesters);
  const loads = new Map<number, Partial<SemesterParameters>>();
  const sharedCourses: SharedCourseEconomyRule[] = [];
  const resolvedSections: Record<string, number> = {};
  for (const course of payableCurriculumCourses(program)) {
    const period = periods[course.semester - 1];
    if (!period) continue;
    const index = course.semester - 1;
    const current = loads.get(index) ?? { directTeachingHours: 0, synchronousTeachingHours: 0, asynchronousTeachingHours: 0 };
    const sections = curriculumCourseSectionsForBudget(course, program.type, semesterStudents[index] ?? 0, sectionOverrides);
    resolvedSections[course.id] = sections;
    const effectiveHours = curriculumCourseEffectiveHours(course, modality, sections);
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
  return { loads, sharedCourses, resolvedSections };
}

export function applyProgramCurriculumToBudget(budget: CohortBudget): CohortBudget {
  const curriculum = budget.program.curriculumCourses ?? [];
  if (!curriculum.length) return budget;
  const { loads, sharedCourses } = curriculumLoadForBudget(
    budget.program,
    budget.startYear,
    budget.startSemester,
    budget.durationSemesters,
    budget.deliveryModality,
    budget.semesters.map((semester) => semester.activeStudents),
    budget.curriculumSectionOverrides ?? {},
  );
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
