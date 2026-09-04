"use client";

import type { BudgetResult, CohortBudget, InstitutionalParameters } from "../calculations/types";
import type { ConsolidationGroup } from "../calculations/consolidation";
import { createFinancialReportPdf } from "./pdf";
import { buildFinancialReport, buildParameterReport, compactParameterReportForPdf, type FinancialReport } from "./report-model";
import { createFinancialReportXlsx } from "./xlsx";
import { createInstitutionalFormulaBudgetXlsx, institutionalTemplateCompatibilityIssue } from "./institutional-budget-xlsx";
import { extendInstitutionalBudgetXlsx } from "./institutional-budget-multiyear";
import { alignInstitutionalBreakEvenFormula } from "./institutional-budget-break-even-formula";
import { buildFinancialNarrative, buildHistoricalCohortSnapshots } from "./financial-narrative";
import { createBudgetMemorandumDocx } from "./memorandum";

function slug(value: string): string {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

export function normalizeDownloadFilename(filename: string): string {
  let decoded = filename;
  try { decoded = decodeURIComponent(filename); } catch { decoded = filename.replaceAll("%20", " "); }
  return decoded
    .replaceAll("%20", " ")
    .replace(/[\\/:*?"<>|]+/g, " - ")
    .replace(/\s+/g, " ")
    .replace(/\s+-\s+-\s+/g, " - ")
    .trim();
}

function humanBudgetFilename(budget: CohortBudget, extension: string): string {
  return normalizeDownloadFilename(`${budget.startYear} - ${budget.program.name} - Cohorte ${budget.startYear}-${budget.startSemester}S - Versión ${budget.programVersionLabel}.${extension}`);
}

function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = normalizeDownloadFilename(filename);
  anchor.style.display = "none";
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1500);
}

function download(bytes: Uint8Array, type: string, filename: string) {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  triggerDownload(new Blob([copy.buffer], { type }), filename);
}

export function downloadTextFile(content: string, type: string, filename: string) {
  triggerDownload(new Blob([content], { type }), filename);
}

function institutionalBudgetFilename(budget: CohortBudget): string {
  const programName = budget.program.name.replaceAll("Metodologías", "Metodologias");
  return `${budget.startYear} - ${programName}.xlsx`;
}

const INSTITUTIONAL_TEMPLATE_URL = "/templates/presupuesto-profesional-formula-base-v10-30.xlsx?v=24e7b6a886161646";
const INSTITUTIONAL_TEMPLATE_SHA256 = "24e7b6a886161646d2db9ff9015d261ecaebdb86b6548bd292baddbd5d89853e";

async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  const digest = await crypto.subtle.digest("SHA-256", copy.buffer);
  return [...new Uint8Array(digest)].map((value) => value.toString(16).padStart(2, "0")).join("");
}

async function loadInstitutionalBudgetXlsxTemplate(): Promise<Uint8Array> {
  const response = await fetch(INSTITUTIONAL_TEMPLATE_URL, { cache: "no-store" });
  if (!response.ok) throw new Error("No fue posible cargar la plantilla institucional mejorada de Excel.");
  const bytes = new Uint8Array(await response.arrayBuffer());
  const digest = await sha256Hex(bytes);
  if (digest !== INSTITUTIONAL_TEMPLATE_SHA256) {
    throw new Error("PLANTILLA_INSTITUCIONAL_OBSOLETA: el archivo recibido no corresponde a la plantilla mejorada v10.26+. Recargue la aplicación y vuelva a exportar.");
  }
  return bytes;
}

function downloadGeneralBudgetXlsx(budget: CohortBudget, result: BudgetResult, parameters: InstitutionalParameters) {
  const report = buildFinancialReport(budget, result);
  const parameterReport = buildParameterReport(budget, result, parameters);
  download(
    createFinancialReportXlsx(report, parameterReport),
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    humanBudgetFilename(budget, "xlsx"),
  );
}

function institutionalBaseResult(result: BudgetResult): BudgetResult {
  const years = result.years.slice(0, 2);
  return {
    ...result,
    years,
    annualFlows: result.annualFlows.filter((flow) => years.includes(flow.year)),
  };
}

export async function downloadBudgetXlsx(
  budget: CohortBudget,
  result: BudgetResult,
  parameters: InstitutionalParameters,
): Promise<void> {
  // Los presupuestos con arancel total usan el XLSX trazable general.
  const institutionalCandidate = budget.program.type === "MAGISTER_PROFESIONAL"
    && budget.tuitionPricingMode !== "PROGRAM_TOTAL"
    && !budget.discounts.some((discount) => discount.target === "ENROLLMENT");

  // Para los Magísteres Profesionales se conserva el formato institucional validado.
  // Si la cohorte cruza tres o más años, se genera primero el mismo archivo de dos años
  // y luego se agregan las columnas siguientes dentro de sus mismas hojas y flujos.
  if (institutionalCandidate && result.years.length >= 2) {
    const baseResult = result.years.length > 2 ? institutionalBaseResult(result) : result;
    const compatibilityIssue = institutionalTemplateCompatibilityIssue(budget, baseResult);
    if (compatibilityIssue) throw new Error(compatibilityIssue);
    const template = await loadInstitutionalBudgetXlsxTemplate();
    let bytes = await createInstitutionalFormulaBudgetXlsx(template, budget, baseResult, parameters);
    if (result.years.length > 2) {
      bytes = await extendInstitutionalBudgetXlsx(bytes, budget, result, parameters);
    }
    // Mantiene exactamente el modelo institucional anterior y corrige sólo la fórmula de equilibrio.
    bytes = await alignInstitutionalBreakEvenFormula(bytes, budget, result, parameters);
    download(bytes, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", institutionalBudgetFilename(budget));
    return;
  }

  // Los modelos que históricamente no usan la plantilla institucional mantienen su XLSX trazable general.
  downloadGeneralBudgetXlsx(budget, result, parameters);
}

async function loadBudgetPdfCover() {
  const response = await fetch("/Portada2026.jpg", { cache: "force-cache" });
  if (!response.ok) throw new Error("No fue posible cargar la portada institucional del PDF.");
  const bytes = new Uint8Array(await response.arrayBuffer());
  return { jpegBytes: bytes, imageWidth: 912, imageHeight: 1168 };
}

export async function downloadBudgetPdf(
  budget: CohortBudget,
  result: BudgetResult,
  parameters: InstitutionalParameters,
  allBudgets: CohortBudget[] = [],
) {
  const report = buildFinancialReport(budget, result);
  const completeParameterReport = buildParameterReport(budget, result, parameters);
  const parameterReport = compactParameterReportForPdf(completeParameterReport);
  const image = await loadBudgetPdfCover();
  const cover = { ...image, title: budget.program.name, subtitle: `Versión ${budget.programVersionLabel}\nCohorte ${budget.startYear}-${budget.startSemester}S` };
  const history = buildHistoricalCohortSnapshots(budget, allBudgets, parameters);
  const narrative = buildFinancialNarrative(budget, result, parameters, history);
  download(createFinancialReportPdf(report, parameterReport, cover, narrative), "application/pdf", humanBudgetFilename(budget, "pdf"));
}

const MEMORANDUM_TEMPLATE_URL = "/templates/memorandum-presupuesto-base-v11-0-6.docx?v=11.0.6";
async function loadMemorandumTemplate(): Promise<Uint8Array> {
  const response = await fetch(MEMORANDUM_TEMPLATE_URL, { cache: "no-store" });
  if (!response.ok) throw new Error("No fue posible cargar la plantilla institucional de memorándum.");
  return new Uint8Array(await response.arrayBuffer());
}

export async function downloadBudgetMemorandum(budget: CohortBudget, result: BudgetResult, parameters: InstitutionalParameters) {
  const template = await loadMemorandumTemplate();
  const bytes = await createBudgetMemorandumDocx(template, budget, result, parameters);
  const filename = `Memorándum - Proyección presupuestaria - ${budget.program.name} - Cohorte ${budget.startYear}-${budget.startSemester}S.docx`;
  download(bytes, "application/vnd.openxmlformats-officedocument.wordprocessingml.document", filename);
}

function csvCell(value: unknown): string {
  const text = value == null ? "" : String(value);
  return `"${text.replaceAll('"', '""')}"`;
}

export function consolidationReport(group: ConsolidationGroup): FinancialReport {
  return {
    title: `Consolidado · ${group.label}`,
    subtitle: `${group.budgetCount} presupuesto(s) incluidos · costos compartidos normalizados`,
    years: group.rows.map((row) => row.year),
    generatedAt: new Date().toISOString(),
    rows: [
      { label: "INGRESOS CONSOLIDADOS", values: group.rows.map((row) => row.grossIncome), tone: "income", bold: true, valueKind: "currency" },
      { label: "EGRESOS BRUTOS", values: group.rows.map((row) => -row.grossExpenses), tone: "expense", valueKind: "currency" },
      { label: "EGRESOS NORMALIZADOS", values: group.rows.map((row) => -row.normalizedExpenses), tone: "section", bold: true, valueKind: "currency" },
      { label: "DUPLICIDAD EVITADA", values: group.rows.map((row) => row.duplicateAvoided), tone: "income", valueKind: "currency" },
      { label: "FLUJO NETO CONSOLIDADO", values: group.rows.map((row) => row.netFlow), tone: "result", bold: true, valueKind: "currency" },
    ],
  };
}

export function downloadConsolidationXlsx(group: ConsolidationGroup) {
  download(createFinancialReportXlsx(consolidationReport(group)), "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", `${slug(group.label)}.xlsx`);
}

export function consolidationCsv(group: ConsolidationGroup): string {
  const rows = [
    ["Agrupación", group.label],
    ["Presupuestos incluidos", group.budgetCount],
    [],
    ["Año", "Ingresos", "Egresos brutos", "Egresos normalizados", "Duplicidad evitada", "Flujo neto"],
    ...group.rows.map((row) => [row.year, row.grossIncome, row.grossExpenses, row.normalizedExpenses, row.duplicateAvoided, row.netFlow]),
  ];
  return `\uFEFF${rows.map((row) => row.map(csvCell).join(";")).join("\r\n")}`;
}

export function downloadConsolidationCsv(group: ConsolidationGroup) {
  downloadTextFile(consolidationCsv(group), "text/csv;charset=utf-8", `${slug(group.label)}.csv`);
}

export function auditCsv(budget: CohortBudget): string {
  const rows = [
    ["Programa", budget.program.code],
    ["Cohorte", budget.cohortName],
    ["Versión del programa", budget.programVersionLabel],
    ["Revisión interna", `R${budget.version}`],
    [],
    ["Fecha", "Usuario", "Rol", "Decisión", "Etapa origen", "Etapa destino", "Comentario"],
    ...budget.reviewHistory.map((event) => [event.createdAt, event.user, event.role, event.decision, event.fromStage, event.toStage, event.comment ?? ""]),
  ];
  return `\uFEFF${rows.map((row) => row.map(csvCell).join(";")).join("\r\n")}`;
}

export function downloadAuditCsv(budget: CohortBudget) {
  downloadTextFile(auditCsv(budget), "text/csv;charset=utf-8", `${slug(budget.program.code)}-${budget.startYear}-auditoria-version-${slug(budget.programVersionLabel)}-r${budget.version}.csv`);
}
