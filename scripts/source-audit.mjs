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
for (const heading of ["Estudiantes y graduación", "Horas docentes directas", "Horas docentes de reemplazo", "Becas"]) {
  if (!budgetWorkspace.includes(heading)) fail(`BudgetWorkspace: falta la sección separada “${heading}”.`);
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
if (!versionsPage.includes("Comparar versiones") || !versionsPage.includes("Versión base") || !versionsPage.includes("Versión a comparar")) {
  fail("app/versiones/page.tsx: la comparación debe permitir seleccionar dos versiones y ejecutar la comparación.");
}

const exportDownload = await readFile(path.join(root, "lib/export/download.ts"), "utf8");
for (const exportFunction of ["downloadBudgetXlsx", "downloadBudgetPdf", "downloadConsolidationXlsx"]) {
  if (!exportDownload.includes(`export function ${exportFunction}`)) {
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

for (const message of warnings) console.warn(`ADVERTENCIA: ${message}`);
if (failures.length) {
  for (const message of failures) console.error(`ERROR: ${message}`);
  process.exit(1);
}

console.log(`Auditoría de código correcta${warnings.length ? `, con ${warnings.length} advertencia(s)` : ""}.`);

