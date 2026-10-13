import { grossTuitionPerStudentForProgram, enrollmentFeeForPeriod } from "../calculations/billing";
import { calculateBreakEvenEquivalentEnrollments } from "../calculations/break-even";
import { calculateBudget, resolvedAnnualOverrideForYear } from "../calculations/budget-engine";
import { getActivePeriods } from "../calculations/periods";
import type { CohortBudget, InstitutionalParameters } from "../calculations/types";

/**
 * Contrato de intercambio, sin estudiantes individuales ni RUT.
 * La matrícula y el arancel conservan sus definiciones: matrícula inicial
 * y arancel bruto de la cohorte completa, respectivamente.
 */
export interface DashboardOfferProgram {
  budgetId: string;
  programId: string;
  code: string;
  name: string;
  cohortName: string;
  status: CohortBudget["status"];
  startYear: number;
  startSemester: 1 | 2;
  durationSemesters: number;
  projectedStudents: number;
  tuition: number;
  annualReferenceTuition: number;
  matriculaFee: number;
  equivalentBreakEven: number | null;
  breakEven: number | null;
  target: number;
  projectedEquivalentEnrollments: number;
  ready: boolean;
  warnings: string[];
}

export interface DashboardOffer2027 {
  format: "UTEM_POSTGRAD_BUDGET_DASHBOARD";
  version: 1;
  year: 2027;
  generatedAt: string;
  tuitionBasis: "PROGRAM_TOTAL";
  programs: DashboardOfferProgram[];
}

export function buildDashboardOffer2027(
  budgets: CohortBudget[],
  parameters: InstitutionalParameters,
  generatedAt = new Date().toISOString(),
): DashboardOffer2027 {
  const relevant = budgets
    .filter((budget) => budget.startYear === 2027 && budget.status !== "Reemplazado")
    .sort((a, b) => a.program.code.localeCompare(b.program.code) || a.startSemester - b.startSemester);
  const programs: DashboardOfferProgram[] = relevant.map((budget) => {
    const firstPeriod = getActivePeriods(budget.startYear, budget.startSemester, budget.durationSemesters)[0];
    const currentYear = firstPeriod?.year ?? 2027;
    const annual = resolvedAnnualOverrideForYear(budget, parameters, currentYear);
    const result = calculateBudget(budget, parameters);
    const equilibrium = calculateBreakEvenEquivalentEnrollments(budget, parameters);
    const tuition = Math.max(0, Math.round(grossTuitionPerStudentForProgram(
      budget, (year) => resolvedAnnualOverrideForYear(budget, parameters, year).annualTuition,
    )));
    const matriculaFee = firstPeriod
      ? Math.round(enrollmentFeeForPeriod(budget, firstPeriod.year, firstPeriod.semester, annual.annualEnrollmentFee))
      : 0;
    const exact = equilibrium.minimumEquivalentEnrollmentsExact;
    const validEquilibrium = exact != null && Number.isFinite(exact) && exact >= 0;
    const warnings: string[] = [];
    if (budget.status !== "Aprobado") warnings.push("Presupuesto no aprobado; valores sujetos a revisión.");
    if (budget.startSemester === 2 && budget.tuitionPricingMode !== "PROGRAM_TOTAL") {
      warnings.push("Modelo de arancel anual histórico con inicio 2S; normalizar antes de importar.");
    }
    if (budget.initialStudents <= 0 || tuition <= 0) warnings.push("Proyección o arancel de cohorte incompletos.");
    if (!validEquilibrium || equilibrium.components.contributionPerEquivalentEnrollment <= 0) {
      warnings.push("Punto de equilibrio no calculable con los datos actuales.");
    }
    // El dashboard registra ingresos arancelarios netos de descuentos, pero ANTES
    // de incobrabilidad: no corresponde usar 'netTuitionIncome' como meta.
    const target = Math.round(result.annualFlows.reduce((sum, flow) => sum + flow.tuitionAfterBenefits, 0));
    const projectedEquivalents = result.annualFlows[0]?.equivalentEnrollments ?? 0;
    return {
      budgetId: budget.id,
      programId: budget.program.id,
      code: budget.program.code,
      name: budget.program.name,
      cohortName: budget.cohortName,
      status: budget.status,
      startYear: budget.startYear,
      startSemester: budget.startSemester,
      durationSemesters: budget.durationSemesters,
      projectedStudents: budget.initialStudents,
      tuition,
      annualReferenceTuition: annual.annualTuition,
      matriculaFee,
      equivalentBreakEven: validEquilibrium ? Number(exact!.toFixed(6)) : null,
      breakEven: validEquilibrium ? Math.round(exact! * tuition) : null,
      target: Math.max(0, target),
      projectedEquivalentEnrollments: Number(projectedEquivalents.toFixed(6)),
      ready: warnings.length === 0,
      warnings,
    };
  });
  // Varias admisiones de un mismo programa requieren revisión de SIGA/cohorte:
  // el dashboard actual tiene sólo una ficha por código SIGA.
  const byProgram = new Map<string, number>();
  for (const p of programs) byProgram.set(p.programId, (byProgram.get(p.programId) ?? 0) + 1);
  for (const p of programs) if ((byProgram.get(p.programId) ?? 0) > 1) {
    p.ready = false;
    p.warnings.push("Hay más de una cohorte 2027 de este programa: seleccione una o configure seguimiento por cohorte.");
  }
  return { format: "UTEM_POSTGRAD_BUDGET_DASHBOARD", version: 1, year: 2027, generatedAt, tuitionBasis: "PROGRAM_TOTAL", programs };
}
