export interface BillingConfigurationInput {
  tuitionPricingMode?: "ANNUAL_LEGACY" | "PROGRAM_TOTAL" | string | null;
  programTotalTuition?: number | null;
  tuitionInstallments?: number | null;
  tuitionDistributionMode?: "PROPORTIONAL" | "CUSTOM" | string | null;
  tuitionSemesterDistribution?: number[] | null;
  durationSemesters: number;
}

export type BillingConfigurationIssueCode =
  | "PROGRAM_TOTAL_TUITION_INVALID"
  | "TUITION_INSTALLMENTS_INVALID"
  | "TUITION_DISTRIBUTION_INVALID";

export interface BillingConfigurationIssue {
  code: BillingConfigurationIssueCode;
  message: string;
}

function finiteNonNegative(value: unknown): number {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(0, number) : 0;
}

export function billingConfigurationIssues(input: BillingConfigurationInput): BillingConfigurationIssue[] {
  if (input.tuitionPricingMode !== "PROGRAM_TOTAL") return [];
  const issues: BillingConfigurationIssue[] = [];
  if (finiteNonNegative(input.programTotalTuition) <= 0) {
    issues.push({
      code: "PROGRAM_TOTAL_TUITION_INVALID",
      message: "El modelo de arancel total requiere informar un Arancel total del programa mayor que cero.",
    });
  }
  if (!Number.isFinite(input.tuitionInstallments) || Number(input.tuitionInstallments) < 1) {
    issues.push({
      code: "TUITION_INSTALLMENTS_INVALID",
      message: "El número de cuotas del arancel debe ser al menos 1. La forma de pago no modifica el precio total del programa.",
    });
  }
  if (input.tuitionDistributionMode === "CUSTOM") {
    const duration = Math.max(1, Math.round(Number(input.durationSemesters) || 0));
    const distribution = Array.isArray(input.tuitionSemesterDistribution) ? input.tuitionSemesterDistribution : [];
    const total = distribution.reduce((sum, value) => sum + finiteNonNegative(value), 0);
    if (distribution.length !== duration || Math.abs(total - 1) > 0.0001) {
      issues.push({
        code: "TUITION_DISTRIBUTION_INVALID",
        message: `La distribución personalizada del arancel debe contener ${duration} semestres y sumar exactamente 100%. Actualmente suma ${(total * 100).toLocaleString("es-CL", { maximumFractionDigits: 2 })}%.`,
      });
    }
  }
  return issues;
}

export function assertBillingConfiguration(input: BillingConfigurationInput): void {
  const issues = billingConfigurationIssues(input);
  if (!issues.length) return;
  throw new Error(`INVALID_BILLING_CONFIGURATION:${issues.map((issue) => issue.message).join(" ")}`);
}
