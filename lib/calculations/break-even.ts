import { calculateBudget, effectiveBadDebtRate } from "./budget-engine";
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

/**
 * Punto de equilibrio de un Magíster Profesional expresado en matrículas equivalentes.
 *
 * Criterio institucional multianual:
 *   Costos fijos / contribución neta de una matrícula equivalente.
 *
 * Costos fijos = costos totales de todos los años activos menos overhead central y de facultad.
 * Contribución = suma de cada cobro de arancel del horizonte × (1 - incobrabilidad)
 *                × (1 - overhead central - overhead facultad).
 *
 * Los descuentos no se restan nuevamente: su efecto ya está contenido en el concepto de
 * "matrícula equivalente". La matrícula administrativa/reconocida, financiamiento institucional,
 * otros ingresos y arrastre tampoco se utilizan para reducir este umbral, en concordancia con
 * la fórmula institucional solicitada para el XLSX.
 */
export function calculateBreakEvenEquivalentEnrollments(
  budget: CohortBudget,
  parameters: InstitutionalParameters,
): BreakEvenResult {
  const current = calculateBudget(budget, parameters);
  const flows = current.annualFlows;

  if (flows.length === 0) {
    return {
      minimumEquivalentEnrollments: null,
      minimumEquivalentEnrollmentsExact: null,
      minimumWholeStudents: null,
      projectedFinalFlowAtMinimum: null,
      currentEquivalentEnrollments: 0,
      equivalentEnrollmentGap: null,
      reached: false,
    };
  }

  const badDebtRate = effectiveBadDebtRate(budget, parameters);
  const fixedCosts = flows.reduce(
    (total, flow) => total + Math.max(0, flow.totalExpenses - flow.centralOverhead - flow.facultyOverhead),
    0,
  );
  const contributionPerEquivalentEnrollment = flows.reduce((total, flow) => {
    const tuitionShare = Math.max(0, flow.tuitionDistributionShare);
    const overheadRate = Math.max(0, flow.centralOverheadRate) + Math.max(0, flow.facultyOverheadRate);
    return total + Math.max(0, flow.annualTuition) * tuitionShare
      * Math.max(0, 1 - badDebtRate)
      * Math.max(0, 1 - overheadRate);
  }, 0);
  const currentNetContribution = flows.reduce((total, flow) => {
    const overheadRate = Math.max(0, flow.centralOverheadRate) + Math.max(0, flow.facultyOverheadRate);
    return total + Math.max(0, flow.tuitionAfterBenefits)
      * Math.max(0, 1 - badDebtRate)
      * Math.max(0, 1 - overheadRate);
  }, 0);
  const currentEquivalentEnrollments = contributionPerEquivalentEnrollment > 0
    ? currentNetContribution / contributionPerEquivalentEnrollment
    : 0;

  if (fixedCosts === 0) {
    return {
      minimumEquivalentEnrollments: 0,
      minimumEquivalentEnrollmentsExact: 0,
      minimumWholeStudents: 0,
      projectedFinalFlowAtMinimum: 0,
      currentEquivalentEnrollments,
      equivalentEnrollmentGap: -currentEquivalentEnrollments,
      reached: true,
    };
  }

  if (contributionPerEquivalentEnrollment <= 0) {
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

  const exact = fixedCosts / contributionPerEquivalentEnrollment;
  const minimum = Math.ceil((exact - 1e-9) * 100) / 100;
  const minimumWholeStudents = Math.ceil(exact - 1e-9);
  const projectedFinalFlowAtMinimum = minimum * contributionPerEquivalentEnrollment - fixedCosts;

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
