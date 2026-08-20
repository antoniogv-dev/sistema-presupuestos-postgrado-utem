"use client";

import type { BudgetResult, CohortBudget, InstitutionalParameters } from "../calculations/types";
import type { ConsolidationGroup } from "../calculations/consolidation";
import { createFinancialReportPdf } from "./pdf";
import { buildFinancialReport, buildParameterReport, compactParameterReportForPdf, type FinancialReport } from "./report-model";
import { createFinancialReportXlsx } from "./xlsx";
import { canUseFormulaTemplate, createInstitutionalFormulaBudgetXlsx } from "./institutional-budget-xlsx";
import { buildFinancialNarrative } from "./financial-narrative";

function slug(value: string): string {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.style.display = "none";
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  // Se difiere la revocación para permitir que navegadores/WebViews completen la descarga.
  window.setTimeout(() => URL.revokeObjectURL(url), 1500);
}

function download(bytes: Uint8Array, type: string, filename: string) {
  // Copia a un ArrayBuffer propio para evitar incompatibilidades de tipado BlobPart
  // con Uint8Array<ArrayBufferLike> en TypeScript/DOM recientes.
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  triggerDownload(new Blob([copy.buffer], { type }), filename);
}

export function downloadTextFile(content: string, type: string, filename: string) {
  triggerDownload(new Blob([content], { type }), filename);
}


function institutionalBudgetFilename(budget: CohortBudget): string {
  // Conserva la convención histórica entregada como modelo institucional.
  const programName = budget.program.name.replaceAll("Metodologías", "Metodologias");
  return `${budget.startYear} - ${programName}.xlsx`;
}

async function loadInstitutionalBudgetXlsxTemplate(): Promise<Uint8Array> {
  const response = await fetch("/templates/presupuesto-profesional-formula-base.xlsx", { cache: "force-cache" });
  if (!response.ok) throw new Error("No fue posible cargar la plantilla institucional de Excel.");
  return new Uint8Array(await response.arrayBuffer());
}

export async function downloadBudgetXlsx(budget: CohortBudget, result: BudgetResult, parameters: InstitutionalParameters) {
  if (canUseFormulaTemplate(budget, result)) {
    const template = await loadInstitutionalBudgetXlsxTemplate();
    const bytes = await createInstitutionalFormulaBudgetXlsx(template, budget, result, parameters);
    download(bytes, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", institutionalBudgetFilename(budget));
    return;
  }
  // Presupuestos con horizontes distintos de dos años conservan la exportación trazable general.
  const report = buildFinancialReport(budget, result);
  const parameterReport = buildParameterReport(budget, result, parameters);
  download(createFinancialReportXlsx(report, parameterReport), "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", `${slug(budget.program.code)}-${budget.startYear}-${budget.startSemester}s-version-${slug(budget.programVersionLabel)}-r${budget.version}.xlsx`);
}

async function loadBudgetPdfCover() {
  const response = await fetch("/Portada2026.jpg", { cache: "force-cache" });
  if (!response.ok) throw new Error("No fue posible cargar la portada institucional del PDF.");
  const bytes = new Uint8Array(await response.arrayBuffer());
  return {
    jpegBytes: bytes,
    imageWidth: 912,
    imageHeight: 1168,
  };
}

export async function downloadBudgetPdf(budget: CohortBudget, result: BudgetResult, parameters: InstitutionalParameters) {
  const report = buildFinancialReport(budget, result);
  const completeParameterReport = buildParameterReport(budget, result, parameters);
  const parameterReport = compactParameterReportForPdf(completeParameterReport);
  const image = await loadBudgetPdfCover();
  const cover = {
    ...image,
    title: budget.program.name,
    subtitle: `Versión ${budget.programVersionLabel}\nCohorte ${budget.startYear}-${budget.startSemester}S`,
  };
  const narrative = buildFinancialNarrative(budget, result, parameters);
  download(createFinancialReportPdf(report, parameterReport, cover, narrative), "application/pdf", `${slug(budget.program.code)}-${budget.startYear}-${budget.startSemester}s-version-${slug(budget.programVersionLabel)}-r${budget.version}.pdf`);
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
  download(
    createFinancialReportXlsx(consolidationReport(group)),
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    `${slug(group.label)}.xlsx`,
  );
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
