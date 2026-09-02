import test from "node:test";
import assert from "node:assert/strict";
import { billingConfigurationIssues, assertBillingConfiguration } from "../../.engine-build/lib/validation/billing-config.js";

test("v12.0.1: distribución personalizada debe cubrir todos los semestres y sumar 100%", () => {
  const invalid = billingConfigurationIssues({
    tuitionPricingMode: "PROGRAM_TOTAL",
    programTotalTuition: 6_400_000,
    tuitionInstallments: 18,
    tuitionDistributionMode: "CUSTOM",
    tuitionSemesterDistribution: [0.4, 0.35, 0.2],
    durationSemesters: 3,
  });
  assert.equal(invalid.some((issue) => issue.code === "TUITION_DISTRIBUTION_INVALID"), true);
  assert.throws(() => assertBillingConfiguration({
    tuitionPricingMode: "PROGRAM_TOTAL",
    programTotalTuition: 6_400_000,
    tuitionInstallments: 18,
    tuitionDistributionMode: "CUSTOM",
    tuitionSemesterDistribution: [0.4, 0.35, 0.2],
    durationSemesters: 3,
  }), /INVALID_BILLING_CONFIGURATION/);
});

test("v12.0.1: distribución 40/35/25 es válida", () => {
  assert.deepEqual(billingConfigurationIssues({
    tuitionPricingMode: "PROGRAM_TOTAL",
    programTotalTuition: 6_400_000,
    tuitionInstallments: 18,
    tuitionDistributionMode: "CUSTOM",
    tuitionSemesterDistribution: [0.4, 0.35, 0.25],
    durationSemesters: 3,
  }), []);
});
