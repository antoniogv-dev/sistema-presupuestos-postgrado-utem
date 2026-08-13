import { manualItemAmountForYear } from "../calculations/budget-engine";
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
      { label: "Descuentos", values: negative("discounts"), tone: "income", valueKind: "currency" },
      { label: "Beca de excelencia académica (arancel)", values: negative("internalTuitionScholarships"), tone: "income", valueKind: "currency" },
      { label: "Arancel después de beneficios", values: positive("tuitionAfterBenefits"), tone: "income", valueKind: "currency" },
      { label: "Incobrables", values: negative("badDebt"), tone: "income", valueKind: "currency" },
      { label: "Ingreso neto por arancel", values: positive("netTuitionIncome"), tone: "income", valueKind: "currency" },
      { label: "Ingresos extraordinarios", values: positive("externalIncome"), tone: "income", valueKind: "currency" },
      { label: "INGRESOS TOTAL (sin matrícula)", values: positive("totalIncome"), tone: "income", bold: true, valueKind: "currency" },
      { label: "Docentes convenio / honorario", values: negative("directTeachingCost"), tone: "expense", valueKind: "currency" },
      { label: "Docentes hora de reemplazo", values: negative("replacementTeachingCost"), tone: "expense", valueKind: "currency" },
      { label: "Pago docente tesista / guía de tesis", values: negative("thesisGuidanceCost"), tone: "expense", valueKind: "currency" },
      { label: "Honorarios académicos adicionales", values: negative("manualAcademicHonoraria"), tone: "expense", valueKind: "currency" },
      { label: "COSTOS ACADÉMICOS", values: negative("academicHonoraria"), tone: "section", bold: true, valueKind: "currency" },
      { label: "Director programa", values: negative("direction"), tone: "expense", valueKind: "currency" },
      { label: "Asistente de Dirección", values: negative("assistance"), tone: "expense", valueKind: "currency" },
      { label: "Honorarios no académicos", values: negative("nonAcademicHonoraria"), tone: "expense", valueKind: "currency" },
      { label: "HONORARIOS NO ACADÉMICOS", values: f.map((flow) => -(flow.direction + flow.assistance + flow.nonAcademicHonoraria)), tone: "section", bold: true, valueKind: "currency" },
      { label: "LIBROS Y PUBLICACIONES TÉCNICAS", values: negative("booksPublications"), tone: "section", bold: true, valueKind: "currency" },
      { label: "Difusión propia del programa", values: negative("diffusion"), tone: "expense", valueKind: "currency" },
      { label: "DIFUSIÓN", values: negative("diffusion"), tone: "section", bold: true, valueKind: "currency" },
      { label: "Pasajes nacionales e internacionales", values: negative("travelFreight"), tone: "expense", valueKind: "currency" },
      { label: "PASAJES Y FLETES", values: negative("travelFreight"), tone: "section", bold: true, valueKind: "currency" },
      { label: "Viáticos honorarios", values: negative("perDiem"), tone: "expense", valueKind: "currency" },
      { label: "VIÁTICOS HONORARIOS NACIONALES", values: negative("perDiem"), tone: "section", bold: true, valueKind: "currency" },
      { label: "Licencias, APIs y servicios de nube", values: negative("software"), tone: "expense", valueKind: "currency" },
      { label: "ADQUISICIÓN DE PROGRAMAS, LICENCIAS Y NUBE", values: negative("software"), tone: "section", bold: true, valueKind: "currency" },
      { label: "Gastos operacionales / bienes y servicios", values: negative("operational"), tone: "expense", valueKind: "currency" },
      { label: "Congresos y pasantías", values: negative("congressesInternships"), tone: "expense", valueKind: "currency" },
      { label: "Alimentos y bebidas", values: negative("foodBeverages"), tone: "expense", valueKind: "currency" },
      { label: "Otros costos y gastos", values: negative("otherCosts"), tone: "expense", valueKind: "currency" },
      { label: "OTROS SERVICIOS", values: f.map((flow) => -(flow.operational + flow.foodBeverages + flow.otherCosts)), tone: "section", bold: true, valueKind: "currency" },
      { label: "Becas por pasantías y manutención", values: f.map((flow) => -(flow.maintenanceScholarships + flow.congressesInternships)), tone: "expense", valueKind: "currency" },
      { label: "AYUDAS INTERNAS", values: f.map((flow) => -(flow.maintenanceScholarships + flow.congressesInternships)), tone: "section", bold: true, valueKind: "currency" },
      ...budget.manualItems.map((item) => ({
        label: `Costo registrado: ${item.name} · ${item.category} (detalle; ya incluido en costos y gastos)`,
        values: result.years.map((year) => -manualItemAmountForYear(item, budget, year)),
        tone: "plain" as const,
        valueKind: "currency" as const,
      })),
      { label: "Base overhead", values: positive("overheadBase"), tone: "plain", valueKind: "currency" },
      { label: "Overhead Central", values: negative("centralOverhead"), tone: "expense", valueKind: "currency" },
      { label: "Overhead Facultad", values: negative("facultyOverhead"), tone: "expense", valueKind: "currency" },
      { label: "RETENCIONES", values: f.map((flow) => -(flow.centralOverhead + flow.facultyOverhead)), tone: "section", bold: true, valueKind: "currency" },
      { label: "TOTAL COSTOS Y GASTOS DE ADM.", values: negative("totalExpenses"), tone: "result", bold: true, valueKind: "currency" },
      { label: "FLUJO DE CAJA NETO", values: positive("netFlow"), tone: "result", bold: true, valueKind: "currency" },
      { label: "Arrastre inicial anual", values: positive("startingCarryover"), tone: "result", valueKind: "currency" },
      { label: "SALDO FINAL ACUMULADO", values: positive("accumulatedFlow"), tone: "result", bold: true, valueKind: "currency" },
      { label: "MATRÍCULAS EQUIVALENTES", values: positive("equivalentEnrollments"), tone: "result", bold: true, valueKind: "number" },
      { label: "ESTUDIANTES EQUIVALENTES APROX.", values: positive("roundedEquivalentStudents"), tone: "result", bold: true, valueKind: "number" },
      { label: "RENDIMIENTO OPERACIONAL", values: f.map((flow) => flow.operatingMargin ?? 0), tone: "result", bold: true, valueKind: "percent" },
    ],
  };
}
