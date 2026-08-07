import { access, readFile, readdir } from "node:fs/promises";

const requiredFiles = [
  "package.json",
  "prisma/schema.prisma",
  "migrations/0001_initial.sql",
  "migrations/0002_seed.sql",
  "open-next.config.ts",
  "wrangler.jsonc",
  "app/api/health/route.ts",
  "demo/index.html",
];

for (const file of requiredFiles) await access(file);

const nodeMajor = Number(process.versions.node.split(".")[0]);
if (nodeMajor !== 22) {
  throw new Error(`Se requiere Node.js 22.x. Versión actual: ${process.versions.node}`);
}

const packageJson = JSON.parse(await readFile("package.json", "utf8"));
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
if (migrations.length < 2) throw new Error("Se requieren al menos las migraciones 0001 y 0002.");
if (new Set(migrations.map((name) => name.slice(0, 4))).size !== migrations.length) {
  throw new Error("Hay números de migración D1 duplicados.");
}

console.log(`Preflight correcto: Node 22, build no recursivo, D1 y ${migrations.length} migraciones verificados.`);
