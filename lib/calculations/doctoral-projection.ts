import { calculateBudget, defaultAnnualOverrideForYear, hydrateAnnualOverrides } from "./budget-engine";
import { getActivePeriods } from "./periods";
import type { AnnualFlow, BudgetAnnualOverride, CohortBudget, InstitutionalParameters, Program } from "./types";

const sum = (values: number[]) => values.reduce((acc, value) => acc + value, 0);
const money = (value: number) => Math.max(0, Math.round(Number.isFinite(value) ? value : 0));

export type DoctoralViewMode = "ANNUAL" | "CONSOLIDATED" | "REGIME";

export interface DoctoralCohortYearRow {
  budgetId: string;
  cohortName: string;
  cohortYear: number;
  academicYear: number;
  students: number;
  status: CohortBudget["status"];
  flow: AnnualFlow;
}

export interface DoctoralProgramYearSummary {
  program: Program;
  year: number;
  cohorts: DoctoralCohortYearRow[];
  totalStudents: number;
  directTeachingHours: number;
  totalIncome: number;
  directTeachingCost: number;
  academicHonoraria: number;
  direction: number;
  assistance: number;
  maintenanceScholarships: number;
  congressesInternships: number;
  travelFreight: number;
  booksPublications: number;
  totalExpenses: number;
  netFlow: number;
}

export interface DoctoralRegimeStage {
  academicYear: number;
  syntheticCohortYear: number;
  students: number;
  eligibleForCongressesInternships: boolean;
  flow: AnnualFlow;
}

export interface DoctoralRegimeProjection {
  program: Program;
  year: number;
  referenceBudgetId: string;
  stages: DoctoralRegimeStage[];
  totalStudents: number;
  totalIncome: number;
  directTeachingCost: number;
  academicHonoraria: number;
  direction: number;
  assistance: number;
  maintenanceScholarships: number;
  congressesInternships: number;
  travelFreight: number;
  booksPublications: number;
  totalExpenses: number;
  netFlow: number;
}

function budgetIsVisible(budget: CohortBudget): boolean {
  return !budget.deletedAt && budget.status !== "Reemplazado" && budget.program.type === "DOCTORADO";
}

export function budgetIsActiveInYear(budget: CohortBudget, year: number): boolean {
  if (!budgetIsVisible(budget)) return false;
  return budget.semesters.some((semester) => semester.year === year);
}

export function academicYearForBudgetYear(budget: CohortBudget, year: number): number | null {
  const periods = getActivePeriods(budget.startYear, budget.startSemester, budget.durationSemesters);
  const indexes = periods
    .map((period, index) => ({ period, index }))
    .filter(({ period }) => period.year === year)
    .map(({ index }) => index);
  if (!indexes.length) return null;
  return Math.min(4, Math.floor(Math.min(...indexes) / 2) + 1);
}

export function studentsForBudgetYear(budget: CohortBudget, year: number): number {
  const values = budget.semesters.filter((semester) => semester.year === year).map((semester) => semester.activeStudents);
  return values.length ? Math.max(...values) : 0;
}

export function activeDoctoralBudgetsForYear(budgets: CohortBudget[], year: number): CohortBudget[] {
  return budgets
    .filter((budget) => budgetIsActiveInYear(budget, year))
    .sort((a, b) => a.program.code.localeCompare(b.program.code, "es") || a.startYear - b.startYear);
}

function annualFlowForYear(budget: CohortBudget, parameters: InstitutionalParameters, year: number): AnnualFlow | null {
  const hydrated = hydrateAnnualOverrides(budget, parameters);
  return calculateBudget(hydrated, parameters).annualFlows.find((flow) => flow.year === year) ?? null;
}

function directHoursForYear(budget: CohortBudget, year: number): number {
  return sum(budget.semesters
    .filter((semester) => semester.year === year)
    .map((semester) => semester.directTeachingHours + semester.synchronousTeachingHours + semester.asynchronousTeachingHours));
}

export function summarizeDoctoralProgramYear(
  program: Program,
  budgets: CohortBudget[],
  parameters: InstitutionalParameters,
  year: number,
): DoctoralProgramYearSummary {
  const cohortRows = budgets
    .filter((budget) => budget.program.id === program.id && budgetIsActiveInYear(budget, year))
    .flatMap((budget) => {
      const flow = annualFlowForYear(budget, parameters, year);
      const academicYear = academicYearForBudgetYear(budget, year);
      if (!flow || academicYear === null) return [];
      return [{
        budgetId: budget.id,
        cohortName: budget.cohortName,
        cohortYear: budget.startYear,
        academicYear,
        students: studentsForBudgetYear(budget, year),
        status: budget.status,
        flow,
      }];
    })
    .sort((a, b) => a.cohortYear - b.cohortYear);

  const flows = cohortRows.map((row) => row.flow);
  const sourceBudgets = budgets.filter((budget) => cohortRows.some((row) => row.budgetId === budget.id));
  return {
    program,
    year,
    cohorts: cohortRows,
    totalStudents: sum(cohortRows.map((row) => row.students)),
    directTeachingHours: sum(sourceBudgets.map((budget) => directHoursForYear(budget, year))),
    totalIncome: sum(flows.map((flow) => flow.totalIncome)),
    directTeachingCost: sum(flows.map((flow) => flow.directTeachingCost + flow.synchronousTeachingCost + flow.asynchronousTeachingCost)),
    academicHonoraria: sum(flows.map((flow) => flow.academicHonoraria)),
    direction: sum(flows.map((flow) => flow.direction)),
    assistance: sum(flows.map((flow) => flow.assistance)),
    maintenanceScholarships: sum(flows.map((flow) => flow.maintenanceScholarships)),
    congressesInternships: sum(flows.map((flow) => flow.congressesInternships)),
    travelFreight: sum(flows.map((flow) => flow.travelFreight)),
    booksPublications: sum(flows.map((flow) => flow.booksPublications)),
    totalExpenses: sum(flows.map((flow) => flow.totalExpenses)),
    netFlow: sum(flows.map((flow) => flow.netFlow)),
  };
}

export function summarizeDoctoralPortfolioYear(
  programs: Program[],
  budgets: CohortBudget[],
  parameters: InstitutionalParameters,
  year: number,
): DoctoralProgramYearSummary[] {
  return programs
    .filter((program) => program.type === "DOCTORADO" && program.status !== "Inactivo")
    .map((program) => summarizeDoctoralProgramYear(program, budgets, parameters, year))
    .sort((a, b) => a.program.code.localeCompare(b.program.code, "es"));
}

function overrideForYear(budget: CohortBudget, parameters: InstitutionalParameters, year: number): BudgetAnnualOverride {
  const hydrated = hydrateAnnualOverrides(budget, parameters);
  return hydrated.annualOverrides.find((item) => item.year === year)
    ?? defaultAnnualOverrideForYear({ program: budget.program, facultyOverheadRate: 0 }, parameters, year);
}

type CommonAnnualKey =
  | "annualOperational"
  | "annualSoftware"
  | "annualDiffusion"
  | "annualCongressesInternships"
  | "annualBooksPublications"
  | "annualTravelFreight"
  | "annualPerDiem"
  | "annualFoodBeverages"
  | "annualOtherCosts";

const commonKeys: CommonAnnualKey[] = [
  "annualOperational",
  "annualSoftware",
  "annualDiffusion",
  "annualCongressesInternships",
  "annualBooksPublications",
  "annualTravelFreight",
  "annualPerDiem",
  "annualFoodBeverages",
  "annualOtherCosts",
];

function programAnnualTotals(
  program: Program,
  budgets: CohortBudget[],
  parameters: InstitutionalParameters,
  year: number,
  reference: CohortBudget,
) {
  const active = budgets.filter((budget) => budget.program.id === program.id && budgetIsActiveInYear(budget, year));
  if (!active.length) {
    const fallback = overrideForYear(reference, parameters, year);
    return {
      direction: fallback.annualDirection,
      assistance: fallback.annualAssistance,
      otherNonAcademic: fallback.annualOtherNonAcademicHonoraria,
      annualOperational: fallback.annualOperational,
      annualSoftware: fallback.annualSoftware,
      annualDiffusion: fallback.annualDiffusion,
      annualCongressesInternships: fallback.annualCongressesInternships,
      annualBooksPublications: fallback.annualBooksPublications,
      annualTravelFreight: fallback.annualTravelFreight,
      annualPerDiem: fallback.annualPerDiem,
      annualFoodBeverages: fallback.annualFoodBeverages,
      annualOtherCosts: fallback.annualOtherCosts,
    };
  }

  const overrides = active.map((budget) => overrideForYear(budget, parameters, year));
  const totals = {
    direction: sum(overrides.map((item) => item.annualDirection * (item.directionProrated ? item.directionAllocationRate : 1))),
    assistance: sum(overrides.map((item) => item.annualAssistance * (item.assistanceProrated ? item.assistanceAllocationRate : 1))),
    otherNonAcademic: sum(overrides.map((item) => item.annualOtherNonAcademicHonoraria * (item.otherNonAcademicProrated ? item.otherNonAcademicAllocationRate : 1))),
    annualOperational: 0,
    annualSoftware: 0,
    annualDiffusion: 0,
    annualCongressesInternships: 0,
    annualBooksPublications: 0,
    annualTravelFreight: 0,
    annualPerDiem: 0,
    annualFoodBeverages: 0,
    annualOtherCosts: 0,
  };
  for (const key of commonKeys) totals[key] = sum(overrides.map((item) => item[key]));
  return totals;
}

function shiftYear(year: number, delta: number) {
  return year + delta;
}

function shiftReferenceBudget(
  reference: CohortBudget,
  targetYear: number,
  academicYear: number,
  targetOverride: BudgetAnnualOverride,
  common: ReturnType<typeof programAnnualTotals>,
): CohortBudget {
  const syntheticStartYear = targetYear - (academicYear - 1);
  const delta = syntheticStartYear - reference.startYear;
  const shifted: CohortBudget = structuredClone(reference);
  shifted.id = `regime-${reference.program.id}-${targetYear}-y${academicYear}`;
  shifted.cohortName = `Régimen · Año ${academicYear}`;
  shifted.startYear = syntheticStartYear;
  shifted.status = "Borrador";
  shifted.workflowStage = "GESTION";
  shifted.authorizedInitialCarryover = 0;
  shifted.includeAuthorizedCarryover = false;
  shifted.reviewHistory = [];
  shifted.createdAt = new Date(0).toISOString();
  shifted.updatedAt = undefined;

  shifted.semesters = reference.semesters.map((semester) => ({ ...semester, year: shiftYear(semester.year, delta) }));
  shifted.discounts = reference.discounts.map((item) => ({
    ...item,
    startYear: shiftYear(item.startYear, delta),
    endYear: shiftYear(item.endYear, delta),
  }));
  shifted.externalIncome = reference.externalIncome.map((item) => ({ ...item, year: shiftYear(item.year, delta) }));
  shifted.manualItems = reference.manualItems.map((item) => ({ ...item, year: shiftYear(item.year, delta) }));
  shifted.sharedCourses = reference.sharedCourses.map((item) => ({ ...item, year: shiftYear(item.year, delta) }));
  shifted.annualOverrides = reference.annualOverrides.map((item) => ({ ...item, year: shiftYear(item.year, delta) }));

  const eligibleForCongress = academicYear >= 3;
  const regimeOverride: BudgetAnnualOverride = {
    ...targetOverride,
    year: targetYear,
    annualDirection: money(common.direction),
    directionProrated: true,
    directionAllocationRate: 0.25,
    annualAssistance: money(common.assistance),
    assistanceProrated: true,
    assistanceAllocationRate: 0.25,
    annualOtherNonAcademicHonoraria: money(common.otherNonAcademic),
    otherNonAcademicProrated: true,
    otherNonAcademicAllocationRate: 0.25,
    annualOperational: money(common.annualOperational / 4),
    annualSoftware: money(common.annualSoftware / 4),
    annualDiffusion: money(common.annualDiffusion / 4),
    annualCongressesInternships: eligibleForCongress ? money(common.annualCongressesInternships / 2) : 0,
    annualBooksPublications: money(common.annualBooksPublications / 4),
    annualTravelFreight: money(common.annualTravelFreight / 4),
    annualPerDiem: money(common.annualPerDiem / 4),
    annualFoodBeverages: money(common.annualFoodBeverages / 4),
    annualOtherCosts: money(common.annualOtherCosts / 4),
  };

  const index = shifted.annualOverrides.findIndex((item) => item.year === targetYear);
  if (index >= 0) shifted.annualOverrides[index] = regimeOverride;
  else shifted.annualOverrides.push(regimeOverride);
  return shifted;
}

function newestReferenceBudget(program: Program, budgets: CohortBudget[]): CohortBudget | null {
  return budgets
    .filter((budget) => budget.program.id === program.id && budgetIsVisible(budget) && budget.durationSemesters >= 8)
    .sort((a, b) => b.startYear - a.startYear || b.version - a.version)[0] ?? null;
}

export function buildDoctoralRegimeProjection(
  program: Program,
  budgets: CohortBudget[],
  parameters: InstitutionalParameters,
  year: number,
): DoctoralRegimeProjection | null {
  if (program.type !== "DOCTORADO") return null;
  const reference = newestReferenceBudget(program, budgets);
  if (!reference) return null;

  const targetOverride = overrideForYear(reference, parameters, year);
  const common = programAnnualTotals(program, budgets, parameters, year, reference);
  const stages = [1, 2, 3, 4].flatMap((academicYear) => {
    const synthetic = shiftReferenceBudget(reference, year, academicYear, targetOverride, common);
    const flow = annualFlowForYear(synthetic, parameters, year);
    if (!flow) return [];
    return [{
      academicYear,
      syntheticCohortYear: year - (academicYear - 1),
      students: studentsForBudgetYear(synthetic, year),
      eligibleForCongressesInternships: academicYear >= 3,
      flow,
    }];
  });

  const flows = stages.map((stage) => stage.flow);
  return {
    program,
    year,
    referenceBudgetId: reference.id,
    stages,
    totalStudents: sum(stages.map((stage) => stage.students)),
    totalIncome: sum(flows.map((flow) => flow.totalIncome)),
    directTeachingCost: sum(flows.map((flow) => flow.directTeachingCost + flow.synchronousTeachingCost + flow.asynchronousTeachingCost)),
    academicHonoraria: sum(flows.map((flow) => flow.academicHonoraria)),
    direction: sum(flows.map((flow) => flow.direction)),
    assistance: sum(flows.map((flow) => flow.assistance)),
    maintenanceScholarships: sum(flows.map((flow) => flow.maintenanceScholarships)),
    congressesInternships: sum(flows.map((flow) => flow.congressesInternships)),
    travelFreight: sum(flows.map((flow) => flow.travelFreight)),
    booksPublications: sum(flows.map((flow) => flow.booksPublications)),
    totalExpenses: sum(flows.map((flow) => flow.totalExpenses)),
    netFlow: sum(flows.map((flow) => flow.netFlow)),
  };
}
