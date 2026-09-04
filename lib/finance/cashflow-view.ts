import type { AnnualFlow, BudgetResult, SemesterRevenueTrace } from "../calculations/types";

export type CashflowViewMode = "SEMESTER" | "ANNUAL" | "CYCLE";

type NumericAnnualFlowKey = {
  [K in keyof AnnualFlow]-?: NonNullable<AnnualFlow[K]> extends number ? K : never
}[keyof AnnualFlow];

export interface AdaptiveCashflowColumn {
  key: string;
  label: string;
  values: Partial<Record<NumericAnnualFlowKey, number>>;
}

const allocatedAnnualFields: NumericAnnualFlowKey[] = [
  "directTeachingCost",
  "synchronousTeachingCost",
  "asynchronousTeachingCost",
  "sharedCourseSavings",
  "replacementTeachingCost",
  "thesisGuidanceCost",
  "academicHonoraria",
  "otherNonAcademicHonoraria",
  "nonAcademicHonoraria",
  "direction",
  "assistance",
  "operational",
  "software",
  "diffusion",
  "maintenanceScholarships",
  "scholarshipsAndAid",
  "equipment",
  "otherExpenses",
  "congressesInternships",
  "booksPublications",
  "travelFreight",
  "perDiem",
  "foodBeverages",
  "otherCosts",
  "thesisStudents",
  "graduatingStudents",
];

function annualValues(flow: AnnualFlow): AdaptiveCashflowColumn["values"] {
  const values: AdaptiveCashflowColumn["values"] = {};
  for (const [key, value] of Object.entries(flow)) {
    if (typeof value === "number") values[key as NumericAnnualFlowKey] = value;
  }
  return values;
}

function lineForPeriod(result: BudgetResult, year: number, semester: 1 | 2): SemesterRevenueTrace | undefined {
  return result.revenueLedger.find((line) => line.year === year && line.semester === semester);
}

function semesterColumns(result: BudgetResult): AdaptiveCashflowColumn[] {
  const columns: AdaptiveCashflowColumn[] = [];
  let accumulated = result.annualFlows[0]?.startingCarryover ?? 0;

  for (const period of result.periods) {
    const annual = result.annualFlows.find((flow) => flow.year === period.year);
    const revenue = lineForPeriod(result, period.year, period.semester);
    if (!annual || !revenue) continue;

    const activeSemesters = Math.max(1, annual.activeSemesters);
    const allocation = 1 / activeSemesters;
    const values: AdaptiveCashflowColumn["values"] = {
      year: period.year,
      activeSemesters: 1,
      annualTuition: annual.annualTuition,
      tuitionFactor: revenue.tuitionShare,
      tuitionDistributionShare: revenue.tuitionShare,
      grossTuition: revenue.grossTuition,
      discounts: revenue.tuitionDiscounts,
      internalTuitionScholarships: revenue.internalTuitionScholarships,
      tuitionAfterBenefits: revenue.tuitionAfterBenefits,
      badDebt: revenue.badDebt,
      netTuitionIncome: revenue.netTuitionIncome,
      grossEnrollmentFee: revenue.grossEnrollmentFee,
      enrollmentDiscounts: revenue.enrollmentDiscounts,
      netEnrollmentFee: revenue.netEnrollmentFee,
      recognizedEnrollmentFee: revenue.recognizedEnrollmentFee,
      equivalentEnrollments: annual.equivalentEnrollments * allocation,
      roundedEquivalentStudents: Math.ceil(annual.equivalentEnrollments * allocation),
      externalIncome: annual.externalIncome * allocation,
      institutionalFinancing: annual.institutionalFinancing * allocation,
      otherIncome: annual.otherIncome * allocation,
    };

    for (const field of allocatedAnnualFields) values[field] = (annual[field] as number) * allocation;

    // El overhead se deriva del ingreso del semestre para que la vista sea trazable y
    // la suma semestral reconcilie exactamente con la vista anual.
    const overheadBase = Math.max(0, revenue.grossTuition - revenue.tuitionDiscounts - revenue.badDebt);
    const centralOverhead = overheadBase * annual.centralOverheadRate;
    const facultyOverhead = overheadBase * annual.facultyOverheadRate;
    const fixedExpensesBeforeOverhead = Math.max(0, annual.totalExpenses - annual.centralOverhead - annual.facultyOverhead) * allocation;
    const totalExpenses = fixedExpensesBeforeOverhead + centralOverhead + facultyOverhead;
    const totalIncome = revenue.netTuitionIncome + revenue.recognizedEnrollmentFee + (annual.externalIncome + annual.institutionalFinancing + annual.otherIncome) * allocation;
    const netFlow = totalIncome - totalExpenses;

    values.overheadBase = overheadBase;
    values.centralOverheadRate = annual.centralOverheadRate;
    values.facultyOverheadRate = annual.facultyOverheadRate;
    values.centralOverhead = centralOverhead;
    values.facultyOverhead = facultyOverhead;
    values.totalIncome = totalIncome;
    values.totalExpenses = totalExpenses;
    values.startingCarryover = accumulated;
    values.netFlow = netFlow;
    accumulated += netFlow;
    values.accumulatedFlow = accumulated;
    values.operatingMargin = totalIncome !== 0 ? netFlow / totalIncome : 0;

    columns.push({
      key: `${period.year}-${period.semester}`,
      label: `${period.year}-${period.semester}S`,
      values,
    });
  }

  return columns;
}

function cycleColumn(result: BudgetResult): AdaptiveCashflowColumn[] {
  if (!result.annualFlows.length) return [];
  const values: AdaptiveCashflowColumn["values"] = {};
  const keys = new Set<NumericAnnualFlowKey>();
  for (const flow of result.annualFlows) {
    for (const [key, value] of Object.entries(flow)) if (typeof value === "number") keys.add(key as NumericAnnualFlowKey);
  }
  for (const key of keys) {
    if (key === "startingCarryover") {
      values[key] = result.annualFlows[0]?.startingCarryover ?? 0;
    } else if (key === "accumulatedFlow") {
      values[key] = result.annualFlows.at(-1)?.accumulatedFlow ?? 0;
    } else if (key === "centralOverheadRate" || key === "facultyOverheadRate" || key === "operatingMargin" || key === "annualTuition" || key === "year") {
      values[key] = 0;
    } else {
      values[key] = result.annualFlows.reduce((sum, flow) => sum + Number(flow[key] ?? 0), 0);
    }
  }
  values.totalIncome = result.annualFlows.reduce((sum, flow) => sum + flow.totalIncome, 0);
  values.totalExpenses = result.annualFlows.reduce((sum, flow) => sum + flow.totalExpenses, 0);
  values.netFlow = result.annualFlows.reduce((sum, flow) => sum + flow.netFlow, 0);
  values.accumulatedFlow = result.finalAccumulatedFlow;
  return [{ key: "cycle", label: "Ciclo completo", values }];
}

export function buildAdaptiveCashflowColumns(result: BudgetResult, mode: CashflowViewMode): AdaptiveCashflowColumn[] {
  if (mode === "SEMESTER") return semesterColumns(result);
  if (mode === "CYCLE") return cycleColumn(result);
  return result.annualFlows.map((flow) => ({ key: String(flow.year), label: String(flow.year), values: annualValues(flow) }));
}

export function adaptiveCashflowValues(columns: AdaptiveCashflowColumn[], field: NumericAnnualFlowKey): number[] {
  return columns.map((column) => Number(column.values[field] ?? 0));
}

export function adaptiveCashflowReconciliation(result: BudgetResult) {
  const semester = semesterColumns(result);
  const annualIncome = result.annualFlows.reduce((sum, flow) => sum + flow.totalIncome, 0);
  const annualExpenses = result.annualFlows.reduce((sum, flow) => sum + flow.totalExpenses, 0);
  const annualNet = result.annualFlows.reduce((sum, flow) => sum + flow.netFlow, 0);
  return {
    semesterIncome: adaptiveCashflowValues(semester, "totalIncome").reduce((sum, value) => sum + value, 0),
    semesterExpenses: adaptiveCashflowValues(semester, "totalExpenses").reduce((sum, value) => sum + value, 0),
    semesterNet: adaptiveCashflowValues(semester, "netFlow").reduce((sum, value) => sum + value, 0),
    annualIncome,
    annualExpenses,
    annualNet,
  };
}
