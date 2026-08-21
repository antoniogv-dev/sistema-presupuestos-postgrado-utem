import { formatCLP, formatPercent } from "../calculations/currency";
import { calculateBudget, programTypeParameters, resolvedAnnualOverrideForYear } from "../calculations/budget-engine";
import { calculateBreakEvenEquivalentEnrollments } from "../calculations/break-even";
import type { BudgetResult, CohortBudget, InstitutionalParameters, SemesterParameters } from "../calculations/types";

export interface NarrativeSection { heading: string; paragraphs: string[]; }

/**
 * Tabla auxiliar del relato financiero. Se mantiene intencionalmente simple
 * para que PDF/XLSX puedan renderizarla sin acoplarse a una implementación.
 */
export interface NarrativeTable {
  title: string;
  headers: string[];
  rows: string[][];
  note?: string;
}

/**
 * Fotografía financiera comparable de una cohorte. Los valores pueden ser null
 * cuando sólo se dispone de la identidad histórica y no de un resultado calculado.
 */
export interface HistoricalCohortSnapshot {
  budgetId: string;
  cohortName: string;
  label: string;
  status: string;
  programVersionLabel: string;
  startYear: number;
  startSemester: number;
  initialStudents: number;
  equivalentEnrollments: number | null;
  totalIncome: number | null;
  totalExpenses: number | null;
  finalAccumulatedFlow: number | null;
  operatingMargin: number | null;
}

export interface FinancialNarrative {
  title: string;
  sections: NarrativeSection[];
  comparisonTable?: NarrativeTable;
}


const money = (value: number) => formatCLP(Math.round(value));
const pct = (value: number) => formatPercent(value);
const qty = (value: number, decimals = 2) => value.toLocaleString("es-CL", { maximumFractionDigits: decimals });
const typeLabel = (value: CohortBudget["program"]["type"]) => ({ DOCTORADO: "doctoral", MAGISTER_ACADEMICO: "académico", MAGISTER_PROFESIONAL: "profesional", OTRO: "otro" })[value];
const modalityLabel = (value: CohortBudget["deliveryModality"]) => ({ PRESENCIAL: "presencial", SEMIPRESENCIAL: "semipresencial", E_LEARNING: "e-learning" })[value];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isCohortBudget(value: unknown): value is CohortBudget {
  if (!isRecord(value)) return false;
  return typeof value.id === "string"
    && typeof value.cohortName === "string"
    && typeof value.startYear === "number"
    && isRecord(value.program)
    && typeof value.program.id === "string";
}

function isBudgetResult(value: unknown): value is BudgetResult {
  if (!isRecord(value)) return false;
  return Array.isArray(value.annualFlows)
    && typeof value.finalAccumulatedFlow === "number";
}

function isInstitutionalParameters(value: unknown): value is InstitutionalParameters {
  if (!isRecord(value)) return false;
  return isRecord(value.teachingHour)
    && isRecord(value.annualEnrollmentFee)
    && isRecord(value.byProgramType);
}

function snapshotFromBudget(budget: CohortBudget, result: BudgetResult | null): HistoricalCohortSnapshot {
  const annualFlows = result?.annualFlows ?? [];
  const totalIncome = result ? sum(annualFlows.map((flow) => flow.totalIncome)) : null;
  const totalExpenses = result ? sum(annualFlows.map((flow) => flow.totalExpenses)) : null;
  const equivalentEnrollments = result && annualFlows.length
    ? Math.max(...annualFlows.map((flow) => flow.equivalentEnrollments))
    : null;
  const margins = annualFlows.map((flow) => flow.operatingMargin).filter((value): value is number => value !== null);
  const operatingMargin = margins.length ? margins[margins.length - 1] : null;
  return {
    budgetId: budget.id,
    cohortName: budget.cohortName,
    label: `${budget.cohortName} · Versión ${budget.programVersionLabel}`,
    status: budget.status,
    programVersionLabel: budget.programVersionLabel,
    startYear: budget.startYear,
    startSemester: budget.startSemester,
    initialStudents: budget.initialStudents,
    equivalentEnrollments,
    totalIncome,
    totalExpenses,
    finalAccumulatedFlow: result?.finalAccumulatedFlow ?? null,
    operatingMargin,
  };
}

/**
 * Construye fotografías históricas aceptando distintas formas de entrada usadas
 * por versiones anteriores y posteriores del exportador. Esta firma variádica es
 * deliberada: evita que una actualización parcial rompa el build por diferencias
 * menores entre download.ts/tests y el generador del relato.
 */
export function buildHistoricalCohortSnapshots(...sources: unknown[]): HistoricalCohortSnapshot[] {
  const parameters = sources.find(isInstitutionalParameters) ?? null;
  const explicitResults = new Map<string, BudgetResult>();
  const budgets: CohortBudget[] = [];

  const visit = (value: unknown) => {
    if (Array.isArray(value)) {
      value.forEach(visit);
      return;
    }
    if (!isRecord(value)) return;
    if (isCohortBudget(value)) {
      budgets.push(value);
      return;
    }
    const maybeBudget = value.budget;
    const maybeResult = value.result;
    if (isCohortBudget(maybeBudget)) {
      budgets.push(maybeBudget);
      if (isBudgetResult(maybeResult)) explicitResults.set(maybeBudget.id, maybeResult);
      return;
    }
    const nestedCandidates = [value.budgets, value.cohorts, value.items, value.history, value.snapshots];
    nestedCandidates.forEach((candidate) => { if (candidate !== undefined) visit(candidate); });
  };

  sources.forEach(visit);
  const unique = [...new Map(budgets.map((budget) => [budget.id, budget])).values()];
  return unique
    .map((budget) => {
      const result = explicitResults.get(budget.id)
        ?? (parameters ? calculateBudget(budget, parameters) : null);
      return snapshotFromBudget(budget, result);
    })
    .sort((a, b) => a.startYear - b.startYear || a.startSemester - b.startSemester || a.cohortName.localeCompare(b.cohortName, "es"));
}

function buildHistoricalComparisonTable(snapshots: HistoricalCohortSnapshot[]): NarrativeTable | undefined {
  if (!snapshots.length) return undefined;
  const value = (amount: number | null) => amount === null ? "—" : money(amount);
  const quantity = (amount: number | null) => amount === null ? "—" : qty(amount, 2);
  return {
    title: "Comparación histórica de cohortes",
    headers: ["Cohorte", "Versión", "Estado", "Estudiantes", "Matrículas equivalentes", "Ingresos", "Costos", "Saldo final"],
    rows: snapshots.map((snapshot) => [
      snapshot.cohortName,
      snapshot.programVersionLabel,
      snapshot.status,
      qty(snapshot.initialStudents, 0),
      quantity(snapshot.equivalentEnrollments),
      value(snapshot.totalIncome),
      value(snapshot.totalExpenses),
      value(snapshot.finalAccumulatedFlow),
    ]),
    note: "La comparación utiliza exclusivamente cohortes y resultados disponibles en la plataforma; cuando un resultado histórico no está disponible se informa con —.",
  };
}

function sum(values: number[]) { return values.reduce((total, value) => total + value, 0); }
function annualSemesterHours(semesters: SemesterParameters[], year: number, field: "directTeachingHours" | "synchronousTeachingHours" | "asynchronousTeachingHours" | "replacementTeachingHours") {
  return sum(semesters.filter((semester) => semester.year === year).map((semester) => Number(semester[field] ?? 0)));
}

function materialCosts(result: BudgetResult) {
  const totals = {
    docencia: sum(result.annualFlows.map((flow) => flow.directTeachingCost + flow.replacementTeachingCost)),
    tesis: sum(result.annualFlows.map((flow) => flow.thesisGuidanceCost)),
    direccion: sum(result.annualFlows.map((flow) => flow.direction)),
    asistencia: sum(result.annualFlows.map((flow) => flow.assistance)),
    otrosHonorarios: sum(result.annualFlows.map((flow) => flow.otherNonAcademicHonoraria)),
    operacionales: sum(result.annualFlows.map((flow) => flow.otherExpenses)),
    overheadCentral: sum(result.annualFlows.map((flow) => flow.centralOverhead)),
    overheadFacultad: sum(result.annualFlows.map((flow) => flow.facultyOverhead)),
    becasAyudas: sum(result.annualFlows.map((flow) => flow.scholarshipsAndAid)),
    equipamiento: sum(result.annualFlows.map((flow) => flow.equipment)),
  };
  const total = sum(result.annualFlows.map((flow) => flow.totalExpenses));
  const labels: Array<[keyof typeof totals, string]> = [
    ["docencia", "docencia"], ["tesis", "guía o revisión de tesis"], ["direccion", "Dirección de Programa"],
    ["asistencia", "Asistencia de Dirección"], ["otrosHonorarios", "otros honorarios no académicos"],
    ["operacionales", "otros gastos operacionales"], ["overheadCentral", "overhead central"],
    ["overheadFacultad", "overhead de facultad"], ["becasAyudas", "becas y ayudas"], ["equipamiento", "equipamiento"],
  ];
  return labels
    .filter(([key]) => totals[key] > 0 && (total === 0 || totals[key] / total >= 0.02))
    .map(([key, label]) => `${label}: ${money(totals[key])}`);
}

function teachingNarrative(budget: CohortBudget, result: BudgetResult, parameters: InstitutionalParameters): string {
  const annualParts = result.years.map((year) => {
    const annual = resolvedAnnualOverrideForYear(budget, parameters, year);
    const replacementHours = annualSemesterHours(budget.semesters, year, "replacementTeachingHours");
    if (budget.deliveryModality === "PRESENCIAL") {
      const hours = annualSemesterHours(budget.semesters, year, "directTeachingHours");
      return `${year}: ${qty(hours, 1)} horas presenciales a ${money(annual.directTeachingHourValue)} por hora${replacementHours > 0 ? ` y ${qty(replacementHours, 1)} horas de reemplazo a ${money(parameters.replacementHour)} por hora` : ""}`;
    }
    const synchronous = annualSemesterHours(budget.semesters, year, "synchronousTeachingHours");
    const asynchronous = annualSemesterHours(budget.semesters, year, "asynchronousTeachingHours");
    return `${year}: ${qty(synchronous, 1)} horas sincrónicas a ${money(annual.synchronousTeachingHourValue)} por hora y ${qty(asynchronous, 1)} horas asincrónicas a ${money(annual.asynchronousTeachingHourValue)} por hora${replacementHours > 0 ? `; adicionalmente, ${qty(replacementHours, 1)} horas de reemplazo a ${money(parameters.replacementHour)} por hora` : ""}`;
  });
  return annualParts.join("; ");
}

function scholarshipNarrative(budget: CohortBudget): string {
  if (!budget.scholarshipsEnabled) return "No se encuentran habilitadas becas internas de arancel o manutención para esta cohorte.";
  const tuition = budget.semesters.filter((semester) => semester.internalTuitionScholarshipStudents > 0 && semester.internalTuitionScholarshipCoverage > 0)
    .map((semester) => `${semester.year}-${semester.semester}S: ${semester.internalTuitionScholarshipStudents} estudiante(s) con cobertura de ${pct(semester.internalTuitionScholarshipCoverage)}`);
  const maintenance = budget.semesters.filter((semester) => semester.maintenanceScholarshipStudents > 0 && semester.maintenanceScholarshipMonths > 0)
    .map((semester) => `${semester.year}-${semester.semester}S: ${semester.maintenanceScholarshipStudents} estudiante(s) por ${semester.maintenanceScholarshipMonths} mes(es)`);
  const parts: string[] = [];
  if (tuition.length) parts.push(`Becas internas de arancel: ${tuition.join("; ")}`);
  if (maintenance.length) parts.push(`Becas de manutención: ${maintenance.join("; ")}`);
  return parts.length ? parts.join(". ") + "." : "Las becas internas están habilitadas, pero no existen cantidades efectivamente parametrizadas en los semestres del presupuesto.";
}

function manualMaterialItems(budget: CohortBudget): string[] {
  const total = sum(budget.manualItems.map((item) => Number(item.amount ?? 0)));
  return budget.manualItems
    .filter((item) => item.amount > 0 && (total === 0 || item.amount / total >= 0.05))
    .sort((a, b) => b.amount - a.amount)
    .slice(0, 6)
    .map((item) => `${item.name} (${item.category}): ${money(item.amount)}${item.periodicity !== "Único" ? `, periodicidad ${item.periodicity.toLowerCase()}` : ""}${item.costType === "Compartido con otras cohortes" ? ", costo compartido" : ""}`);
}

function conclusionForProfessional(budget: CohortBudget, result: BudgetResult, totalIncome: number, totalExpenses: number): string {
  const netOperating = totalIncome - totalExpenses;
  const operatingMargin = totalIncome > 0 ? netOperating / totalIncome : null;
  const allYearsDeficit = result.annualFlows.length > 0 && result.annualFlows.every((flow) => flow.netFlow < 0);
  if (result.finalAccumulatedFlow < 0 && allYearsDeficit) {
    return "Desde el punto de vista presupuestario, la propuesta presenta un déficit estructural bajo los supuestos registrados. Para alcanzar equilibrio financiero requiere incrementar los ingresos propios del programa, aumentar la matrícula efectiva o reducir y/o redistribuir costos.";
  }
  if (result.finalAccumulatedFlow < 0) {
    return "Desde el punto de vista presupuestario, la propuesta finaliza con déficit. El equilibrio depende de una recuperación adicional de ingresos, mayor matrícula efectiva o ajustes de costos respecto de los supuestos actualmente registrados.";
  }
  if (operatingMargin !== null && operatingMargin < 0.05) {
    return "Desde el punto de vista presupuestario, la propuesta presenta un equilibrio financiero de bajo margen. Su ejecución es especialmente sensible a variaciones en matrícula, deserción, incobrabilidad, prorrateos o incrementos de costos.";
  }
  if (operatingMargin !== null && operatingMargin < 0.10) {
    return "Desde el punto de vista presupuestario, la propuesta alcanza equilibrio financiero bajo los supuestos señalados, aunque mantiene una holgura acotada frente a variaciones de ingresos o costos.";
  }
  return "Desde el punto de vista presupuestario, la propuesta presenta equilibrio financiero y una holgura positiva bajo los supuestos registrados para la cohorte.";
}

export function buildFinancialNarrative(
  budget: CohortBudget,
  result: BudgetResult,
  parameters: InstitutionalParameters,
  historicalSnapshots: HistoricalCohortSnapshot[] = [],
): FinancialNarrative {
  const last = result.periods.at(-1);
  const periodText = last ? `${budget.startYear}-${budget.startSemester}S a ${last.year}-${last.semester}S` : `${budget.startYear}-${budget.startSemester}S`;
  const totalIncome = sum(result.annualFlows.map((flow) => flow.totalIncome));
  const totalExpenses = sum(result.annualFlows.map((flow) => flow.totalExpenses));
  const totalGrossTuition = sum(result.annualFlows.map((flow) => flow.grossTuition));
  const totalDiscounts = sum(result.annualFlows.map((flow) => flow.discounts + flow.internalTuitionScholarships));
  const totalBadDebt = sum(result.annualFlows.map((flow) => flow.badDebt));
  const totalEnrollment = sum(result.annualFlows.map((flow) => flow.grossEnrollmentFee));
  const scoped = programTypeParameters(parameters, budget.program.type);
  const breakEven = budget.program.type === "MAGISTER_PROFESIONAL" ? calculateBreakEvenEquivalentEnrollments(budget, parameters) : null;

  const identification = `El presupuesto corresponde al programa ${budget.program.name}, versión ${budget.programVersionLabel}, cohorte ${budget.cohortName}, de carácter ${typeLabel(budget.program.type)}${budget.program.type === "MAGISTER_PROFESIONAL" ? ` y modalidad ${modalityLabel(budget.deliveryModality)}` : ""}. El horizonte presupuestado se extiende entre ${periodText}, con una duración de ${budget.durationSemesters} semestres y una matrícula inicial o proyectada de ${budget.initialStudents} estudiante(s). El documento corresponde a la revisión interna R${budget.version} y su estado registrado es ${budget.status}. La matrícula anual se presenta como antecedente informativo y no integra los ingresos presupuestarios totales del modelo.`;

  const yearIncome = result.annualFlows.map((flow) => {
    const annual = resolvedAnnualOverrideForYear(budget, parameters, flow.year);
    return `${flow.year}: arancel anual de ${money(annual.annualTuition)} por estudiante, arancel bruto ${money(flow.grossTuition)}, descuentos y becas de arancel ${money(flow.discounts + flow.internalTuitionScholarships)}, base sujeta a cobro ${money(flow.tuitionAfterBenefits)}, incobrabilidad ${money(flow.badDebt)} e ingresos presupuestarios efectivos ${money(flow.totalIncome)}`;
  }).join("; ");
  const discountDetail = budget.discounts.filter((discount) => discount.percentage > 0 && discount.students > 0)
    .map((discount) => `${discount.name}: ${pct(discount.percentage)} para ${discount.students} estudiante(s), vigente desde ${discount.startYear}-${discount.startSemester}S hasta ${discount.endYear}-${discount.endSemester}S`).join("; ");
  const equivalent = result.annualFlows.map((flow) => `${flow.year}: ${qty(flow.equivalentEnrollments)}`).join("; ");
  const incomeParagraph = `La secuencia de cálculo de ingresos es: arancel bruto -> descuentos o becas de arancel -> ingreso sujeto a cobro -> incobrabilidad -> ingreso presupuestario efectivo. En el conjunto del período, el arancel bruto alcanza ${money(totalGrossTuition)}, los descuentos y becas de arancel totalizan ${money(totalDiscounts)} y la incobrabilidad asciende a ${money(totalBadDebt)}, equivalente a la tasa parametrizada de ${pct(scoped.badDebtRate)} sobre la base definida por el modelo. ${discountDetail ? `Los descuentos registrados son: ${discountDetail}. ` : "No se registran descuentos de arancel con porcentaje y estudiantes positivos. "}${scholarshipNarrative(budget)} Los estudiantes equivalentes a arancel completo son ${equivalent}. El valor bruto de matrículas informado asciende a ${money(totalEnrollment)}, pero no se suma a los ingresos totales. Detalle anual: ${yearIncome}.`;

  const teaching = teachingNarrative(budget, result, parameters);
  const costs = materialCosts(result);
  const manualItems = manualMaterialItems(budget);
  const scale = (budget.sharedCourses ?? []).filter((rule) => rule.hours > 0 && new Set(rule.participantProgramIds).size >= 2);
  const scaleSavings = sum(result.annualFlows.map((flow) => flow.sharedCourseSavings));
  const thesisDetail = result.years.map((year) => {
    const annual = resolvedAnnualOverrideForYear(budget, parameters, year);
    const flow = result.annualFlows.find((candidate) => candidate.year === year);
    return flow && flow.thesisGuidanceCost > 0 ? `${year}: ${flow.graduatingStudents} estudiante(s) en graduación a ${money(annual.thesisGuidancePerGraduatingStudent)} por guía` : null;
  }).filter(Boolean).join("; ");
  const costParagraph = `Los costos y gastos presupuestados totalizan ${money(totalExpenses)}. En docencia se consideran ${teaching}. ${thesisDetail ? `La guía de tesis se determina de la siguiente forma: ${thesisDetail}. ` : ""}Las partidas de mayor incidencia o materialidad son ${costs.length ? costs.join("; ") : "las registradas en el cuadro financiero"}.${manualItems.length ? ` Entre los costos manuales de mayor magnitud se encuentran: ${manualItems.join("; ")}.` : ""} ${scale.length ? `Se registran ${scale.length} regla(s) de economía de escala por asignaturas compartidas entre dos o más programas, con un ahorro docente total imputado de ${money(scaleSavings)}. Las reglas consideradas son: ${scale.map((rule) => `${rule.courseName}, ${rule.year}-${rule.semester}S, ${qty(rule.hours, 1)} horas, ${rule.participantProgramIds.length} programas y ${pct(rule.allocationRate)} imputado a esta cohorte`).join("; ")}.` : "No se registran economías de escala activas por asignaturas compartidas."}`;

  const prorations: string[] = [];
  for (const flow of result.annualFlows) {
    const annual = resolvedAnnualOverrideForYear(budget, parameters, flow.year);
    if (annual.directionProrated) prorations.push(`${flow.year}: Dirección, valor anual base ${money(annual.annualDirection)}, porcentaje aplicado ${pct(annual.directionAllocationRate)} y monto imputado ${money(annual.annualDirection * annual.directionAllocationRate)}; causa: costo distribuido con otras cohortes o versiones activas`);
    if (annual.assistanceProrated) prorations.push(`${flow.year}: Asistencia de Dirección, valor anual base ${money(annual.annualAssistance)}, porcentaje aplicado ${pct(annual.assistanceAllocationRate)} y monto imputado ${money(annual.annualAssistance * annual.assistanceAllocationRate)}; causa: costo distribuido con otras cohortes o versiones activas`);
    if (annual.otherNonAcademicProrated) prorations.push(`${flow.year}: otros honorarios no académicos, valor anual base ${money(annual.annualOtherNonAcademicHonoraria)}, porcentaje aplicado ${pct(annual.otherNonAcademicAllocationRate)} y monto imputado ${money(annual.annualOtherNonAcademicHonoraria * annual.otherNonAcademicAllocationRate)}; causa: costo distribuido con otras cohortes o versiones activas`);
  }
  const sharedManual = budget.manualItems.filter((item) => item.costType === "Compartido con otras cohortes" && item.amount > 0).map((item) => `${item.name}: ${money(item.amount)}`);
  const prorationParagraph = prorations.length || sharedManual.length
    ? `${prorations.length ? `El presupuesto incorpora los siguientes prorrateos: ${prorations.join("; ")}. ` : ""}${sharedManual.length ? `Además, se identifican como costos compartidos: ${sharedManual.join("; ")}. ` : ""}La materialización de estos ajustes depende de que las condiciones de simultaneidad o distribución de costos utilizadas se mantengan durante la ejecución.`
    : "El presupuesto no registra prorrateos activos de Dirección, Asistencia de Dirección u otros honorarios no académicos, ni costos manuales marcados como compartidos.";

  const yearlyResult = result.annualFlows.map((flow) => `${flow.year}: ingresos ${money(flow.totalIncome)}, costos y gastos ${money(flow.totalExpenses)}, flujo neto ${money(flow.netFlow)}, arrastre ${money(flow.startingCarryover)} y saldo acumulado ${money(flow.accumulatedFlow)}${flow.operatingMargin == null ? "" : `, con rendimiento operacional de ${pct(flow.operatingMargin)}`}`).join("; ");
  let evolution: string;
  if (result.annualFlows.some((flow) => flow.netFlow < 0) && result.finalAccumulatedFlow >= 0) evolution = "El flujo presenta uno o más períodos deficitarios que son recuperados posteriormente dentro del horizonte presupuestado.";
  else if (result.finalAccumulatedFlow < 0) evolution = "El horizonte presupuestado finaliza con saldo acumulado negativo.";
  else evolution = "El horizonte presupuestado finaliza con saldo acumulado positivo.";
  const breakEvenText = breakEven?.minimumEquivalentEnrollments !== null && breakEven?.minimumEquivalentEnrollments !== undefined
    ? ` Para mantener un saldo final no negativo, el punto de equilibrio estimado es de ${qty(breakEven.minimumEquivalentEnrollments, 2)} matrículas equivalentes a arancel completo, equivalente aproximadamente a ${breakEven.minimumWholeStudents} estudiante(s).`
    : breakEven ? " Con la estructura actual no se identifica un punto de equilibrio dentro del rango de simulación de matrículas equivalentes." : "";
  const resultParagraph = `La evolución financiera anual es la siguiente: ${yearlyResult}. ${evolution}${breakEvenText}`;

  const conclusion = budget.program.type === "MAGISTER_PROFESIONAL"
    ? conclusionForProfessional(budget, result, totalIncome, totalExpenses)
    : result.finalAccumulatedFlow < 0
      ? "El presupuesto presenta un déficit al término del horizonte analizado. En un programa académico o doctoral, esta situación refleja una necesidad de financiamiento complementario para su ejecución; con los antecedentes presupuestarios disponibles no corresponde atribuir automáticamente una fuente institucional específica ni calificar el programa como inviable."
      : "El presupuesto presenta saldo acumulado no negativo al término del horizonte analizado. Esta conclusión es estrictamente financiera y no constituye un acto administrativo de aprobación.";
  const risks = `Las principales condiciones de sensibilidad son la matrícula efectiva respecto de los ${budget.initialStudents} estudiante(s) considerados, la materialización de descuentos y becas, una incobrabilidad distinta de ${pct(scoped.badDebtRate)}, variaciones en valores hora o costos y, cuando existan, la continuidad de los prorrateos y economías de escala utilizados.${result.warnings.length ? ` El motor presupuestario registra además las siguientes advertencias para revisión: ${result.warnings.join("; ")}.` : ""} Toda cifra mencionada en este análisis se origina en el flujo presupuestario o en los parámetros registrados para la cohorte.`;

  return {
    title: "Análisis financiero y principales consideraciones",
    comparisonTable: buildHistoricalComparisonTable(historicalSnapshots),
    sections: [
      { heading: "Identificación y contexto", paragraphs: [identification] },
      { heading: "Parámetros de ingresos e incobrabilidad", paragraphs: [incomeParagraph] },
      { heading: "Costos principales", paragraphs: [costParagraph] },
      { heading: "Prorrateos y ajustes", paragraphs: [prorationParagraph] },
      { heading: "Resultado financiero", paragraphs: [resultParagraph] },
      { heading: "Conclusión financiera", paragraphs: [conclusion, risks] },
    ],
  };
}
