-- v10.9: arancel anual por presupuesto y mejoras del flujo de caja
ALTER TABLE "BudgetAnnualOverride" ADD COLUMN "annualTuition" INTEGER NOT NULL DEFAULT 0;

-- Conserva los presupuestos existentes rellenando el arancel de cada año desde el arancel maestro del programa.
UPDATE "BudgetAnnualOverride"
SET "annualTuition" = COALESCE(
  (
    SELECT pat."amount"
    FROM "ProgramAnnualTuition" pat
    JOIN "CohortBudget" cb ON cb."programId" = pat."programId"
    WHERE cb."id" = "BudgetAnnualOverride"."budgetId"
      AND pat."year" = "BudgetAnnualOverride"."year"
      AND pat."amount" > 0
    LIMIT 1
  ),
  (
    SELECT pat."amount"
    FROM "ProgramAnnualTuition" pat
    JOIN "CohortBudget" cb ON cb."programId" = pat."programId"
    WHERE cb."id" = "BudgetAnnualOverride"."budgetId"
      AND pat."year" <= "BudgetAnnualOverride"."year"
      AND pat."amount" > 0
    ORDER BY pat."year" DESC
    LIMIT 1
  ),
  (
    SELECT pat."amount"
    FROM "ProgramAnnualTuition" pat
    JOIN "CohortBudget" cb ON cb."programId" = pat."programId"
    WHERE cb."id" = "BudgetAnnualOverride"."budgetId"
      AND pat."amount" > 0
    ORDER BY pat."year" ASC
    LIMIT 1
  ),
  0
);
