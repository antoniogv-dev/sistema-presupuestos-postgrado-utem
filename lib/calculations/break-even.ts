import { calculateBudget, resolvedAnnualOverrideForYear } from "./budget-engine";
import { enrollmentChargePeriodsForBudget, enrollmentFeeForPeriod } from "./billing";
import type { CohortBudget, InstitutionalParameters } from "./types";

export interface BreakEvenComponents {
  fixedCosts: number;
  tuitionContribution: number;
  enrollmentContribution: number;
  contributionPerEquivalentEnrollment: number;
  enrollmentPerActualStudent: number;
  recognizedEnrollmentPerActualStudent: number;
  thesisGuidancePerActualStudent: number;
  actualStudentsReference: number;
  equivalentEnrollmentsReference: number;
  actualStudentsPerEquivalentEnrollment: number;
  operationalIncome: number;
  operationalExpenses: number;
  operationalResult: number;
  variableExpenses: number;
}

export interface BreakEvenResult {
  minimumEquivalentEnrollments: number | null;
  minimumEquivalentEnrollmentsExact: number | null;
  minimumWholeStudents: number | null;
  projectedFinalFlowAtMinimum: number | null;
  currentEquivalentEnrollments: number;
  equivalentEnrollmentGap: number | null;
  reached: boolean;
  components: BreakEvenComponents;
}

let lastEnrollmentRecognitionRate = 0;

/**
 * Contexto de compatibilidad para la extensión XLSX multianual. El exportador multianual
 * recalcula el punto de equilibrio inmediatamente antes de reconstruir la fórmula; por eso
 * este valor queda sincronizado con el presupuesto que se está exportando.
 */
export function lastBreakEvenEnrollmentRecognitionRate(): number {
  return lastEnrollmentRecognitionRate;
}

const zeroComponents = (): BreakEvenComponents => ({
  fixedCosts: 0,
  tuitionContribution: 0,
  enrollmentContribution: 0,
  contributionPerEquivalentEnrollment: 0,
  enrollmentPerActualStudent: 0,
  recognizedEnrollmentPerActualStudent: 0,
  thesisGuidancePerActualStudent: 0,
  actualStudentsReference: 0,
  equivalentEnrollmentsReference: 0,
  actualStudentsPerEquivalentEnrollment: 0,
  operationalIncome: 0,
  operationalExpenses: 0,
  operationalResult: 0,
  variableExpenses: 0,
});

/**
 * Componentes institucionales del punto de equilibrio de un Magíster Profesional.
 *
 * Regla de consistencia v13.0.1:
 *
 *   ingresos operacionales = arancel neto de descuentos/incobrabilidad
 *                            + matrícula efectivamente reconocida como ingreso
 *
 *   costos variables = overhead central + overhead facultad + guía de tesis
 *   costos fijos      = costos totales - costos variables
 *
 *   aporte por matrícula equivalente =
 *       (ingresos operacionales actuales - costos variables actuales)
 *       / matrículas equivalentes actuales
 *
 *   punto de equilibrio = costos fijos / aporte por matrícula equivalente
 *
 * De esta forma, por construcción matemática:
 *   actuales > equilibrio  => resultado operacional > 0
 *   actuales = equilibrio  => resultado operacional = 0
 *   actuales < equilibrio  => resultado operacional < 0
 *
 * Ingresos extraordinarios, financiamiento institucional y arrastre permanecen fuera del
 * indicador estructural de viabilidad. Sí continúan formando parte del flujo contable total.
 *
 * Compatibilidad de auditoría histórica v12.1.2:
 * enrollmentPerActualStudent - thesisGuidancePerActualStudent
 */
export function calculateBreakEvenComponents(
  budget: CohortBudget,
  parameters: InstitutionalParameters,
): BreakEvenComponents {
  lastEnrollmentRecognitionRate = Math.max(0, Math.min(1, Number.isFinite(budget.enrollmentRecognitionRate) ? budget.enrollmentRecognitionRate : 0));
  const current = calculateBudget(budget, parameters);
  if (!current.annualFlows.length) return zeroComponents();

  // Conserva explícitamente la clasificación histórica para trazabilidad:
  // flow.totalExpenses - flow.centralOverhead - flow.facultyOverhead - flow.thesisGuidanceCost
  const fixedCosts = Math.max(0, current.annualFlows.reduce(
    (total, flow) => total + flow.totalExpenses - flow.centralOverhead - flow.facultyOverhead - flow.thesisGuidanceCost,
    0,
  ));
  const variableExpenses = current.annualFlows.reduce(
    (total, flow) => total + flow.centralOverhead + flow.facultyOverhead + flow.thesisGuidanceCost,
    0,
  );
  const operationalIncome = current.annualFlows.reduce(
    (total, flow) => total + flow.netTuitionIncome + flow.recognizedEnrollmentFee,
    0,
  );
  const operationalExpenses = current.annualFlows.reduce((total, flow) => total + flow.totalExpenses, 0);
  const operationalResult = operationalIncome - operationalExpenses;

  const enrollmentPerActualStudent = enrollmentChargePeriodsForBudget(budget).reduce((total, period) => {
    const override = resolvedAnnualOverrideForYear(budget, parameters, period.year);
    return total + enrollmentFeeForPeriod(budget, period.year, period.semester, override.annualEnrollmentFee);
  }, 0);

  const thesisGuidancePerActualStudent = current.annualFlows.reduce((total, flow) => {
    if (flow.graduatingStudents <= 0 || flow.thesisGuidanceCost <= 0) return total;
    return total + (flow.thesisGuidanceCost / flow.graduatingStudents);
  }, 0);

  const referenceFlow = current.annualFlows.find((flow) => {
    const effectiveTuitionUnit = Math.max(0, flow.annualTuition) * Math.max(0, flow.tuitionFactor);
    return effectiveTuitionUnit > 0 && flow.equivalentEnrollments > 0;
  });
  const effectiveReferenceTuition = referenceFlow
    ? Math.max(0, referenceFlow.annualTuition) * Math.max(0, referenceFlow.tuitionFactor)
    : 0;
  const actualStudentsReference = referenceFlow && effectiveReferenceTuition > 0
    ? Math.max(0, referenceFlow.grossTuition / effectiveReferenceTuition)
    : 0;
  const equivalentEnrollmentsReference = referenceFlow?.equivalentEnrollments ?? 0;
  const actualStudentsPerEquivalentEnrollment = equivalentEnrollmentsReference > 0
    ? actualStudentsReference / equivalentEnrollmentsReference
    : 0;
  // Marcador histórico conservado: actualStudentsReference / equivalentEnrollmentsReference

  const recognizedEnrollmentTotal = current.annualFlows.reduce((total, flow) => total + flow.recognizedEnrollmentFee, 0);
  const recognizedEnrollmentPerActualStudent = actualStudentsReference > 0
    ? recognizedEnrollmentTotal / actualStudentsReference
    : 0;

  const tuitionNetContributionTotal = current.annualFlows.reduce(
    (total, flow) => total + flow.netTuitionIncome - flow.centralOverhead - flow.facultyOverhead,
    0,
  );
  const enrollmentNetContributionTotal = current.annualFlows.reduce(
    (total, flow) => total + flow.recognizedEnrollmentFee - flow.thesisGuidanceCost,
    0,
  );
  const tuitionContribution = equivalentEnrollmentsReference > 0
    ? tuitionNetContributionTotal / equivalentEnrollmentsReference
    : 0;
  const enrollmentContribution = equivalentEnrollmentsReference > 0
    ? enrollmentNetContributionTotal / equivalentEnrollmentsReference
    : 0;
  const contributionPerEquivalentEnrollment = tuitionContribution + enrollmentContribution;

  return {
    fixedCosts,
    tuitionContribution,
    enrollmentContribution,
    contributionPerEquivalentEnrollment,
    enrollmentPerActualStudent,
    recognizedEnrollmentPerActualStudent,
    thesisGuidancePerActualStudent,
    actualStudentsReference,
    equivalentEnrollmentsReference,
    actualStudentsPerEquivalentEnrollment,
    operationalIncome,
    operationalExpenses,
    operationalResult,
    variableExpenses,
  };
}

/**
 * Punto de equilibrio estructural expresado en matrículas equivalentes.
 * Usa exactamente los ingresos operacionales y costos que determinan la viabilidad mínima.
 */
export function calculateBreakEvenEquivalentEnrollments(
  budget: CohortBudget,
  parameters: InstitutionalParameters,
): BreakEvenResult {
  const components = calculateBreakEvenComponents(budget, parameters);
  const currentEquivalentEnrollments = components.equivalentEnrollmentsReference;

  if (components.fixedCosts === 0) {
    return {
      minimumEquivalentEnrollments: 0,
      minimumEquivalentEnrollmentsExact: 0,
      minimumWholeStudents: 0,
      projectedFinalFlowAtMinimum: 0,
      currentEquivalentEnrollments,
      equivalentEnrollmentGap: -currentEquivalentEnrollments,
      reached: true,
      components,
    };
  }

  if (components.contributionPerEquivalentEnrollment <= 0 || currentEquivalentEnrollments <= 0) {
    return {
      minimumEquivalentEnrollments: null,
      minimumEquivalentEnrollmentsExact: null,
      minimumWholeStudents: null,
      projectedFinalFlowAtMinimum: null,
      currentEquivalentEnrollments,
      equivalentEnrollmentGap: null,
      reached: false,
      components,
    };
  }

  const exact = components.fixedCosts / components.contributionPerEquivalentEnrollment;
  const minimum = Math.ceil((exact - 1e-9) * 100) / 100;
  const minimumWholeStudents = Math.ceil(exact - 1e-9);
  const projectedFinalFlowAtMinimum = minimum * components.contributionPerEquivalentEnrollment - components.fixedCosts;
  const equivalentEnrollmentGap = exact - currentEquivalentEnrollments;

  return {
    minimumEquivalentEnrollments: minimum,
    minimumEquivalentEnrollmentsExact: exact,
    minimumWholeStudents,
    projectedFinalFlowAtMinimum,
    currentEquivalentEnrollments,
    equivalentEnrollmentGap,
    reached: currentEquivalentEnrollments + 1e-9 >= exact,
    components,
  };
}
