-- v10.22: elimina sólo valores de referencia sembrados históricamente para
-- gastos operacionales, software y difusión. Valores personalizados distintos
-- de estas referencias se conservan.
UPDATE "AnnualParameter"
SET "amount" = 0
WHERE "parameterId" = 'param-operating-expenses'
  AND "amount" IN (1800000, 1890000, 1984500, 2083725, 2187911);

UPDATE "AnnualParameter"
SET "amount" = 0
WHERE "parameterId" = 'param-software-licenses'
  AND "amount" IN (750000, 787500, 826875, 868219, 911630);

UPDATE "AnnualParameter"
SET "amount" = 0
WHERE "parameterId" = 'param-diffusion-admission'
  AND "amount" IN (1000000, 1050000, 1102500, 1157625, 1215506);

-- Limpia también los overrides ya persistidos en presupuestos cuando conservan
-- exactamente los valores de referencia sembrados. No toca valores personalizados.
UPDATE "BudgetAnnualOverride"
SET "annualOperational" = 0
WHERE "annualOperational" IN (1800000, 1890000, 1984500, 2083725, 2187911);

UPDATE "BudgetAnnualOverride"
SET "annualSoftware" = 0
WHERE "annualSoftware" IN (750000, 787500, 826875, 868219, 911630);

UPDATE "BudgetAnnualOverride"
SET "annualDiffusion" = 0
WHERE "annualDiffusion" IN (1000000, 1050000, 1102500, 1157625, 1215506);

-- La referencia profesional solicitada comienza en 2027 con $192.150.
-- Se corrigen únicamente valores que coinciden con la serie institucional antigua
-- desplazada un año; cualquier matrícula personalizada se conserva sin cambios.
UPDATE "BudgetAnnualOverride"
SET "annualEnrollmentFee" = CASE "year"
  WHEN 2027 THEN 192150
  WHEN 2028 THEN 201758
  WHEN 2029 THEN 211846
  WHEN 2030 THEN 222439
  ELSE "annualEnrollmentFee"
END
WHERE "year" BETWEEN 2027 AND 2030
  AND (
    ("year" = 2027 AND "annualEnrollmentFee" = 201758) OR
    ("year" = 2028 AND "annualEnrollmentFee" = 211846) OR
    ("year" = 2029 AND "annualEnrollmentFee" = 222439) OR
    ("year" = 2030 AND "annualEnrollmentFee" = 233561)
  )
  AND "budgetId" IN (
    SELECT cb."id"
    FROM "CohortBudget" cb
    JOIN "Program" p ON p."id" = cb."programId"
    WHERE p."type" = 'MAGISTER_PROFESIONAL'
  );
