import { getActivePeriods, isPeriodWithinRange } from "../calculations/periods";
import { hydrateAnnualOverrides } from "../calculations/budget-engine";
import { resolveAnnualTemplateValue } from "./annual-projection";
import type {
  BudgetTemplate,
  CohortBudget,
  CostTemplateConfig,
  DiscountTemplateConfig,
  IncomeTemplateConfig,
  InstitutionalParameters,
  MaintenanceScholarshipTemplateConfig,
  TuitionScholarshipTemplateConfig,
  AnnualParameterTemplateConfig,
} from "../calculations/types";

const clone = <T,>(value: T): T => structuredClone(value);
const nonNegative = (value: unknown): number => Math.max(0, Number.isFinite(Number(value)) ? Number(value) : 0);
const uid = (prefix: string, key: string): string => `${prefix}-${key}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

function canonicalCostCategory(category: CostTemplateConfig["category"]): CostTemplateConfig["category"] {
  const aliases: Partial<Record<string, CostTemplateConfig["category"]>> = {
    "Honorarios académicos": "Otros costos y gastos",
    "Honorarios no académicos": "Otros honorarios no académicos",
    "Asistencia": "Asistencia de dirección",
    "Gastos operacionales": "Gastos operacionales / Bienes y servicios",
    "Bienes y servicios": "Gastos operacionales / Bienes y servicios",
    "Software": "Software y licencias",
    "Congresos": "Congresos y pasantías",
    "Pasantías": "Congresos y pasantías",
    "Otros": "Otros costos y gastos",
    "Equipamientos": "Equipamiento",
    "Equipamiento y bienes de capital": "Equipamiento",
    "Ayudas": "Becas y ayudas",
  };
  return aliases[category] ?? category;
}

function bounds(budget: CohortBudget, periodMode: "TODOS" | "ULTIMO" = "TODOS") {
  const periods = getActivePeriods(budget.startYear, budget.startSemester, budget.durationSemesters);
  const first = periodMode === "ULTIMO" ? periods.at(-1)! : periods[0];
  const last = periods.at(-1)!;
  return { first, last: periodMode === "ULTIMO" ? first : last };
}

function templateStudents(activeStudents: number, mode: "TODOS_ACTIVOS" | "CANTIDAD", configured: number): number {
  return mode === "TODOS_ACTIVOS" ? nonNegative(activeStudents) : nonNegative(configured);
}


function applyAnnualParameter(budget: CohortBudget, config: AnnualParameterTemplateConfig) {
  budget.annualOverrides = budget.annualOverrides.map((annual) => {
    const value = resolveAnnualTemplateValue(config, annual.year);
    if (value <= 0) return annual;
    if (config.parameter === "ARANCEL") return { ...annual, annualTuition: value };
    if (config.parameter === "MATRICULA") return { ...annual, annualEnrollmentFee: value };
    if (config.parameter === "BECA_MANUTENCION") return { ...annual, maintenanceScholarshipMonthlyValue: value };
    if (config.parameter === "DOCENCIA_PRESENCIAL") return { ...annual, directTeachingHourValue: value };
    if (config.parameter === "DOCENCIA_SINCRONICA") return { ...annual, synchronousTeachingHourValue: value };
    if (config.parameter === "DOCENCIA_ASINCRONICA") return { ...annual, asynchronousTeachingHourValue: value };
    if (config.parameter === "GUIA_TESIS") return { ...annual, thesisGuidancePerGraduatingStudent: value };
    if (config.parameter === "DIRECCION") return { ...annual, annualDirection: value };
    if (config.parameter === "ASISTENCIA") return { ...annual, annualAssistance: value };
    return { ...annual, annualOtherNonAcademicHonoraria: value };
  });
}

export function applyBudgetTemplate(
  source: CohortBudget,
  template: BudgetTemplate,
  parameters?: InstitutionalParameters,
): CohortBudget {
  let budget = clone(source);
  // Las plantillas con parámetros anuales deben poder aplicarse incluso a un presupuesto
  // recién creado que todavía no tenga overrides persistidos. Cuando están disponibles
  // los parámetros institucionales, hidratamos todos los años activos antes de aplicar
  // los valores particulares de la plantilla.
  if (parameters && template.items.some((item) => item.active && item.kind === "PARAMETRO_ANUAL")) {
    budget = hydrateAnnualOverrides(budget, parameters);
  }
  budget.discounts = budget.discounts.filter((item) => !item.originTemplateItemKey);
  budget.externalIncome = budget.externalIncome.filter((item) => !item.originTemplateItemKey);
  budget.manualItems = budget.manualItems.filter((item) => !item.originTemplateItemKey);
  budget.semesters = budget.semesters.map((semester) => ({
    ...semester,
    internalTuitionScholarshipStudents: 0,
    internalTuitionScholarshipCoverage: 1,
    maintenanceScholarshipStudents: 0,
    maintenanceScholarshipMonths: 0,
  }));

  if (template.settings?.modality) budget.deliveryModality = template.settings.modality;
  if (template.settings?.sharedCourses?.length) {
    const periods = getActivePeriods(budget.startYear, budget.startSemester, budget.durationSemesters);
    budget.sharedCourses = template.settings.sharedCourses.map((preset) => {
      const period = periods[Math.max(0, Math.min(periods.length - 1, preset.semesterOffset - 1))];
      return { id: uid("shared-course", preset.id), courseName: preset.courseName, year: period.year, semester: period.semester, teachingMode: preset.teachingMode, hours: nonNegative(preset.hours), participantProgramIds: [...new Set([budget.program.id, ...preset.participantProgramIds])], allocationRate: nonNegative(preset.allocationRate), note: preset.note };
    });
  }

  for (const item of template.items.filter((candidate) => candidate.active).sort((a, b) => a.position - b.position)) {
    if (item.kind === "PARAMETRO_ANUAL") {
      applyAnnualParameter(budget, item.config as AnnualParameterTemplateConfig);
    }
    if (item.kind === "DESCUENTO") {
      const config = item.config as DiscountTemplateConfig;
      const period = bounds(budget, config.periodMode);
      budget.discounts.push({
        id: uid("discount", item.key),
        name: item.name,
        percentage: nonNegative(config.percentage),
        students: nonNegative(config.students),
        startYear: period.first.year,
        startSemester: period.first.semester,
        endYear: period.last.year,
        endSemester: period.last.semester,
        note: config.note,
        originTemplateItemKey: item.key,
      });
    }
    if (item.kind === "BECA_ARANCEL") {
      const config = item.config as TuitionScholarshipTemplateConfig;
      const period = bounds(budget, config.periodMode);
      budget.semesters = budget.semesters.map((semester) => isPeriodWithinRange(semester.year, semester.semester, period.first.year, period.first.semester, period.last.year, period.last.semester) ? {
        ...semester,
        internalTuitionScholarshipStudents: templateStudents(semester.activeStudents, config.studentMode, config.students),
        internalTuitionScholarshipCoverage: nonNegative(config.coverage),
      } : semester);
    }
    if (item.kind === "BECA_MANUTENCION") {
      const config = item.config as MaintenanceScholarshipTemplateConfig;
      const period = bounds(budget, config.periodMode);
      budget.semesters = budget.semesters.map((semester) => isPeriodWithinRange(semester.year, semester.semester, period.first.year, period.first.semester, period.last.year, period.last.semester) ? {
        ...semester,
        maintenanceScholarshipStudents: templateStudents(semester.activeStudents, config.studentMode, config.students),
        maintenanceScholarshipMonths: nonNegative(config.months),
      } : semester);
    }
    if (item.kind === "COSTO") {
      const config = item.config as CostTemplateConfig;
      const period = bounds(budget);
      budget.manualItems.push({
        id: uid("cost", item.key),
        name: item.name,
        description: config.description ?? "",
        category: canonicalCostCategory(config.category),
        year: config.year ?? period.first.year,
        semester: config.semester,
        amount: nonNegative(config.amount),
        costType: config.costType,
        periodicity: config.periodicity,
        note: config.note,
        originTemplateItemKey: item.key,
      });
    }
    if (item.kind === "INGRESO_EXTRAORDINARIO") {
      const config = item.config as IncomeTemplateConfig;
      const period = bounds(budget);
      budget.externalIncome.push({
        id: uid("income", item.key),
        type: config.type,
        description: item.name,
        year: config.year ?? period.first.year,
        semester: config.semester ?? period.first.semester,
        students: nonNegative(config.students),
        amountPerStudent: nonNegative(config.amountPerStudent),
        source: config.source,
        note: config.note,
        originTemplateItemKey: item.key,
      });
    }
  }

  if (template.items.some((item) => item.active && (item.kind === "BECA_ARANCEL" || item.kind === "BECA_MANUTENCION"))) {
    budget.scholarshipsEnabled = true;
  }

  budget.appliedTemplateId = template.id;
  budget.appliedTemplateCode = template.code;
  budget.appliedTemplateVersion = template.version;
  budget.updatedAt = new Date().toISOString();
  return budget;
}
