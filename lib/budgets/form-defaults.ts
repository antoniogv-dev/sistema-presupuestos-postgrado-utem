import { getActivePeriods } from "../calculations/periods";
import type { SemesterNumber, SemesterParameters } from "../calculations/types";

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
