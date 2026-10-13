import { getActivePeriods } from "../calculations/periods";
import type { SemesterNumber, SemesterParameters } from "../calculations/types";

/**
 * Valores neutrales de un semestre nuevo. Se mantienen en el módulo de presupuestos
 * para que el motor financiero compilado aisladamente no dependa de los mappers de API.
 */
export function emptyBudgetSemester(year: number, semester: SemesterNumber, students = 0): SemesterParameters {
  return {
    year,
    semester,
    activeStudents: students,
    graduatingStudents: 0,
    directTeachingHours: 0,
    synchronousTeachingHours: 0,
    asynchronousTeachingHours: 0,
    replacementTeachingHours: 0,
    electiveSubjects: 0,
    electiveSections: 0,
    specializedCourses: 0,
    specializedSections: 0,
    internalTuitionScholarshipStudents: 0,
    internalTuitionScholarshipCoverage: 1,
    maintenanceScholarshipStudents: 0,
    maintenanceScholarshipMonths: 0,
    notes: "",
  };
}

export function synchronizeInitialStudents(
  semesters: SemesterParameters[],
  initialStudents: number,
): SemesterParameters[] {
  const value = Math.max(0, Math.round(initialStudents));
  const lastIndex = semesters.length - 1;
  return semesters.map((semester, index) => ({
    ...semester,
    activeStudents: value,
    graduatingStudents: index === lastIndex ? value : semester.graduatingStudents,
  }));
}


export function synchronizeLastSemesterGraduation(
  semesters: SemesterParameters[],
  initialStudents: number,
): SemesterParameters[] {
  const value = Math.max(0, Math.round(initialStudents));
  const lastIndex = semesters.length - 1;
  return semesters.map((semester, index) => ({
    ...semester,
    graduatingStudents: index === lastIndex ? value : semester.graduatingStudents,
  }));
}

export function fullProgramDiscountRange(
  startYear: number,
  startSemester: SemesterNumber,
  durationSemesters: number,
): {
  startYear: number;
  startSemester: SemesterNumber;
  endYear: number;
  endSemester: SemesterNumber;
} {
  const periods = getActivePeriods(startYear, startSemester, durationSemesters);
  const last = periods.at(-1) ?? { year: startYear, semester: startSemester };
  return {
    startYear,
    startSemester,
    endYear: last.year,
    endSemester: last.semester,
  };
}
