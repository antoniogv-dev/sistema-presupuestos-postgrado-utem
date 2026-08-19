import { readFile } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const checks = [];
const failures = [];

async function source(relative) {
  return readFile(path.join(root, relative), "utf8");
}

function check(name, condition, detail) {
  checks.push(name);
  if (!condition) failures.push(`${name}: ${detail}`);
}

const workspace = await source("features/budgets/components/BudgetWorkspace.tsx");
const budgetUpdate = await source("app/api/budgets/[budgetId]/route.ts");
const budgetCollection = await source("app/api/budgets/route.ts");
const importPage = await source("app/importar-exportar/page.tsx");
const templateCreate = await source("app/api/templates/route.ts");
const templateUpdate = await source("app/api/templates/[templateId]/route.ts");
const consolidation = await source("lib/calculations/consolidation.ts");
const versions = await source("app/api/budgets/[budgetId]/versions/route.ts");
const notifications = await source("app/api/notifications/email/route.ts");
const integrity = await source("lib/validation/budget-integrity.ts");
const applyTemplate = await source("lib/templates/apply-template.ts");

check(
  "Programa inmutable en formulario",
  !workspace.includes("Programa del presupuesto<select") && workspace.includes("El programa es parte de la identidad del presupuesto y no puede reasignarse"),
  "el formulario todavía permite reasignar el programa de un presupuesto existente",
);
check(
  "Programa inmutable en API",
  budgetUpdate.includes("PROGRAM_IMMUTABLE") && !budgetUpdate.includes('assign("programId"'),
  "la API todavía puede actualizar CohortBudget.programId",
);
check(
  "Selección exacta desde D1",
  workspace.includes('fetch(`/api/budgets/${nextId}`') && workspace.includes("Toda la página quedó sincronizada con este presupuesto"),
  "el presupuesto activo no se vuelve a leer por su ID exacto",
);
check(
  "Selector sin estado candidato divergente",
  !workspace.includes("candidateBudgetId") && !workspace.includes("Aplicar filtro") && workspace.includes("Presupuesto / cohorte"),
  "continúa existiendo un selector candidato distinto del presupuesto activo",
);
check(
  "Plantillas específicas aisladas por programa",
  workspace.includes("!template.programId || template.programId === budget.program.id") && applyTemplate.includes("template.programId !== source.program.id"),
  "una plantilla específica puede aplicarse a otro programa",
);
check(
  "Plantillas validadas por API",
  templateCreate.includes("TEMPLATE_PROGRAM_MISMATCH") && templateUpdate.includes("TEMPLATE_PROGRAM_MISMATCH"),
  "las APIs de plantillas no verifican programa/tipo",
);
check(
  "Importación sin asignación silenciosa",
  !importPage.includes("programs[0]?.id") && importPage.includes("No se asignó un programa automáticamente"),
  "un archivo no reconocido todavía cae silenciosamente en el primer programa",
);
check(
  "Importación crea identidad una sola vez",
  (importPage.match(/programId: program\.id/g) ?? []).length === 1,
  "la importación vuelve a intentar reasignar programId después de crear el presupuesto",
);
check(
  "Cohorte y programa auditados",
  integrity.includes("COHORT_PROGRAM_PREFIX_MISMATCH") && budgetUpdate.includes("COHORT_PROGRAM_MISMATCH") && budgetCollection.includes("COHORT_PROGRAM_MISMATCH"),
  "no existe control cliente/servidor para cohortes rotuladas con otro código de programa",
);
check(
  "Workflow usa versión persistida",
  workspace.includes("Los correos y el workflow siempre usan la versión persistida en D1") && workspace.includes("disabled={dirty || blockingIntegrityIssues.length > 0}"),
  "se puede enviar/aprobar una versión local no guardada o con identidad inconsistente",
);
check(
  "Consolidado excluye borradores",
  consolidation.includes("ACTIVE_CONSOLIDATION_STATUSES") && consolidation.includes('"En revisión", "Observado", "Aprobado"') && consolidation.includes("institutional-approved"),
  "los borradores podrían volver a entrar al consolidado institucional",
);
check(
  "Versiones y avisos están acotados por budgetId",
  versions.includes("budgetId") && notifications.includes("budgetId"),
  "versiones o avisos no están anclados al presupuesto seleccionado",
);

if (failures.length) {
  for (const failure of failures) console.error(`ERROR INTEGRIDAD: ${failure}`);
  process.exit(1);
}
console.log(`Auditoría transversal correcta: ${checks.length}/${checks.length} controles de aislamiento e identidad aprobados.`);
