-- Sistema de Presupuestos de Postgrado UTEM
-- Esquema inicial para Cloudflare D1 (SQLite).
PRAGMA foreign_keys = ON;

CREATE TABLE "User" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "email" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE "Role" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "code" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "accessLevel" TEXT NOT NULL CHECK ("accessLevel" IN ('GESTOR','VISTO_BUENO','APROBADOR'))
);

CREATE TABLE "UserRole" (
  "userId" TEXT NOT NULL,
  "roleId" TEXT NOT NULL,
  PRIMARY KEY ("userId", "roleId"),
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  FOREIGN KEY ("roleId") REFERENCES "Role"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "Program" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "code" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "type" TEXT NOT NULL CHECK ("type" IN ('DOCTORADO','MAGISTER_ACADEMICO','MAGISTER_PROFESIONAL','OTRO')),
  "faculty" TEXT NOT NULL,
  "director" TEXT NOT NULL,
  "officialDurationSemesters" INTEGER NOT NULL CHECK ("officialDurationSemesters" > 0),
  "status" TEXT NOT NULL DEFAULT 'ACTIVO' CHECK ("status" IN ('ACTIVO','INACTIVO','EN_DISENO')),
  "costCenter" TEXT,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE "ProgramAnnualTuition" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "programId" TEXT NOT NULL,
  "year" INTEGER NOT NULL CHECK ("year" BETWEEN 2000 AND 2100),
  "amount" INTEGER NOT NULL CHECK ("amount" >= 0),
  "source" TEXT NOT NULL DEFAULT 'PROPIO' CHECK ("source" IN ('PROPIO','PLANTILLA_DOCTORADO')),
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY ("programId") REFERENCES "Program"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "BudgetTemplate" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "code" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "programType" TEXT NOT NULL CHECK ("programType" IN ('DOCTORADO','MAGISTER_ACADEMICO','MAGISTER_PROFESIONAL','OTRO')),
  "description" TEXT,
  "version" INTEGER NOT NULL DEFAULT 1 CHECK ("version" >= 1),
  "active" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "programId" TEXT,
  FOREIGN KEY ("programId") REFERENCES "Program"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "BudgetTemplateItem" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "templateId" TEXT NOT NULL,
  "itemKey" TEXT NOT NULL,
  "kind" TEXT NOT NULL CHECK ("kind" IN ('DESCUENTO','BECA_ARANCEL','BECA_MANUTENCION','COSTO','INGRESO_EXTRAORDINARIO')),
  "name" TEXT NOT NULL,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "position" INTEGER NOT NULL DEFAULT 0 CHECK ("position" >= 0),
  "config" JSONB NOT NULL,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY ("templateId") REFERENCES "BudgetTemplate"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "CohortBudget" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "programId" TEXT NOT NULL,
  "cohortName" TEXT NOT NULL,
  "startYear" INTEGER NOT NULL,
  "startSemester" INTEGER NOT NULL CHECK ("startSemester" IN (1,2)),
  "durationSemesters" INTEGER NOT NULL CHECK ("durationSemesters" BETWEEN 2 AND 8),
  "initialStudents" INTEGER NOT NULL CHECK ("initialStudents" >= 0),
  "status" TEXT NOT NULL DEFAULT 'BORRADOR' CHECK ("status" IN ('BORRADOR','EN_REVISION','OBSERVADO','APROBADO','REEMPLAZADO')),
  "workflowStage" TEXT NOT NULL DEFAULT 'GESTION' CHECK ("workflowStage" IN ('GESTION','VISTO_BUENO','APROBACION','FINALIZADO')),
  "facultyOverheadRate" DECIMAL NOT NULL CHECK ("facultyOverheadRate" BETWEEN 0 AND 1),
  "enrollmentRecognitionRate" DECIMAL NOT NULL CHECK ("enrollmentRecognitionRate" BETWEEN 0 AND 1),
  "authorizedInitialCarryover" INTEGER NOT NULL DEFAULT 0,
  "includeAuthorizedCarryover" BOOLEAN NOT NULL DEFAULT true,
  "normalizeSharedCosts" BOOLEAN NOT NULL DEFAULT true,
  "alertPotentialDuplicates" BOOLEAN NOT NULL DEFAULT true,
  "appliedTemplateId" TEXT,
  "appliedTemplateVersion" INTEGER CHECK ("appliedTemplateVersion" IS NULL OR "appliedTemplateVersion" >= 1),
  "notes" TEXT,
  "responsibleId" TEXT NOT NULL,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "deletedAt" DATETIME,
  "deletedById" TEXT,
  FOREIGN KEY ("programId") REFERENCES "Program"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  FOREIGN KEY ("appliedTemplateId") REFERENCES "BudgetTemplate"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  FOREIGN KEY ("responsibleId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  FOREIGN KEY ("deletedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE TABLE "BudgetVersion" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "budgetId" TEXT NOT NULL,
  "number" INTEGER NOT NULL CHECK ("number" >= 1),
  "status" TEXT NOT NULL CHECK ("status" IN ('BORRADOR','EN_REVISION','OBSERVADO','APROBADO','REEMPLAZADO')),
  "snapshot" JSONB NOT NULL,
  "changeNote" TEXT,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY ("budgetId") REFERENCES "CohortBudget"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "SemesterPeriod" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "budgetId" TEXT NOT NULL,
  "year" INTEGER NOT NULL,
  "semester" INTEGER NOT NULL CHECK ("semester" IN (1,2)),
  "position" INTEGER NOT NULL CHECK ("position" >= 0),
  FOREIGN KEY ("budgetId") REFERENCES "CohortBudget"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "SemesterParameters" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "periodId" TEXT NOT NULL,
  "activeStudents" INTEGER NOT NULL CHECK ("activeStudents" >= 0),
  "graduatingStudents" INTEGER NOT NULL DEFAULT 0 CHECK ("graduatingStudents" >= 0),
  "directTeachingHours" DECIMAL NOT NULL CHECK ("directTeachingHours" >= 0),
  "replacementTeachingHours" DECIMAL NOT NULL CHECK ("replacementTeachingHours" >= 0),
  "electiveSubjects" INTEGER NOT NULL DEFAULT 0 CHECK ("electiveSubjects" >= 0),
  "electiveSections" INTEGER NOT NULL DEFAULT 0 CHECK ("electiveSections" >= 0),
  "specializedCourses" INTEGER NOT NULL DEFAULT 0 CHECK ("specializedCourses" >= 0),
  "specializedSections" INTEGER NOT NULL DEFAULT 0 CHECK ("specializedSections" >= 0),
  "internalTuitionScholarshipStudents" INTEGER NOT NULL DEFAULT 0 CHECK ("internalTuitionScholarshipStudents" >= 0),
  "internalTuitionScholarshipCoverage" DECIMAL NOT NULL DEFAULT 1 CHECK ("internalTuitionScholarshipCoverage" BETWEEN 0 AND 1),
  "maintenanceScholarshipStudents" INTEGER NOT NULL DEFAULT 0 CHECK ("maintenanceScholarshipStudents" >= 0),
  "maintenanceScholarshipMonths" INTEGER NOT NULL DEFAULT 0 CHECK ("maintenanceScholarshipMonths" >= 0),
  "notes" TEXT,
  FOREIGN KEY ("periodId") REFERENCES "SemesterPeriod"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "InstitutionalParameter" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "code" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "unit" TEXT NOT NULL,
  "annual" BOOLEAN NOT NULL DEFAULT false,
  "editablePerBudget" BOOLEAN NOT NULL DEFAULT false
);

CREATE TABLE "AnnualParameter" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "parameterId" TEXT NOT NULL,
  "year" INTEGER CHECK ("year" IS NULL OR "year" BETWEEN 2000 AND 2100),
  "scope" TEXT NOT NULL DEFAULT 'GENERAL' CHECK ("scope" IN ('GENERAL','DOCTORADO','MAGISTER_ACADEMICO','MAGISTER_PROFESIONAL','OTRO')),
  "amount" DECIMAL NOT NULL,
  "validFrom" DATETIME,
  "validTo" DATETIME,
  FOREIGN KEY ("parameterId") REFERENCES "InstitutionalParameter"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "StudentGroup" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "budgetId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "students" INTEGER NOT NULL CHECK ("students" >= 0),
  "description" TEXT,
  FOREIGN KEY ("budgetId") REFERENCES "CohortBudget"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "DiscountType" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "name" TEXT NOT NULL,
  "active" BOOLEAN NOT NULL DEFAULT true
);

CREATE TABLE "CohortDiscount" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "budgetId" TEXT NOT NULL,
  "discountTypeId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "percentage" DECIMAL NOT NULL CHECK ("percentage" BETWEEN 0 AND 1),
  "students" INTEGER NOT NULL CHECK ("students" >= 0),
  "startYear" INTEGER NOT NULL,
  "startSemester" INTEGER NOT NULL CHECK ("startSemester" IN (1,2)),
  "endYear" INTEGER NOT NULL,
  "endSemester" INTEGER NOT NULL CHECK ("endSemester" IN (1,2)),
  "note" TEXT,
  "originTemplateItemKey" TEXT,
  FOREIGN KEY ("budgetId") REFERENCES "CohortBudget"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  FOREIGN KEY ("discountTypeId") REFERENCES "DiscountType"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE TABLE "InternalScholarship" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "budgetId" TEXT NOT NULL,
  "type" TEXT NOT NULL,
  "students" INTEGER NOT NULL CHECK ("students" >= 0),
  "coverage" DECIMAL CHECK ("coverage" IS NULL OR "coverage" BETWEEN 0 AND 1),
  "monthlyAmount" INTEGER CHECK ("monthlyAmount" IS NULL OR "monthlyAmount" >= 0),
  "months" INTEGER CHECK ("months" IS NULL OR "months" >= 0),
  "startYear" INTEGER NOT NULL,
  "startSemester" INTEGER NOT NULL CHECK ("startSemester" IN (1,2)),
  "endYear" INTEGER NOT NULL,
  "endSemester" INTEGER NOT NULL CHECK ("endSemester" IN (1,2)),
  FOREIGN KEY ("budgetId") REFERENCES "CohortBudget"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "ExternalIncome" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "budgetId" TEXT NOT NULL,
  "type" TEXT NOT NULL,
  "description" TEXT NOT NULL,
  "year" INTEGER NOT NULL,
  "semester" INTEGER NOT NULL CHECK ("semester" IN (1,2)),
  "students" INTEGER NOT NULL CHECK ("students" >= 0),
  "amountPerStudent" INTEGER NOT NULL CHECK ("amountPerStudent" >= 0),
  "source" TEXT NOT NULL,
  "note" TEXT,
  "originTemplateItemKey" TEXT,
  FOREIGN KEY ("budgetId") REFERENCES "CohortBudget"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "BudgetItem" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "budgetId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "description" TEXT NOT NULL,
  "category" TEXT NOT NULL,
  "year" INTEGER NOT NULL,
  "semester" INTEGER CHECK ("semester" IS NULL OR "semester" IN (1,2)),
  "amount" INTEGER NOT NULL CHECK ("amount" >= 0),
  "costType" TEXT NOT NULL CHECK ("costType" IN ('PROPIO_COHORTE','COMPARTIDO')),
  "periodicity" TEXT NOT NULL,
  "note" TEXT,
  "originTemplateItemKey" TEXT,
  FOREIGN KEY ("budgetId") REFERENCES "CohortBudget"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "SharedCostRule" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "programId" TEXT NOT NULL,
  "category" TEXT NOT NULL,
  "method" TEXT NOT NULL,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "description" TEXT,
  FOREIGN KEY ("programId") REFERENCES "Program"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "AnnualFinancialFlow" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "budgetId" TEXT NOT NULL,
  "year" INTEGER NOT NULL,
  "annualTuition" INTEGER NOT NULL DEFAULT 0,
  "grossTuition" INTEGER NOT NULL,
  "discounts" INTEGER NOT NULL,
  "tuitionScholarships" INTEGER NOT NULL,
  "badDebt" INTEGER NOT NULL,
  "netTuitionIncome" INTEGER NOT NULL,
  "enrollmentIncome" INTEGER NOT NULL,
  "externalIncome" INTEGER NOT NULL,
  "totalIncome" INTEGER NOT NULL,
  "equivalentEnrollments" DECIMAL NOT NULL DEFAULT 0 CHECK ("equivalentEnrollments" >= 0),
  "roundedEquivalentStudents" INTEGER NOT NULL DEFAULT 0 CHECK ("roundedEquivalentStudents" >= 0),
  "graduatingStudents" INTEGER NOT NULL DEFAULT 0 CHECK ("graduatingStudents" >= 0),
  "thesisGuidanceCost" INTEGER NOT NULL DEFAULT 0,
  "centralOverhead" INTEGER NOT NULL DEFAULT 0,
  "facultyOverhead" INTEGER NOT NULL DEFAULT 0,
  "totalExpenses" INTEGER NOT NULL,
  "netFlow" INTEGER NOT NULL,
  "startingCarryover" INTEGER NOT NULL,
  "accumulatedFlow" INTEGER NOT NULL,
  "operatingMargin" DECIMAL,
  "calculatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY ("budgetId") REFERENCES "CohortBudget"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "Approval" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "budgetId" TEXT NOT NULL,
  "versionId" TEXT,
  "userId" TEXT NOT NULL,
  "decision" TEXT NOT NULL DEFAULT 'PENDIENTE' CHECK ("decision" IN ('PENDIENTE','APROBADO','OBSERVADO','RECHAZADO')),
  "level" TEXT NOT NULL CHECK ("level" IN ('VISTO_BUENO','APROBACION')),
  "comment" TEXT,
  "decidedAt" DATETIME,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY ("budgetId") REFERENCES "CohortBudget"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  FOREIGN KEY ("versionId") REFERENCES "BudgetVersion"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE TABLE "BudgetWorkflowEvent" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "budgetId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "role" TEXT NOT NULL CHECK ("role" IN ('GESTOR','VISTO_BUENO','APROBADOR')),
  "action" TEXT NOT NULL,
  "fromStage" TEXT NOT NULL CHECK ("fromStage" IN ('GESTION','VISTO_BUENO','APROBACION','FINALIZADO')),
  "toStage" TEXT NOT NULL CHECK ("toStage" IN ('GESTION','VISTO_BUENO','APROBACION','FINALIZADO')),
  "comment" TEXT,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY ("budgetId") REFERENCES "CohortBudget"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE TABLE "AuditLog" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "userId" TEXT NOT NULL,
  "budgetId" TEXT,
  "versionId" TEXT,
  "entity" TEXT NOT NULL,
  "entityId" TEXT NOT NULL,
  "field" TEXT,
  "previousValue" JSONB,
  "newValue" JSONB,
  "action" TEXT NOT NULL,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  FOREIGN KEY ("budgetId") REFERENCES "CohortBudget"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  FOREIGN KEY ("versionId") REFERENCES "BudgetVersion"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "User_email_key" ON "User"("email");
CREATE UNIQUE INDEX "Role_code_key" ON "Role"("code");
CREATE INDEX "Role_accessLevel_idx" ON "Role"("accessLevel");
CREATE UNIQUE INDEX "Program_code_key" ON "Program"("code");
CREATE UNIQUE INDEX "ProgramAnnualTuition_programId_year_key" ON "ProgramAnnualTuition"("programId", "year");
CREATE INDEX "ProgramAnnualTuition_year_idx" ON "ProgramAnnualTuition"("year");
CREATE UNIQUE INDEX "BudgetTemplate_code_key" ON "BudgetTemplate"("code");
CREATE INDEX "BudgetTemplate_programType_active_idx" ON "BudgetTemplate"("programType", "active");
CREATE INDEX "BudgetTemplate_programId_idx" ON "BudgetTemplate"("programId");
CREATE UNIQUE INDEX "BudgetTemplateItem_templateId_itemKey_key" ON "BudgetTemplateItem"("templateId", "itemKey");
CREATE INDEX "BudgetTemplateItem_templateId_position_idx" ON "BudgetTemplateItem"("templateId", "position");
CREATE UNIQUE INDEX "CohortBudget_programId_cohortName_active_key" ON "CohortBudget"("programId", "cohortName") WHERE "deletedAt" IS NULL;
CREATE INDEX "CohortBudget_programId_cohortName_idx" ON "CohortBudget"("programId", "cohortName");
CREATE INDEX "CohortBudget_programId_startYear_startSemester_idx" ON "CohortBudget"("programId", "startYear", "startSemester");
CREATE INDEX "CohortBudget_deletedAt_idx" ON "CohortBudget"("deletedAt");
CREATE INDEX "CohortBudget_appliedTemplateId_idx" ON "CohortBudget"("appliedTemplateId");
CREATE UNIQUE INDEX "BudgetVersion_budgetId_number_key" ON "BudgetVersion"("budgetId", "number");
CREATE UNIQUE INDEX "SemesterPeriod_budgetId_year_semester_key" ON "SemesterPeriod"("budgetId", "year", "semester");
CREATE UNIQUE INDEX "SemesterParameters_periodId_key" ON "SemesterParameters"("periodId");
CREATE UNIQUE INDEX "InstitutionalParameter_code_key" ON "InstitutionalParameter"("code");
CREATE UNIQUE INDEX "AnnualParameter_parameterId_year_scope_key" ON "AnnualParameter"("parameterId", "year", "scope");
CREATE INDEX "AnnualParameter_scope_year_idx" ON "AnnualParameter"("scope", "year");
CREATE UNIQUE INDEX "DiscountType_name_key" ON "DiscountType"("name");
CREATE INDEX "BudgetItem_budgetId_year_category_idx" ON "BudgetItem"("budgetId", "year", "category");
CREATE UNIQUE INDEX "SharedCostRule_programId_category_key" ON "SharedCostRule"("programId", "category");
CREATE UNIQUE INDEX "AnnualFinancialFlow_budgetId_year_key" ON "AnnualFinancialFlow"("budgetId", "year");
CREATE INDEX "AnnualFinancialFlow_year_idx" ON "AnnualFinancialFlow"("year");
CREATE INDEX "BudgetWorkflowEvent_budgetId_createdAt_idx" ON "BudgetWorkflowEvent"("budgetId", "createdAt");
CREATE INDEX "AuditLog_entity_entityId_createdAt_idx" ON "AuditLog"("entity", "entityId", "createdAt");
