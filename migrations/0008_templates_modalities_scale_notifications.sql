-- Amplía BudgetTemplateItem para soportar parámetros anuales editables en plantillas.
-- Se reconstruye la tabla porque SQLite no permite modificar un CHECK existente.
CREATE TABLE "BudgetTemplateItem_v10_18" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "templateId" TEXT NOT NULL,
  "itemKey" TEXT NOT NULL,
  "kind" TEXT NOT NULL CHECK ("kind" IN ('DESCUENTO','BECA_ARANCEL','BECA_MANUTENCION','COSTO','INGRESO_EXTRAORDINARIO','PARAMETRO_ANUAL')),
  "name" TEXT NOT NULL,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "position" INTEGER NOT NULL DEFAULT 0 CHECK ("position" >= 0),
  "config" JSONB NOT NULL,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY ("templateId") REFERENCES "BudgetTemplate"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

INSERT INTO "BudgetTemplateItem_v10_18" ("id","templateId","itemKey","kind","name","active","position","config","createdAt","updatedAt")
SELECT "id","templateId","itemKey","kind","name","active","position","config","createdAt","updatedAt" FROM "BudgetTemplateItem";

DROP TABLE "BudgetTemplateItem";
ALTER TABLE "BudgetTemplateItem_v10_18" RENAME TO "BudgetTemplateItem";
CREATE UNIQUE INDEX "BudgetTemplateItem_templateId_itemKey_key" ON "BudgetTemplateItem"("templateId", "itemKey");
CREATE INDEX "BudgetTemplateItem_templateId_position_idx" ON "BudgetTemplateItem"("templateId", "position");

ALTER TABLE "BudgetTemplate" ADD COLUMN "settings" TEXT NOT NULL DEFAULT '{}';
ALTER TABLE "CohortBudget" ADD COLUMN "deliveryModality" TEXT NOT NULL DEFAULT 'PRESENCIAL';
ALTER TABLE "SemesterParameters" ADD COLUMN "synchronousTeachingHours" REAL NOT NULL DEFAULT 0;
ALTER TABLE "SemesterParameters" ADD COLUMN "asynchronousTeachingHours" REAL NOT NULL DEFAULT 0;
ALTER TABLE "BudgetAnnualOverride" ADD COLUMN "synchronousTeachingHourValue" REAL NOT NULL DEFAULT 0;
ALTER TABLE "BudgetAnnualOverride" ADD COLUMN "asynchronousTeachingHourValue" REAL NOT NULL DEFAULT 0;
ALTER TABLE "BudgetAnnualOverride" ADD COLUMN "maintenanceScholarshipMonthlyValue" INTEGER NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS "SharedCourseEconomy" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "budgetId" TEXT NOT NULL,
  "courseName" TEXT NOT NULL,
  "year" INTEGER NOT NULL,
  "semester" INTEGER NOT NULL,
  "teachingMode" TEXT NOT NULL DEFAULT 'PRESENCIAL',
  "hours" REAL NOT NULL DEFAULT 0,
  "participantProgramIds" TEXT NOT NULL DEFAULT '[]',
  "allocationRate" REAL NOT NULL DEFAULT 1,
  "note" TEXT,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SharedCourseEconomy_budgetId_fkey" FOREIGN KEY ("budgetId") REFERENCES "CohortBudget" ("id") ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS "SharedCourseEconomy_budgetId_year_semester_idx" ON "SharedCourseEconomy"("budgetId", "year", "semester");

CREATE TABLE IF NOT EXISTS "BudgetNotification" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "budgetId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "action" TEXT NOT NULL,
  "recipientEmail" TEXT NOT NULL,
  "recipientName" TEXT,
  "channel" TEXT NOT NULL DEFAULT 'EMAIL',
  "status" TEXT NOT NULL DEFAULT 'PREPARADO',
  "subject" TEXT NOT NULL,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "BudgetNotification_budgetId_fkey" FOREIGN KEY ("budgetId") REFERENCES "CohortBudget" ("id") ON DELETE CASCADE,
  CONSTRAINT "BudgetNotification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS "BudgetNotification_budgetId_createdAt_idx" ON "BudgetNotification"("budgetId", "createdAt");
CREATE INDEX IF NOT EXISTS "BudgetNotification_recipientEmail_idx" ON "BudgetNotification"("recipientEmail");

UPDATE "BudgetTemplate"
SET "name" = 'Plantilla Magíster Profesional Presencial',
    "settings" = '{"modality":"PRESENCIAL"}',
    "updatedAt" = CURRENT_TIMESTAMP
WHERE "code" = 'MAGISTER_PROFESIONAL';

INSERT OR IGNORE INTO "BudgetTemplate" ("id","code","name","programType","description","version","active","createdAt","updatedAt","programId","settings")
VALUES
('template-magister-profesional-semipresencial','MAGISTER_PROFESIONAL_SEMIPRESENCIAL','Plantilla Magíster Profesional Semipresencial','MAGISTER_PROFESIONAL','Permite separar docencia sincrónica y asincrónica con valores hora diferenciados.',1,1,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP,NULL,'{"modality":"SEMIPRESENCIAL"}'),
('template-magister-profesional-elearning','MAGISTER_PROFESIONAL_ELEARNING','Plantilla Magíster Profesional E-learning','MAGISTER_PROFESIONAL','Permite separar docencia sincrónica y asincrónica con valores hora diferenciados.',1,1,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP,NULL,'{"modality":"E_LEARNING"}');

-- Filas base de parámetros anuales. Los valores se pueden cargar desde las referencias
-- institucionales en la interfaz y luego reajustar con un factor anual propio.
INSERT OR IGNORE INTO "BudgetTemplateItem" ("id","templateId","itemKey","kind","name","active","position","config","createdAt","updatedAt") VALUES
('mp-par-arancel','template-magister-profesional','param-arancel','PARAMETRO_ANUAL','Arancel',1,10,'{"parameter":"ARANCEL","values":{},"annualAdjustmentRate":0.05}',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP),
('mp-par-matricula','template-magister-profesional','param-matricula','PARAMETRO_ANUAL','Matrícula',1,11,'{"parameter":"MATRICULA","values":{},"annualAdjustmentRate":0.05}',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP),
('mp-par-mantencion','template-magister-profesional','param-mantencion','PARAMETRO_ANUAL','Beca de manutención mensual',1,12,'{"parameter":"BECA_MANUTENCION","values":{},"annualAdjustmentRate":0.05}',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP),
('mp-par-docencia','template-magister-profesional','param-docencia-presencial','PARAMETRO_ANUAL','Valor hora docencia presencial',1,13,'{"parameter":"DOCENCIA_PRESENCIAL","values":{},"annualAdjustmentRate":0.05}',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP),
('mp-par-guia','template-magister-profesional','param-guia-tesis','PARAMETRO_ANUAL','Guía de tesis',1,14,'{"parameter":"GUIA_TESIS","values":{},"annualAdjustmentRate":0.05}',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP),
('mp-par-direccion','template-magister-profesional','param-direccion','PARAMETRO_ANUAL','Dirección',1,15,'{"parameter":"DIRECCION","values":{},"annualAdjustmentRate":0.05}',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP),
('mp-par-asistencia','template-magister-profesional','param-asistencia','PARAMETRO_ANUAL','Asistencia de dirección',1,16,'{"parameter":"ASISTENCIA","values":{},"annualAdjustmentRate":0.05}',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP),
('mp-par-otros-hon','template-magister-profesional','param-otros-honorarios','PARAMETRO_ANUAL','Otros honorarios no académicos',1,17,'{"parameter":"OTROS_HONORARIOS_NO_ACADEMICOS","values":{},"annualAdjustmentRate":0.05}',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP),

('mps-par-arancel','template-magister-profesional-semipresencial','param-arancel','PARAMETRO_ANUAL','Arancel',1,10,'{"parameter":"ARANCEL","values":{},"annualAdjustmentRate":0.05}',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP),
('mps-par-matricula','template-magister-profesional-semipresencial','param-matricula','PARAMETRO_ANUAL','Matrícula',1,11,'{"parameter":"MATRICULA","values":{},"annualAdjustmentRate":0.05}',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP),
('mps-par-mantencion','template-magister-profesional-semipresencial','param-mantencion','PARAMETRO_ANUAL','Beca de manutención mensual',1,12,'{"parameter":"BECA_MANUTENCION","values":{},"annualAdjustmentRate":0.05}',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP),
('mps-par-sync','template-magister-profesional-semipresencial','param-docencia-sincronica','PARAMETRO_ANUAL','Valor hora docencia sincrónica',1,13,'{"parameter":"DOCENCIA_SINCRONICA","values":{},"annualAdjustmentRate":0.05}',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP),
('mps-par-async','template-magister-profesional-semipresencial','param-docencia-asincronica','PARAMETRO_ANUAL','Valor hora docencia asincrónica',1,14,'{"parameter":"DOCENCIA_ASINCRONICA","values":{},"annualAdjustmentRate":0.05}',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP),
('mps-par-guia','template-magister-profesional-semipresencial','param-guia-tesis','PARAMETRO_ANUAL','Guía de tesis',1,15,'{"parameter":"GUIA_TESIS","values":{},"annualAdjustmentRate":0.05}',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP),
('mps-par-direccion','template-magister-profesional-semipresencial','param-direccion','PARAMETRO_ANUAL','Dirección',1,16,'{"parameter":"DIRECCION","values":{},"annualAdjustmentRate":0.05}',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP),
('mps-par-asistencia','template-magister-profesional-semipresencial','param-asistencia','PARAMETRO_ANUAL','Asistencia de dirección',1,17,'{"parameter":"ASISTENCIA","values":{},"annualAdjustmentRate":0.05}',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP),
('mps-par-otros-hon','template-magister-profesional-semipresencial','param-otros-honorarios','PARAMETRO_ANUAL','Otros honorarios no académicos',1,18,'{"parameter":"OTROS_HONORARIOS_NO_ACADEMICOS","values":{},"annualAdjustmentRate":0.05}',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP),

('mpe-par-arancel','template-magister-profesional-elearning','param-arancel','PARAMETRO_ANUAL','Arancel',1,10,'{"parameter":"ARANCEL","values":{},"annualAdjustmentRate":0.05}',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP),
('mpe-par-matricula','template-magister-profesional-elearning','param-matricula','PARAMETRO_ANUAL','Matrícula',1,11,'{"parameter":"MATRICULA","values":{},"annualAdjustmentRate":0.05}',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP),
('mpe-par-mantencion','template-magister-profesional-elearning','param-mantencion','PARAMETRO_ANUAL','Beca de manutención mensual',1,12,'{"parameter":"BECA_MANUTENCION","values":{},"annualAdjustmentRate":0.05}',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP),
('mpe-par-sync','template-magister-profesional-elearning','param-docencia-sincronica','PARAMETRO_ANUAL','Valor hora docencia sincrónica',1,13,'{"parameter":"DOCENCIA_SINCRONICA","values":{},"annualAdjustmentRate":0.05}',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP),
('mpe-par-async','template-magister-profesional-elearning','param-docencia-asincronica','PARAMETRO_ANUAL','Valor hora docencia asincrónica',1,14,'{"parameter":"DOCENCIA_ASINCRONICA","values":{},"annualAdjustmentRate":0.05}',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP),
('mpe-par-guia','template-magister-profesional-elearning','param-guia-tesis','PARAMETRO_ANUAL','Guía de tesis',1,15,'{"parameter":"GUIA_TESIS","values":{},"annualAdjustmentRate":0.05}',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP),
('mpe-par-direccion','template-magister-profesional-elearning','param-direccion','PARAMETRO_ANUAL','Dirección',1,16,'{"parameter":"DIRECCION","values":{},"annualAdjustmentRate":0.05}',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP),
('mpe-par-asistencia','template-magister-profesional-elearning','param-asistencia','PARAMETRO_ANUAL','Asistencia de dirección',1,17,'{"parameter":"ASISTENCIA","values":{},"annualAdjustmentRate":0.05}',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP),
('mpe-par-otros-hon','template-magister-profesional-elearning','param-otros-honorarios','PARAMETRO_ANUAL','Otros honorarios no académicos',1,18,'{"parameter":"OTROS_HONORARIOS_NO_ACADEMICOS","values":{},"annualAdjustmentRate":0.05}',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP);

-- También se habilitan parámetros anuales editables en las plantillas académica y doctoral.
INSERT OR IGNORE INTO "BudgetTemplateItem" ("id","templateId","itemKey","kind","name","active","position","config","createdAt","updatedAt") VALUES
('doc-par-arancel','template-doctorado','param-arancel','PARAMETRO_ANUAL','Arancel',1,10,'{"parameter":"ARANCEL","values":{},"annualAdjustmentRate":0.05}',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP),
('doc-par-matricula','template-doctorado','param-matricula','PARAMETRO_ANUAL','Matrícula',1,11,'{"parameter":"MATRICULA","values":{},"annualAdjustmentRate":0.05}',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP),
('doc-par-mantencion','template-doctorado','param-mantencion','PARAMETRO_ANUAL','Beca de manutención mensual',1,12,'{"parameter":"BECA_MANUTENCION","values":{},"annualAdjustmentRate":0.05}',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP),
('doc-par-docencia','template-doctorado','param-docencia-presencial','PARAMETRO_ANUAL','Valor hora docencia presencial',1,13,'{"parameter":"DOCENCIA_PRESENCIAL","values":{},"annualAdjustmentRate":0.05}',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP),
('doc-par-guia','template-doctorado','param-guia-tesis','PARAMETRO_ANUAL','Guía de tesis',1,14,'{"parameter":"GUIA_TESIS","values":{},"annualAdjustmentRate":0.05}',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP),
('doc-par-direccion','template-doctorado','param-direccion','PARAMETRO_ANUAL','Dirección',1,15,'{"parameter":"DIRECCION","values":{},"annualAdjustmentRate":0.05}',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP),
('doc-par-asistencia','template-doctorado','param-asistencia','PARAMETRO_ANUAL','Asistencia de dirección',1,16,'{"parameter":"ASISTENCIA","values":{},"annualAdjustmentRate":0.05}',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP),

('ma-par-arancel','template-magister-academico','param-arancel','PARAMETRO_ANUAL','Arancel',1,10,'{"parameter":"ARANCEL","values":{},"annualAdjustmentRate":0.05}',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP),
('ma-par-matricula','template-magister-academico','param-matricula','PARAMETRO_ANUAL','Matrícula',1,11,'{"parameter":"MATRICULA","values":{},"annualAdjustmentRate":0.05}',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP),
('ma-par-mantencion','template-magister-academico','param-mantencion','PARAMETRO_ANUAL','Beca de manutención mensual',1,12,'{"parameter":"BECA_MANUTENCION","values":{},"annualAdjustmentRate":0.05}',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP),
('ma-par-docencia','template-magister-academico','param-docencia-presencial','PARAMETRO_ANUAL','Valor hora docencia presencial',1,13,'{"parameter":"DOCENCIA_PRESENCIAL","values":{},"annualAdjustmentRate":0.05}',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP),
('ma-par-guia','template-magister-academico','param-guia-tesis','PARAMETRO_ANUAL','Guía de tesis',1,14,'{"parameter":"GUIA_TESIS","values":{},"annualAdjustmentRate":0.05}',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP),
('ma-par-direccion','template-magister-academico','param-direccion','PARAMETRO_ANUAL','Dirección',1,15,'{"parameter":"DIRECCION","values":{},"annualAdjustmentRate":0.05}',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP),
('ma-par-asistencia','template-magister-academico','param-asistencia','PARAMETRO_ANUAL','Asistencia de dirección',1,16,'{"parameter":"ASISTENCIA","values":{},"annualAdjustmentRate":0.05}',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP);
