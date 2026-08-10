import { access, readFile, readdir } from "node:fs/promises";

const requiredFiles = [
  "package.json",
  "prisma/schema.prisma",
  "migrations/0001_initial.sql",
  "migrations/0002_seed.sql",
  "migrations/0003_functional_improvements.sql",
  "open-next.config.ts",
  "wrangler.jsonc",
  "app/api/health/route.ts",
  "app/api/parameters/route.ts",
  "app/api/programs/[programId]/route.ts",
  "app/api/budgets/[budgetId]/versions/route.ts",
  "app/api/admin/users/route.ts",
  "demo/index.html",
];

for (const file of requiredFiles) await access(file);

const nodeMajor = Number(process.versions.node.split(".")[0]);
if (nodeMajor !== 22) {
  throw new Error(`Se requiere Node.js 22.x. Versión actual: ${process.versions.node}`);
}

const packageJson = JSON.parse(await readFile("package.json", "utf8"));

function parseSemver(version) {
  const match = String(version ?? "").match(/^(\d+)\.(\d+)\.(\d+)/);
  if (!match) return null;
  return match.slice(1).map(Number);
}

function atLeast(version, minimum) {
  const current = parseSemver(version);
  const required = parseSemver(minimum);
  if (!current || !required) return false;
  for (let index = 0; index < 3; index += 1) {
    if (current[index] > required[index]) return true;
    if (current[index] < required[index]) return false;
  }
  return true;
}

const nextVersion = packageJson.dependencies?.next;
const openNextVersion = packageJson.dependencies?.["@opennextjs/cloudflare"];
if (openNextVersion === "1.20.2" && !atLeast(nextVersion, "15.5.21")) {
  throw new Error(`@opennextjs/cloudflare 1.20.2 requiere Next.js >=15.5.21 en la rama 15.x. Configurado: ${nextVersion ?? "sin versión"}.`);
}
if (packageJson.devDependencies?.["eslint-config-next"] !== nextVersion) {
  throw new Error(`eslint-config-next debe coincidir con Next.js. next=${nextVersion}; eslint-config-next=${packageJson.devDependencies?.["eslint-config-next"] ?? "sin versión"}.`);
}

if (packageJson.scripts?.build !== "next build") {
  throw new Error('package.json debe contener "build": "next build" para evitar recursión con OpenNext.');
}

const wrangler = JSON.parse(await readFile("wrangler.jsonc", "utf8"));
const d1 = wrangler.d1_databases?.find((binding) => binding.binding === "DB");
if (!d1) throw new Error("Falta el binding D1 DB en wrangler.jsonc.");
if (d1.migrations_dir !== "migrations") {
  throw new Error('El binding DB debe usar "migrations_dir": "migrations".');
}
if (!d1.database_id || /REEMPLAZAR|PLACEHOLDER/i.test(d1.database_id)) {
  if (process.env.ALLOW_CONFIGURATION_PLACEHOLDERS !== "1") {
    throw new Error("Debe reemplazar database_id por el ID real de Cloudflare D1 antes de desplegar.");
  }
  console.warn("ADVERTENCIA: database_id aún es un marcador de configuración.");
}

const migrations = (await readdir("migrations"))
  .filter((name) => /^\d{4}_.+\.sql$/.test(name))
  .sort();
if (migrations.length < 3) throw new Error("Se requieren al menos las migraciones 0001, 0002 y 0003.");
if (new Set(migrations.map((name) => name.slice(0, 4))).size !== migrations.length) {
  throw new Error("Hay números de migración D1 duplicados.");
}

console.log(`Preflight correcto: Node 22, dependencias Next/OpenNext compatibles, build no recursivo, D1 y ${migrations.length} migraciones verificados.`);
