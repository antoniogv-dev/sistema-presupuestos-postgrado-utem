import { calculateBudget } from "./budget-engine";
import type { BudgetItem, CohortBudget, DuplicateCostAlert, InstitutionalParameters, ProgramType } from "./types";

export interface ConsolidatedYear { year: number; grossIncome: number; grossExpenses: number; normalizedExpenses: number; duplicateAvoided: number; netFlow: number; }
export interface ConsolidationGroup { id: string; label: string; kind: "PROGRAM" | "ACADEMIC" | "PROFESSIONAL" | "INSTITUTIONAL"; programTypes: ProgramType[]; budgetCount: number; rows: ConsolidatedYear[]; }

export const SHARED_CATEGORIES: BudgetItem["category"][] = ["Dirección", "Asistencia", "Gastos operacionales", "Software"];
const normalizedName = (value: string) => value.trim().toLocaleLowerCase("es-CL").replace(/\s+/g, " ");
const sum = (values: number[]) => values.reduce((acc, value) => acc + value, 0);

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

    const automaticGroups = new Map<string, number[]>();
    for (const { budget, flow } of entries) {
      if (!budget.normalizeSharedCosts) continue;
      const amount = flow.direction + flow.assistance + flow.operational + flow.software;
      const current = automaticGroups.get(budget.program.id) ?? [];
      current.push(amount);
      automaticGroups.set(budget.program.id, current);
    }
    const automaticAvoided = sum([...automaticGroups.values()].map((amounts) => Math.max(0, sum(amounts) - Math.max(...amounts))));

    const manualGroups = new Map<string, number[]>();
    for (const { budget } of entries) {
      if (!budget.normalizeSharedCosts) continue;
      for (const item of budget.manualItems.filter((candidate) => candidate.year === year && candidate.costType === "Compartido con otras cohortes")) {
        const key = `${budget.program.id}|${year}|${item.category}|${normalizedName(item.name)}`;
        const current = manualGroups.get(key) ?? [];
        current.push(item.amount);
        manualGroups.set(key, current);
      }
    }
    const manualAvoided = sum([...manualGroups.values()].map((amounts) => Math.max(0, sum(amounts) - Math.max(...amounts))));
    const duplicateAvoided = automaticAvoided + manualAvoided;
    const normalizedExpenses = grossExpenses - duplicateAvoided;
    return { year, grossIncome, grossExpenses, normalizedExpenses, duplicateAvoided, netFlow: grossIncome - normalizedExpenses };
  });
}

export function buildConsolidationGroups(budgets: CohortBudget[], parameters: InstitutionalParameters): ConsolidationGroup[] {
  const active = budgets.filter((budget) => !budget.deletedAt);
  const programGroups = [...new Map(active.map((budget) => [budget.program.id, budget.program])).values()].sort((a, b) => a.code.localeCompare(b.code, "es")).map((program) => {
    const programBudgets = active.filter((budget) => budget.program.id === program.id);
    return { id: `program-${program.id}`, label: `${program.code} · ${program.name}`, kind: "PROGRAM" as const, programTypes: [program.type], budgetCount: programBudgets.length, rows: consolidateBudgets(programBudgets, parameters) };
  });
  const academic = active.filter((budget) => budget.program.type === "DOCTORADO" || budget.program.type === "MAGISTER_ACADEMICO");
  const professional = active.filter((budget) => budget.program.type === "MAGISTER_PROFESIONAL");
  return [
    { id: "academic", label: "Programas académicos", kind: "ACADEMIC", programTypes: ["DOCTORADO", "MAGISTER_ACADEMICO"], budgetCount: academic.length, rows: consolidateBudgets(academic, parameters) },
    { id: "professional", label: "Programas profesionales", kind: "PROFESSIONAL", programTypes: ["MAGISTER_PROFESIONAL"], budgetCount: professional.length, rows: consolidateBudgets(professional, parameters) },
    { id: "institutional", label: "Consolidado institucional", kind: "INSTITUTIONAL", programTypes: ["DOCTORADO", "MAGISTER_ACADEMICO", "MAGISTER_PROFESIONAL", "OTRO"], budgetCount: active.length, rows: consolidateBudgets(active, parameters) },
    ...programGroups,
  ];
}
