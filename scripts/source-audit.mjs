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

for (const message of warnings) console.warn(`ADVERTENCIA: ${message}`);
if (failures.length) {
  for (const message of failures) console.error(`ERROR: ${message}`);
  process.exit(1);
}

console.log(`Auditoría de código correcta${warnings.length ? `, con ${warnings.length} advertencia(s)` : ""}.`);
