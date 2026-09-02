-- v11.1.0: estructura de cobro modular para arancel total del programa y nuevas modalidades de matrícula.
-- Los defaults preservan íntegramente el comportamiento de los presupuestos históricos.
ALTER TABLE "CohortBudget" ADD COLUMN "tuitionPricingMode" TEXT NOT NULL DEFAULT 'ANNUAL_LEGACY';
ALTER TABLE "CohortBudget" ADD COLUMN "enrollmentBillingMode" TEXT NOT NULL DEFAULT 'ANNUAL';
ALTER TABLE "CohortBudget" ADD COLUMN "programTotalTuition" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "CohortBudget" ADD COLUMN "singleEnrollmentFee" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "CohortBudget" ADD COLUMN "semesterEnrollmentFee" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "CohortBudget" ADD COLUMN "tuitionInstallments" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "CohortBudget" ADD COLUMN "tuitionDistributionMode" TEXT NOT NULL DEFAULT 'PROPORTIONAL';
ALTER TABLE "CohortBudget" ADD COLUMN "tuitionSemesterDistribution" TEXT;
ALTER TABLE "CohortDiscount" ADD COLUMN "target" TEXT NOT NULL DEFAULT 'TUITION';
