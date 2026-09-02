import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const root = process.cwd();
const ignored = new Set(["node_modules", ".next", ".open-next", ".engine-build", ".git"]);
const files = [];

async function walk(directory) {
  for (const name of await readdir(directory)) {
    if (ignored.has(name)) continue;
    const full = path.join(directory, name);
    const info = await stat(full);
    if (info.isDirectory()) await walk(full);
    else if (/\.(?:ts|tsx|js|mjs)$/.test(name)) files.push(full);
  }
}

await walk(root);
const unsafeMarkers = ["$queryRawUnsafe", "$executeRawUnsafe"];
const failures = [];
const interpolations = [];

for (const file of files) {
  const source = await readFile(file, "utf8");
  const relative = path.relative(root, file).replaceAll("\\", "/");
  if (relative === "scripts/sql-safety-audit.mjs") continue;
  for (const marker of unsafeMarkers) if (source.includes(marker)) failures.push(`${relative}: uso prohibido ${marker}.`);
  const regex = /\.prepare\(\s*`([\s\S]*?)`\s*\)/g;
  for (const match of source.matchAll(regex)) {
    if (!match[1].includes("${")) continue;
    const expressions = [...match[1].matchAll(/\$\{([^}]+)\}/g)].map((item) => item[1].trim());
    for (const expression of expressions) interpolations.push(`${relative}::${expression}`);
  }
}

const allowedInterpolations = new Set([
  "lib/auth/api-access.ts::comparison",
  'app/api/budgets/[budgetId]/route.ts::assignments.join(", ")',
  "app/api/programs/[programId]/offering-policy/route.ts::ph",
]);
for (const value of interpolations) if (!allowedInterpolations.has(value)) failures.push(`SQL dinámico no autorizado: ${value}`);
for (const allowed of allowedInterpolations) if (!interpolations.includes(allowed)) failures.push(`Control SQL esperado ausente o modificado: ${allowed}`);

const auth = await readFile(path.join(root, "lib/auth/api-access.ts"), "utf8");
if (!auth.includes('field: "email" | "id"')) failures.push("Autenticación: selector de campo dejó de ser una unión cerrada email/id.");
if (!auth.includes('field === "email" ? `LOWER(u."email") = LOWER(?)` : `u."id" = ?`')) failures.push("Autenticación: comparación parametrizada esperada no encontrada.");

const budgetRoute = await readFile(path.join(root, "app/api/budgets/[budgetId]/route.ts"), "utf8");
const updateStart = budgetRoute.indexOf("const assignments: string[]");
const updateEnd = budgetRoute.indexOf('database.prepare(`UPDATE "CohortBudget"');
if (updateStart < 0 || updateEnd < updateStart) failures.push("Presupuestos: no se pudo auditar construcción del UPDATE dinámico.");
else {
  const region = budgetRoute.slice(updateStart, updateEnd);
  const calls = [...region.matchAll(/assign\(([^,]+),/g)].map((match) => match[1].trim());
  const nonLiteral = calls.filter((value) => !/^"[A-Za-z0-9]+"$/.test(value));
  if (nonLiteral.length) failures.push(`Presupuestos: columnas UPDATE no literales: ${nonLiteral.join(", ")}`);
}

const offering = await readFile(path.join(root, "app/api/programs/[programId]/offering-policy/route.ts"), "utf8");
if (!offering.includes("const ph=keep.map(()=>'?').join(',')")) failures.push("Offering policy: placeholders NOT IN dejaron de generarse exclusivamente como '?'.");

if (failures.length) {
  for (const failure of failures) console.error(`ERROR SQL: ${failure}`);
  process.exit(1);
}
console.log(`Auditoría SQL correcta: 0 APIs raw inseguras y ${interpolations.length} interpolaciones estructurales controladas.`);
