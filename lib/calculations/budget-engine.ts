import { getActivePeriods, getActiveYears, isPeriodWithinRange, periodKey } from "./periods";
import type {
  AnnualFlow,
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

export function parameterForYear(values: Record<number, number>, year: number): number {
  if (values[year] !== undefined) return values[year];
  const available = Object.keys(values).map(Number).sort((a, b) => a - b);
  const previous = available.filter((candidate) => candidate <= year).at(-1);
  return previous !== undefined ? values[previous] : values[available[0]] ?? 0;
}

export function programTypeParameters(parameters: InstitutionalParameters, type: ProgramType): ProgramTypeParameters {
  return parameters.byProgramType[type] ?? parameters.byProgramType.OTRO;
}

export function tuitionForProgramYear(budget: CohortBudget, parameters: InstitutionalParameters, year: number): number {
  const customValues = budget.program.annualTuition;
  if (customValues && Object.keys(customValues).length > 0) return parameterForYear(customValues, year);
  const typeTemplate = parameters.tuitionTemplates?.[budget.program.type];
  return parameterForYear(typeTemplate && Object.keys(typeTemplate).length ? typeTemplate : parameters.doctorateTuitionTemplate, year);
}

function sumManualItems(items: BudgetItem[], year: number, categories: BudgetItem["category"][]): number {
  return sum(items.filter((item) => item.year === year && categories.includes(item.category)).map((item) => nonNegative(item.amount)));
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
    if (discounts + semester.internalTuitionScholarshipStudents > semester.activeStudents) {
      warnings.push(`${semester.year}-${semester.semester}: descuentos y becas internas superan los estudiantes activos.`);
    }
    if (nonNegative(semester.graduatingStudents) > nonNegative(semester.activeStudents)) {
      warnings.push(`${semester.year}-${semester.semester}: los estudiantes en graduación superan los estudiantes activos.`);
    }
  }
  if (budget.facultyOverheadRate < 0 || budget.facultyOverheadRate > 1) warnings.push("El overhead de facultad debe estar entre 0 % y 100 %.");
  if (budget.enrollmentRecognitionRate < 0 || budget.enrollmentRecognitionRate > 1) warnings.push("El reconocimiento de matrícula debe estar entre 0 % y 100 %.");
  if (!overheadApplies(budget.program.type) && budget.facultyOverheadRate > 0) {
    warnings.push("El overhead configurado se ignora porque los doctorados y magísteres académicos no están afectos a overhead.");
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

  const annualFlows: AnnualFlow[] = years.map((year, yearIndex) => {
    const yearPeriods = periods.filter((period) => period.year === year);
    const semesters = yearPeriods.map((period) => semesterMap.get(periodKey(period.year, period.semester))).filter(Boolean) as SemesterParameters[];
    const annualTuition = tuitionForProgramYear(budget, parameters, year);
    const tuitionFactor = semesters.length * 0.5;

    const grossTuition = sum(semesters.map((semester) => nonNegative(semester.activeStudents) * annualTuition * 0.5));
    const discounts = sum(semesters.flatMap((semester) => budget.discounts
      .filter((discount) => isPeriodWithinRange(semester.year, semester.semester, discount.startYear, discount.startSemester, discount.endYear, discount.endSemester))
      .map((discount) => nonNegative(discount.students) * annualTuition * 0.5 * nonNegative(discount.percentage))));
    const internalTuitionScholarships = sum(semesters.map((semester) =>
      nonNegative(semester.internalTuitionScholarshipStudents) * annualTuition * 0.5 * nonNegative(semester.internalTuitionScholarshipCoverage),
    ));

    const tuitionAfterBenefits = Math.max(0, grossTuition - discounts - internalTuitionScholarships);
    const equivalentDenominator = annualTuition * tuitionFactor;
    const equivalentEnrollments = equivalentDenominator > 0 ? tuitionAfterBenefits / equivalentDenominator : 0;
    const roundedEquivalentStudents = Math.ceil(equivalentEnrollments);
    const badDebt = tuitionAfterBenefits * scoped.badDebtRate;
    const netTuitionIncome = tuitionAfterBenefits - badDebt;
    const recognizedEnrollmentFee = sum(semesters.map((semester) =>
      nonNegative(semester.activeStudents) * parameterForYear(parameters.annualEnrollmentFee, semester.year) * 0.5 * budget.enrollmentRecognitionRate,
    ));
    const externalIncome = sum(budget.externalIncome.filter((income) => income.year === year).map((income) => nonNegative(income.students) * nonNegative(income.amountPerStudent)));
    const otherIncome = 0;
    const totalIncome = netTuitionIncome + recognizedEnrollmentFee + externalIncome + otherIncome;

    const directTeachingCost = sum(semesters.map((semester) => nonNegative(semester.directTeachingHours) * parameterForYear(parameters.teachingHour, semester.year)));
    const replacementTeachingCost = sum(semesters.map((semester) => nonNegative(semester.replacementTeachingHours) * parameters.replacementHour));
    const graduatingStudents = Math.max(0, ...semesters.map((semester) => {
      const explicit = semester.graduatingStudents;
      return explicit === undefined ? inferredGraduatingStudents(budget, semester) : nonNegative(explicit);
    }));
    const thesisGuidanceCost = graduatingStudents * parameterForYear(scoped.thesisGuidancePerGraduatingStudent, year);
    const manualAcademicHonoraria = sumManualItems(budget.manualItems, year, ["Honorarios académicos"]);
    const academicHonoraria = directTeachingCost + replacementTeachingCost + thesisGuidanceCost + manualAcademicHonoraria;
    const thesisStudents = Math.max(0, ...semesters.map((semester) => thesisStudentsForSemester(budget, semester)));
    const nonAcademicHonoraria = sumManualItems(budget.manualItems, year, ["Honorarios no académicos"]);

    const direction = parameterForYear(scoped.annualDirection, year) + sumManualItems(budget.manualItems, year, ["Dirección"]);
    const assistance = parameterForYear(scoped.annualAssistance, year) + sumManualItems(budget.manualItems, year, ["Asistencia"]);
    const operational = parameterForYear(scoped.referenceOperational, year) + sumManualItems(budget.manualItems, year, ["Gastos operacionales", "Bienes y servicios"]);
    const software = parameterForYear(scoped.softwareLicenses, year) + sumManualItems(budget.manualItems, year, ["Software"]);
    const diffusion = parameterForYear(scoped.diffusionAdmission, year) + sumManualItems(budget.manualItems, year, ["Difusión"]);
    const maintenanceScholarships = sum(semesters.map((semester) =>
      nonNegative(semester.maintenanceScholarshipStudents)
      * nonNegative(semester.maintenanceScholarshipMonths)
      * parameterForYear(parameters.maintenanceScholarshipMonthly, semester.year),
    )) + sumManualItems(budget.manualItems, year, ["Becas de manutención"]);
    const congressesInternships = parameterForYear(scoped.congressesInternships, year)
      + sumManualItems(budget.manualItems, year, ["Congresos", "Pasantías"]);
    const booksPublications = sumManualItems(budget.manualItems, year, ["Libros y publicaciones"]);
    const travelFreight = sumManualItems(budget.manualItems, year, ["Pasajes y fletes"]);
    const perDiem = sumManualItems(budget.manualItems, year, ["Viáticos"]);
    const otherCosts = sumManualItems(budget.manualItems, year, ["Otros"]);
    const centralOverhead = overheadApplies(budget.program.type) ? netTuitionIncome * scoped.centralOverheadRate : 0;
    const facultyOverhead = overheadApplies(budget.program.type) ? netTuitionIncome * budget.facultyOverheadRate : 0;
    const totalExpenses = academicHonoraria + nonAcademicHonoraria + direction + assistance + operational + software + diffusion
      + maintenanceScholarships + congressesInternships + booksPublications + travelFreight + perDiem + otherCosts + centralOverhead + facultyOverhead;
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
      recognizedEnrollmentFee,
      externalIncome,
      otherIncome,
      totalIncome,
      directTeachingCost,
      replacementTeachingCost,
      thesisGuidanceCost,
      manualAcademicHonoraria,
      academicHonoraria,
      nonAcademicHonoraria,
      direction,
      assistance,
      operational,
      software,
      diffusion,
      maintenanceScholarships,
      congressesInternships,
      booksPublications,
      travelFreight,
      perDiem,
      otherCosts,
      centralOverhead,
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
