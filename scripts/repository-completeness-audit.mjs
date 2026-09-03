import { access, readFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const root = process.cwd();
const requiredFiles = [
  "lib/calculations/budget-engine.ts",
  "lib/finance/revenue-engine.ts",
  "lib/finance/cost-engine.ts",
  "lib/calculations/billing.ts",
  "lib/calculations/break-even.ts",
  "lib/calculations/consolidation.ts",
  "lib/curriculum/budget-load.ts",
  "lib/import/curriculum-file-import.ts",
  "lib/validation/cohort-consistency.ts",
  "features/budgets/components/BudgetWorkspace.tsx",
  "app/programas/page.tsx",
  "app/planes-anuales/page.tsx",
  "migrations/0013_program_total_billing.sql",
  "migrations/0014_curriculum_graduation_section_overrides.sql",
  "demo/tests/curriculum-graduation-v1211.test.mjs",
  "demo/tests/curriculum-graduation-simulation-v1211.test.mjs",
  "demo/tests/break-even-v1212.test.mjs",
  "RELEASE_V12_1_2_PUNTO_EQUILIBRIO_MATRICULA.md",
];

const missing = [];
for (const relative of requiredFiles) {
  try { await access(path.join(root, relative)); }
  catch { missing.push(relative); }
}
if (missing.length) {
  console.error("ERROR: repositorio incompleto. Faltan archivos críticos de la versión v12.1.2:");
  for (const file of missing) console.error(` - ${file}`);
  console.error("Use el ZIP completo v12.1.2; no aplique el parche incremental sobre una base anterior a v12.1.0.");
  process.exit(1);
}

const packageJson = JSON.parse(await readFile(path.join(root, "package.json"), "utf8"));
if (packageJson.version !== "2.1.2-d1-web") {
  console.error(`ERROR: versión técnica inesperada: ${packageJson.version}. Se esperaba 2.1.2-d1-web.`);
  process.exit(1);
}
console.log(`Integridad del repositorio correcta: ${requiredFiles.length}/${requiredFiles.length} archivos críticos v12.1.2 presentes.`);
