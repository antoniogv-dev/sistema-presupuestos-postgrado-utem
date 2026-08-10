-- Verificación funcional v10 para Cloudflare D1.
-- Ejecutar desde D1 > Console después del despliegue.

SELECT 'tablas_funcionales' AS control, COUNT(*) AS cantidad
FROM sqlite_master
WHERE type = 'table' AND name NOT LIKE '_cf_%' AND name NOT LIKE 'sqlite_%' AND name <> 'd1_migrations';

SELECT 'roles' AS control, COUNT(*) AS cantidad FROM "Role";
SELECT code, name FROM "Role" ORDER BY code;

SELECT 'plantillas' AS control, COUNT(*) AS cantidad FROM "BudgetTemplate";
SELECT 'items_plantilla' AS control, COUNT(*) AS cantidad FROM "BudgetTemplateItem";
SELECT 'parametros_institucionales' AS control, COUNT(*) AS cantidad FROM "InstitutionalParameter";
SELECT 'valores_parametros' AS control, COUNT(*) AS cantidad FROM "AnnualParameter";

SELECT 'tabla_sesiones' AS control, COUNT(*) AS cantidad
FROM sqlite_master WHERE type = 'table' AND name = 'UserSession';

SELECT 'columnas_password_usuario' AS control, COUNT(*) AS cantidad
FROM pragma_table_info('User')
WHERE name IN ('passwordHash','passwordSalt','passwordIterations','passwordUpdatedAt');

SELECT 'columna_tipo_plantilla_arancel' AS control, COUNT(*) AS cantidad
FROM pragma_table_info('ProgramAnnualTuition')
WHERE name = 'templateType';

SELECT 'usuarios' AS control, COUNT(*) AS cantidad FROM "User";
SELECT u.name, u.email, u.active, GROUP_CONCAT(r.code, ', ') AS roles
FROM "User" u
LEFT JOIN "UserRole" ur ON ur.userId = u.id
LEFT JOIN "Role" r ON r.id = ur.roleId
GROUP BY u.id
ORDER BY u.name;

SELECT 'migraciones_aplicadas' AS control, COUNT(*) AS cantidad FROM d1_migrations;
SELECT name, applied_at FROM d1_migrations ORDER BY id;

PRAGMA foreign_key_check;
