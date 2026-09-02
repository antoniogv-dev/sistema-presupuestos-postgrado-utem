import { getActivePeriods } from "../calculations/periods";
import type { BudgetAnnualOverride, BudgetItem, CohortBudget, InstitutionalParameters, SemesterParameters } from "../calculations/types";

const sum = (values: number[]) => values.reduce((acc, value) => acc + value, 0);
const nonNegative = (value: number | undefined) => Math.max(0, Number.isFinite(value) ? Number(value) : 0);
const clampRate = (value: number | undefined) => Math.min(1, Math.max(0, Number.isFinite(value) ? Number(value) : 0));

function semesterOrdinal(year: number, semester: 1 | 2): number {
  return year * 2 + semester;
}

export function manualItemMultiplier(item: BudgetItem, budget: CohortBudget, year: number): number {
  if (item.periodicity === "Único") return item.year === year ? 1 : 0;
  if (year < item.year) return 0;
  if (item.periodicity === "Anual") return 1;
  const activePeriods = getActivePeriods(budget.startYear, budget.startSemester, budget.durationSemesters).filter((period) => period.year === year);
  const startOrdinal = semesterOrdinal(item.year, item.semester ?? 1);
  return activePeriods.filter((period) => semesterOrdinal(period.year, period.semester) >= startOrdinal).length;
}

export function manualItemAmountForYear(item: BudgetItem, budget: CohortBudget, year: number): number {
  return nonNegative(item.amount) * manualItemMultiplier(item, budget, year);
}

function sumManualItems(budget: CohortBudget, year: number, categories: BudgetItem["category"][]): number {
  return sum(budget.manualItems.filter((item) => categories.includes(item.category)).map((item) => manualItemAmountForYear(item, budget, year)));
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

export interface AnnualCostProjection {
  directTeachingCost: number;
  synchronousTeachingCost: number;
  asynchronousTeachingCost: number;
  sharedCourseSavings: number;
  replacementTeachingCost: number;
  thesisGuidanceCost: number;
  academicHonoraria: number;
  otherNonAcademicHonoraria: number;
  nonAcademicHonoraria: number;
  direction: number;
  assistance: number;
  operational: number;
  software: number;
  diffusion: number;
  maintenanceScholarships: number;
  scholarshipsAndAid: number;
  equipment: number;
  otherExpenses: number;
  congressesInternships: number;
  booksPublications: number;
  travelFreight: number;
  perDiem: number;
  foodBeverages: number;
  otherCosts: number;
  thesisStudents: number;
  graduatingStudents: number;
  fixedExpensesBeforeOverhead: number;
}

export function calculateAnnualCosts(
  budget: CohortBudget,
  year: number,
  semesters: SemesterParameters[],
  override: BudgetAnnualOverride,
  parameters: InstitutionalParameters,
): AnnualCostProjection {
  const grossPresentialTeachingCost = sum(semesters.map((semester) => nonNegative(semester.directTeachingHours) * nonNegative(override.directTeachingHourValue)));
  const grossSynchronousTeachingCost = sum(semesters.map((semester) => nonNegative(semester.synchronousTeachingHours) * nonNegative(override.synchronousTeachingHourValue)));
  const grossAsynchronousTeachingCost = sum(semesters.map((semester) => nonNegative(semester.asynchronousTeachingHours) * nonNegative(override.asynchronousTeachingHourValue)));
  const validSharedCourseRules = (budget.sharedCourses ?? []).filter((rule) => rule.year === year && new Set(rule.participantProgramIds).size >= 2 && rule.allocationRate > 0);
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
  const directTeachingCost = budget.program.type === "MAGISTER_PROFESIONAL"
    ? presentialTeachingCost + synchronousTeachingCost + asynchronousTeachingCost
    : (budget.deliveryModality === "PRESENCIAL" ? presentialTeachingCost : synchronousTeachingCost + asynchronousTeachingCost);
  const replacementTeachingCost = sum(semesters.map((semester) => nonNegative(semester.replacementTeachingHours) * parameters.replacementHour));
  const graduatingStudents = Math.max(0, ...semesters.map((semester) => semester.graduatingStudents === undefined ? inferredGraduatingStudents(budget, semester) : nonNegative(semester.graduatingStudents)));
  const thesisGuidanceCost = graduatingStudents * nonNegative(override.thesisGuidancePerGraduatingStudent);
  const academicHonoraria = directTeachingCost + replacementTeachingCost + thesisGuidanceCost;
  const thesisStudents = Math.max(0, ...semesters.map((semester) => thesisStudentsForSemester(budget, semester)));

  const direction = nonNegative(override.annualDirection) * (override.directionProrated ? clampRate(override.directionAllocationRate) : 1) + sumManualItems(budget, year, ["Dirección"]);
  const assistance = nonNegative(override.annualAssistance) * (override.assistanceProrated ? clampRate(override.assistanceAllocationRate) : 1) + sumManualItems(budget, year, ["Asistencia", "Asistencia de dirección"]);
  const otherNonAcademicHonoraria = nonNegative(override.annualOtherNonAcademicHonoraria) * (override.otherNonAcademicProrated ? clampRate(override.otherNonAcademicAllocationRate) : 1) + sumManualItems(budget, year, ["Honorarios no académicos", "Otros honorarios no académicos"]);
  const nonAcademicHonoraria = direction + assistance + otherNonAcademicHonoraria;

  const operational = nonNegative(override.annualOperational) + sumManualItems(budget, year, ["Gastos operacionales", "Bienes y servicios", "Gastos operacionales / Bienes y servicios"]);
  const software = nonNegative(override.annualSoftware) + sumManualItems(budget, year, ["Software", "Software y licencias"]);
  const diffusion = nonNegative(override.annualDiffusion) + sumManualItems(budget, year, ["Difusión"]);
  const maintenanceScholarships = (budget.scholarshipsEnabled ? sum(semesters.map((semester) => nonNegative(semester.maintenanceScholarshipStudents) * nonNegative(semester.maintenanceScholarshipMonths) * nonNegative(override.maintenanceScholarshipMonthlyValue))) : 0) + sumManualItems(budget, year, ["Becas de manutención"]);
  const scholarshipsAndAid = maintenanceScholarships + sumManualItems(budget, year, ["Becas y ayudas"]);
  const equipment = sumManualItems(budget, year, ["Equipamiento"]);
  const congressesInternships = nonNegative(override.annualCongressesInternships) + sumManualItems(budget, year, ["Congresos", "Pasantías", "Congresos y pasantías"]);
  const booksPublications = nonNegative(override.annualBooksPublications) + sumManualItems(budget, year, ["Libros y publicaciones"]);
  const travelFreight = nonNegative(override.annualTravelFreight) + sumManualItems(budget, year, ["Pasajes y fletes"]);
  const perDiem = nonNegative(override.annualPerDiem) + sumManualItems(budget, year, ["Viáticos"]);
  const foodBeverages = nonNegative(override.annualFoodBeverages) + sumManualItems(budget, year, ["Alimentos y bebidas"]);
  const otherCosts = nonNegative(override.annualOtherCosts) + sumManualItems(budget, year, ["Otros", "Otros costos y gastos", "Honorarios académicos"]);
  const otherExpenses = operational + software + diffusion + congressesInternships + booksPublications + travelFreight + perDiem + foodBeverages + otherCosts;
  const fixedExpensesBeforeOverhead = academicHonoraria + nonAcademicHonoraria + otherExpenses + equipment + scholarshipsAndAid;

  return {
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
    thesisStudents,
    graduatingStudents,
    fixedExpensesBeforeOverhead,
  };
}
