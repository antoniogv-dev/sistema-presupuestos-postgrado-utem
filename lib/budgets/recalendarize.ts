import { grossTuitionPerStudentForProgram, proportionalTuitionDistribution } from "../calculations/billing";
import { resolvedAnnualOverrideForYear } from "../calculations/budget-engine";
import { getActivePeriods, getActiveYears } from "../calculations/periods";
import type { BudgetAnnualOverride, CohortBudget, InstitutionalParameters, SemesterNumber } from "../calculations/types";
import { emptySemester } from "../mappers/budget-api";
import { synchronizeLastSemesterGraduation } from "./form-defaults";

/**
 * Modifica la fecha académica (no la duración del programa).
 * Se ejecuta sólo ante una edición explícita y nunca al leer presupuestos históricos.
 */
export interface CohortCalendarChange {
  startYear: number;
  startSemester: SemesterNumber;
  durationSemesters: number;
  initialStudents: number;
  /** Normaliza una cohorte 2S ya registrada, sin mover nuevamente sus fechas. */
  normalizeExisting?: boolean;
}

const clampFraction = (value: number) => Math.min(1, Math.max(0, value));

function shiftedPeriod(year: number, semester: SemesterNumber, offset: number) {
  const ordinal = year * 2 + semester - 1 + offset;
  return { year: Math.floor(ordinal / 2), semester: ((ordinal % 2) + 1) as SemesterNumber };
}

function allocateAnnualStaff(
  next: BudgetAnnualOverride,
  previous: BudgetAnnualOverride | undefined,
  oldShare: number,
  newShare: number,
): BudgetAnnualOverride {
  const fields = [
    ["directionProrated", "directionAllocationRate"],
    ["assistanceProrated", "assistanceAllocationRate"],
    ["otherNonAcademicProrated", "otherNonAcademicAllocationRate"],
  ] as const;
  const result = { ...next };
  for (const [enabledKey, shareKey] of fields) {
    // Las participaciones manuales distintas de la fracción académica prevalecen:
    // pueden reflejar reparto real entre varias cohortes.
    const isManual = previous?.[enabledKey] && Math.abs(previous[shareKey] - oldShare) > 1e-8;
    if (isManual) continue;
    result[enabledKey] = newShare < 1;
    result[shareKey] = clampFraction(newShare);
  }
  return result;
}

export function recalendarizeCohortBudget(
  budget: CohortBudget,
  parameters: InstitutionalParameters,
  change: CohortCalendarChange,
): CohortBudget {
  const oldPeriods = getActivePeriods(budget.startYear, budget.startSemester, budget.durationSemesters);
  const newPeriods = getActivePeriods(change.startYear, change.startSemester, change.durationSemesters);
  const previousByPosition = new Map<number, CohortBudget["semesters"][number] | undefined>(oldPeriods.map((period, index) => [
    index, budget.semesters.find((item) => item.year === period.year && item.semester === period.semester),
  ] as const));
  const moveBy = (change.startYear - budget.startYear) * 2 + change.startSemester - budget.startSemester;
  const changedCalendar = moveBy !== 0 || change.durationSemesters !== budget.durationSemesters;
  const isProfessional = budget.program.type === "MAGISTER_PROFESIONAL";
  const normalize = isProfessional && (changedCalendar || change.normalizeExisting === true);
  const actualStudents = Math.max(0, Math.round(change.initialStudents));

  const semesters = newPeriods.map((period, index) => {
    const source = previousByPosition.get(index);
    return {
      ...(source ?? emptySemester(period.year, period.semester, actualStudents)),
      year: period.year,
      semester: period.semester,
      activeStudents: source?.activeStudents ?? actualStudents,
    };
  });
  const syncedSemesters = synchronizeLastSemesterGraduation(semesters, actualStudents);

  const years = getActiveYears(newPeriods);
  const oldYears = getActiveYears(oldPeriods);
  const lastAnnual = [...budget.annualOverrides].sort((a, b) => a.year - b.year).at(-1);
  const annualOverrides = years.map((year) => {
    const previous = budget.annualOverrides.find((item) => item.year === year);
    const fallback = resolvedAnnualOverrideForYear(budget, parameters, year);
    // Otros honorarios continuos configurados por la cohorte, p.ej. tutoría Canvas,
    // requieren proyectarse cuando aparece un ejercicio adicional.
    const projectedOther = !previous && lastAnnual && year > lastAnnual.year
      ? Math.round(Math.max(0, lastAnnual.annualOtherNonAcademicHonoraria || 0)
          * Math.pow(1 + Math.max(0, parameters.annualAdjustmentRate), year - lastAnnual.year))
      : fallback.annualOtherNonAcademicHonoraria;
    const updated = { ...fallback, annualOtherNonAcademicHonoraria: projectedOther };
    if (!normalize) return updated;
    const oldShare = oldYears.includes(year)
      ? oldPeriods.filter((period) => period.year === year).length / 2
      : 1;
    const newShare = newPeriods.filter((period) => period.year === year).length / 2;
    return allocateAnnualStaff(updated, previous, oldShare, newShare);
  });

  const discountDates = moveBy === 0 ? budget.discounts : budget.discounts.map((discount) => {
    const start = shiftedPeriod(discount.startYear, discount.startSemester, moveBy);
    const end = shiftedPeriod(discount.endYear, discount.endSemester, moveBy);
    return { ...discount, startYear: start.year, startSemester: start.semester, endYear: end.year, endSemester: end.semester };
  });
  const externalIncome = moveBy === 0 ? budget.externalIncome : budget.externalIncome.map((item) => ({
    ...item, ...shiftedPeriod(item.year, item.semester, moveBy),
  }));
  const sharedCourses = moveBy === 0 ? budget.sharedCourses : budget.sharedCourses.map((item) => ({
    ...item, ...shiftedPeriod(item.year, item.semester, moveBy),
  }));
  // Gastos manuales anuales y compras sin semestre se dejan intactos: podrían
  // ser compromisos fijos. Los que tienen un semestre explícito siguen a la cohorte.
  const manualItems = moveBy === 0 ? budget.manualItems : budget.manualItems.map((item) => (
    item.periodicity !== "Anual" && item.semester !== undefined
      ? { ...item, ...shiftedPeriod(item.year, item.semester, moveBy) }
      : item
  ));

  const convertLegacyTuition = normalize && budget.tuitionPricingMode !== "PROGRAM_TOTAL"
    && (change.startSemester === 2 || budget.startSemester === 2);
  const lockedProgramTotal = convertLegacyTuition
    ? grossTuitionPerStudentForProgram(budget, (year) => resolvedAnnualOverrideForYear(budget, parameters, year).annualTuition)
    : budget.programTotalTuition;
  const customDistribution = budget.tuitionDistributionMode === "CUSTOM"
    && budget.tuitionSemesterDistribution?.length === change.durationSemesters
    ? budget.tuitionSemesterDistribution
    : proportionalTuitionDistribution(change.durationSemesters);
  const priorCanonicalName = budget.program.code + " " + budget.startYear + "-" + budget.startSemester + "S";
  const nextCanonicalName = budget.program.code + " " + change.startYear + "-" + change.startSemester + "S";

  return {
    ...budget,
    cohortName: budget.cohortName.trim() === priorCanonicalName ? nextCanonicalName : budget.cohortName,
    startYear: change.startYear,
    startSemester: change.startSemester,
    durationSemesters: change.durationSemesters,
    initialStudents: actualStudents,
    tuitionPricingMode: convertLegacyTuition ? "PROGRAM_TOTAL" : budget.tuitionPricingMode,
    programTotalTuition: lockedProgramTotal,
    tuitionSemesterDistribution: customDistribution,
    semesters: syncedSemesters,
    annualOverrides,
    discounts: discountDates,
    externalIncome,
    manualItems,
    sharedCourses,
  };
}
