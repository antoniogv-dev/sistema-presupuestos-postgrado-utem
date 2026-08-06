-- Datos iniciales: roles, plantillas y definiciones institucionales.
PRAGMA foreign_keys = ON;

INSERT OR IGNORE INTO "Role" ("id", "code", "name", "description", "accessLevel") VALUES
  ('role-gestor', 'GESTOR', 'Gestor presupuestario', 'Crea, modifica y envía presupuestos a visto bueno.', 'GESTOR'),
  ('role-visto-bueno', 'VISTO_BUENO', 'Visto bueno', 'Revisa, observa y otorga visto bueno técnico.', 'VISTO_BUENO'),
  ('role-aprobador', 'APROBADOR', 'Aprobación', 'Aprueba u observa la versión final y administra accesos.', 'APROBADOR');

INSERT OR IGNORE INTO "BudgetTemplate" (
  "id", "code", "name", "programType", "description", "version", "active", "createdAt", "updatedAt"
) VALUES
  ('template-doctorado', 'DOCTORADO', 'Plantilla Doctoral', 'DOCTORADO', 'Incluye beca de excelencia académica de arancel y beca de atención económica de manutención.', 1, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('template-magister-academico', 'MAGISTER_ACADEMICO', 'Plantilla Magíster Académico', 'MAGISTER_ACADEMICO', 'Incluye beca de excelencia académica de arancel y beca de atención económica de manutención.', 1, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('template-magister-profesional', 'MAGISTER_PROFESIONAL', 'Plantilla Magíster Profesional', 'MAGISTER_PROFESIONAL', 'Incluye únicamente descuentos configurables; no incorpora becas académicas por defecto.', 1, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

INSERT OR IGNORE INTO "BudgetTemplateItem" (
  "id", "templateId", "itemKey", "kind", "name", "active", "position", "config", "createdAt", "updatedAt"
) VALUES
  ('doctorado-beca-arancel', 'template-doctorado', 'beca-excelencia-arancel', 'BECA_ARANCEL', 'Beca de excelencia académica (arancel)', true, 1, '{"studentMode":"TODOS_ACTIVOS","students":0,"coverage":1,"periodMode":"TODOS"}', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('doctorado-beca-mantencion', 'template-doctorado', 'beca-atencion-economica', 'BECA_MANUTENCION', 'Beca de atención económica (manutención)', true, 2, '{"studentMode":"TODOS_ACTIVOS","students":0,"months":0,"periodMode":"TODOS"}', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('ma-beca-arancel', 'template-magister-academico', 'beca-excelencia-arancel', 'BECA_ARANCEL', 'Beca de excelencia académica (arancel)', true, 1, '{"studentMode":"TODOS_ACTIVOS","students":0,"coverage":1,"periodMode":"TODOS"}', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('ma-beca-mantencion', 'template-magister-academico', 'beca-atencion-economica', 'BECA_MANUTENCION', 'Beca de atención económica (manutención)', true, 2, '{"studentMode":"TODOS_ACTIVOS","students":0,"months":0,"periodMode":"TODOS"}', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('mp-descuento', 'template-magister-profesional', 'descuento-incorporable', 'DESCUENTO', 'Descuento incorporable', true, 1, '{"percentage":0,"students":0,"periodMode":"TODOS","note":"Complete porcentaje y estudiantes según autorización."}', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

INSERT OR IGNORE INTO "InstitutionalParameter" ("id", "code", "name", "unit", "annual", "editablePerBudget") VALUES
  ('param-direct-hour', 'DIRECT_TEACHING_HOUR', 'Valor hora docente directa', 'CLP', true, false),
  ('param-replacement-hour', 'REPLACEMENT_TEACHING_HOUR', 'Valor hora docente de reemplazo', 'CLP', false, false),
  ('param-thesis-guidance', 'THESIS_GUIDANCE', 'Valor de guía o revisión de tesis por estudiante', 'CLP', true, false),
  ('param-maintenance-scholarship', 'MAINTENANCE_SCHOLARSHIP', 'Valor mensual de beca de atención económica', 'CLP', true, false),
  ('param-annual-enrollment', 'ANNUAL_ENROLLMENT', 'Valor anual de matrícula', 'CLP', true, true),
  ('param-program-direction', 'PROGRAM_DIRECTION', 'Monto anual de dirección del programa', 'CLP', true, true),
  ('param-program-assistance', 'PROGRAM_ASSISTANCE', 'Monto anual de asistencia técnica o administrativa', 'CLP', true, true),
  ('param-operating-expenses', 'OPERATING_EXPENSES', 'Gastos operacionales de referencia', 'CLP', true, true),
  ('param-software-licenses', 'SOFTWARE_LICENSES', 'Software y licencias', 'CLP', true, true),
  ('param-diffusion-admission', 'DIFFUSION_ADMISSION', 'Difusión y admisión', 'CLP', true, true),
  ('param-congresses-internships', 'CONGRESSES_INTERNSHIPS', 'Congresos y pasantías', 'CLP', true, true),
  ('param-annual-adjustment', 'ANNUAL_ADJUSTMENT', 'Porcentaje de reajuste anual', 'PORCENTAJE', true, false),
  ('param-central-overhead', 'CENTRAL_OVERHEAD', 'Overhead central', 'PORCENTAJE', true, true),
  ('param-faculty-overhead', 'FACULTY_OVERHEAD', 'Overhead de facultad', 'PORCENTAJE', true, true),
  ('param-bad-debt', 'BAD_DEBT', 'Porcentaje de incobrabilidad', 'PORCENTAJE', true, true);

INSERT OR IGNORE INTO "DiscountType" ("id", "name", "active")
VALUES ('discount-configurable', 'Descuento configurable', true);
