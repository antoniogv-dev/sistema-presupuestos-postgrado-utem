import { calculateBudget } from "./budget-engine";
import { manualItemAmountForYear } from "../finance/cost-engine";
import type { BudgetItem, BudgetStatus, CohortBudget, DuplicateCostAlert, InstitutionalParameters, ProgramType } from "./types";

export type ConsolidationScope = "ACTIVE" | "APPROVED";
export interface ConsolidatedYear { year: number; grossIncome: number; grossExpenses: number; normalizedExpenses: number; duplicateAvoided: number; netFlow: number; }
export interface ConsolidationGroup {
  id: string;
  label: string;
  kind: "PROGRAM" | "ACADEMIC" | "PROFESSIONAL" | "INSTITUTIONAL";
  programTypes: ProgramType[];
  scope: ConsolidationScope;
  budgetCount: number;
  rows: ConsolidatedYear[];
}

export const ACTIVE_CONSOLIDATION_STATUSES: BudgetStatus[] = ["En revisión", "Observado", "Aprobado"];
export const APPROVED_CONSOLIDATION_STATUSES: BudgetStatus[] = ["Aprobado"];

export const SHARED_CATEGORIES: BudgetItem["category"][] = [
  "Dirección", "Asistencia de dirección", "Otros honorarios no académicos",
  "Gastos operacionales / Bienes y servicios", "Software y licencias", "Equipamiento",
];
const normalizedName = (value: string) => value.trim().toLocaleLowerCase("es-CL").replace(/\s+/g, " ");
const sum = (values: number[]) => values.reduce((acc, value) => acc + value, 0);

export function isBudgetEligibleForConsolidation(budget: CohortBudget, scope: ConsolidationScope): boolean {
  if (budget.deletedAt) return false;
  const statuses = scope === "APPROVED" ? APPROVED_CONSOLIDATION_STATUSES : ACTIVE_CONSOLIDATION_STATUSES;
  return statuses.includes(budget.status);
}

export function budgetsForConsolidationGroup(budgets: CohortBudget[], group: Pick<ConsolidationGroup, "kind" | "id" | "programTypes" | "scope">): CohortBudget[] {
  return budgets.filter((budget) => {
    if (!isBudgetEligibleForConsolidation(budget, group.scope)) return false;
    if (group.kind === "PROGRAM") return `program-${budget.program.id}` === group.id;
    return group.programTypes.includes(budget.program.type);
  });
}

export function detectPotentialDuplicateCosts(budgets: CohortBudget[], selectedBudgetId?: string): DuplicateCostAlert[] {
  const groups = new Map<string, Array<{ budget: CohortBudget; item: BudgetItem }>>();
  for (const budget of budgets.filter((candidate) => !candidate.deletedAt && candidate.alertPotentialDuplicates)) {
    for (const item of budget.manualItems) {
      const key = `${budget.program.id}|${item.year}|${item.category}|${normalizedName(item.name)}`;
      const current = groups.get(key) ?? [];
      current.push({ budget, item });
      groups.set(key, current);
    }
  }
  return [...groups.entries()]
    .filter(([, entries]) => new Set(entries.map(({ budget }) => budget.id)).size > 1)
    .filter(([, entries]) => !selectedBudgetId || entries.some(({ budget }) => budget.id === selectedBudgetId))
    .map(([key, entries]) => ({
      key,
      programId: entries[0].budget.program.id,
      year: entries[0].item.year,
      category: entries[0].item.category,
      name: entries[0].item.name,
      budgetIds: [...new Set(entries.map(({ budget }) => budget.id))],
      cohorts: [...new Set(entries.map(({ budget }) => budget.cohortName))],
      totalAmount: sum(entries.map(({ item }) => item.amount)),
      allMarkedShared: entries.every(({ item }) => item.costType === "Compartido con otras cohortes"),
      message: `${entries[0].item.name} aparece en ${new Set(entries.map(({ budget }) => budget.id)).size} cohortes del mismo programa para ${entries[0].item.year}.`,
    }));
}

export function consolidateBudgets(budgets: CohortBudget[], parameters: InstitutionalParameters): ConsolidatedYear[] {
  const activeBudgets = budgets.filter((budget) => !budget.deletedAt);
  const calculated = activeBudgets.map((budget) => ({ budget, result: calculateBudget(budget, parameters) }));
  const years = [...new Set(calculated.flatMap(({ result }) => result.years))].sort((a, b) => a - b);

  return years.map((year) => {
    const entries = calculated.flatMap(({ budget, result }) => {
      const flow = result.annualFlows.find((candidate) => candidate.year === year);
      return flow ? [{ budget, flow }] : [];
    });
    const grossIncome = sum(entries.map(({ flow }) => flow.totalIncome));
    const grossExpenses = sum(entries.map(({ flow }) => flow.totalExpenses));

    // La normalización automática debe operar sólo sobre los costos base del staff/operación.
    // Los costos manuales se normalizan por separado únicamente cuando están marcados como compartidos.
    // De esta forma un gasto manual no se descuenta dos veces del consolidado.
    const automaticCategories: BudgetItem["category"][] = [
      "Dirección", "Asistencia", "Asistencia de dirección", "Honorarios no académicos", "Otros honorarios no académicos",
      "Gastos operacionales", "Bienes y servicios", "Gastos operacionales / Bienes y servicios", "Software", "Software y licencias",
    ];
    const automaticGroups = new Map<string, number[]>();
    for (const { budget, flow } of entries) {
      if (!budget.normalizeSharedCosts) continue;
      const manualIncluded = sum(budget.manualItems
        .filter((item) => automaticCategories.includes(item.category))
        .map((item) => manualItemAmountForYear(item, budget, year)));
      const amount = Math.max(0, flow.nonAcademicHonoraria + flow.operational + flow.software - manualIncluded);
      const current = automaticGroups.get(budget.program.id) ?? [];
      current.push(amount);
      automaticGroups.set(budget.program.id, current);
    }
    const automaticAvoided = sum([...automaticGroups.values()].map((amounts) => Math.max(0, sum(amounts) - Math.max(...amounts))));

    const manualGroups = new Map<string, number[]>();
    for (const { budget } of entries) {
      if (!budget.normalizeSharedCosts) continue;
      for (const item of budget.manualItems.filter((candidate) => candidate.costType === "Compartido con otras cohortes")) {
        const amount = manualItemAmountForYear(item, budget, year);
        if (amount <= 0) continue;
        const key = `${budget.program.id}|${year}|${item.category}|${normalizedName(item.name)}`;
        const current = manualGroups.get(key) ?? [];
        current.push(amount);
        manualGroups.set(key, current);
      }
    }
    const manualAvoided = sum([...manualGroups.values()].map((amounts) => Math.max(0, sum(amounts) - Math.max(...amounts))));
    const duplicateAvoided = automaticAvoided + manualAvoided;
    const normalizedExpenses = grossExpenses - duplicateAvoided;
    return { year, grossIncome, grossExpenses, normalizedExpenses, duplicateAvoided, netFlow: grossIncome - normalizedExpenses };
  });
}

function groupFromBudgets(
  id: string,
  label: string,
  kind: ConsolidationGroup["kind"],
  programTypes: ProgramType[],
  scope: ConsolidationScope,
  budgets: CohortBudget[],
  parameters: InstitutionalParameters,
): ConsolidationGroup {
  return { id, label, kind, programTypes, scope, budgetCount: budgets.length, rows: consolidateBudgets(budgets, parameters) };
}

export function buildConsolidationGroups(budgets: CohortBudget[], parameters: InstitutionalParameters): ConsolidationGroup[] {
  const active = budgets.filter((budget) => isBudgetEligibleForConsolidation(budget, "ACTIVE"));
  const approved = budgets.filter((budget) => isBudgetEligibleForConsolidation(budget, "APPROVED"));

  const programGroups = [...new Map(active.map((budget) => [budget.program.id, budget.program])).values()]
    .sort((a, b) => a.code.localeCompare(b.code, "es"))
    .map((program) => {
      const programBudgets = active.filter((budget) => budget.program.id === program.id);
      return groupFromBudgets(`program-${program.id}`, `${program.code} · ${program.name}`, "PROGRAM", [program.type], "ACTIVE", programBudgets, parameters);
    });

  const academic = active.filter((budget) => budget.program.type === "DOCTORADO" || budget.program.type === "MAGISTER_ACADEMICO");
  const professional = active.filter((budget) => budget.program.type === "MAGISTER_PROFESIONAL");
  const allTypes: ProgramType[] = ["DOCTORADO", "MAGISTER_ACADEMICO", "MAGISTER_PROFESIONAL", "OTRO"];

  return [
    groupFromBudgets("institutional-approved", "Consolidado institucional · Aprobados", "INSTITUTIONAL", allTypes, "APPROVED", approved, parameters),
    groupFromBudgets("institutional-active", "Consolidado institucional · Activos", "INSTITUTIONAL", allTypes, "ACTIVE", active, parameters),
    groupFromBudgets("academic", "Programas académicos · Activos", "ACADEMIC", ["DOCTORADO", "MAGISTER_ACADEMICO"], "ACTIVE", academic, parameters),
    groupFromBudgets("professional", "Programas profesionales · Activos", "PROFESSIONAL", ["MAGISTER_PROFESIONAL"], "ACTIVE", professional, parameters),
    ...programGroups,
  ];
}
