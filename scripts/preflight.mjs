import { access, readFile } from "node:fs/promises";

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
if (nodeMajor < 22) throw new Error(`Se requiere Node.js 22 o superior. Versión actual: ${process.versions.node}`);

const wrangler = JSON.parse(await readFile("wrangler.jsonc", "utf8"));
const d1 = wrangler.d1_databases?.find((binding) => binding.binding === "DB");
if (!d1) throw new Error("Falta el binding D1 DB en wrangler.jsonc.");
if (!d1.migrations_dir) throw new Error("Falta migrations_dir para D1.");

console.log("Preflight correcto: estructura D1, binding DB y versión de Node.js verificados.");
