-- v10.10: reparación defensiva de aranceles anuales históricos.
-- No cambia la estructura; corrige valores 0 heredados cuando el programa posee un arancel válido.
UPDATE "BudgetAnnualOverride"
SET "annualTuition" = COALESCE(
  (
    SELECT pat."amount"
    FROM "CohortBudget" cb
    JOIN "ProgramAnnualTuition" pat ON pat."programId" = cb."programId"
    WHERE cb."id" = "BudgetAnnualOverride"."budgetId"
      AND pat."year" = "BudgetAnnualOverride"."year"
      AND pat."amount" > 0
    LIMIT 1
  ),
  (
    SELECT pat."amount"
    FROM "CohortBudget" cb
    JOIN "ProgramAnnualTuition" pat ON pat."programId" = cb."programId"
    WHERE cb."id" = "BudgetAnnualOverride"."budgetId"
      AND pat."year" <= "BudgetAnnualOverride"."year"
      AND pat."amount" > 0
    ORDER BY pat."year" DESC
    LIMIT 1
  ),
  (
    SELECT pat."amount"
    FROM "CohortBudget" cb
    JOIN "ProgramAnnualTuition" pat ON pat."programId" = cb."programId"
    WHERE cb."id" = "BudgetAnnualOverride"."budgetId"
      AND pat."year" > "BudgetAnnualOverride"."year"
      AND pat."amount" > 0
    ORDER BY pat."year" ASC
    LIMIT 1
  ),
  "annualTuition"
)
WHERE COALESCE("annualTuition", 0) <= 0;
