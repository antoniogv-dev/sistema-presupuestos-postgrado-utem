import { parameterForYear, programTypeParameters, resolvedAnnualOverrideForYear } from "../calculations/budget-engine";
import type { BudgetResult, CohortBudget, InstitutionalParameters } from "../calculations/types";

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

export type ParameterValueKind = "currency" | "number" | "percent" | "text";

export interface ParameterReportRow {
  section: string;
  parameter: string;
  period: string;
  value: string | number;
  valueKind: ParameterValueKind;
  detail?: string;
}

export interface ParameterReport {
  title: string;
  subtitle: string;
  rows: ParameterReportRow[];
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

function yesNo(value: boolean): string {
  return value ? "Sí" : "No";
}

function periodLabel(year: number, semester?: 1 | 2): string {
  return semester ? `${year}-${semester}S` : String(year);
}

export function buildParameterReport(
  budget: CohortBudget,
  result: BudgetResult,
  parameters: InstitutionalParameters,
): ParameterReport {
  const rows: ParameterReportRow[] = [];
  const scoped = programTypeParameters(parameters, budget.program.type);

  const pushText = (section: string, parameter: string, period: string, value: string, detail?: string) => {
    rows.push({ section, parameter, period, value, valueKind: "text", detail });
  };
  const pushNumber = (section: string, parameter: string, period: string, value: number, detail?: string) => {
    rows.push({ section, parameter, period, value, valueKind: "number", detail });
  };
  const pushCurrency = (section: string, parameter: string, period: string, value: number, detail?: string) => {
    rows.push({ section, parameter, period, value, valueKind: "currency", detail });
  };
  const pushPercent = (section: string, parameter: string, period: string, value: number, detail?: string) => {
    rows.push({ section, parameter, period, value, valueKind: "percent", detail });
  };

  pushText("Identificación", "Programa", "General", budget.program.name, budget.program.code);
  pushText("Identificación", "Tipo de programa", "General", budget.program.type.replaceAll("_", " "));
  pushText("Identificación", "Facultad / unidad", "General", budget.program.faculty);
  pushText("Identificación", "Director", "General", budget.program.director);
  pushText("Identificación", "Centro de costo", "General", budget.program.costCenter ?? "No informado");
  pushText("Identificación", "Cohorte", "General", budget.cohortName);
  pushNumber("Identificación", "Año de inicio", "General", budget.startYear);
  pushNumber("Identificación", "Semestre de inicio", "General", budget.startSemester);
  pushNumber("Identificación", "Duración", "General", budget.durationSemesters, "semestres");
  pushNumber("Identificación", "Estudiantes iniciales", "General", budget.initialStudents, "estudiantes");
  pushText("Identificación", "Estado", "General", budget.status);
  pushText("Identificación", "Etapa de aprobación", "General", budget.workflowStage.replaceAll("_", " "));
  pushText("Identificación", "Versión del programa / plan", "General", budget.programVersionLabel);
  pushNumber("Identificación", "Revisión interna de la plataforma", "General", budget.version);
  pushText("Identificación", "Responsable", "General", budget.responsible);
  pushText("Identificación", "Fecha de creación", "General", budget.createdAt);
  pushText("Identificación", "Fuente del arancel", "General", budget.program.tuitionSource ?? "PROPIO");
  pushText("Identificación", "Plantilla aplicada", "General", budget.appliedTemplateCode ?? "Sin plantilla", budget.appliedTemplateVersion ? `Versión ${budget.appliedTemplateVersion}` : undefined);

  pushText("Controles del presupuesto", "Becas habilitadas", "General", yesNo(budget.scholarshipsEnabled));
  pushPercent("Controles del presupuesto", "Reconocimiento de matrícula", "General", budget.enrollmentRecognitionRate, "Informativo; la matrícula no integra INGRESOS TOTAL");
  pushCurrency("Controles del presupuesto", "Arrastre inicial autorizado", "General", budget.authorizedInitialCarryover);
  pushText("Controles del presupuesto", "Incluir arrastre autorizado", "General", yesNo(budget.includeAuthorizedCarryover));
  pushText("Controles del presupuesto", "Normalizar costos compartidos", "General", yesNo(budget.normalizeSharedCosts));
  pushText("Controles del presupuesto", "Alertar posibles duplicidades", "General", yesNo(budget.alertPotentialDuplicates));

  for (const flow of result.annualFlows) {
    const year = flow.year;
    const annual = resolvedAnnualOverrideForYear(budget, parameters, year);
    const section = "Parámetros anuales";
    pushCurrency(section, "Arancel anual por estudiante", String(year), annual.annualTuition, "Valor aplicado al cálculo del arancel bruto");
    pushCurrency(section, "Matrícula anual por estudiante", String(year), annual.annualEnrollmentFee, "Informativa; sin descuentos y fuera de INGRESOS TOTAL");
    pushCurrency(section, "Valor hora docencia directa", String(year), annual.directTeachingHourValue);
    pushCurrency(section, "Valor hora docencia de reemplazo", String(year), parameters.replacementHour, "Parámetro institucional general");
    pushCurrency(section, "Guía de tesis por estudiante en graduación", String(year), annual.thesisGuidancePerGraduatingStudent);
    if (budget.scholarshipsEnabled) {
      pushCurrency(section, "Beca de manutención mensual", String(year), parameterForYear(parameters.maintenanceScholarshipMonthly, year));
    }
    pushPercent(section, "Incobrabilidad", String(year), scoped.badDebtRate, "Aplicada al arancel después de descuentos y beca de arancel");
    pushCurrency(section, "Dirección anual", String(year), annual.annualDirection);
    pushText(section, "Dirección prorrateada", String(year), yesNo(annual.directionProrated));
    pushPercent(section, "Porcentaje aplicado a dirección", String(year), annual.directionAllocationRate);
    pushCurrency(section, "Asistencia de dirección anual", String(year), annual.annualAssistance);
    pushText(section, "Asistencia prorrateada", String(year), yesNo(annual.assistanceProrated));
    pushPercent(section, "Porcentaje aplicado a asistencia", String(year), annual.assistanceAllocationRate);
    pushCurrency(section, "Otros honorarios no académicos anuales", String(year), annual.annualOtherNonAcademicHonoraria);
    pushText(section, "Otros honorarios no académicos prorrateados", String(year), yesNo(annual.otherNonAcademicProrated));
    pushPercent(section, "Porcentaje aplicado a otros honorarios no académicos", String(year), annual.otherNonAcademicAllocationRate);
    pushCurrency(section, "Gastos operacionales / Bienes y servicios", String(year), annual.annualOperational);
    pushCurrency(section, "Software y licencias", String(year), annual.annualSoftware);
    pushCurrency(section, "Difusión", String(year), annual.annualDiffusion);
    pushCurrency(section, "Congresos y pasantías", String(year), annual.annualCongressesInternships);
    pushCurrency(section, "Libros y publicaciones", String(year), annual.annualBooksPublications);
    pushCurrency(section, "Pasajes y fletes", String(year), annual.annualTravelFreight);
    pushCurrency(section, "Viáticos", String(year), annual.annualPerDiem);
    pushCurrency(section, "Alimentos y bebidas", String(year), annual.annualFoodBeverages);
    pushCurrency(section, "Otros costos y gastos", String(year), annual.annualOtherCosts);
    pushPercent(section, "Overhead central", String(year), annual.centralOverheadRate);
    pushPercent(section, "Overhead facultad", String(year), annual.facultyOverheadRate);
    pushNumber(section, "Semestres activos en el año", String(year), flow.activeSemesters);
    pushNumber(section, "Factor de arancel anual", String(year), flow.tuitionFactor, "0,5 por semestre activo");
  }

  for (const semester of budget.semesters) {
    const period = periodLabel(semester.year, semester.semester);
    const section = "Parámetros semestrales";
    pushNumber(section, "Estudiantes activos", period, semester.activeStudents, "estudiantes");
    pushNumber(section, "Estudiantes en graduación", period, semester.graduatingStudents, "estudiantes");
    pushNumber(section, "Horas docentes directas", period, semester.directTeachingHours, "horas");
    pushNumber(section, "Horas docentes de reemplazo", period, semester.replacementTeachingHours, "horas");
    pushNumber(section, "Asignaturas electivas", period, semester.electiveSubjects);
    pushNumber(section, "Secciones de electivos", period, semester.electiveSections);
    pushNumber(section, "Cursos especializados", period, semester.specializedCourses);
    pushNumber(section, "Secciones de cursos especializados", period, semester.specializedSections);
    if (budget.scholarshipsEnabled) {
      pushNumber(section, "Estudiantes con beca interna de arancel", period, semester.internalTuitionScholarshipStudents);
      pushPercent(section, "Cobertura de beca interna de arancel", period, semester.internalTuitionScholarshipCoverage);
      pushNumber(section, "Estudiantes con beca de manutención", period, semester.maintenanceScholarshipStudents);
      pushNumber(section, "Meses de beca de manutención", period, semester.maintenanceScholarshipMonths);
    }
  }

  if (budget.discounts.length === 0) {
    pushText("Descuentos de arancel", "Descuentos registrados", "General", "Sin descuentos");
  } else {
    budget.discounts.forEach((discount, index) => {
      const label = `Descuento ${index + 1}: ${discount.name}`;
      const period = `${periodLabel(discount.startYear, discount.startSemester)} a ${periodLabel(discount.endYear, discount.endSemester)}`;
      pushPercent("Descuentos de arancel", label, period, discount.percentage, `${discount.students} estudiante(s); aplicado exclusivamente al arancel`);
    });
  }

  if (budget.externalIncome.length === 0) {
    pushText("Ingresos extraordinarios", "Ingresos registrados", "General", "Sin ingresos extraordinarios");
  } else {
    budget.externalIncome.forEach((income, index) => {
      pushCurrency(
        "Ingresos extraordinarios",
        `${index + 1}. ${income.description || income.type}`,
        periodLabel(income.year, income.semester),
        income.amountPerStudent,
        `${income.students} estudiante(s) · ${income.type} · Fuente: ${income.source || "No informada"}`,
      );
    });
  }

  if (budget.manualItems.length === 0) {
    pushText("Costos y gastos registrados", "Costos manuales", "General", "Sin costos manuales");
  } else {
    budget.manualItems.forEach((item, index) => {
      pushCurrency(
        "Costos y gastos registrados",
        `${index + 1}. ${item.name}`,
        periodLabel(item.year, item.semester),
        item.amount,
        `${item.category} · ${item.periodicity} · ${item.costType}`,
      );
    });
  }

  return {
    title: `Parámetros utilizados · ${budget.program.code} · ${budget.cohortName}`,
    subtitle: `Versión programa ${budget.programVersionLabel} · Revisión interna R${budget.version} · parámetros efectivos utilizados para calcular el flujo presupuestario`,
    rows,
    generatedAt: new Date().toISOString(),
  };
}
