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
 * Criterio institucional v11.0.8:
 *   Costos fijos / contribución neta de una matrícula equivalente.
 *
 * Costos fijos = costos totales del primer año menos overhead central y de facultad.
 * Contribución = arancel anual × (1 - incobrabilidad) × (1 - overhead central - overhead facultad).
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
  const first = current.annualFlows[0];

  if (!first) {
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

  const currentEquivalentEnrollments = first.equivalentEnrollments;
  const badDebtRate = effectiveBadDebtRate(budget, parameters);
  const overheadRate = Math.max(0, first.centralOverheadRate) + Math.max(0, first.facultyOverheadRate);
  const fixedCosts = Math.max(0, Math.abs(first.totalExpenses - first.centralOverhead - first.facultyOverhead));
  const contributionPerEquivalentEnrollment = Math.max(0, first.annualTuition)
    * Math.max(0, 1 - badDebtRate)
    * Math.max(0, 1 - overheadRate);

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
