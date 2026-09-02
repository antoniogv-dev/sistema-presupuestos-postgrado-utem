import { enrollmentChargePeriodsForBudget, enrollmentFeeForPeriod, isProgramTotalPricing, normalizedTuitionDistribution } from "../calculations/billing";
import { getActivePeriods, getAnnualEnrollmentChargePeriods, isPeriodWithinRange, periodKey } from "../calculations/periods";
import type { BudgetAnnualOverride, CohortBudget, PricingTrace, SemesterNumber, SemesterRevenueTrace } from "../calculations/types";

const sum = (values: number[]) => values.reduce((acc, value) => acc + value, 0);
const nonNegative = (value: number | undefined) => Math.max(0, Number.isFinite(value) ? Number(value) : 0);
const clampRate = (value: number | undefined) => Math.min(1, Math.max(0, Number.isFinite(value) ? Number(value) : 0));

export interface ProgramPricingSnapshot extends PricingTrace {
  pricingMode: "ANNUAL_LEGACY" | "PROGRAM_TOTAL";
  enrollmentBillingMode: "ANNUAL" | "SINGLE_SPECIAL" | "SEMESTER";
  durationSemesters: number;
  programTotalTuition: number;
  equivalentTuitionPerSemester: number;
  tuitionInstallments: number;
  distribution: Array<{ index: number; year: number; semester: SemesterNumber; share: number }>;
}

export interface SemesterRevenueLedgerLine extends SemesterRevenueTrace {
  index: number;
  year: number;
  semester: SemesterNumber;
  activeStudents: number;
  tuitionUnitPrice: number;
  tuitionShare: number;
  grossTuition: number;
  tuitionDiscounts: number;
  internalTuitionScholarships: number;
  tuitionAfterBenefits: number;
  badDebt: number;
  netTuitionIncome: number;
  enrollmentUnitPrice: number;
  grossEnrollmentFee: number;
  enrollmentDiscounts: number;
  netEnrollmentFee: number;
  recognizedEnrollmentFee: number;
}

export interface AnnualRevenueProjection {
  year: number;
  activeSemesters: number;
  annualTuition: number;
  tuitionFactor: number;
  tuitionDistributionShare: number;
  grossTuition: number;
  discounts: number;
  internalTuitionScholarships: number;
  tuitionAfterBenefits: number;
  equivalentEnrollments: number;
  roundedEquivalentStudents: number;
  badDebt: number;
  netTuitionIncome: number;
  grossEnrollmentFee: number;
  enrollmentDiscounts: number;
  netEnrollmentFee: number;
  recognizedEnrollmentFee: number;
  externalIncome: number;
  institutionalFinancing: number;
  otherIncome: number;
  totalIncome: number;
}

export interface RevenueEngineResult {
  pricing: ProgramPricingSnapshot;
  semesterLedger: SemesterRevenueLedgerLine[];
  annualByYear: Map<number, AnnualRevenueProjection>;
}

export function buildPricingSnapshot(
  budget: CohortBudget,
  annualOverrideForYear: (year: number) => BudgetAnnualOverride,
): ProgramPricingSnapshot {
  const programTotalMode = isProgramTotalPricing(budget);
  const distribution = programTotalMode
    ? normalizedTuitionDistribution(budget)
    : getActivePeriods(budget.startYear, budget.startSemester, budget.durationSemesters).map((period) => ({ ...period, share: 0 }));
  const legacyTotal = getAnnualEnrollmentChargePeriods(budget.startYear, budget.startSemester, budget.durationSemesters)
    .reduce((total, period) => total + nonNegative(annualOverrideForYear(period.year).annualTuition), 0);
  const programTotalTuition = programTotalMode ? nonNegative(budget.programTotalTuition) : legacyTotal;
  return {
    pricingMode: programTotalMode ? "PROGRAM_TOTAL" : "ANNUAL_LEGACY",
    enrollmentBillingMode: budget.enrollmentBillingMode ?? "ANNUAL",
    durationSemesters: budget.durationSemesters,
    programTotalTuition,
    equivalentTuitionPerSemester: budget.durationSemesters > 0 ? programTotalTuition / budget.durationSemesters : 0,
    tuitionInstallments: Math.max(1, Math.round(nonNegative(budget.tuitionInstallments) || 1)),
    distribution,
  };
}

export function calculateRevenueEngine(
  budget: CohortBudget,
  annualOverrideForYear: (year: number) => BudgetAnnualOverride,
  badDebtRate: number,
): RevenueEngineResult {
  const periods = getActivePeriods(budget.startYear, budget.startSemester, budget.durationSemesters);
  const semesterMap = new Map(budget.semesters.map((semester) => [periodKey(semester.year, semester.semester), semester]));
  const pricing = buildPricingSnapshot(budget, annualOverrideForYear);
  const programTotalMode = pricing.pricingMode === "PROGRAM_TOTAL";
  const tuitionChargePeriods = new Set(getAnnualEnrollmentChargePeriods(budget.startYear, budget.startSemester, budget.durationSemesters)
    .map((period) => periodKey(period.year, period.semester)));
  const enrollmentChargePeriods = new Set(enrollmentChargePeriodsForBudget(budget)
    .map((period) => periodKey(period.year, period.semester)));
  const distributionByPeriod = new Map(pricing.distribution.map((period) => [periodKey(period.year, period.semester), period.share]));

  const semesterLedger: SemesterRevenueLedgerLine[] = periods.flatMap((period) => {
    const semester = semesterMap.get(periodKey(period.year, period.semester));
    if (!semester) return [];
    const override = annualOverrideForYear(period.year);
    const tuitionShare = programTotalMode ? (distributionByPeriod.get(periodKey(period.year, period.semester)) ?? 0) : (tuitionChargePeriods.has(periodKey(period.year, period.semester)) ? 1 : 0);
    const tuitionUnitPrice = programTotalMode
      ? pricing.programTotalTuition * tuitionShare
      : (tuitionChargePeriods.has(periodKey(period.year, period.semester)) ? nonNegative(override.annualTuition) : 0);
    const activeStudents = nonNegative(semester.activeStudents);
    const grossTuition = activeStudents * tuitionUnitPrice;
    const tuitionDiscounts = sum(budget.discounts
      .filter((discount) => discount.target !== "ENROLLMENT" && isPeriodWithinRange(period.year, period.semester, discount.startYear, discount.startSemester, discount.endYear, discount.endSemester))
      .map((discount) => nonNegative(discount.students) * tuitionUnitPrice * clampRate(discount.percentage)));
    const internalTuitionScholarships = budget.scholarshipsEnabled
      ? nonNegative(semester.internalTuitionScholarshipStudents) * tuitionUnitPrice * clampRate(semester.internalTuitionScholarshipCoverage)
      : 0;
    const tuitionAfterBenefits = Math.max(0, grossTuition - tuitionDiscounts - internalTuitionScholarships);
    const badDebt = tuitionAfterBenefits * clampRate(badDebtRate);
    const netTuitionIncome = tuitionAfterBenefits - badDebt;

    const enrollmentUnitPrice = enrollmentChargePeriods.has(periodKey(period.year, period.semester))
      ? enrollmentFeeForPeriod(budget, period.year, period.semester, override.annualEnrollmentFee)
      : 0;
    const grossEnrollmentFee = activeStudents * enrollmentUnitPrice;
    const enrollmentDiscounts = sum(budget.discounts
      .filter((discount) => discount.target === "ENROLLMENT" && isPeriodWithinRange(period.year, period.semester, discount.startYear, discount.startSemester, discount.endYear, discount.endSemester))
      .map((discount) => nonNegative(discount.students) * enrollmentUnitPrice * clampRate(discount.percentage)));
    const netEnrollmentFee = Math.max(0, grossEnrollmentFee - enrollmentDiscounts);
    const recognizedEnrollmentFee = netEnrollmentFee * clampRate(budget.enrollmentRecognitionRate);

    return [{
      index: period.index,
      year: period.year,
      semester: period.semester,
      activeStudents,
      tuitionUnitPrice,
      tuitionShare,
      grossTuition,
      tuitionDiscounts,
      internalTuitionScholarships,
      tuitionAfterBenefits,
      badDebt,
      netTuitionIncome,
      enrollmentUnitPrice,
      grossEnrollmentFee,
      enrollmentDiscounts,
      netEnrollmentFee,
      recognizedEnrollmentFee,
    }];
  });

  const years = [...new Set(periods.map((period) => period.year))].sort((a, b) => a - b);
  const annualByYear = new Map<number, AnnualRevenueProjection>();
  for (const year of years) {
    const lines = semesterLedger.filter((line) => line.year === year);
    const override = annualOverrideForYear(year);
    const tuitionFactor = sum(lines.map((line) => line.tuitionShare));
    const annualTuition = programTotalMode ? pricing.programTotalTuition : nonNegative(override.annualTuition);
    const grossTuition = sum(lines.map((line) => line.grossTuition));
    const discounts = sum(lines.map((line) => line.tuitionDiscounts));
    const internalTuitionScholarships = sum(lines.map((line) => line.internalTuitionScholarships));
    const tuitionAfterBenefits = sum(lines.map((line) => line.tuitionAfterBenefits));
    const equivalentDenominator = annualTuition * Math.max(0, tuitionFactor);
    const equivalentEnrollments = equivalentDenominator > 0 ? tuitionAfterBenefits / equivalentDenominator : 0;
    const roundedEquivalentStudents = Math.ceil(equivalentEnrollments);
    const badDebt = sum(lines.map((line) => line.badDebt));
    const netTuitionIncome = sum(lines.map((line) => line.netTuitionIncome));
    const grossEnrollmentFee = sum(lines.map((line) => line.grossEnrollmentFee));
    const enrollmentDiscounts = sum(lines.map((line) => line.enrollmentDiscounts));
    const netEnrollmentFee = sum(lines.map((line) => line.netEnrollmentFee));
    const recognizedEnrollmentFee = sum(lines.map((line) => line.recognizedEnrollmentFee));
    const institutionalFinancing = sum(budget.externalIncome
      .filter((income) => income.year === year && income.type === "Financiamiento institucional")
      .map((income) => nonNegative(income.amountPerStudent)));
    const externalIncome = sum(budget.externalIncome
      .filter((income) => income.year === year && income.type !== "Financiamiento institucional")
      .map((income) => nonNegative(income.students) * nonNegative(income.amountPerStudent)));
    const otherIncome = 0;
    const totalIncome = netTuitionIncome + recognizedEnrollmentFee + externalIncome + institutionalFinancing + otherIncome;
    annualByYear.set(year, {
      year,
      activeSemesters: lines.length,
      annualTuition,
      tuitionFactor,
      tuitionDistributionShare: tuitionFactor,
      grossTuition,
      discounts,
      internalTuitionScholarships,
      tuitionAfterBenefits,
      equivalentEnrollments,
      roundedEquivalentStudents,
      badDebt,
      netTuitionIncome,
      grossEnrollmentFee,
      enrollmentDiscounts,
      netEnrollmentFee,
      recognizedEnrollmentFee,
      externalIncome,
      institutionalFinancing,
      otherIncome,
      totalIncome,
    });
  }

  return { pricing, semesterLedger, annualByYear };
}
