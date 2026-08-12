import { getActivePeriods, isPeriodWithinRange } from "../calculations/periods";
import type {
  BudgetTemplate,
  CohortBudget,
  CostTemplateConfig,
  DiscountTemplateConfig,
  IncomeTemplateConfig,
  MaintenanceScholarshipTemplateConfig,
  TuitionScholarshipTemplateConfig,
} from "../calculations/types";

const clone = <T,>(value: T): T => structuredClone(value);
const nonNegative = (value: unknown): number => Math.max(0, Number.isFinite(Number(value)) ? Number(value) : 0);
const uid = (prefix: string, key: string): string => `${prefix}-${key}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

function bounds(budget: CohortBudget, periodMode: "TODOS" | "ULTIMO" = "TODOS") {
  const periods = getActivePeriods(budget.startYear, budget.startSemester, budget.durationSemesters);
  const first = periodMode === "ULTIMO" ? periods.at(-1)! : periods[0];
  const last = periods.at(-1)!;
  return { first, last: periodMode === "ULTIMO" ? first : last };
}

function templateStudents(activeStudents: number, mode: "TODOS_ACTIVOS" | "CANTIDAD", configured: number): number {
  return mode === "TODOS_ACTIVOS" ? nonNegative(activeStudents) : nonNegative(configured);
}

export function applyBudgetTemplate(source: CohortBudget, template: BudgetTemplate): CohortBudget {
  const budget = clone(source);
  budget.discounts = budget.discounts.filter((item) => !item.originTemplateItemKey);
  budget.externalIncome = budget.externalIncome.filter((item) => !item.originTemplateItemKey);
  budget.manualItems = budget.manualItems.filter((item) => !item.originTemplateItemKey);
  budget.semesters = budget.semesters.map((semester) => ({
    ...semester,
    internalTuitionScholarshipStudents: 0,
    internalTuitionScholarshipCoverage: 1,
    maintenanceScholarshipStudents: 0,
    maintenanceScholarshipMonths: 0,
  }));

  for (const item of template.items.filter((candidate) => candidate.active).sort((a, b) => a.position - b.position)) {
    if (item.kind === "DESCUENTO") {
      const config = item.config as DiscountTemplateConfig;
      const period = bounds(budget, config.periodMode);
      budget.discounts.push({
        id: uid("discount", item.key),
        name: item.name,
        percentage: nonNegative(config.percentage),
        students: nonNegative(config.students),
        startYear: period.first.year,
        startSemester: period.first.semester,
        endYear: period.last.year,
        endSemester: period.last.semester,
        note: config.note,
        originTemplateItemKey: item.key,
      });
    }
    if (item.kind === "BECA_ARANCEL") {
      const config = item.config as TuitionScholarshipTemplateConfig;
      const period = bounds(budget, config.periodMode);
      budget.semesters = budget.semesters.map((semester) => isPeriodWithinRange(semester.year, semester.semester, period.first.year, period.first.semester, period.last.year, period.last.semester) ? {
        ...semester,
        internalTuitionScholarshipStudents: templateStudents(semester.activeStudents, config.studentMode, config.students),
        internalTuitionScholarshipCoverage: nonNegative(config.coverage),
      } : semester);
    }
    if (item.kind === "BECA_MANUTENCION") {
      const config = item.config as MaintenanceScholarshipTemplateConfig;
      const period = bounds(budget, config.periodMode);
      budget.semesters = budget.semesters.map((semester) => isPeriodWithinRange(semester.year, semester.semester, period.first.year, period.first.semester, period.last.year, period.last.semester) ? {
        ...semester,
        maintenanceScholarshipStudents: templateStudents(semester.activeStudents, config.studentMode, config.students),
        maintenanceScholarshipMonths: nonNegative(config.months),
      } : semester);
    }
    if (item.kind === "COSTO") {
      const config = item.config as CostTemplateConfig;
      const period = bounds(budget);
      budget.manualItems.push({
        id: uid("cost", item.key),
        name: item.name,
        description: config.description ?? "",
        category: config.category,
        year: config.year ?? period.first.year,
        semester: config.semester,
        amount: nonNegative(config.amount),
        costType: config.costType,
        periodicity: config.periodicity,
        note: config.note,
        originTemplateItemKey: item.key,
      });
    }
    if (item.kind === "INGRESO_EXTRAORDINARIO") {
      const config = item.config as IncomeTemplateConfig;
      const period = bounds(budget);
      budget.externalIncome.push({
        id: uid("income", item.key),
        type: config.type,
        description: item.name,
        year: config.year ?? period.first.year,
        semester: config.semester ?? period.first.semester,
        students: nonNegative(config.students),
        amountPerStudent: nonNegative(config.amountPerStudent),
        source: config.source,
        note: config.note,
        originTemplateItemKey: item.key,
      });
    }
  }

  if (template.items.some((item) => item.active && (item.kind === "BECA_ARANCEL" || item.kind === "BECA_MANUTENCION"))) {
    budget.scholarshipsEnabled = true;
  }

  budget.appliedTemplateId = template.id;
  budget.appliedTemplateCode = template.code;
  budget.appliedTemplateVersion = template.version;
  budget.updatedAt = new Date().toISOString();
  return budget;
}
