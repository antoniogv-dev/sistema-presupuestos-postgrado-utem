import type { BudgetResult, CohortBudget } from "../calculations/types";

export type ReportRowTone = "income" | "expense" | "section" | "result" | "plain";
export type ReportValueKind = "currency" | "number" | "percent";

export interface FinancialReportRow {
  label: string;
  values: number[];
  tone: ReportRowTone;
  bold?: boolean;
  valueKind?: ReportValueKind;
}

export interface FinancialReport {
  title: string;
  subtitle: string;
  years: number[];
  rows: FinancialReportRow[];
  generatedAt: string;
}

export function buildFinancialReport(budget: CohortBudget, result: BudgetResult): FinancialReport {
  const f = result.annualFlows;
  const negative = (key: keyof (typeof f)[number]) => f.map((flow) => -Number(flow[key] ?? 0));
  const positive = (key: keyof (typeof f)[number]) => f.map((flow) => Number(flow[key] ?? 0));

  return {
    title: `${budget.program.name} (inicio ${budget.startYear}-${budget.startSemester}S)`,
    subtitle: `${budget.program.code} · ${budget.cohortName} · Versión programa ${budget.programVersionLabel} · Revisión interna R${budget.version} · ${budget.status}`,
    years: result.years,
    generatedAt: new Date().toISOString(),
    rows: [
      { label: "Matrícula anual (informativa, sin descuentos; no suma a ingresos total)", values: positive("grossEnrollmentFee"), tone: "income", valueKind: "currency" },
      ...(budget.enrollmentRecognitionRate > 0 ? [{ label: "Matrícula reconocida (informativa; no suma a ingresos total)", values: positive("recognizedEnrollmentFee"), tone: "income" as const, valueKind: "currency" as const }] : []),
      { label: "Arancel bruto", values: positive("grossTuition"), tone: "income", valueKind: "currency" },
      { label: "Descuentos arancel", values: negative("discounts"), tone: "income", valueKind: "currency" },
      ...(budget.scholarshipsEnabled ? [{ label: "Beca interna de arancel", values: negative("internalTuitionScholarships"), tone: "income" as const, valueKind: "currency" as const }] : []),
      { label: "Incobrables", values: negative("badDebt"), tone: "income", valueKind: "currency" },
      { label: "Ingresos extraordinarios", values: positive("externalIncome"), tone: "income", valueKind: "currency" },
      { label: "INGRESOS TOTAL (sin matrícula)", values: positive("totalIncome"), tone: "income", bold: true, valueKind: "currency" },

      { label: "Horas docentes directas", values: negative("directTeachingCost"), tone: "expense", valueKind: "currency" },
      { label: "Horas docentes de reemplazo", values: negative("replacementTeachingCost"), tone: "expense", valueKind: "currency" },
      { label: "Guía de tesis", values: negative("thesisGuidanceCost"), tone: "expense", valueKind: "currency" },

      { label: "Dirección", values: negative("direction"), tone: "expense", valueKind: "currency" },
      { label: "Asistencia de dirección", values: negative("assistance"), tone: "expense", valueKind: "currency" },
      { label: "Otros honorarios no académicos", values: negative("otherNonAcademicHonoraria"), tone: "expense", valueKind: "currency" },
      { label: "HONORARIOS NO ACADÉMICOS (SUBTOTAL)", values: negative("nonAcademicHonoraria"), tone: "section", bold: true, valueKind: "currency" },

      ...(budget.scholarshipsEnabled || f.some((flow) => flow.maintenanceScholarships > 0)
        ? [{ label: "Becas de manutención", values: negative("maintenanceScholarships"), tone: "expense" as const, valueKind: "currency" as const }]
        : []),
      { label: "Gastos operacionales / Bienes y servicios", values: negative("operational"), tone: "expense", valueKind: "currency" },
      { label: "Software y licencias", values: negative("software"), tone: "expense", valueKind: "currency" },
      { label: "Difusión", values: negative("diffusion"), tone: "expense", valueKind: "currency" },
      { label: "Congresos y pasantías", values: negative("congressesInternships"), tone: "expense", valueKind: "currency" },
      { label: "Libros y publicaciones", values: negative("booksPublications"), tone: "expense", valueKind: "currency" },
      { label: "Pasajes y fletes", values: negative("travelFreight"), tone: "expense", valueKind: "currency" },
      { label: "Viáticos", values: negative("perDiem"), tone: "expense", valueKind: "currency" },
      { label: "Alimentos y bebidas", values: negative("foodBeverages"), tone: "expense", valueKind: "currency" },
      { label: "Otros costos y gastos", values: negative("otherCosts"), tone: "expense", valueKind: "currency" },

      { label: "Base overhead", values: positive("overheadBase"), tone: "plain", valueKind: "currency" },
      { label: "Overhead central", values: negative("centralOverhead"), tone: "expense", valueKind: "currency" },
      { label: "Overhead facultad", values: negative("facultyOverhead"), tone: "expense", valueKind: "currency" },
      { label: "TOTAL COSTOS Y GASTOS", values: negative("totalExpenses"), tone: "result", bold: true, valueKind: "currency" },
      { label: "FLUJO NETO", values: positive("netFlow"), tone: "result", bold: true, valueKind: "currency" },
      { label: "Arrastre inicial anual", values: positive("startingCarryover"), tone: "result", valueKind: "currency" },
      { label: "SALDO FINAL ACUMULADO", values: positive("accumulatedFlow"), tone: "result", bold: true, valueKind: "currency" },
      { label: "MATRÍCULAS EQUIVALENTES", values: positive("equivalentEnrollments"), tone: "result", bold: true, valueKind: "number" },
      { label: "ESTUDIANTES EQUIVALENTES APROX.", values: positive("roundedEquivalentStudents"), tone: "result", bold: true, valueKind: "number" },
      { label: "RENDIMIENTO OPERACIONAL", values: f.map((flow) => flow.operatingMargin ?? 0), tone: "result", bold: true, valueKind: "percent" },
    ],
  };
}
