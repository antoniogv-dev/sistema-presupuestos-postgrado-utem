import { getActivePeriods, getActiveYears, getAnnualEnrollmentChargePeriods, getAnnualTuitionChargePeriods, isPeriodWithinRange, periodKey } from "./periods";
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

export function overheadApplies(type: ProgramType): boolean {
  return type !== "DOCTORADO" && type !== "MAGISTER_ACADEMICO";
}

export function validateBudget(budget: CohortBudget): string[] {
  const warnings: string[] = [];
  for (const semester of budget.semesters) {
    const discounts = budget.discounts
      .filter((discount) => isPeriodWithinRange(semester.year, semester.semester, discount.startYear, discount.startSemester, discount.endYear, discount.endSemester))
      .reduce((acc, discount) => acc + discount.students, 0);
    if (discounts > semester.activeStudents) warnings.push(`${semester.year}-${semester.semester}: los descuentos superan los estudiantes activos.`);
    if (budget.scholarshipsEnabled && discounts + semester.internalTuitionScholarshipStudents > semester.activeStudents) {
      warnings.push(`${semester.year}-${semester.semester}: descuentos y becas internas superan los estudiantes activos.`);
    }
    if (nonNegative(semester.graduatingStudents) > nonNegative(semester.activeStudents)) {
      warnings.push(`${semester.year}-${semester.semester}: los estudiantes en graduación superan los estudiantes activos.`);
    }
  }
  if (budget.enrollmentRecognitionRate < 0 || budget.enrollmentRecognitionRate > 1) warnings.push("El reconocimiento de matrícula debe estar entre 0 % y 100 %.");
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
  const scoped = programTypeParameters(parameters, budget.program.type);
  let previousAccumulated = budget.includeAuthorizedCarryover ? budget.authorizedInitialCarryover : 0;

  const enrollmentChargePeriods = new Set(
    getAnnualEnrollmentChargePeriods(budget.startYear, budget.startSemester, budget.durationSemesters)
      .map((period) => periodKey(period.year, period.semester)),
  );
  const tuitionChargePeriods = new Map(
    getAnnualTuitionChargePeriods(periods).map((period) => [period.year, period] as const),
  );

  const annualFlows: AnnualFlow[] = years.map((year, yearIndex) => {
    const yearPeriods = periods.filter((period) => period.year === year);
    const semesters = yearPeriods.map((period) => semesterMap.get(periodKey(period.year, period.semester))).filter(Boolean) as SemesterParameters[];
    const override = resolvedAnnualOverrideForYear(budget, parameters, year);
    const annualTuition = nonNegative(override.annualTuition);
    const tuitionFactor = yearPeriods.length > 0 ? 1 : 0;
    const tuitionChargePeriod = tuitionChargePeriods.get(year);
    const tuitionSemester = tuitionChargePeriod
      ? semesterMap.get(periodKey(tuitionChargePeriod.year, tuitionChargePeriod.semester))
      : undefined;

    // El arancel es anual y se cobra una vez por cada año activo. Los estudiantes se
    // mantienen como personas completas; un año con un solo semestre no los transforma
    // en 0,5 estudiantes ni reduce el arancel anual a la mitad.
    const grossTuition = nonNegative(tuitionSemester?.activeStudents) * annualTuition;
    const discounts = tuitionSemester ? sum(budget.discounts
      .filter((discount) => isPeriodWithinRange(tuitionSemester.year, tuitionSemester.semester, discount.startYear, discount.startSemester, discount.endYear, discount.endSemester))
      .map((discount) => nonNegative(discount.students) * annualTuition * clampRate(discount.percentage))) : 0;
    const internalTuitionScholarships = budget.scholarshipsEnabled && tuitionSemester
      ? nonNegative(tuitionSemester.internalTuitionScholarshipStudents) * annualTuition * clampRate(tuitionSemester.internalTuitionScholarshipCoverage)
      : 0;

    const tuitionAfterBenefits = Math.max(0, grossTuition - discounts - internalTuitionScholarships);
    const equivalentDenominator = annualTuition;
    const equivalentEnrollments = equivalentDenominator > 0 ? tuitionAfterBenefits / equivalentDenominator : 0;
    const roundedEquivalentStudents = Math.ceil(equivalentEnrollments);
    const badDebt = tuitionAfterBenefits * scoped.badDebtRate;
    const netTuitionIncome = tuitionAfterBenefits - badDebt;

    const enrollmentSemesters = semesters.filter((semester) => enrollmentChargePeriods.has(periodKey(semester.year, semester.semester)));
    const grossEnrollmentFee = sum(enrollmentSemesters.map((semester) => nonNegative(semester.activeStudents) * nonNegative(override.annualEnrollmentFee)));
    // Los descuentos de cohorte se aplican exclusivamente al arancel.
    // La matrícula es un valor anual informativo y no recibe descuentos.
    const enrollmentDiscounts = 0;
    const netEnrollmentFee = grossEnrollmentFee;
    const recognizedEnrollmentFee = grossEnrollmentFee * clampRate(budget.enrollmentRecognitionRate);

    const externalIncome = sum(budget.externalIncome.filter((income) => income.year === year).map((income) => nonNegative(income.students) * nonNegative(income.amountPerStudent)));
    const otherIncome = 0;
    // La matrícula se muestra y controla en el flujo, pero no forma parte de INGRESOS TOTAL.
    const totalIncome = netTuitionIncome + externalIncome + otherIncome;

    const grossPresentialTeachingCost = sum(semesters.map((semester) => nonNegative(semester.directTeachingHours) * nonNegative(override.directTeachingHourValue)));
    const grossSynchronousTeachingCost = sum(semesters.map((semester) => nonNegative(semester.synchronousTeachingHours) * nonNegative(override.synchronousTeachingHourValue)));
    const grossAsynchronousTeachingCost = sum(semesters.map((semester) => nonNegative(semester.asynchronousTeachingHours) * nonNegative(override.asynchronousTeachingHourValue)));
    // Una economía de escala sólo tiene efecto financiero cuando participan efectivamente
    // dos o más programas. Las reglas incompletas pueden guardarse como borrador, pero no
    // generan ahorro hasta cumplir esa condición.
    const validSharedCourseRules = (budget.sharedCourses ?? []).filter((rule) =>
      rule.year === year && new Set(rule.participantProgramIds).size >= 2 && rule.allocationRate > 0,
    );
    const sharedCourseSavings = validSharedCourseRules.reduce((total, rule) => {
      const rate = rule.teachingMode === "SINCRONICA" ? override.synchronousTeachingHourValue : rule.teachingMode === "ASINCRONICA" ? override.asynchronousTeachingHourValue : override.directTeachingHourValue;
      return total + nonNegative(rule.hours) * nonNegative(rate) * (1 - clampRate(rule.allocationRate));
    }, 0);
    const presentialSavings = validSharedCourseRules.filter((rule) => rule.teachingMode === "PRESENCIAL").reduce((total, rule) => total + nonNegative(rule.hours) * nonNegative(override.directTeachingHourValue) * (1 - clampRate(rule.allocationRate)), 0);
    const synchronousSavings = validSharedCourseRules.filter((rule) => rule.teachingMode === "SINCRONICA").reduce((total, rule) => total + nonNegative(rule.hours) * nonNegative(override.synchronousTeachingHourValue) * (1 - clampRate(rule.allocationRate)), 0);
    const asynchronousSavings = validSharedCourseRules.filter((rule) => rule.teachingMode === "ASINCRONICA").reduce((total, rule) => total + nonNegative(rule.hours) * nonNegative(override.asynchronousTeachingHourValue) * (1 - clampRate(rule.allocationRate)), 0);
    const presentialTeachingCost = Math.max(0, grossPresentialTeachingCost - presentialSavings);
    const synchronousTeachingCost = Math.max(0, grossSynchronousTeachingCost - synchronousSavings);
    const asynchronousTeachingCost = Math.max(0, grossAsynchronousTeachingCost - asynchronousSavings);
    // En programas profesionales la malla puede combinar docencia presencial/sincrónica
    // y asincrónica por asignatura. Todas las componentes valorizables forman parte del
    // costo docente. Para programas académicos/doctorales se conserva la regla histórica.
    const directTeachingCost = budget.program.type === "MAGISTER_PROFESIONAL"
      ? presentialTeachingCost + synchronousTeachingCost + asynchronousTeachingCost
      : (budget.deliveryModality === "PRESENCIAL" ? presentialTeachingCost : synchronousTeachingCost + asynchronousTeachingCost);
    const replacementTeachingCost = sum(semesters.map((semester) => nonNegative(semester.replacementTeachingHours) * parameters.replacementHour));
    const graduatingStudents = Math.max(0, ...semesters.map((semester) => {
      const explicit = semester.graduatingStudents;
      return explicit === undefined ? inferredGraduatingStudents(budget, semester) : nonNegative(explicit);
    }));
    const thesisGuidanceCost = graduatingStudents * nonNegative(override.thesisGuidancePerGraduatingStudent);
    // No existe una línea separada de "honorarios académicos adicionales":
    // los costos académicos son docencia directa, reemplazo y guía de tesis.
    const academicHonoraria = directTeachingCost + replacementTeachingCost + thesisGuidanceCost;
    const thesisStudents = Math.max(0, ...semesters.map((semester) => thesisStudentsForSemester(budget, semester)));

    const directionBase = nonNegative(override.annualDirection) * (override.directionProrated ? clampRate(override.directionAllocationRate) : 1);
    const assistanceBase = nonNegative(override.annualAssistance) * (override.assistanceProrated ? clampRate(override.assistanceAllocationRate) : 1);
    const otherNonAcademicBase = nonNegative(override.annualOtherNonAcademicHonoraria)
      * (override.otherNonAcademicProrated ? clampRate(override.otherNonAcademicAllocationRate) : 1);
    const direction = directionBase + sumManualItems(budget, year, ["Dirección"]);
    const assistance = assistanceBase + sumManualItems(budget, year, ["Asistencia", "Asistencia de dirección"]);
    const otherNonAcademicHonoraria = otherNonAcademicBase
      + sumManualItems(budget, year, ["Honorarios no académicos", "Otros honorarios no académicos"]);
    // "Honorarios no académicos" es subtotal del staff, no un ítem independiente.
    const nonAcademicHonoraria = direction + assistance + otherNonAcademicHonoraria;

    const operational = nonNegative(override.annualOperational)
      + sumManualItems(budget, year, ["Gastos operacionales", "Bienes y servicios", "Gastos operacionales / Bienes y servicios"]);
    const software = nonNegative(override.annualSoftware)
      + sumManualItems(budget, year, ["Software", "Software y licencias"]);
    const diffusion = nonNegative(override.annualDiffusion) + sumManualItems(budget, year, ["Difusión"]);
    const maintenanceScholarships = (budget.scholarshipsEnabled ? sum(semesters.map((semester) =>
      nonNegative(semester.maintenanceScholarshipStudents)
      * nonNegative(semester.maintenanceScholarshipMonths)
      * nonNegative(override.maintenanceScholarshipMonthlyValue),
    )) : 0) + sumManualItems(budget, year, ["Becas de manutención"]);
    const otherScholarshipsAndAid = sumManualItems(budget, year, ["Becas y ayudas"]);
    const scholarshipsAndAid = maintenanceScholarships + otherScholarshipsAndAid;
    const equipment = sumManualItems(budget, year, ["Equipamiento"]);
    const congressesInternships = nonNegative(override.annualCongressesInternships)
      + sumManualItems(budget, year, ["Congresos", "Pasantías", "Congresos y pasantías"]);
    const booksPublications = nonNegative(override.annualBooksPublications)
      + sumManualItems(budget, year, ["Libros y publicaciones"]);
    const travelFreight = nonNegative(override.annualTravelFreight)
      + sumManualItems(budget, year, ["Pasajes y fletes"]);
    const perDiem = nonNegative(override.annualPerDiem)
      + sumManualItems(budget, year, ["Viáticos"]);
    const foodBeverages = nonNegative(override.annualFoodBeverages)
      + sumManualItems(budget, year, ["Alimentos y bebidas"]);
    const otherCosts = nonNegative(override.annualOtherCosts)
      + sumManualItems(budget, year, ["Otros", "Otros costos y gastos", "Honorarios académicos"]);
    // Subtotal de otros gastos: costos administrativos/operacionales distintos de
    // honorarios, equipamiento, becas/ayudas y overhead.
    const otherExpenses = operational + software + diffusion + congressesInternships
      + booksPublications + travelFreight + perDiem + foodBeverages + otherCosts;

    // Base solicitada: arancel bruto - descuentos de arancel - incobrables.
    const overheadBase = Math.max(0, grossTuition - discounts - badDebt);
    const centralOverheadRate = overheadApplies(budget.program.type) ? clampRate(override.centralOverheadRate) : 0;
    const facultyOverheadRate = overheadApplies(budget.program.type) ? clampRate(override.facultyOverheadRate) : 0;
    const centralOverhead = overheadBase * centralOverheadRate;
    const facultyOverhead = overheadBase * facultyOverheadRate;
    const totalExpenses = academicHonoraria + nonAcademicHonoraria + otherExpenses
      + equipment + scholarshipsAndAid + centralOverhead + facultyOverhead;
    const netFlow = totalIncome - totalExpenses;
    const startingCarryover = yearIndex === 0 ? (budget.includeAuthorizedCarryover ? budget.authorizedInitialCarryover : 0) : previousAccumulated;
    const accumulatedFlow = startingCarryover + netFlow;
    const operatingMargin = totalIncome !== 0 ? netFlow / totalIncome : null;
    previousAccumulated = accumulatedFlow;

    return {
      year,
      activeSemesters: semesters.length,
      tuitionFactor,
      annualTuition,
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
      otherIncome,
      totalIncome,
      directTeachingCost,
      synchronousTeachingCost,
      asynchronousTeachingCost,
      sharedCourseSavings,
      replacementTeachingCost,
      thesisGuidanceCost,
      academicHonoraria,
      otherNonAcademicHonoraria,
      nonAcademicHonoraria,
      direction,
      assistance,
      operational,
      software,
      diffusion,
      maintenanceScholarships,
      scholarshipsAndAid,
      equipment,
      otherExpenses,
      congressesInternships,
      booksPublications,
      travelFreight,
      perDiem,
      foodBeverages,
      otherCosts,
      centralOverhead,
      overheadBase,
      centralOverheadRate,
      facultyOverheadRate,
      facultyOverhead,
      totalExpenses,
      netFlow,
      startingCarryover,
      accumulatedFlow,
      thesisStudents,
      graduatingStudents,
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
    annualFlows,
    finalAccumulatedFlow,
    viable,
    worstDeficitYear: deficitFlows[0]?.year ?? null,
    breakEvenYear,
    warnings,
  };
}
