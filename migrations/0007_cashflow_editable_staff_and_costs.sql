-- v10.11: flujo editable, subtotal de staff y canonización de categorías de costos.

ALTER TABLE "BudgetAnnualOverride" ADD COLUMN "annualOtherNonAcademicHonoraria" INTEGER;
ALTER TABLE "BudgetAnnualOverride" ADD COLUMN "otherNonAcademicProrated" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "BudgetAnnualOverride" ADD COLUMN "otherNonAcademicAllocationRate" REAL NOT NULL DEFAULT 1;
ALTER TABLE "BudgetAnnualOverride" ADD COLUMN "annualOperational" INTEGER;
ALTER TABLE "BudgetAnnualOverride" ADD COLUMN "annualSoftware" INTEGER;
ALTER TABLE "BudgetAnnualOverride" ADD COLUMN "annualDiffusion" INTEGER;
ALTER TABLE "BudgetAnnualOverride" ADD COLUMN "annualCongressesInternships" INTEGER;
ALTER TABLE "BudgetAnnualOverride" ADD COLUMN "annualBooksPublications" INTEGER;
ALTER TABLE "BudgetAnnualOverride" ADD COLUMN "annualTravelFreight" INTEGER;
ALTER TABLE "BudgetAnnualOverride" ADD COLUMN "annualPerDiem" INTEGER;
ALTER TABLE "BudgetAnnualOverride" ADD COLUMN "annualFoodBeverages" INTEGER;
ALTER TABLE "BudgetAnnualOverride" ADD COLUMN "annualOtherCosts" INTEGER;

-- Canoniza categorías históricas sin perder montos.
UPDATE "BudgetItem" SET "category" = 'Otros costos y gastos'
WHERE "category" = 'Honorarios académicos';

UPDATE "BudgetItem" SET "category" = 'Otros honorarios no académicos'
WHERE "category" = 'Honorarios no académicos';

UPDATE "BudgetItem" SET "category" = 'Asistencia de dirección'
WHERE "category" = 'Asistencia';

UPDATE "BudgetItem" SET "category" = 'Gastos operacionales / Bienes y servicios'
WHERE "category" IN ('Gastos operacionales', 'Bienes y servicios');

UPDATE "BudgetItem" SET "category" = 'Software y licencias'
WHERE "category" = 'Software';

UPDATE "BudgetItem" SET "category" = 'Congresos y pasantías'
WHERE "category" IN ('Congresos', 'Pasantías');

UPDATE "BudgetItem" SET "category" = 'Otros costos y gastos'
WHERE "category" = 'Otros';
