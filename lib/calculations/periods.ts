import type { SemesterNumber } from "./types";

export interface ActivePeriod {
  year: number;
  semester: SemesterNumber;
  index: number;
}

export function getActivePeriods(startYear: number, startSemester: SemesterNumber, durationSemesters: number): ActivePeriod[] {
  if (!Number.isInteger(startYear) || startYear < 2000) throw new Error("El año de inicio no es válido.");
  if (![1, 2].includes(startSemester)) throw new Error("El semestre de inicio debe ser 1 o 2.");
  if (!Number.isInteger(durationSemesters) || durationSemesters < 2 || durationSemesters > 8) {
    throw new Error("La duración debe estar entre 2 y 8 semestres.");
  }

  return Array.from({ length: durationSemesters }, (_, index) => {
    const offset = (startSemester - 1) + index;
    return {
      year: startYear + Math.floor(offset / 2),
      semester: ((offset % 2) + 1) as SemesterNumber,
      index,
    };
  });
}

export function getActiveYears(periods: ActivePeriod[]): number[] {
  return [...new Set(periods.map((period) => period.year))].sort((a, b) => a - b);
}

export function getTuitionFactorForYear(periods: ActivePeriod[], year: number): number {
  return periods.filter((period) => period.year === year).length * 0.5;
}

export function periodKey(year: number, semester: SemesterNumber): string {
  return `${year}-${semester}`;
}

export function isPeriodWithinRange(
  year: number,
  semester: SemesterNumber,
  startYear: number,
  startSemester: SemesterNumber,
  endYear: number,
  endSemester: SemesterNumber,
): boolean {
  const value = year * 2 + semester;
  return value >= startYear * 2 + startSemester && value <= endYear * 2 + endSemester;
}
