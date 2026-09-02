import { getActivePeriods, getAnnualEnrollmentChargePeriods, periodKey } from "./periods";
import type { CohortBudget, SemesterNumber } from "./types";

export interface TuitionDistributionPeriod {
  index: number;
  year: number;
  semester: SemesterNumber;
  share: number;
}

const finiteNonNegative = (value: unknown) => {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(0, number) : 0;
};

export function isProgramTotalPricing(budget: Pick<CohortBudget, "tuitionPricingMode">): boolean {
  return budget.tuitionPricingMode === "PROGRAM_TOTAL";
}

export function proportionalTuitionDistribution(durationSemesters: number): number[] {
  const duration = Math.max(1, Math.round(durationSemesters));
  return Array.from({ length: duration }, () => 1 / duration);
}

export function normalizedTuitionDistribution(budget: Pick<CohortBudget, "startYear" | "startSemester" | "durationSemesters" | "tuitionDistributionMode" | "tuitionSemesterDistribution">): TuitionDistributionPeriod[] {
  const periods = getActivePeriods(budget.startYear, budget.startSemester, budget.durationSemesters);
  const proportional = proportionalTuitionDistribution(periods.length);
  const raw = budget.tuitionDistributionMode === "CUSTOM" && Array.isArray(budget.tuitionSemesterDistribution)
    ? periods.map((_, index) => finiteNonNegative(budget.tuitionSemesterDistribution?.[index]))
    : proportional;
  const total = raw.reduce((acc, value) => acc + value, 0);
  const shares = total > 0 ? raw.map((value) => value / total) : proportional;
  return periods.map((period, index) => ({ ...period, share: shares[index] ?? 0 }));
}

export function rawTuitionDistributionTotal(budget: Pick<CohortBudget, "durationSemesters" | "tuitionDistributionMode" | "tuitionSemesterDistribution">): number {
  if (budget.tuitionDistributionMode !== "CUSTOM") return 1;
  return Array.from({ length: Math.max(1, budget.durationSemesters) }, (_, index) => finiteNonNegative(budget.tuitionSemesterDistribution?.[index]))
    .reduce((acc, value) => acc + value, 0);
}

export function tuitionDistributionShareForYear(budget: CohortBudget, year: number): number {
  if (!isProgramTotalPricing(budget)) return 0;
  return normalizedTuitionDistribution(budget).filter((period) => period.year === year).reduce((acc, period) => acc + period.share, 0);
}

export function tuitionDistributionShareForPeriod(budget: CohortBudget, year: number, semester: SemesterNumber): number {
  if (!isProgramTotalPricing(budget)) return 0;
  return normalizedTuitionDistribution(budget).find((period) => period.year === year && period.semester === semester)?.share ?? 0;
}

export function enrollmentChargePeriodsForBudget(budget: Pick<CohortBudget, "startYear" | "startSemester" | "durationSemesters" | "enrollmentBillingMode">): Array<{ year: number; semester: SemesterNumber }> {
  const periods = getActivePeriods(budget.startYear, budget.startSemester, budget.durationSemesters);
  if (budget.enrollmentBillingMode === "SINGLE_SPECIAL") return periods.slice(0, 1);
  if (budget.enrollmentBillingMode === "SEMESTER") return periods;
  return getAnnualEnrollmentChargePeriods(budget.startYear, budget.startSemester, budget.durationSemesters);
}

export function enrollmentFeeForPeriod(budget: CohortBudget, year: number, semester: SemesterNumber, annualEnrollmentFee: number): number {
  const active = new Set(enrollmentChargePeriodsForBudget(budget).map((period) => periodKey(period.year, period.semester)));
  if (!active.has(periodKey(year, semester))) return 0;
  if (budget.enrollmentBillingMode === "SINGLE_SPECIAL") return finiteNonNegative(budget.singleEnrollmentFee);
  if (budget.enrollmentBillingMode === "SEMESTER") return finiteNonNegative(budget.semesterEnrollmentFee);
  return finiteNonNegative(annualEnrollmentFee);
}

export function grossEnrollmentPerStudentForProgram(budget: CohortBudget, annualFeeByYear: (year: number) => number): number {
  return enrollmentChargePeriodsForBudget(budget).reduce((total, period) => total + enrollmentFeeForPeriod(budget, period.year, period.semester, annualFeeByYear(period.year)), 0);
}

export function grossTuitionPerStudentForProgram(budget: CohortBudget, annualTuitionByYear: (year: number) => number): number {
  if (isProgramTotalPricing(budget)) return finiteNonNegative(budget.programTotalTuition);
  return getAnnualEnrollmentChargePeriods(budget.startYear, budget.startSemester, budget.durationSemesters)
    .reduce((total, period) => total + finiteNonNegative(annualTuitionByYear(period.year)), 0);
}

export function tuitionInstallmentValue(programTuition: number, discountRate: number, installments: number): number {
  const count = Math.max(1, Math.round(installments));
  const effective = finiteNonNegative(programTuition) * Math.max(0, 1 - Math.min(1, Math.max(0, discountRate)));
  return effective / count;
}
