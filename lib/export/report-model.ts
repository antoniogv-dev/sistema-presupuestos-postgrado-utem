import { effectiveBadDebtRate, resolvedAnnualOverrideForYear } from "../calculations/budget-engine";
import { calculateBreakEvenEquivalentEnrollments } from "../calculations/break-even";
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
      { label: "Matrícula anual bruta (referencial, sin descuentos)", values: positive("grossEnrollmentFee"), tone: "income", valueKind: "currency" },
      ...(budget.enrollmentRecognitionRate > 0 ? [{ label: "Matrícula reconocida (ingreso del programa)", values: positive("recognizedEnrollmentFee"), tone: "income" as const, valueKind: "currency" as const }] : []),
      { label: "Arancel bruto", values: positive("grossTuition"), tone: "income", valueKind: "currency" },
      { label: "Descuentos arancel", values: negative("discounts"), tone: "income", valueKind: "currency" },
      ...(budget.scholarshipsEnabled ? [{ label: "Beca interna de arancel", values: negative("internalTuitionScholarships"), tone: "income" as const, valueKind: "currency" as const }] : []),
      { label: "Incobrables", values: negative("badDebt"), tone: "income", valueKind: "currency" },
      { label: "Ingresos extraordinarios", values: positive("externalIncome"), tone: "income", valueKind: "currency" },
      ...(f.some((flow) => flow.institutionalFinancing > 0) ? [{ label: "Financiamiento institucional", values: positive("institutionalFinancing"), tone: "income" as const, valueKind: "currency" as const }] : []),
      { label: "INGRESOS TOTAL", values: positive("totalIncome"), tone: "income", bold: true, valueKind: "currency" },

      ...(budget.deliveryModality === "PRESENCIAL"
        ? [{ label: "Horas docentes presenciales", values: negative("directTeachingCost"), tone: "expense" as const, valueKind: "currency" as const }]
        : [
            { label: "Docencia sincrónica", values: negative("synchronousTeachingCost"), tone: "expense" as const, valueKind: "currency" as const },
            { label: "Docencia asincrónica", values: negative("asynchronousTeachingCost"), tone: "expense" as const, valueKind: "currency" as const },
            ...(f.some((flow) => flow.sharedCourseSavings > 0) ? [{ label: "Ahorro economía de escala (informativo)", values: positive("sharedCourseSavings"), tone: "income" as const, valueKind: "currency" as const }] : []),
          ]),
      { label: "Horas docentes de reemplazo", values: negative("replacementTeachingCost"), tone: "expense", valueKind: "currency" },
      { label: "Guía de tesis", values: negative("thesisGuidanceCost"), tone: "expense", valueKind: "currency" },
      { label: "HONORARIOS ACADÉMICOS (SUBTOTAL)", values: negative("academicHonoraria"), tone: "section", bold: true, valueKind: "currency" },

      { label: "Dirección", values: negative("direction"), tone: "expense", valueKind: "currency" },
      { label: "Asistencia de dirección", values: negative("assistance"), tone: "expense", valueKind: "currency" },
      { label: "Otros honorarios no académicos", values: negative("otherNonAcademicHonoraria"), tone: "expense", valueKind: "currency" },
      { label: "HONORARIOS NO ACADÉMICOS (SUBTOTAL)", values: negative("nonAcademicHonoraria"), tone: "section", bold: true, valueKind: "currency" },

      { label: "Gastos operacionales / Bienes y servicios", values: negative("operational"), tone: "expense", valueKind: "currency" },
      { label: "Software y licencias", values: negative("software"), tone: "expense", valueKind: "currency" },
      { label: "Difusión", values: negative("diffusion"), tone: "expense", valueKind: "currency" },
      { label: "Congresos y pasantías", values: negative("congressesInternships"), tone: "expense", valueKind: "currency" },
      { label: "Libros y publicaciones", values: negative("booksPublications"), tone: "expense", valueKind: "currency" },
      { label: "Pasajes y fletes", values: negative("travelFreight"), tone: "expense", valueKind: "currency" },
      { label: "Viáticos", values: negative("perDiem"), tone: "expense", valueKind: "currency" },
      { label: "Alimentos y bebidas", values: negative("foodBeverages"), tone: "expense", valueKind: "currency" },
      { label: "Otros costos y gastos", values: negative("otherCosts"), tone: "expense", valueKind: "currency" },
      { label: "OTROS GASTOS (SUBTOTAL)", values: negative("otherExpenses"), tone: "section", bold: true, valueKind: "currency" },

      ...(f.some((flow) => flow.equipment > 0)
        ? [{ label: "EQUIPAMIENTOS (SUBTOTAL)", values: negative("equipment"), tone: "section" as const, bold: true, valueKind: "currency" as const }]
        : []),
      ...(f.some((flow) => flow.scholarshipsAndAid > 0)
        ? [
            ...(f.some((flow) => flow.maintenanceScholarships > 0)
              ? [{ label: "Becas de manutención", values: negative("maintenanceScholarships"), tone: "expense" as const, valueKind: "currency" as const }]
              : []),
            { label: "BECAS Y AYUDAS (SUBTOTAL)", values: negative("scholarshipsAndAid"), tone: "section" as const, bold: true, valueKind: "currency" as const },
          ]
        : []),

      { label: "Base overhead (solo arancel neto sujeto a cobro)", values: positive("overheadBase"), tone: "plain", valueKind: "currency" },
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

function appendDetail(...parts: Array<string | undefined>): string | undefined {
  const filtered = parts.map((part) => part?.trim()).filter((part): part is string => Boolean(part));
  return filtered.length ? filtered.join(" · ") : undefined;
}

export function buildParameterReport(
  budget: CohortBudget,
  result: BudgetResult,
  parameters: InstitutionalParameters,
): ParameterReport {
  const rows: ParameterReportRow[] = [];

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

  // Identificación completa del programa y de la formulación.
  pushText("Identificación", "Programa", "General", budget.program.name, budget.program.code);
  pushText("Identificación", "Código del programa", "General", budget.program.code);
  pushText("Identificación", "Tipo de programa", "General", budget.program.type.replaceAll("_", " "));
  pushText("Identificación", "Modalidad", "General", budget.deliveryModality.replaceAll("_", " "));
  pushText("Identificación", "Facultad / unidad", "General", budget.program.faculty || "No informado");
  pushText("Identificación", "Director", "General", budget.program.director || "No informado");
  pushText("Identificación", "Centro de costo", "General", budget.program.costCenter ?? "No informado");
  pushText("Identificación", "Estado del programa", "General", budget.program.status);
  pushNumber("Identificación", "Duración oficial del programa", "General", budget.program.officialDurationSemesters, "semestres");
  pushText("Identificación", "Cohorte", "General", budget.cohortName);
  pushNumber("Identificación", "Año de inicio", "General", budget.startYear);
  pushNumber("Identificación", "Semestre de inicio", "General", budget.startSemester);
  pushNumber("Identificación", "Duración presupuestada", "General", budget.durationSemesters, "semestres");
  pushNumber("Identificación", "Estudiantes iniciales", "General", budget.initialStudents, "estudiantes");
  pushText("Identificación", "Estado del presupuesto", "General", budget.status);
  pushText("Identificación", "Etapa de aprobación", "General", budget.workflowStage.replaceAll("_", " "));
  pushText("Identificación", "Versión del programa / plan", "General", budget.programVersionLabel);
  pushNumber("Identificación", "Revisión interna de la plataforma", "General", budget.version);
  pushText("Identificación", "Responsable", "General", budget.responsible);
  pushText("Identificación", "Fecha de creación", "General", budget.createdAt);
  pushText("Identificación", "Última actualización", "General", budget.updatedAt ?? "No informada");
  pushText("Identificación", "Fuente del arancel", "General", budget.program.tuitionSource ?? "PROPIO");
  pushText("Identificación", "Plantilla aplicada", "General", budget.appliedTemplateCode ?? "Sin plantilla", budget.appliedTemplateVersion ? `Versión ${budget.appliedTemplateVersion}` : undefined);
  pushText("Identificación", "Observaciones generales", "General", budget.notes?.trim() || "Sin observaciones");

  // Parámetros institucionales generales que efectivamente alimentan el cálculo.
  pushCurrency("Parámetros institucionales generales", "Valor hora docencia de reemplazo", "General", parameters.replacementHour);
  pushPercent("Parámetros institucionales generales", "Reajuste anual de referencia", "General", parameters.annualAdjustmentRate);
  pushNumber("Parámetros institucionales generales", "Horizonte de planificación", "General", parameters.planningHorizonYears, "años");

  // Controles del presupuesto.
  pushText("Controles del presupuesto", "Becas habilitadas", "General", yesNo(budget.scholarshipsEnabled));
  pushPercent("Controles del presupuesto", "Reconocimiento de matrícula", "General", budget.enrollmentRecognitionRate, "La fracción reconocida integra INGRESOS TOTAL; no integra la base de overhead");
  pushCurrency("Controles del presupuesto", "Arrastre inicial autorizado", "General", budget.authorizedInitialCarryover);
  pushText("Controles del presupuesto", "Incluir arrastre autorizado", "General", yesNo(budget.includeAuthorizedCarryover));
  pushText("Controles del presupuesto", "Normalizar costos compartidos", "General", yesNo(budget.normalizeSharedCosts));
  pushText("Controles del presupuesto", "Alertar posibles duplicidades", "General", yesNo(budget.alertPotentialDuplicates));

  // Valores efectivos anuales. El XLSX conserva incluso los ceros para que la hoja sea una fotografía completa de los inputs.
  for (const flow of result.annualFlows) {
    const year = flow.year;
    const annual = resolvedAnnualOverrideForYear(budget, parameters, year);
    const section = "Parámetros anuales";
    pushCurrency(section, "Arancel anual por estudiante", String(year), annual.annualTuition, "Valor efectivo usado para calcular el arancel bruto");
    pushCurrency(section, "Matrícula anual por estudiante", String(year), annual.annualEnrollmentFee, budget.enrollmentRecognitionRate > 0 ? `Sin descuentos; ${(budget.enrollmentRecognitionRate * 100).toLocaleString("es-CL", { maximumFractionDigits: 1 })}% se reconoce como ingreso y no integra la base de overhead` : "Referencial; sin descuentos y sin reconocimiento como ingreso");
    if (budget.program.type === "MAGISTER_PROFESIONAL") {
      pushCurrency(section, "Valor hora docencia sincrónica", String(year), annual.synchronousTeachingHourValue, "Valor hora único visible para la modalidad profesional");
    } else {
      pushCurrency(section, "Valor hora docencia presencial", String(year), annual.directTeachingHourValue);
    }
    pushCurrency(section, "Valor hora docencia de reemplazo", String(year), parameters.replacementHour, "Parámetro institucional general");
    pushCurrency(section, "Guía de tesis por estudiante en graduación", String(year), annual.thesisGuidancePerGraduatingStudent);
    if (budget.scholarshipsEnabled) {
      pushCurrency(section, "Beca de manutención mensual", String(year), annual.maintenanceScholarshipMonthlyValue);
    }
    pushPercent(section, "Incobrabilidad", String(year), effectiveBadDebtRate(budget, parameters), "Porcentaje editable de esta formulación; aplicado al arancel después de descuentos y beca de arancel");

    pushCurrency(section, "Dirección anual base", String(year), annual.annualDirection);
    pushText(section, "Dirección prorrateada", String(year), yesNo(annual.directionProrated));
    pushPercent(section, "Porcentaje aplicado a dirección", String(year), annual.directionAllocationRate);
    pushCurrency(section, "Dirección aplicada al presupuesto", String(year), annual.annualDirection * (annual.directionProrated ? annual.directionAllocationRate : 1));

    pushCurrency(section, "Asistencia de dirección anual base", String(year), annual.annualAssistance);
    pushText(section, "Asistencia de dirección prorrateada", String(year), yesNo(annual.assistanceProrated));
    pushPercent(section, "Porcentaje aplicado a asistencia", String(year), annual.assistanceAllocationRate);
    pushCurrency(section, "Asistencia aplicada al presupuesto", String(year), annual.annualAssistance * (annual.assistanceProrated ? annual.assistanceAllocationRate : 1));

    pushCurrency(section, "Otros honorarios no académicos anuales base", String(year), annual.annualOtherNonAcademicHonoraria);
    pushText(section, "Otros honorarios no académicos prorrateados", String(year), yesNo(annual.otherNonAcademicProrated));
    pushPercent(section, "Porcentaje aplicado a otros honorarios no académicos", String(year), annual.otherNonAcademicAllocationRate);
    pushCurrency(section, "Otros honorarios no académicos aplicados", String(year), annual.annualOtherNonAcademicHonoraria * (annual.otherNonAcademicProrated ? annual.otherNonAcademicAllocationRate : 1));

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

  if (budget.program.type === "MAGISTER_PROFESIONAL") {
    const breakEven = calculateBreakEvenEquivalentEnrollments(budget, parameters);
    if (breakEven.minimumEquivalentEnrollments !== null) {
      pushNumber("Punto de equilibrio", "Matrículas equivalentes mínimas", "Horizonte completo", breakEven.minimumEquivalentEnrollments, `Umbral exacto ${breakEven.minimumEquivalentEnrollmentsExact?.toLocaleString("es-CL", { maximumFractionDigits: 4 })}`);
      pushNumber("Punto de equilibrio", "Estudiantes a arancel completo aproximados", "Horizonte completo", breakEven.minimumWholeStudents ?? 0, "Redondeo hacia arriba del umbral equivalente");
      pushNumber("Punto de equilibrio", "Matrículas equivalentes actuales de referencia", "Horizonte completo", breakEven.currentEquivalentEnrollments);
    } else {
      pushText("Punto de equilibrio", "Resultado", "Horizonte completo", "No alcanzado dentro del rango de simulación");
    }
  }

  // Inputs semestrales completos.
  for (const semester of budget.semesters) {
    const period = periodLabel(semester.year, semester.semester);
    const section = "Parámetros semestrales";
    pushNumber(section, "Estudiantes activos", period, semester.activeStudents, "estudiantes");
    pushNumber(section, "Estudiantes en graduación", period, semester.graduatingStudents, "estudiantes");
    pushNumber(section, "Horas docentes presenciales", period, semester.directTeachingHours, "horas");
    if (budget.deliveryModality !== "PRESENCIAL") {
      pushNumber(section, "Horas docentes sincrónicas", period, semester.synchronousTeachingHours, "horas");
      pushNumber(section, "Horas docentes asincrónicas", period, semester.asynchronousTeachingHours, "horas");
    }
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
    pushText(section, "Observaciones del periodo", period, semester.notes?.trim() || "Sin observaciones");
  }

  // Descuentos de arancel: cada registro, vigencia, cantidad y observación.
  if (budget.discounts.length === 0) {
    pushText("Descuentos de arancel", "Descuentos registrados", "General", "Sin descuentos");
  } else {
    budget.discounts.forEach((discount, index) => {
      const label = `Descuento ${index + 1}: ${discount.name}`;
      const period = `${periodLabel(discount.startYear, discount.startSemester)} a ${periodLabel(discount.endYear, discount.endSemester)}`;
      pushPercent(
        "Descuentos de arancel",
        label,
        period,
        discount.percentage,
        appendDetail(`${discount.students} estudiante(s)`, "Aplicado exclusivamente al arancel", discount.note ? `Nota: ${discount.note}` : undefined, discount.originTemplateItemKey ? `Origen plantilla: ${discount.originTemplateItemKey}` : undefined),
      );
    });
  }

  // Ingresos extraordinarios: monto unitario, estudiantes, fuente y notas.
  if (budget.externalIncome.length === 0) {
    pushText("Ingresos extraordinarios", "Ingresos registrados", "General", "Sin ingresos extraordinarios");
  } else {
    budget.externalIncome.forEach((income, index) => {
      const fixedInstitutional = income.type === "Financiamiento institucional";
      pushCurrency(
        fixedInstitutional ? "Financiamiento institucional" : "Ingresos extraordinarios",
        `${index + 1}. ${income.description || income.type}`,
        fixedInstitutional ? String(income.year) : periodLabel(income.year, income.semester),
        income.amountPerStudent,
        fixedInstitutional
          ? appendDetail("Monto fijo del proyecto/programa", "No depende de estudiantes ni semestre", `Fuente: ${income.source || "No informada"}`, income.note ? `Nota: ${income.note}` : undefined)
          : appendDetail(`${income.students} estudiante(s)`, income.type, `Fuente: ${income.source || "No informada"}`, income.note ? `Nota: ${income.note}` : undefined, income.originTemplateItemKey ? `Origen plantilla: ${income.originTemplateItemKey}` : undefined),
      );
    });
  }

  if ((budget.sharedCourses ?? []).length) {
    budget.sharedCourses.forEach((rule, index) => {
      pushNumber("Economías de escala", `${index + 1}. ${rule.courseName}`, periodLabel(rule.year, rule.semester), rule.hours, appendDetail(rule.teachingMode, `${rule.participantProgramIds.length} programas participantes`, `Imputación ${(rule.allocationRate * 100).toLocaleString("es-CL", { maximumFractionDigits: 1 })}%`, rule.note));
    });
  }

  // Cada costo/gasto manual queda individualizado. La hoja Excel no resume ni oculta registros en cero.
  if (budget.manualItems.length === 0) {
    pushText("Costos y gastos registrados", "Costos manuales", "General", "Sin costos manuales");
  } else {
    budget.manualItems.forEach((item, index) => {
      pushCurrency(
        "Costos y gastos registrados",
        `${index + 1}. ${item.name}`,
        periodLabel(item.year, item.semester),
        item.amount,
        appendDetail(
          item.category,
          item.periodicity,
          item.costType,
          item.description ? `Descripción: ${item.description}` : undefined,
          item.note ? `Nota: ${item.note}` : undefined,
          item.originTemplateItemKey ? `Origen plantilla: ${item.originTemplateItemKey}` : undefined,
        ),
      );
    });
  }

  return {
    title: `Parámetros completos · ${budget.program.code} · ${budget.cohortName}`,
    subtitle: `Versión programa ${budget.programVersionLabel} · Revisión interna R${budget.version} · fotografía completa de los parámetros efectivos usados en el cálculo`,
    rows,
    generatedAt: new Date().toISOString(),
  };
}

const PDF_IDENTIFICATION_PARAMETERS = new Set([
  "Programa",
  "Cohorte",
  "Duración presupuestada",
  "Estudiantes iniciales",
  "Versión del programa / plan",
  "Modalidad",
]);

const PDF_PRIMARY_PARAMETERS = new Set([
  "Arancel anual por estudiante",
  "Matrícula anual por estudiante",
  "Valor hora docencia presencial",
  "Valor hora docencia sincrónica",
  "Valor hora docencia asincrónica",
  "Valor hora docencia de reemplazo",
  "Beca de manutención mensual",
  "Guía de tesis por estudiante en graduación",
  "Incobrabilidad",
  "Dirección aplicada al presupuesto",
  "Asistencia aplicada al presupuesto",
  "Otros honorarios no académicos aplicados",
  "Overhead central",
  "Overhead facultad",
]);

function hasActualText(value: string): boolean {
  const clean = value.trim();
  if (!clean) return false;
  const uninformative = new Set([
    "No",
    "No informado",
    "No informada",
    "Sin plantilla",
    "Sin descuentos",
    "Sin ingresos extraordinarios",
    "Sin costos manuales",
    "Sin observaciones",
  ]);
  return !uninformative.has(clean);
}

function rowHasMeaningfulInformation(row: ParameterReportRow): boolean {
  // El PDF es un informe ejecutivo: sólo conserva identificación esencial y parámetros
  // económicos principales. La trazabilidad completa sigue disponible en XLSX.
  if (row.section === "Identificación") {
    return PDF_IDENTIFICATION_PARAMETERS.has(row.parameter)
      && (typeof row.value === "number" || hasActualText(row.value));
  }

  if (row.section === "Parámetros institucionales generales") return false;

  if (row.section === "Parámetros anuales") {
    if (!PDF_PRIMARY_PARAMETERS.has(row.parameter)) return false;
    if (typeof row.value === "number") {
      const optionalWhenZero = new Set(["Beca de manutención mensual", "Guía de tesis por estudiante en graduación", "Otros honorarios no académicos aplicados"]);
      return Number.isFinite(row.value) && (!optionalWhenZero.has(row.parameter) || Math.abs(row.value) > 0.000001);
    }
    return hasActualText(row.value);
  }

  // Los descuentos concretos son un supuesto central del ingreso y se conservan sólo
  // cuando existen. No se repiten cargas semestrales, punto de equilibrio ni costos
  // manuales porque ya están explicados en el relato y en el flujo.
  if (row.section === "Descuentos de arancel") {
    if (typeof row.value === "number") return Math.abs(row.value) > 0.000001;
    return hasActualText(row.value);
  }

  return false;
}

/**
 * Anexo ejecutivo para PDF. Mantiene exclusivamente los parámetros principales;
 * el XLSX continúa utilizando buildParameterReport() y conserva el detalle completo.
 */
export function compactParameterReportForPdf(report: ParameterReport): ParameterReport {
  return {
    ...report,
    title: report.title.replace("Parámetros completos", "Parámetros principales utilizados"),
    subtitle: "Supuestos económicos esenciales utilizados en la formulación",
    rows: report.rows.filter(rowHasMeaningfulInformation),
  };
}
