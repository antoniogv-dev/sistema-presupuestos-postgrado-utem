ALTER TABLE "Program" ADD COLUMN "versionLabel" TEXT NOT NULL DEFAULT '1';
ALTER TABLE "CohortBudget" ADD COLUMN "programVersionLabel" TEXT NOT NULL DEFAULT '1';
ALTER TABLE "CohortBudget" ADD COLUMN "scholarshipsEnabled" INTEGER NOT NULL DEFAULT 1;

CREATE TABLE "BudgetAnnualOverride" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "budgetId" TEXT NOT NULL,
  "year" INTEGER NOT NULL,
  "directTeachingHourValue" REAL NOT NULL,
  "annualEnrollmentFee" INTEGER NOT NULL,
  "thesisGuidancePerGraduatingStudent" INTEGER NOT NULL,
  "annualDirection" INTEGER NOT NULL,
  "directionProrated" INTEGER NOT NULL DEFAULT 0,
  "directionAllocationRate" REAL NOT NULL DEFAULT 1,
  "annualAssistance" INTEGER NOT NULL,
  "assistanceProrated" INTEGER NOT NULL DEFAULT 0,
  "assistanceAllocationRate" REAL NOT NULL DEFAULT 1,
  "centralOverheadRate" REAL NOT NULL DEFAULT 0,
  "facultyOverheadRate" REAL NOT NULL DEFAULT 0,
  CONSTRAINT "BudgetAnnualOverride_budgetId_fkey"
    FOREIGN KEY ("budgetId") REFERENCES "CohortBudget" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "BudgetAnnualOverride_budgetId_year_key"
  ON "BudgetAnnualOverride"("budgetId", "year");
CREATE INDEX "BudgetAnnualOverride_year_idx"
  ON "BudgetAnnualOverride"("year");

UPDATE "CohortBudget"
SET "programVersionLabel" = COALESCE(
  (SELECT "Program"."versionLabel" FROM "Program" WHERE "Program"."id" = "CohortBudget"."programId"),
  '1'
);

UPDATE "CohortBudget"
SET "scholarshipsEnabled" = 0
WHERE "programId" IN (
  SELECT "id" FROM "Program" WHERE "type" = 'MAGISTER_PROFESIONAL'
)
AND NOT EXISTS (
  SELECT 1
  FROM "SemesterPeriod" sp
  JOIN "SemesterParameters" spp ON spp."periodId" = sp."id"
  WHERE sp."budgetId" = "CohortBudget"."id"
    AND (
      COALESCE(spp."internalTuitionScholarshipStudents", 0) > 0 OR
      COALESCE(spp."maintenanceScholarshipStudents", 0) > 0
    )
);
