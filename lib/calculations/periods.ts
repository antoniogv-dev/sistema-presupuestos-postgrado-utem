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

export function getAnnualEnrollmentChargePeriods(
  startYear: number,
  startSemester: SemesterNumber,
  durationSemesters: number,
): ActivePeriod[] {
  // La matrícula es anual: se cobra una sola vez por cada bloque de dos semestres,
  // contado desde el semestre de ingreso de la cohorte. Esto funciona igual para
  // cohortes que comienzan en 1S o 2S y evita duplicar matrícula por año calendario.
  return getActivePeriods(startYear, startSemester, durationSemesters).filter((period) => period.index % 2 === 0);
}

export function getActiveYears(periods: ActivePeriod[]): number[] {
  return [...new Set(periods.map((period) => period.year))].sort((a, b) => a - b);
}

export function getAnnualTuitionChargePeriods(periods: ActivePeriod[]): ActivePeriod[] {
  // El arancel es anual: se cobra una sola vez por cada año calendario en que la cohorte
  // se encuentra activa, usando el primer semestre activo de ese año como período de cargo.
  // Esto evita representar personas como 0,5 estudiantes cuando un año sólo contiene un semestre.
  const byYear = new Map<number, ActivePeriod>();
  for (const period of periods) {
    if (!byYear.has(period.year)) byYear.set(period.year, period);
  }
  return [...byYear.values()].sort((a, b) => a.year - b.year || a.semester - b.semester);
}

export function getTuitionFactorForYear(periods: ActivePeriod[], year: number): number {
  // Un año activo representa un cargo anual completo de arancel. El número de semestres
  // del año no fracciona estudiantes ni el arancel anual.
  return periods.some((period) => period.year === year) ? 1 : 0;
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
