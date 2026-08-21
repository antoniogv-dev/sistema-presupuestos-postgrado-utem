import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const { demoBudget, secondDemoBudget, institutionalParameters } = await import(path.join(root, ".engine-build/lib/demo-data.js"));
const { calculateBudget } = await import(path.join(root, ".engine-build/lib/calculations/budget-engine.js"));
const { buildFinancialNarrative, buildHistoricalCohortSnapshots } = await import(path.join(root, ".engine-build/lib/export/financial-narrative.js"));
const { buildParameterReport, compactParameterReportForPdf } = await import(path.join(root, ".engine-build/lib/export/report-model.js"));

 test("v10.31 relato económico-financiero usa historia aprobada y no emite juicios", () => {
  const budget = structuredClone(demoBudget);
  const result = calculateBudget(budget, institutionalParameters);
  const history = buildHistoricalCohortSnapshots(budget, [budget, secondDemoBudget], institutionalParameters);
  assert.equal(history.length, 1);
  const narrative = buildFinancialNarrative(budget, result, institutionalParameters, history);
  const text = [narrative.title, ...narrative.sections.flatMap((section) => [section.heading, ...section.paragraphs])].join(" ");
  assert.match(text, /1\. Antecedentes de la cohorte/);
  assert.match(text, /7\. Variaciones entre cohortes/);
  assert.ok(narrative.comparisonTable);
  assert.doesNotMatch(text.toLowerCase(), /se aprueba|se rechaza|recomendamos|inviable/);
});

test("v10.31 anexo PDF omite detalle semestral y conserva parámetros principales", () => {
  const budget = structuredClone(demoBudget);
  const result = calculateBudget(budget, institutionalParameters);
  const compact = compactParameterReportForPdf(buildParameterReport(budget, result, institutionalParameters));
  assert.ok(compact.rows.some((row) => row.parameter === "Programa"));
  assert.ok(compact.rows.some((row) => row.parameter === "Arancel anual por estudiante"));
  assert.equal(compact.rows.some((row) => row.section === "Parámetros semestrales"), false);
  assert.equal(compact.rows.some((row) => row.section === "Punto de equilibrio"), false);
  assert.equal(compact.rows.some((row) => row.section === "Costos y gastos registrados"), false);
});

test("v10.31 nombres de descarga decodifican espacios y caracteres URL", async () => {
  const { normalizeDownloadFilename } = await import(path.join(root, ".engine-build/lib/export/download.js"));
  assert.equal(
    normalizeDownloadFilename("2027%20-%20Mag%C3%ADster%20en%20Gesti%C3%B3n.pdf"),
    "2027 - Magíster en Gestión.pdf",
  );
  assert.equal(normalizeDownloadFilename("Memorándum%20-%20MGP.docx").includes("%20"), false);
});
