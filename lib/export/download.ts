"use client";

import type { BudgetResult, CohortBudget } from "../calculations/types";
import { createFinancialReportPdf } from "./pdf";
import { buildFinancialReport } from "./report-model";
import { createFinancialReportXlsx } from "./xlsx";

function slug(value: string): string {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function download(bytes: Uint8Array, type: string, filename: string) {
  const blob = new Blob([bytes], { type });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

export function downloadBudgetXlsx(budget: CohortBudget, result: BudgetResult) {
  const report = buildFinancialReport(budget, result);
  download(createFinancialReportXlsx(report), "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", `${slug(budget.program.code)}-${budget.startYear}-${budget.startSemester}s-v${budget.version}.xlsx`);
}

export function downloadBudgetPdf(budget: CohortBudget, result: BudgetResult) {
  const report = buildFinancialReport(budget, result);
  download(createFinancialReportPdf(report), "application/pdf", `${slug(budget.program.code)}-${budget.startYear}-${budget.startSemester}s-v${budget.version}.pdf`);
}
