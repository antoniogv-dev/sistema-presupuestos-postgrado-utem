import { calculateBudget } from "./budget-engine";
import type { CohortBudget, InstitutionalParameters } from "./types";

export interface BreakEvenResult {
  minimumEquivalentEnrollments: number | null;
  minimumEquivalentEnrollmentsExact: number | null;
  minimumWholeStudents: number | null;
  projectedFinalFlowAtMinimum: number | null;
  currentEquivalentEnrollments: number;
  equivalentEnrollmentGap: number | null;
  reached: boolean;
}

function syntheticEquivalentBudget(budget: CohortBudget, equivalentStudents: number): CohortBudget {
  return {
    ...structuredClone(budget),
    scholarshipsEnabled: false,
    discounts: [],
    semesters: budget.semesters.map((semester) => ({
      ...semester,
      activeStudents: equivalentStudents,
      // La matrícula equivalente mide capacidad de financiamiento a arancel completo.
      // Los costos académicos ya presupuestados (por ejemplo, guía de tesis) se conservan
      // dentro de lo razonable para no transformar el punto de equilibrio en un presupuesto distinto.
      graduatingStudents: Math.min(semester.graduatingStudents, equivalentStudents),
      internalTuitionScholarshipStudents: 0,
      maintenanceScholarshipStudents: 0,
      maintenanceScholarshipMonths: 0,
    })),
  };
}

function finalFlowForEquivalentStudents(
  budget: CohortBudget,
  parameters: InstitutionalParameters,
  equivalentStudents: number,
): number {
  return calculateBudget(syntheticEquivalentBudget(budget, equivalentStudents), parameters).finalAccumulatedFlow;
}

export function calculateBreakEvenEquivalentEnrollments(
  budget: CohortBudget,
  parameters: InstitutionalParameters,
): BreakEvenResult {
  const current = calculateBudget(budget, parameters);
  const currentEquivalentEnrollments = current.annualFlows.reduce(
    (maximum, flow) => Math.max(maximum, flow.equivalentEnrollments),
    0,
  );

  // Si incluso con cero matrículas equivalentes el presupuesto no es deficitario
  // (por arrastre/otros ingresos), el mínimo requerido es cero.
  const zeroFlow = finalFlowForEquivalentStudents(budget, parameters, 0);
  if (zeroFlow >= 0) {
    return {
      minimumEquivalentEnrollments: 0,
      minimumEquivalentEnrollmentsExact: 0,
      minimumWholeStudents: 0,
      projectedFinalFlowAtMinimum: zeroFlow,
      currentEquivalentEnrollments,
      equivalentEnrollmentGap: -currentEquivalentEnrollments,
      reached: true,
    };
  }

  let high = 1;
  let highFlow = finalFlowForEquivalentStudents(budget, parameters, high);
  const maximumSearch = 10_000;
  while (highFlow < 0 && high < maximumSearch) {
    high *= 2;
    highFlow = finalFlowForEquivalentStudents(budget, parameters, high);
  }

  if (highFlow < 0) {
    return {
      minimumEquivalentEnrollments: null,
      minimumEquivalentEnrollmentsExact: null,
      minimumWholeStudents: null,
      projectedFinalFlowAtMinimum: null,
      currentEquivalentEnrollments,
      equivalentEnrollmentGap: null,
      reached: false,
    };
  }

  let low = 0;
  for (let iteration = 0; iteration < 50; iteration += 1) {
    const mid = (low + high) / 2;
    if (finalFlowForEquivalentStudents(budget, parameters, mid) >= 0) high = mid;
    else low = mid;
  }

  const exact = high;
  // Las matrículas equivalentes admiten decimales porque incorporan el efecto financiero
  // de descuentos y beneficios. Se redondea hacia arriba a dos decimales para entregar
  // un umbral operativo que nunca deje el flujo final bajo cero y permanezca cercano a 0.
  const minimum = Math.ceil((exact - 1e-9) * 100) / 100;
  const minimumWholeStudents = Math.ceil(exact - 1e-9);
  const projectedFinalFlowAtMinimum = finalFlowForEquivalentStudents(budget, parameters, minimum);

  return {
    minimumEquivalentEnrollments: minimum,
    minimumEquivalentEnrollmentsExact: exact,
    minimumWholeStudents,
    projectedFinalFlowAtMinimum,
    currentEquivalentEnrollments,
    equivalentEnrollmentGap: minimum - currentEquivalentEnrollments,
    reached: true,
  };
}
