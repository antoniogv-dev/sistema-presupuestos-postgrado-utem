SELECT 'tablas' AS control, COUNT(*) AS cantidad
FROM sqlite_master
WHERE type = 'table' AND name NOT LIKE '_cf_%' AND name NOT LIKE 'sqlite_%';

SELECT 'roles' AS control, COUNT(*) AS cantidad FROM "Role";
SELECT 'plantillas' AS control, COUNT(*) AS cantidad FROM "BudgetTemplate";
SELECT 'items_plantilla' AS control, COUNT(*) AS cantidad FROM "BudgetTemplateItem";
SELECT 'parametros' AS control, COUNT(*) AS cantidad FROM "InstitutionalParameter";
