import { calculateBudget, resolvedAnnualOverrideForYear } from "./budget-engine";
import { enrollmentChargePeriodsForBudget, enrollmentFeeForPeriod } from "./billing";
import type { CohortBudget, InstitutionalParameters } from "./types";

export interface BreakEvenComponents {
  fixedCosts: number;
  tuitionContribution: number;
  enrollmentContribution: number;
  contributionPerEquivalentEnrollment: number;
  enrollmentPerActualStudent: number;
  thesisGuidancePerActualStudent: number;
  actualStudentsReference: number;
  equivalentEnrollmentsReference: number;
  actualStudentsPerEquivalentEnrollment: number;
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

const zeroComponents = (): BreakEvenComponents => ({
  fixedCosts: 0,
  tuitionContribution: 0,
  enrollmentContribution: 0,
  contributionPerEquivalentEnrollment: 0,
  enrollmentPerActualStudent: 0,
  thesisGuidancePerActualStudent: 0,
  actualStudentsReference: 0,
  equivalentEnrollmentsReference: 0,
  actualStudentsPerEquivalentEnrollment: 0,
});

/**
 * Componentes institucionales del punto de equilibrio de un Magíster Profesional.
 *
 * Regla v12.1.2:
 *
 *   costos fijos = costos totales del horizonte
 *                  - overhead central/facultad
 *                  - guía de tesis variable por estudiante
 *
 *   aporte arancel = Σ [arancel efectivo del periodo × (1-incobrabilidad)
 *                       × (1-overhead central-overhead facultad)]
 *
 *   aporte matrícula = (matrícula por estudiante del horizonte
 *                       - guía de tesis por estudiante del horizonte)
 *                      × (estudiantes reales de referencia / matrículas equivalentes de referencia)
 *
 *   punto de equilibrio = costos fijos / (aporte arancel + aporte matrícula)
 *
 * La matrícula se considera como contribución por estudiante para este indicador aunque el
 * porcentaje de reconocimiento contable/presupuestario de matrícula sea distinto. Ese porcentaje
 * continúa gobernando INGRESOS TOTAL; no cambia la fórmula institucional de viabilidad mínima.
 */
export function calculateBreakEvenComponents(
  budget: CohortBudget,
  parameters: InstitutionalParameters,
): BreakEvenComponents {
  const current = calculateBudget(budget, parameters);
  if (!current.annualFlows.length) return zeroComponents();

  const fixedCosts = Math.abs(current.annualFlows.reduce(
    (total, flow) => total + flow.totalExpenses - flow.centralOverhead - flow.facultyOverhead - flow.thesisGuidanceCost,
    0,
  ));

  const tuitionContribution = current.annualFlows.reduce((total, flow) => {
    const effectiveTuitionUnit = Math.max(0, flow.annualTuition) * Math.max(0, flow.tuitionFactor);
    if (effectiveTuitionUnit <= 0) return total;
    const badDebtRate = flow.tuitionAfterBenefits > 0 ? Math.max(0, Math.min(1, flow.badDebt / flow.tuitionAfterBenefits)) : 0;
    const overheadRate = Math.max(0, flow.centralOverheadRate) + Math.max(0, flow.facultyOverheadRate);
    return total + effectiveTuitionUnit
      * Math.max(0, 1 - badDebtRate)
      * Math.max(0, 1 - overheadRate);
  }, 0);

  const enrollmentPerActualStudent = enrollmentChargePeriodsForBudget(budget).reduce((total, period) => {
    const override = resolvedAnnualOverrideForYear(budget, parameters, period.year);
    return total + enrollmentFeeForPeriod(budget, period.year, period.semester, override.annualEnrollmentFee);
  }, 0);

  const thesisGuidancePerActualStudent = current.annualFlows.reduce((total, flow) => {
    if (flow.graduatingStudents <= 0 || flow.thesisGuidanceCost <= 0) return total;
    return total + (flow.thesisGuidanceCost / flow.graduatingStudents);
  }, 0);

  // La referencia B6/B7 de la fórmula Excel se obtiene del primer periodo que realmente cobra arancel.
  // Se usa el flujo anual agregado porque su grossTuition/tuitionAfterBenefits conserva exactamente
  // la relación estudiantes reales / matrículas equivalentes después de beneficios de arancel.
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

  const enrollmentContribution = (enrollmentPerActualStudent - thesisGuidancePerActualStudent)
    * actualStudentsPerEquivalentEnrollment;
  const contributionPerEquivalentEnrollment = tuitionContribution + enrollmentContribution;


  return {
    fixedCosts,
    tuitionContribution,
    enrollmentContribution,
    contributionPerEquivalentEnrollment,
    enrollmentPerActualStudent,
    thesisGuidancePerActualStudent,
    actualStudentsReference,
    equivalentEnrollmentsReference,
    actualStudentsPerEquivalentEnrollment,
  };
}

/**
 * Punto de equilibrio de un Magíster Profesional expresado en matrículas equivalentes.
 *
 * Desde v12.1.2 el cálculo reproduce la fórmula institucional completa: considera todo el
 * horizonte presupuestario, incorpora la matrícula como aporte por estudiante y reclasifica
 * la guía de tesis como costo variable. Los demás ingresos extraordinarios y el arrastre no
 * reducen el umbral de viabilidad mínima.
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

  if (components.contributionPerEquivalentEnrollment <= 0) {
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

  return {
    minimumEquivalentEnrollments: minimum,
    minimumEquivalentEnrollmentsExact: exact,
    minimumWholeStudents,
    projectedFinalFlowAtMinimum,
    currentEquivalentEnrollments,
    equivalentEnrollmentGap: minimum - currentEquivalentEnrollments,
    reached: true,
    components,
  };
}
