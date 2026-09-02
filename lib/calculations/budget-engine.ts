import { getActivePeriods, getActiveYears, getAnnualEnrollmentChargePeriods, isPeriodWithinRange, periodKey } from "./periods";
import { rawTuitionDistributionTotal } from "./billing";
import { calculateRevenueEngine } from "../finance/revenue-engine";
import { calculateAnnualCosts } from "../finance/cost-engine";
import type {
  AnnualFlow,
  BudgetAnnualOverride,
  BudgetItem,
  BudgetResult,
  CohortBudget,
  InstitutionalParameters,
  ProgramType,
  ProgramTypeParameters,
  SemesterParameters,
} from "./types";

const sum = (values: number[]) => values.reduce((acc, value) => acc + value, 0);
const nonNegative = (value: number | undefined) => Math.max(0, Number.isFinite(value) ? Number(value) : 0);
const clampRate = (value: number | undefined) => Math.min(1, Math.max(0, Number.isFinite(value) ? Number(value) : 0));

export function parameterForYear(values: Record<number, number>, year: number): number {
  if (values[year] !== undefined) return values[year];
  const available = Object.keys(values).map(Number).filter(Number.isFinite).sort((a, b) => a - b);
  const previous = available.filter((candidate) => candidate <= year).at(-1);
  return previous !== undefined ? values[previous] : values[available[0]] ?? 0;
}

export function programTypeParameters(parameters: InstitutionalParameters, type: ProgramType): ProgramTypeParameters {
  return parameters.byProgramType[type] ?? parameters.byProgramType.OTRO;
}

export const PROFESSIONAL_ENROLLMENT_BASE_YEAR = 2027;
export const PROFESSIONAL_ENROLLMENT_BASE_VALUE = 192_150;

export function professionalEnrollmentFeeForYear(parameters: InstitutionalParameters, year: number): number {
  if (year < PROFESSIONAL_ENROLLMENT_BASE_YEAR) return parameterForYear(parameters.annualEnrollmentFee, year);
  const rate = Math.max(0, Number.isFinite(parameters.annualAdjustmentRate) ? parameters.annualAdjustmentRate : 0);
  return Math.round(PROFESSIONAL_ENROLLMENT_BASE_VALUE * Math.pow(1 + rate, year - PROFESSIONAL_ENROLLMENT_BASE_YEAR));
}

export function tuitionForProgramYear(budget: Pick<CohortBudget, "program">, parameters: InstitutionalParameters, year: number): number {
  const customValues = budget.program.annualTuition;
  if (customValues && Object.keys(customValues).length > 0) {
    const positiveValues = Object.fromEntries(Object.entries(customValues).filter(([, value]) => nonNegative(value) > 0));
    if (Object.keys(positiveValues).length > 0) return parameterForYear(positiveValues, year);
  }
  const typeTemplate = parameters.tuitionTemplates?.[budget.program.type];
  return parameterForYear(typeTemplate && Object.keys(typeTemplate).length ? typeTemplate : parameters.doctorateTuitionTemplate, year);
}

export function defaultAnnualOverrideForYear(
  budget: Pick<CohortBudget, "program" | "facultyOverheadRate">,
  parameters: InstitutionalParameters,
  year: number,
): BudgetAnnualOverride {
  const scoped = programTypeParameters(parameters, budget.program.type);
  const overhead = overheadApplies(budget.program.type);
  return {
    year,
    directTeachingHourValue: parameterForYear(parameters.teachingHour, year),
    synchronousTeachingHourValue: parameterForYear(parameters.teachingHour, year),
    asynchronousTeachingHourValue: parameterForYear(parameters.teachingHour, year),
    maintenanceScholarshipMonthlyValue: budget.program.type === "MAGISTER_PROFESIONAL" ? 0 : parameterForYear(parameters.maintenanceScholarshipMonthly, year),
    annualEnrollmentFee: budget.program.type === "MAGISTER_PROFESIONAL" ? professionalEnrollmentFeeForYear(parameters, year) : parameterForYear(parameters.annualEnrollmentFee, year),
    annualTuition: tuitionForProgramYear(budget, parameters, year),
    thesisGuidancePerGraduatingStudent: parameterForYear(scoped.thesisGuidancePerGraduatingStudent, year),
    annualDirection: parameterForYear(scoped.annualDirection, year),
    directionProrated: false,
    directionAllocationRate: 1,
    annualAssistance: parameterForYear(scoped.annualAssistance, year),
    assistanceProrated: false,
    assistanceAllocationRate: 1,
    annualOtherNonAcademicHonoraria: 0,
    otherNonAcademicProrated: false,
    otherNonAcademicAllocationRate: 1,
    annualOperational: parameterForYear(scoped.referenceOperational, year),
    annualSoftware: parameterForYear(scoped.softwareLicenses, year),
    annualDiffusion: parameterForYear(scoped.diffusionAdmission, year),
    annualCongressesInternships: parameterForYear(scoped.congressesInternships, year),
    annualBooksPublications: 0,
    annualTravelFreight: 0,
    annualPerDiem: 0,
    annualFoodBeverages: 0,
    annualOtherCosts: 0,
    centralOverheadRate: overhead ? scoped.centralOverheadRate : 0,
    facultyOverheadRate: overhead ? (budget.facultyOverheadRate ?? scoped.facultyOverheadRate) : 0,
  };
}

export function resolvedAnnualOverrideForYear(
  budget: CohortBudget,
  parameters: InstitutionalParameters,
  year: number,
): BudgetAnnualOverride {
  const fallback = defaultAnnualOverrideForYear(budget, parameters, year);
  const stored = budget.annualOverrides?.find((item) => item.year === year);
  if (!stored) return fallback;
  const storedTuition = nonNegative(stored.annualTuition);
  const resolvedSynchronousTeachingHour = Number.isFinite(stored.synchronousTeachingHourValue) && stored.synchronousTeachingHourValue > 0
    ? nonNegative(stored.synchronousTeachingHourValue)
    : fallback.synchronousTeachingHourValue;
  return {
    ...fallback,
    ...stored,
    year,
    // Un arancel 0 en un año activo se interpreta como dato faltante, no como arancel válido.
    // Esto permite recuperar cohortes antiguas que sólo tenían informado el primer año.
    annualTuition: storedTuition > 0 ? storedTuition : fallback.annualTuition,
    // v10.20: en presupuestos históricos, un 0 de matrícula anual proviene de filas
    // creadas antes de que este parámetro se persistiera por año. Para programas
    // profesionales se recupera la referencia institucional/plantilla en vez de
    // interpretar ese 0 como una matrícula real.
    annualEnrollmentFee: nonNegative(stored.annualEnrollmentFee) > 0 ? nonNegative(stored.annualEnrollmentFee) : fallback.annualEnrollmentFee,
    directTeachingHourValue: budget.program.type === "MAGISTER_PROFESIONAL" ? resolvedSynchronousTeachingHour : nonNegative(stored.directTeachingHourValue),
    synchronousTeachingHourValue: resolvedSynchronousTeachingHour,
    asynchronousTeachingHourValue: budget.program.type === "MAGISTER_PROFESIONAL" ? resolvedSynchronousTeachingHour : (Number.isFinite(stored.asynchronousTeachingHourValue) && stored.asynchronousTeachingHourValue > 0 ? nonNegative(stored.asynchronousTeachingHourValue) : fallback.asynchronousTeachingHourValue),
    maintenanceScholarshipMonthlyValue: budget.program.type === "MAGISTER_PROFESIONAL"
      ? 0
      : (Number.isFinite(stored.maintenanceScholarshipMonthlyValue) && stored.maintenanceScholarshipMonthlyValue > 0 ? nonNegative(stored.maintenanceScholarshipMonthlyValue) : fallback.maintenanceScholarshipMonthlyValue),
    directionAllocationRate: clampRate(stored.directionAllocationRate),
    assistanceAllocationRate: clampRate(stored.assistanceAllocationRate),
    annualOtherNonAcademicHonoraria: Number.isFinite(stored.annualOtherNonAcademicHonoraria) ? nonNegative(stored.annualOtherNonAcademicHonoraria) : fallback.annualOtherNonAcademicHonoraria,
    otherNonAcademicProrated: Boolean(stored.otherNonAcademicProrated),
    otherNonAcademicAllocationRate: Number.isFinite(stored.otherNonAcademicAllocationRate) ? clampRate(stored.otherNonAcademicAllocationRate) : 1,
    annualOperational: Number.isFinite(stored.annualOperational) ? nonNegative(stored.annualOperational) : fallback.annualOperational,
    annualSoftware: Number.isFinite(stored.annualSoftware) ? nonNegative(stored.annualSoftware) : fallback.annualSoftware,
    annualDiffusion: Number.isFinite(stored.annualDiffusion) ? nonNegative(stored.annualDiffusion) : fallback.annualDiffusion,
    annualCongressesInternships: Number.isFinite(stored.annualCongressesInternships) ? nonNegative(stored.annualCongressesInternships) : fallback.annualCongressesInternships,
    annualBooksPublications: Number.isFinite(stored.annualBooksPublications) ? nonNegative(stored.annualBooksPublications) : fallback.annualBooksPublications,
    annualTravelFreight: Number.isFinite(stored.annualTravelFreight) ? nonNegative(stored.annualTravelFreight) : fallback.annualTravelFreight,
    annualPerDiem: Number.isFinite(stored.annualPerDiem) ? nonNegative(stored.annualPerDiem) : fallback.annualPerDiem,
    annualFoodBeverages: Number.isFinite(stored.annualFoodBeverages) ? nonNegative(stored.annualFoodBeverages) : fallback.annualFoodBeverages,
    annualOtherCosts: Number.isFinite(stored.annualOtherCosts) ? nonNegative(stored.annualOtherCosts) : fallback.annualOtherCosts,
    centralOverheadRate: clampRate(stored.centralOverheadRate),
    facultyOverheadRate: clampRate(stored.facultyOverheadRate),
  };
}

export function hydrateAnnualOverrides(budget: CohortBudget, parameters: InstitutionalParameters): CohortBudget {
  const years = getActiveYears(getActivePeriods(budget.startYear, budget.startSemester, budget.durationSemesters));
  return {
    ...budget,
    annualOverrides: years.map((year) => resolvedAnnualOverrideForYear(budget, parameters, year)),
  };
}

function semesterOrdinal(year: number, semester: 1 | 2): number {
  return year * 2 + semester;
}

export function manualItemMultiplier(item: BudgetItem, budget: CohortBudget, year: number): number {
  if (item.periodicity === "Único") return item.year === year ? 1 : 0;
  if (year < item.year) return 0;

  if (item.periodicity === "Anual") return 1;

  const activePeriods = getActivePeriods(budget.startYear, budget.startSemester, budget.durationSemesters)
    .filter((period) => period.year === year);
  const startOrdinal = semesterOrdinal(item.year, item.semester ?? 1);
  return activePeriods.filter((period) => semesterOrdinal(period.year, period.semester) >= startOrdinal).length;
}

export function manualItemAmountForYear(item: BudgetItem, budget: CohortBudget, year: number): number {
  return nonNegative(item.amount) * manualItemMultiplier(item, budget, year);
}

function sumManualItems(budget: CohortBudget, year: number, categories: BudgetItem["category"][]): number {
  return sum(budget.manualItems
    .filter((item) => categories.includes(item.category))
    .map((item) => manualItemAmountForYear(item, budget, year)));
}

function thesisStudentsForSemester(budget: CohortBudget, semester: SemesterParameters): number {
  const periods = getActivePeriods(budget.startYear, budget.startSemester, budget.durationSemesters);
  const periodIndex = periods.find((period) => period.year === semester.year && period.semester === semester.semester)?.index ?? -1;
  if (periodIndex < 0) return 0;
  if (budget.program.type === "DOCTORADO") return periodIndex >= 2 ? semester.activeStudents : 0;
  return periodIndex === budget.durationSemesters - 1 ? semester.activeStudents : 0;
}

function inferredGraduatingStudents(budget: CohortBudget, semester: SemesterParameters): number {
  const periods = getActivePeriods(budget.startYear, budget.startSemester, budget.durationSemesters);
  const last = periods.at(-1);
  if (!last || last.year !== semester.year || last.semester !== semester.semester) return 0;
  return nonNegative(semester.activeStudents);
}

export function effectiveBadDebtRate(
  budget: Pick<CohortBudget, "program" | "badDebtRate">,
  parameters: InstitutionalParameters,
): number {
  const configured = budget.badDebtRate;
  if (configured !== undefined && configured !== null && Number.isFinite(configured)) return clampRate(configured);
  return clampRate(programTypeParameters(parameters, budget.program.type).badDebtRate);
}

export function overheadApplies(type: ProgramType): boolean {
  return type !== "DOCTORADO" && type !== "MAGISTER_ACADEMICO";
}

export function validateBudget(budget: CohortBudget): string[] {
  const warnings: string[] = [];
  for (const semester of budget.semesters) {
    const tuitionDiscountStudents = budget.discounts
      .filter((discount) => discount.target !== "ENROLLMENT" && isPeriodWithinRange(semester.year, semester.semester, discount.startYear, discount.startSemester, discount.endYear, discount.endSemester))
      .reduce((acc, discount) => acc + discount.students, 0);
    const enrollmentDiscountStudents = budget.discounts
      .filter((discount) => discount.target === "ENROLLMENT" && isPeriodWithinRange(semester.year, semester.semester, discount.startYear, discount.startSemester, discount.endYear, discount.endSemester))
      .reduce((acc, discount) => acc + discount.students, 0);
    if (tuitionDiscountStudents > semester.activeStudents) warnings.push(`${semester.year}-${semester.semester}: los descuentos de arancel superan los estudiantes activos.`);
    if (enrollmentDiscountStudents > semester.activeStudents) warnings.push(`${semester.year}-${semester.semester}: los descuentos de matrícula superan los estudiantes activos.`);
    if (budget.scholarshipsEnabled && tuitionDiscountStudents + semester.internalTuitionScholarshipStudents > semester.activeStudents) {
      warnings.push(`${semester.year}-${semester.semester}: descuentos de arancel y becas internas superan los estudiantes activos.`);
    }
    if (nonNegative(semester.graduatingStudents) > nonNegative(semester.activeStudents)) {
      warnings.push(`${semester.year}-${semester.semester}: los estudiantes en graduación superan los estudiantes activos.`);
    }
  }
  if (budget.enrollmentRecognitionRate < 0 || budget.enrollmentRecognitionRate > 1) warnings.push("El reconocimiento de matrícula debe estar entre 0 % y 100 %.");
  if (budget.tuitionPricingMode === "PROGRAM_TOTAL") {
    if (nonNegative(budget.programTotalTuition) <= 0) warnings.push("El arancel total del programa debe ser mayor que cero.");
    if ((budget.tuitionInstallments ?? 1) < 1) warnings.push("El número de cuotas del arancel debe ser al menos 1.");
    if (budget.tuitionDistributionMode === "CUSTOM" && Math.abs(rawTuitionDistributionTotal(budget) - 1) > 0.0001) {
      warnings.push("La distribución personalizada del arancel debe sumar exactamente 100 %.");
    }
  }
  for (const item of budget.annualOverrides ?? []) {
    for (const [label, rate] of [
      ["prorrateo de dirección", item.directionAllocationRate],
      ["prorrateo de asistencia", item.assistanceAllocationRate],
      ["prorrateo de otros honorarios no académicos", item.otherNonAcademicAllocationRate],
      ["overhead central", item.centralOverheadRate],
      ["overhead de facultad", item.facultyOverheadRate],
    ] as const) {
      if (rate < 0 || rate > 1) warnings.push(`${item.year}: el ${label} debe estar entre 0 % y 100 %.`);
    }
  }
  for (const rule of budget.sharedCourses ?? []) {
    if (new Set(rule.participantProgramIds).size < 2) warnings.push(`${rule.courseName}: una economía de escala debe incluir al menos dos programas.`);
    if (rule.allocationRate <= 0 || rule.allocationRate > 1) warnings.push(`${rule.courseName}: el porcentaje imputado debe ser mayor a 0 % y hasta 100 %.`);
  }
  if (!overheadApplies(budget.program.type) && (budget.annualOverrides ?? []).some((item) => item.centralOverheadRate > 0 || item.facultyOverheadRate > 0)) {
    warnings.push("Los valores de overhead se ignoran porque los doctorados y magísteres académicos no están afectos a overhead.");
  }
  return [...new Set(warnings)];
}

export function calculateBudget(budget: CohortBudget, parameters: InstitutionalParameters): BudgetResult {
  const periods = getActivePeriods(budget.startYear, budget.startSemester, budget.durationSemesters);
  const years = getActiveYears(periods);
  const semesterMap = new Map(budget.semesters.map((semester) => [periodKey(semester.year, semester.semester), semester]));
  const warnings = validateBudget(budget);
  let previousAccumulated = budget.includeAuthorizedCarryover ? budget.authorizedInitialCarryover : 0;

  // Motor v12: primero se construye el contrato de precio y el libro mayor semestral
  // de ingresos. El año calendario sólo agrega el reconocimiento presupuestario;
  // nunca determina el precio total del programa.
  const annualOverrides = new Map(years.map((year) => [year, resolvedAnnualOverrideForYear(budget, parameters, year)]));
  const overrideForYear = (year: number) => annualOverrides.get(year) ?? resolvedAnnualOverrideForYear(budget, parameters, year);
  const revenueEngine = calculateRevenueEngine(budget, overrideForYear, effectiveBadDebtRate(budget, parameters));

  const annualFlows: AnnualFlow[] = years.map((year, yearIndex) => {
    const yearPeriods = periods.filter((period) => period.year === year);
    const semesters = yearPeriods.map((period) => semesterMap.get(periodKey(period.year, period.semester))).filter(Boolean) as SemesterParameters[];
    const override = overrideForYear(year);
    const revenue = revenueEngine.annualByYear.get(year);
    if (!revenue) throw new Error(`El motor financiero no generó el reconocimiento de ingresos para ${year}.`);

    const costs = calculateAnnualCosts(budget, year, semesters, override, parameters);
    // Política institucional: overhead sólo sobre arancel bruto menos descuentos de
    // arancel e incobrabilidad. No incorpora matrícula reconocida ni financiamiento institucional.
    const overheadBase = Math.max(0, revenue.grossTuition - revenue.discounts - revenue.badDebt);
    const centralOverheadRate = overheadApplies(budget.program.type) ? clampRate(override.centralOverheadRate) : 0;
    const facultyOverheadRate = overheadApplies(budget.program.type) ? clampRate(override.facultyOverheadRate) : 0;
    const centralOverhead = overheadBase * centralOverheadRate;
    const facultyOverhead = overheadBase * facultyOverheadRate;
    const totalExpenses = costs.fixedExpensesBeforeOverhead + centralOverhead + facultyOverhead;
    const netFlow = revenue.totalIncome - totalExpenses;
    const startingCarryover = yearIndex === 0 ? (budget.includeAuthorizedCarryover ? budget.authorizedInitialCarryover : 0) : previousAccumulated;
    const accumulatedFlow = startingCarryover + netFlow;
    const operatingMargin = revenue.totalIncome !== 0 ? netFlow / revenue.totalIncome : null;
    previousAccumulated = accumulatedFlow;

    return {
      year,
      activeSemesters: revenue.activeSemesters,
      tuitionFactor: revenue.tuitionFactor,
      tuitionDistributionShare: revenue.tuitionDistributionShare,
      annualTuition: revenue.annualTuition,
      grossTuition: revenue.grossTuition,
      discounts: revenue.discounts,
      internalTuitionScholarships: revenue.internalTuitionScholarships,
      tuitionAfterBenefits: revenue.tuitionAfterBenefits,
      equivalentEnrollments: revenue.equivalentEnrollments,
      roundedEquivalentStudents: revenue.roundedEquivalentStudents,
      badDebt: revenue.badDebt,
      netTuitionIncome: revenue.netTuitionIncome,
      grossEnrollmentFee: revenue.grossEnrollmentFee,
      enrollmentDiscounts: revenue.enrollmentDiscounts,
      netEnrollmentFee: revenue.netEnrollmentFee,
      recognizedEnrollmentFee: revenue.recognizedEnrollmentFee,
      externalIncome: revenue.externalIncome,
      institutionalFinancing: revenue.institutionalFinancing,
      otherIncome: revenue.otherIncome,
      totalIncome: revenue.totalIncome,
      directTeachingCost: costs.directTeachingCost,
      synchronousTeachingCost: costs.synchronousTeachingCost,
      asynchronousTeachingCost: costs.asynchronousTeachingCost,
      sharedCourseSavings: costs.sharedCourseSavings,
      replacementTeachingCost: costs.replacementTeachingCost,
      thesisGuidanceCost: costs.thesisGuidanceCost,
      academicHonoraria: costs.academicHonoraria,
      otherNonAcademicHonoraria: costs.otherNonAcademicHonoraria,
      nonAcademicHonoraria: costs.nonAcademicHonoraria,
      direction: costs.direction,
      assistance: costs.assistance,
      operational: costs.operational,
      software: costs.software,
      diffusion: costs.diffusion,
      maintenanceScholarships: costs.maintenanceScholarships,
      scholarshipsAndAid: costs.scholarshipsAndAid,
      equipment: costs.equipment,
      otherExpenses: costs.otherExpenses,
      congressesInternships: costs.congressesInternships,
      booksPublications: costs.booksPublications,
      travelFreight: costs.travelFreight,
      perDiem: costs.perDiem,
      foodBeverages: costs.foodBeverages,
      otherCosts: costs.otherCosts,
      centralOverhead,
      overheadBase,
      centralOverheadRate,
      facultyOverheadRate,
      facultyOverhead,
      totalExpenses,
      netFlow,
      startingCarryover,
      accumulatedFlow,
      thesisStudents: costs.thesisStudents,
      graduatingStudents: costs.graduatingStudents,
      operatingMargin,
    };
  });

  const finalAccumulatedFlow = annualFlows.at(-1)?.accumulatedFlow ?? (budget.includeAuthorizedCarryover ? budget.authorizedInitialCarryover : 0);
  const isProfessional = budget.program.type === "MAGISTER_PROFESIONAL";
  const viable = isProfessional ? finalAccumulatedFlow >= 0 : null;
  const deficitFlows = annualFlows.filter((flow) => flow.accumulatedFlow < 0).sort((a, b) => a.accumulatedFlow - b.accumulatedFlow);
  const breakEvenYear = annualFlows.find((flow) => flow.accumulatedFlow >= 0)?.year ?? null;

  return {
    periods,
    years,
    pricing: revenueEngine.pricing,
    revenueLedger: revenueEngine.semesterLedger,
    annualFlows,
    finalAccumulatedFlow,
    viable,
    worstDeficitYear: deficitFlows[0]?.year ?? null,
    breakEvenYear,
    warnings,
  };
}

