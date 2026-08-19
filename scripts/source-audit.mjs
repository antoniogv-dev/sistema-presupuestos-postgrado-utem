import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const packageJson = JSON.parse(await readFile(path.join(root, "package.json"), "utf8"));
const failures = [];
const warnings = [];

function fail(message) {
  failures.push(message);
}

function warn(message) {
  warnings.push(message);
}

if (packageJson.scripts?.build !== "next build") {
  fail('El script "build" debe ser exactamente "next build" para evitar recursión con OpenNext.');
}

const cloudflareBuild = packageJson.scripts?.["build:cloudflare"] ?? "";
if (!cloudflareBuild.includes("opennextjs-cloudflare build")) {
  fail('El script "build:cloudflare" debe ejecutar "opennextjs-cloudflare build".');
}
if (!cloudflareBuild.includes("typecheck") && !cloudflareBuild.includes("quality:cloudflare")) {
  fail('El build de Cloudflare debe ejecutar el chequeo TypeScript antes de OpenNext.');
}
if (/npm run build:cloudflare/.test(packageJson.scripts?.build ?? "")) {
  fail('El script "build" no puede volver a llamar a "build:cloudflare".');
}

if ((packageJson.scripts?.["db:generate"] ?? "").includes("--no-engine")) {
  fail('El script "db:generate" no debe usar --no-engine con Prisma + D1 + OpenNext.');
}

async function sourceFiles(directory) {
  const output = [];
  for (const entry of await readdir(directory)) {
    const absolute = path.join(directory, entry);
    const info = await stat(absolute);
    if (info.isDirectory()) {
      if (!["node_modules", ".next", ".open-next", "demo"].includes(entry)) {
        output.push(...await sourceFiles(absolute));
      }
    } else if (/\.(ts|tsx|mjs)$/.test(entry)) {
      output.push(absolute);
    }
  }
  return output;
}

const auditedRoots = ["app", "components", "features", "lib"].map((directory) => path.join(root, directory));
const auditedFiles = (await Promise.all(auditedRoots.map(sourceFiles))).flat();

for (const file of auditedFiles) {
  const relative = path.relative(root, file);
  const content = await readFile(file, "utf8");

  if (/\bD1Value\b/.test(content)) {
    fail(`${relative}: use D1BindValue o un tipo explícito; D1Value no está disponible globalmente.`);
  }
  if (/experimental\s*:\s*\{[\s\S]*typedRoutes/.test(content)) {
    fail(`${relative}: typedRoutes debe configurarse en el nivel superior de next.config.ts.`);
  }
  if (/response\.json\(\)[\s\S]{0,180}\bbody\.error\b/.test(content)) {
    fail(`${relative}: valide el resultado unknown de response.json() antes de leer body.error.`);
  }
  if (/return\s+await\s+response\.json\(\)\.catch/.test(content)) {
    fail(`${relative}: no devuelva response.json() directamente desde una función tipada; capture como unknown y aplique un type guard.`);
  }
  if (/config\s*:\s*\{\s*\.\.\.\([^)]*config\s+as\s+object\)/.test(content)) {
    fail(`${relative}: no expanda configuraciones union mediante "as object"; use un helper tipado.`);
  }
  if (/as\s+BudgetTemplateConfig/.test(content) && !/as\s+unknown\s+as\s+BudgetTemplateConfig/.test(content)) {
    warn(`${relative}: revise casts directos a BudgetTemplateConfig; pueden ocultar incompatibilidades de union.`);
  }
}

const loginPageSource = await readFile(path.join(root, "app/login/page.tsx"), "utf8");
if (!loginPageSource.includes("function isLoginResponseBody")) {
  fail("app/login/page.tsx: falta el type guard isLoginResponseBody; el repositorio parece conservar una versión antigua del login.");
}
if (!loginPageSource.includes("const parsed: unknown = await response.json()")) {
  fail("app/login/page.tsx: la respuesta JSON del login debe capturarse primero como unknown y validarse.");
}

const wrangler = JSON.parse(await readFile(path.join(root, "wrangler.jsonc"), "utf8"));
const d1 = wrangler.d1_databases?.find((binding) => binding.binding === "DB");
if (!d1) fail("wrangler.jsonc: falta el binding D1 DB.");
if (d1 && d1.migrations_dir !== "migrations") {
  fail('wrangler.jsonc: migrations_dir debe ser "migrations".');
}
if (d1 && (!d1.database_id || /REEMPLAZAR|PLACEHOLDER/i.test(d1.database_id))) {
  if (process.env.ALLOW_CONFIGURATION_PLACEHOLDERS === "1") {
    warn("wrangler.jsonc: database_id aún es un marcador de configuración.");
  } else {
    fail("wrangler.jsonc: reemplace database_id por el ID real de Cloudflare D1.");
  }
}

for (const variable of [
  "CLOUDFLARE_ACCESS_TEAM_DOMAIN",
  "CLOUDFLARE_ACCESS_AUD",
  "BOOTSTRAP_ADMIN_EMAIL",
]) {
  const value = wrangler.vars?.[variable];
  if (!value || /REEMPLAZAR|PLACEHOLDER/i.test(value)) {
    warn(`wrangler.jsonc: ${variable} aún no tiene un valor productivo.`);
  }
}



// Controles funcionales v10: evitar regresiones hacia datos demo o roles incompletos.
const programPage = await readFile(path.join(root, "app/programas/page.tsx"), "utf8");
if (/import\s*\{[^}]*\bprograms\b[^}]*\}\s*from\s*["']@\/lib\/demo-data["']/.test(programPage)) {
  fail("app/programas/page.tsx: el maestro de programas no puede depender del catálogo demo.");
}
if (!programPage.includes("Aplicar filtros") || !programPage.includes("Modificar programa")) {
  fail("app/programas/page.tsx: faltan controles funcionales de filtro o modificación.");
}
for (const source of ["PLANTILLA_DOCTORADO", "PLANTILLA_MAGISTER_ACADEMICO", "PLANTILLA_MAGISTER_PROFESIONAL"]) {
  if (!programPage.includes(source)) fail(`app/programas/page.tsx: falta la fuente de arancel ${source}.`);
}

for (const relative of ["app/consolidado/page.tsx", "app/importar-exportar/page.tsx", "app/versiones/page.tsx"]) {
  const content = await readFile(path.join(root, relative), "utf8");
  if (/\bdemoBudgets?\b/.test(content)) fail(`${relative}: no debe exportar, consolidar ni comparar usando presupuestos demo.`);
}

const adminRoute = await readFile(path.join(root, "app/api/admin/users/route.ts"), "utf8");
for (const role of ["ADMIN", "CREADOR", "LECTOR", "GESTOR", "VISTO_BUENO", "APROBADOR"]) {
  if (!adminRoute.includes(`"${role}"`)) fail(`app/api/admin/users/route.ts: falta el rol ${role}.`);
}

const tuitionRoute = await readFile(path.join(root, "app/api/programs/[programId]/tuition/route.ts"), "utf8");
if (!tuitionRoute.includes("PLANTILLA_MAGISTER_ACADEMICO") || !tuitionRoute.includes("PLANTILLA_MAGISTER_PROFESIONAL")) {
  fail("La API de aranceles debe aceptar plantillas doctoral, magíster académico y magíster profesional.");
}

const budgetWorkspace = await readFile(path.join(root, "features/budgets/components/BudgetWorkspace.tsx"), "utf8");
for (const heading of ["Estudiantes y graduación", "Horas docentes de reemplazo", "Becas"]) {
  if (!budgetWorkspace.includes(heading)) fail(`BudgetWorkspace: falta la sección separada “${heading}”.`);
}
if (!budgetWorkspace.includes("Horas docentes presenciales") && !budgetWorkspace.includes("Horas docentes sincrónicas")) {
  fail("BudgetWorkspace: falta la sección de carga docente según modalidad.");
}

// Barreras adicionales v10 para las fallas reportadas en producción.
const dashboardPage = await readFile(path.join(root, "app/page.tsx"), "utf8");
if (/\bdemoBudgets?\b/.test(dashboardPage)) {
  fail("app/page.tsx: el panel principal no debe depender de presupuestos demo.");
}

const programsPostRoute = await readFile(path.join(root, "app/api/programs/route.ts"), "utf8");
if (!programsPostRoute.includes("annualTuitions") || !programsPostRoute.includes("runD1Batch")) {
  fail("app/api/programs/route.ts: el alta de programas debe guardar programa, aranceles y auditoría de forma atómica.");
}

const parametersPage = await readFile(path.join(root, "app/parametros/page.tsx"), "utf8");
const parametersRoute = await readFile(path.join(root, "app/api/parameters/route.ts"), "utf8");
if (!parametersPage.includes("Guardar parámetros") || !parametersPage.includes("/api/parameters")) {
  fail("app/parametros/page.tsx: los parámetros generales deben poder guardarse en D1.");
}
if (!parametersRoute.includes("export async function PUT") || !parametersRoute.includes("runD1Batch")) {
  fail("app/api/parameters/route.ts: falta persistencia atómica de parámetros generales.");
}

const versionsPage = await readFile(path.join(root, "app/versiones/page.tsx"), "utf8");
if (!versionsPage.includes("Comparar versiones") || !versionsPage.includes("Revisión interna base") || !versionsPage.includes("Revisión interna a comparar")) {
  fail("app/versiones/page.tsx: la comparación debe permitir seleccionar dos versiones y ejecutar la comparación.");
}

const exportDownload = await readFile(path.join(root, "lib/export/download.ts"), "utf8");
for (const exportFunction of ["downloadBudgetXlsx", "downloadBudgetPdf", "downloadConsolidationXlsx"]) {
  const pattern = new RegExp(`export\\s+(?:async\\s+)?function\\s+${exportFunction}\\b`);
  if (!pattern.test(exportDownload)) {
    fail(`lib/export/download.ts: falta la exportación funcional ${exportFunction}.`);
  }
}

const adminMigration = await readFile(path.join(root, "migrations/0003_functional_improvements.sql"), "utf8");
for (const marker of ["'ADMIN'", "'CREADOR'", "'LECTOR'", 'CREATE TABLE IF NOT EXISTS "UserSession"', 'ADD COLUMN "passwordHash"']) {
  if (!adminMigration.includes(marker)) fail(`0003_functional_improvements.sql: falta ${marker}.`);
}

const adminAccess = await readFile(path.join(root, "lib/auth/api-access.ts"), "utf8");
if (!adminAccess.includes("Antonio Gutiérrez") || !adminAccess.includes("BOOTSTRAP_ADMIN_EMAIL") || !adminAccess.includes("BOOTSTRAP_ADMIN_PASSWORD")) {
  fail("lib/auth/api-access.ts: falta el aprovisionamiento seguro del administrador inicial Antonio Gutiérrez.");
}


const passwordSource = await readFile(path.join(root, "lib/auth/password.ts"), "utf8");
if (!passwordSource.includes("100_000") || passwordSource.includes("120_000")) {
  fail("lib/auth/password.ts: PBKDF2 debe respetar el máximo efectivo de 100.000 iteraciones del runtime de Cloudflare usado por este proyecto.");
}
const v108Migration = await readFile(path.join(root, "migrations/0004_budget_professional_parameters.sql"), "utf8");
for (const marker of ['CREATE TABLE "BudgetAnnualOverride"', '"programVersionLabel"', '"scholarshipsEnabled"']) {
  if (!v108Migration.includes(marker)) fail(`0004_budget_professional_parameters.sql: falta ${marker}.`);
}
const budgetWorkspaceV108 = await readFile(path.join(root, "features/budgets/components/BudgetWorkspace.tsx"), "utf8");
for (const marker of [
  "Versión del programa / plan",
  "Revisión interna",
  "Staff comprometido/prorrateable y overhead",
  "Matrícula anual (informativa, sin descuentos)",
  "INGRESOS TOTAL (sin matrícula)",
  "Valores hora según modalidad",
  "Guía de tesis por graduando",
  "Habilitar becas",
  "otra(s) versión(es) aprobada(s)",
  "PercentCell",
]) {
  if (!budgetWorkspaceV108.includes(marker)) fail(`BudgetWorkspace.tsx: falta la mejora v10.8 ${marker}.`);
}

const v109Migration = await readFile(path.join(root, "migrations/0005_cashflow_costs_and_annual_tuition.sql"), "utf8");
for (const marker of ['ADD COLUMN "annualTuition"', 'ProgramAnnualTuition']) {
  if (!v109Migration.includes(marker)) fail(`0005_cashflow_costs_and_annual_tuition.sql: falta ${marker}.`);
}
for (const marker of [
  '"Alimentos y bebidas"',
  'Arancel anual',
  'Matrícula anual (informativa, sin descuentos)',
  'Gastos operacionales / Bienes y servicios',
  'Otros costos y gastos',
]) {
  if (!budgetWorkspaceV108.includes(marker)) fail(`BudgetWorkspace.tsx: falta la mejora v10.9 ${marker}.`);
}
for (const forbidden of ['label="Descuentos matrícula"', 'label="Matrícula neta"']) {
  if (budgetWorkspaceV108.includes(forbidden)) fail(`BudgetWorkspace.tsx: v10.9 no debe mostrar ${forbidden} en el flujo.`);
}

const engineV108 = await readFile(path.join(root, "lib/calculations/budget-engine.ts"), "utf8");
for (const marker of [
  'item.periodicity === "Anual"',
  "const totalIncome = netTuitionIncome + externalIncome + otherIncome",
  "const overheadBase = Math.max(0, grossTuition - discounts - badDebt)",
  "budget.scholarshipsEnabled",
  "directionAllocationRate",
  "annualEnrollmentFee",
  "annualTuition",
  "foodBeverages",
]) {
  if (!engineV108.includes(marker)) fail(`budget-engine.ts: falta la regla v10.8 ${marker}.`);
}

const v110Migration = await readFile(path.join(root, "migrations/0006_repair_annual_tuition_and_enrollment_rules.sql"), "utf8");
if (!v110Migration.includes('WHERE COALESCE("annualTuition", 0) <= 0')) {
  fail("0006_repair_annual_tuition_and_enrollment_rules.sql: falta reparación defensiva de aranceles en cero.");
}
for (const marker of [
  '"Alimentos y bebidas"',
  'Matrícula anual (informativa, sin descuentos)',
  'EditableCostFlowRow',
  'ManualCostRows',
  'Otros honorarios no académicos',
  'HONORARIOS NO ACADÉMICOS (SUBTOTAL)',
  'FUNCTIONAL_RELEASE = "v10.23"',
]) {
  if (!budgetWorkspaceV108.includes(marker)) fail(`BudgetWorkspace.tsx: falta la mejora v10.11 ${marker}.`);
}
for (const forbidden of [
  'label="Descuentos matrícula"',
  'label="Matrícula neta"',
  'Matrícula anual (informativa, descuentos aplicados)',
  'Honorarios académicos adicionales',
  'Detalle de costos y gastos registrados',
]) {
  if (budgetWorkspaceV108.includes(forbidden)) fail(`BudgetWorkspace.tsx: v10.11 no debe contener ${forbidden}.`);
}
if (!engineV108.includes("const enrollmentDiscounts = 0;")) {
  fail("budget-engine.ts: la matrícula no debe recibir descuentos; enrollmentDiscounts debe ser 0.");
}
if (!engineV108.includes("annualTuition: storedTuition > 0 ? storedTuition : fallback.annualTuition")) {
  fail("budget-engine.ts: falta recuperación de arancel anual cuando un override histórico está en 0.");
}
const appShellV110 = await readFile(path.join(root, "components/AppShell.tsx"), "utf8");
if (!appShellV110.includes("v10.23") || !appShellV110.includes("1.0.33-d1-web")) {
  fail("AppShell.tsx: debe mostrar la versión funcional v10.23 para detectar despliegues parciales o antiguos.");
}
const v111Migration = await readFile(path.join(root, "migrations/0007_cashflow_editable_staff_and_costs.sql"), "utf8");
for (const marker of ["annualOtherNonAcademicHonoraria", "annualOperational", "annualFoodBeverages", "Otros honorarios no académicos"]) {
  if (!v111Migration.includes(marker)) fail(`0007_cashflow_editable_staff_and_costs.sql: falta ${marker}.`);
}
if (!engineV108.includes("const nonAcademicHonoraria = direction + assistance + otherNonAcademicHonoraria")) {
  fail("budget-engine.ts: honorarios no académicos debe ser subtotal de dirección, asistencia y otros honorarios.");
}
if (engineV108.includes("manualAcademicHonoraria")) {
  fail("budget-engine.ts: no debe existir honorarios académicos adicionales en el flujo v10.11.");
}

for (const marker of [
  'label="Gastos operacionales / Bienes y servicios"',
  'label="Software y licencias"',
  'label="Difusión"',
  'label="Congresos y pasantías"',
  'label="Libros y publicaciones"',
  'label="Pasajes y fletes"',
  'label="Viáticos"',
  'label="Alimentos y bebidas"',
  'label="Otros costos y gastos"',
]) {
  if (!budgetWorkspaceV108.includes(marker)) fail(`BudgetWorkspace.tsx: falta categoría editable v10.11 ${marker}.`);
}

const reportModelV111 = await readFile(path.join(root, "lib/export/report-model.ts"), "utf8");
for (const marker of [
  "Asistencia de dirección",
  "Otros honorarios no académicos",
  "HONORARIOS NO ACADÉMICOS (SUBTOTAL)",
  "Gastos operacionales / Bienes y servicios",
  "Alimentos y bebidas",
  "TOTAL COSTOS Y GASTOS",
]) {
  if (!reportModelV111.includes(marker)) fail(`report-model.ts: falta alineación del flujo v10.11 ${marker}.`);
}
for (const forbidden of ["Honorarios académicos adicionales", "Detalle de costos y gastos registrados"]) {
  if (reportModelV111.includes(forbidden)) fail(`report-model.ts: no debe contener ${forbidden}.`);
}

// v10.12: trazabilidad de todos los parámetros usados en las exportaciones.
for (const marker of [
  "buildParameterReport",
  "Parámetros anuales",
  "Parámetros semestrales",
  "Descuentos de arancel",
  "Costos y gastos registrados",
  "Valor hora docencia presencial",
]) {
  if (!reportModelV111.includes(marker)) fail(`report-model.ts: falta exportación de parámetros v10.12 ${marker}.`);
}
const xlsxV112 = await readFile(path.join(root, "lib/export/xlsx.ts"), "utf8");
for (const marker of ["Parámetros completos", "Parámetros anuales", "Parámetros semestrales", "Descuentos", "Costos e ingresos", "buildParameterSheet"]) {
  if (!xlsxV112.includes(marker)) fail(`xlsx.ts: falta trazabilidad multipestaña v10.15 ${marker}.`);
}
const pdfV112 = await readFile(path.join(root, "lib/export/pdf.ts"), "utf8");
for (const marker of ["createParameterPageContent", "paginateParameterRows", "UNIDAD / DETALLE"]) {
  if (!pdfV112.includes(marker)) fail(`pdf.ts: falta anexo PDF de parámetros v10.12 ${marker}.`);
}
const downloadV112 = await readFile(path.join(root, "lib/export/download.ts"), "utf8");
if (!downloadV112.includes("buildParameterReport") || !downloadV112.includes("InstitutionalParameters")) {
  fail("download.ts: las exportaciones individuales deben recibir los parámetros institucionales y construir su anexo v10.12.");
}

// v10.15: portada institucional, PDF compacto, XLSX completo y eliminación verificable desde el flujo.
for (const marker of [
  "compactParameterReportForPdf",
  "Parámetros completos",
  "Duración oficial del programa",
  "Dirección aplicada al presupuesto",
]) {
  if (!reportModelV111.includes(marker)) fail(`report-model.ts: falta mejora v10.15 ${marker}.`);
}
for (const marker of ["PdfCover", "createCoverPageContent", "/Im1 Do", "DCTDecode"]) {
  if (!pdfV112.includes(marker)) fail(`pdf.ts: falta portada institucional v10.15 ${marker}.`);
}
for (const marker of ["/Portada2026.jpg", "compactParameterReportForPdf", "Cohorte ${budget.startYear}-${budget.startSemester}S"]) {
  if (!downloadV112.includes(marker)) fail(`download.ts: falta integración de portada/PDF v10.15 ${marker}.`);
}
for (const marker of ["flow-action-header", "onRemove={removeManualCost}", ">Quitar</button>"]) {
  if (!budgetWorkspaceV108.includes(marker)) fail(`BudgetWorkspace.tsx: falta eliminación desde flujo v10.15 ${marker}.`);
}
for (const marker of ["Agregar costo al flujo", "flow-remove-button", "window.confirm", "Costo: {item.name}"]) {
  if (!budgetWorkspaceV108.includes(marker)) fail(`BudgetWorkspace.tsx: falta evidencia funcional v10.15 ${marker}.`);
}
if (budgetWorkspaceV108.includes("Incluido: {item.name}")) {
  fail("BudgetWorkspace.tsx: v10.15 debe mostrar el costo como fila propia del flujo, no con el rótulo heredado Incluido.");
}
for (const marker of ["Parámetros anuales", "Parámetros semestrales", "Costos e ingresos"]) {
  if (!xlsxV112.includes(marker)) fail(`xlsx.ts: falta hoja específica v10.15 ${marker}.`);
}
if (!downloadV112.includes("Versión ${budget.programVersionLabel}\\nCohorte ${budget.startYear}-${budget.startSemester}S")) {
  fail("download.ts: la portada v10.15 debe separar versión y cohorte en dos líneas.");
}
// v10.15: exportación inequívoca. Los parámetros completos deben estar también
// en la primera hoja del XLSX y todas las páginas del PDF deben ser A4 verticales.
for (const marker of [
  'Presupuesto completo',
  'PARÁMETROS COMPLETOS UTILIZADOS EN EL CÁLCULO',
  'buildCompleteBudgetSheet',
  'workbookView activeTab="0"',
]) {
  if (!xlsxV112.includes(marker)) fail(`xlsx.ts: falta trazabilidad visible en primera hoja v10.15 ${marker}.`);
}
for (const marker of [
  'const PAGE_WIDTH = 595',
  'const PAGE_HEIGHT = 842',
  'const yearChunkSize = 3',
  'PDF completamente vertical',
  'Math.min(COVER_PAGE_WIDTH / cover.imageWidth',
]) {
  if (!pdfV112.includes(marker)) fail(`pdf.ts: falta PDF vertical completo v10.15 ${marker}.`);
}

const coverPathV113 = path.join(root, "public/Portada2026.jpg");
try {
  await readFile(coverPathV113);
} catch {
  fail("public/Portada2026.jpg: falta la portada institucional usada por la exportación PDF v10.15.");
}

// v10.16: estructura de subtotales del flujo de caja.
for (const marker of [
  'HONORARIOS ACADÉMICOS (SUBTOTAL)',
  'HONORARIOS NO ACADÉMICOS (SUBTOTAL)',
  'OTROS GASTOS (SUBTOTAL)',
  'EQUIPAMIENTOS (SUBTOTAL)',
  'BECAS Y AYUDAS (SUBTOTAL)',
  'FLOW_COST_GROUPS.equipment',
  'FLOW_COST_GROUPS.scholarshipsAid',
]) {
  if (!budgetWorkspaceV108.includes(marker)) fail(`BudgetWorkspace.tsx: falta subtotal v10.16 ${marker}.`);
}
for (const marker of [
  'const otherExpenses =',
  'const equipment = sumManualItems',
  'const scholarshipsAndAid =',
  'academicHonoraria + nonAcademicHonoraria + otherExpenses',
]) {
  if (!engineV108.includes(marker)) fail(`budget-engine.ts: falta cálculo de subtotales v10.16 ${marker}.`);
}
for (const marker of [
  'HONORARIOS ACADÉMICOS (SUBTOTAL)',
  'OTROS GASTOS (SUBTOTAL)',
  'EQUIPAMIENTOS (SUBTOTAL)',
  'BECAS Y AYUDAS (SUBTOTAL)',
  'flow.equipment > 0',
  'flow.scholarshipsAndAid > 0',
]) {
  if (!reportModelV111.includes(marker)) fail(`report-model.ts: falta estructura de subtotales v10.16 ${marker}.`);
}
if (!budgetWorkspaceV108.includes('"Equipamiento"') || !budgetWorkspaceV108.includes('"Becas y ayudas"')) {
  fail("BudgetWorkspace.tsx: v10.16 debe permitir clasificar costos como Equipamiento o Becas y ayudas.");
}

// v10.17: compatibilidad real del OOXML con Microsoft Excel.
for (const marker of [
  'OOXML compatible con Microsoft Excel',
  'replace(/[\\u0000-\\u0008',
  'sheetFormatPr defaultRowHeight="18"',
  'PARÁMETROS COMPLETOS UTILIZADOS EN EL CÁLCULO',
]) {
  if (!xlsxV112.includes(marker)) fail(`xlsx.ts: falta corrección de compatibilidad v10.17 ${marker}.`);
}
if (xlsxV112.includes('<autoFilter ref=')) {
  fail('xlsx.ts: v10.17 elimina autoFilter artesanal para evitar que Excel reemplace las hojas XML.');
}
if (xlsxV112.includes('<pageSetup orientation=')) {
  fail('xlsx.ts: v10.17 elimina pageSetup artesanal; la orientación vertical corresponde al PDF, no al XML XLSX manual.');
}

const prismaFactory = await readFile(path.join(root, "lib/database/prisma.ts"), "utf8");
// Analice sólo código ejecutable: los comentarios explicativos pueden mencionar
// globalThis como antipatrón y no deben producir falsos positivos en CI.
const prismaExecutable = prismaFactory
  .replace(/\/\*[\s\S]*?\*\//g, "")
  .replace(/\/\/.*$/gm, "");
if (/\bglobalThis\b|\bglobalForPrisma\b|\bprismaBinding\b/.test(prismaExecutable)) {
  fail("lib/database/prisma.ts: no reutilice PrismaClient/PrismaD1 globalmente entre requests de Cloudflare Workers.");
}
if (!prismaExecutable.includes("new PrismaClient")) {
  fail("lib/database/prisma.ts: debe crear un PrismaClient ligado al binding D1 del request actual.");
}

const authHealth = await readFile(path.join(root, "app/api/auth/health/route.ts"), "utf8");
if (!authHealth.includes("AUTH_READY") || !authHealth.includes("BOOTSTRAP_ADMIN_PASSWORD")) {
  fail("app/api/auth/health/route.ts: falta el diagnóstico seguro de autenticación/D1.");
}

// Prisma/OpenNext: estas condiciones son obligatorias para el runtime workerd.
const nextConfigSource = await readFile(path.join(root, "next.config.ts"), "utf8");
if (!nextConfigSource.includes("serverExternalPackages")) {
  fail("next.config.ts: falta serverExternalPackages para Prisma/OpenNext.");
}
for (const pkg of ["@prisma/client", ".prisma/client"]) {
  if (!nextConfigSource.includes(pkg)) {
    fail(`next.config.ts: serverExternalPackages debe incluir ${pkg}.`);
  }
}
const prismaSchemaSource = await readFile(path.join(root, "prisma/schema.prisma"), "utf8");
if (/generator\s+client\s*\{[\s\S]*?\boutput\s*=/.test(prismaSchemaSource)) {
  fail("prisma/schema.prisma: no use output personalizado; OpenNext debe parchear el cliente estándar.");
}
const prismaClientVersion = packageJson.dependencies?.["@prisma/client"];
const prismaAdapterVersion = packageJson.dependencies?.["@prisma/adapter-d1"];
const prismaCliVersion = packageJson.devDependencies?.prisma;
if (!prismaClientVersion || prismaClientVersion !== prismaAdapterVersion || prismaClientVersion !== prismaCliVersion) {
  fail(`package.json: Prisma CLI, @prisma/client y @prisma/adapter-d1 deben coincidir. prisma=${prismaCliVersion ?? "?"}, client=${prismaClientVersion ?? "?"}, adapter=${prismaAdapterVersion ?? "?"}.`);
}


// OpenNext Cloudflare 1.x usa el runtime Node.js de Next.js. Una ruta Edge
// puede compilar en Next y fallar recién durante el bundle de OpenNext.
const edgeRuntimePattern = /export\s+const\s+runtime\s*=\s*["']edge["']/;
async function auditNoEdgeRuntime(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      await auditNoEdgeRuntime(fullPath);
      continue;
    }
    if (!/\.(?:ts|tsx|js|jsx|mjs|cjs)$/.test(entry.name)) continue;
    const source = await readFile(fullPath, "utf8");
    if (edgeRuntimePattern.test(source)) {
      fail(`${path.relative(root, fullPath)}: @opennextjs/cloudflare requiere runtime Node.js; elimine export const runtime = "edge".`);
    }
  }
}
await auditNoEdgeRuntime(path.join(root, "app"));

// v10.18: plantillas, modalidades, economías de escala, avisos y relato financiero.
const templateManagerV1018 = await readFile(path.join(root, "features/templates/components/TemplateManager.tsx"), "utf8");
for (const marker of ["Proyectar reajuste desde valor base", "Valor base manual", "Clonar plantilla", "SEMIPRESENCIAL", "E_LEARNING", "Economías de escala"]) {
  if (!templateManagerV1018.includes(marker)) fail(`TemplateManager v10.18: falta ${marker}.`);
}
const workspaceV1018 = await readFile(path.join(root, "features/budgets/components/BudgetWorkspace.tsx"), "utf8");
for (const marker of ["Clonar presupuesto", "Enviar por correo", "Economías de escala", "/api/workflow/recipients", "v10.23"]) {
  if (!workspaceV1018.includes(marker)) fail(`BudgetWorkspace v10.18: falta ${marker}.`);
}
const narrativeV1018 = await readFile(path.join(root, "lib/export/financial-narrative.ts"), "utf8");
for (const marker of ["Análisis financiero y principales consideraciones", "arancel bruto", "Conclusión financiera", "equilibrio financiero de bajo margen"]) {
  if (!narrativeV1018.includes(marker)) fail(`Relato financiero v10.18: falta ${marker}.`);
}
const migrationV1018 = await readFile(path.join(root, "migrations/0008_templates_modalities_scale_notifications.sql"), "utf8");
for (const marker of ["SharedCourseEconomy", "BudgetNotification", "deliveryModality", "synchronousTeachingHours", "PARAMETRO_ANUAL", "BudgetTemplateItem_v10_18"]) {
  if (!migrationV1018.includes(marker)) fail(`Migración 0008: falta ${marker}.`);
}
const notificationRouteV1018 = await readFile(path.join(root, "app/api/notifications/email/route.ts"), "utf8");
for (const marker of ["RESEND_API_KEY", "NOTIFICATION_FROM_EMAIL", "mailtoUrl", "BudgetNotification"]) {
  if (!notificationRouteV1018.includes(marker)) fail(`Avisos por correo v10.18: falta ${marker}.`);
}
const workflowRecipientsV1018 = await readFile(path.join(root, "app/api/workflow/recipients/route.ts"), "utf8");
if (!workflowRecipientsV1018.includes("VISTO_BUENO") || !workflowRecipientsV1018.includes("APROBADOR")) {
  fail("Destinatarios workflow v10.18: faltan roles de V°B° o aprobación.");
}

// v10.19: consolidación por estado y proyección desde valor base manual.
const consolidationV1019 = await readFile(path.join(root, "lib/calculations/consolidation.ts"), "utf8");
for (const marker of ["institutional-approved", "institutional-active", "ACTIVE_CONSOLIDATION_STATUSES", '"En revisión", "Observado", "Aprobado"']) {
  if (!consolidationV1019.includes(marker)) fail(`Consolidación v10.19: falta ${marker}.`);
}
const consolidationPageV1019 = await readFile(path.join(root, "app/consolidado/page.tsx"), "utf8");
for (const marker of ["institutional-approved", "Borrador y Reemplazado nunca se suman", "Consolidado por programa (activos)"]) {
  if (!consolidationPageV1019.includes(marker)) fail(`Pantalla consolidado v10.19: falta ${marker}.`);
}
const annualProjectionV1019 = await readFile(path.join(root, "lib/templates/annual-projection.ts"), "utf8");
for (const marker of ["projectAnnualValues", "projectedAnnualValue", "resolveAnnualTemplateValue"]) {
  if (!annualProjectionV1019.includes(marker)) fail(`Proyección anual v10.19: falta ${marker}.`);
}

// v10.21: guardado verificable de plantillas y matrícula anual profesional corregida.
const templateUpdateV1020 = await readFile(path.join(root, "app/api/templates/[templateId]/route.ts"), "utf8");
for (const marker of ["readTemplate", "normalizeItemKeys", "await runD1Batch(statements)", "const persisted = await readTemplate(templateId)"]) {
  if (!templateUpdateV1020.includes(marker)) fail(`Guardado de plantillas v10.21: falta ${marker}.`);
}
for (const marker of ["Guardando…", "Guardar cambios", "Plantilla guardada y verificada"]) {
  if (!templateManagerV1018.includes(marker)) fail(`TemplateManager v10.21: falta ${marker}.`);
}
const periodsV1020 = await readFile(path.join(root, "lib/calculations/periods.ts"), "utf8");
if (!periodsV1020.includes("getAnnualEnrollmentChargePeriods")) fail("Matrícula v10.21: falta helper único de periodos anuales de cobro.");
for (const marker of [
  "annualEnrollmentFee: nonNegative(stored.annualEnrollmentFee) > 0",
  "getAnnualEnrollmentChargePeriods(budget.startYear, budget.startSemester, budget.durationSemesters)",
  "const enrollmentDiscounts = 0;",
]) {
  if (!engineV108.includes(marker)) fail(`Matrícula v10.21: falta ${marker}.`);
}


// v10.23: selección canónica por programa y presupuesto. El programa de una cohorte
// es inmutable; cambiar el selector superior debe recargar un presupuesto exacto desde D1.
const budgetWorkspaceV1021 = await readFile(path.join(root, "features/budgets/components/BudgetWorkspace.tsx"), "utf8");
for (const marker of [
  "draftBudget",
  "setDraftBudget(nextBudget ? structuredClone(nextBudget) : null)",
  "setDirty(true)",
  "Programa del presupuesto",
  "El programa es parte de la identidad del presupuesto y no puede reasignarse",
  "Presupuesto / cohorte",
  "Toda la página quedó sincronizada con este presupuesto",
  "auditBudgetIntegrity",
  "beforeunload",
  'FUNCTIONAL_RELEASE = "v10.23"',
]) {
  if (!budgetWorkspaceV1021.includes(marker)) fail(`Aislamiento de presupuestos v10.23: falta ${marker}.`);
}
for (const forbidden of ["candidateBudgetId", "Aplicar filtro", "reasignará únicamente el presupuesto activo", "Programa del presupuesto<select"]) {
  if (budgetWorkspaceV1021.includes(forbidden)) fail(`Aislamiento de presupuestos v10.23: no debe permanecer ${forbidden}.`);
}
const globalsV1021 = await readFile(path.join(root, "app/globals.css"), "utf8");
for (const marker of ["isolated-budget-selector", "active-budget-context", "dirty-badge"]) {
  if (!globalsV1021.includes(marker)) fail(`UI selector aislado v10.21: falta ${marker}.`);
}


// v10.22: simplificación de parámetros profesionales, reajuste de staff, punto de equilibrio e importación local.
if (budgetWorkspaceV1021.includes("<th>Valor hora docente directa</th>")) {
  fail("BudgetWorkspace v10.22: Valores anuales del presupuesto no debe mostrar la columna Valor hora docente directa.");
}
for (const marker of [
  "Valores hora según modalidad",
  "<th>Hora sincrónica</th>",
  "beca de manutención mensual parte en $0",
  "Reajuste para el año siguiente (%)",
  "Aplicar → siguiente año",
  "Usar plantilla",
  "setInitialStudentsForAllSemesters",
  "Punto de equilibrio",
  "Viabilidad mínima de dictación",
  'FUNCTIONAL_RELEASE = "v10.23"',
]) {
  if (!budgetWorkspaceV1021.includes(marker)) fail(`BudgetWorkspace v10.22: falta ${marker}.`);
}
for (const marker of ["PROFESSIONAL_ENROLLMENT_BASE_YEAR = 2027", "PROFESSIONAL_ENROLLMENT_BASE_VALUE = 192_150", 'budget.program.type === "MAGISTER_PROFESIONAL" ? 0']) {
  if (!engineV108.includes(marker)) fail(`budget-engine.ts v10.22: falta ${marker}.`);
}
const breakEvenV1022 = await readFile(path.join(root, "lib/calculations/break-even.ts"), "utf8");
for (const marker of ["calculateBreakEvenEquivalentEnrollments", "minimumEquivalentEnrollments", "projectedFinalFlowAtMinimum"]) {
  if (!breakEvenV1022.includes(marker)) fail(`break-even.ts v10.22: falta ${marker}.`);
}
const importPageV1022 = await readFile(path.join(root, "app/importar-exportar/page.tsx"), "utf8");
const importerV1022 = await readFile(path.join(root, "lib/import/budget-file-import.ts"), "utf8");
for (const marker of ["Buscar archivo local", "Crear presupuesto importado", "analyzeBudgetFile", "vista previa"]) {
  if (!importPageV1022.includes(marker)) fail(`Importación v10.22: falta ${marker}.`);
}
for (const marker of ["parseXlsx", "DecompressionStream", "parametros completos", "analyzeGenericSheet", "Formato no soportado. Use .xlsx, .xlsm, .csv o .json"]) {
  if (!importerV1022.includes(marker)) fail(`Reconocimiento de archivos v10.22: falta ${marker}.`);
}
const migrationV1022 = await readFile(path.join(root, "migrations/0009_remove_seeded_operational_defaults.sql"), "utf8");
for (const marker of ["param-operating-expenses", "param-software-licenses", "param-diffusion-admission", 'SET "amount" = 0', 'UPDATE "BudgetAnnualOverride"', 'annualEnrollmentFee', 'MAGISTER_PROFESIONAL']) {
  if (!migrationV1022.includes(marker)) fail(`Migración 0009 v10.22: falta ${marker}.`);
}

// v10.23: barreras contra mezcla de programas/presupuestos y plantillas cruzadas.
const budgetRouteV1023 = await readFile(path.join(root, "app/api/budgets/[budgetId]/route.ts"), "utf8");
for (const marker of ["PROGRAM_IMMUTABLE", "COHORT_PROGRAM_MISMATCH", "TEMPLATE_PROGRAM_MISMATCH"]) {
  if (!budgetRouteV1023.includes(marker)) fail(`API presupuesto v10.23: falta ${marker}.`);
}
if (budgetRouteV1023.includes('assign("programId"')) fail('API presupuesto v10.23: programId no debe actualizarse en un presupuesto existente.');
const integrityV1023 = await readFile(path.join(root, "lib/validation/budget-integrity.ts"), "utf8");
for (const marker of ["auditBudgetIntegrity", "COHORT_PROGRAM_PREFIX_MISMATCH", "templateAppliesToProgram", "canonicalCohortName"]) {
  if (!integrityV1023.includes(marker)) fail(`Auditoría de integridad v10.23: falta ${marker}.`);
}
if (importPageV1022.includes('programs[0]?.id')) fail('Importación v10.23: no debe asignar silenciosamente el primer programa cuando el archivo no identifica uno.');
for (const marker of ['!template.programId || template.programId === budget.program.id', 'fetch(`/api/budgets/${nextId}`', 'setSelectedTemplateId(nextBudget?.appliedTemplateId ?? "")']) {
  if (!budgetWorkspaceV1021.includes(marker)) fail(`Aislamiento v10.23: falta ${marker}.`);
}

for (const message of warnings) console.warn(`ADVERTENCIA: ${message}`);
if (failures.length) {
  for (const message of failures) console.error(`ERROR: ${message}`);
  process.exit(1);
}

console.log(`Auditoría de código correcta${warnings.length ? `, con ${warnings.length} advertencia(s)` : ""}.`);


