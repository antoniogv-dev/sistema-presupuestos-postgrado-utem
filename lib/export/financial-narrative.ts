import { formatCLP, formatPercent } from "../calculations/currency";
import { calculateBudget, effectiveBadDebtRate, resolvedAnnualOverrideForYear } from "../calculations/budget-engine";
import type { BudgetResult, CohortBudget, InstitutionalParameters } from "../calculations/types";

export interface NarrativeSection { heading: string; paragraphs: string[]; }
export interface NarrativeTable { title: string; headers: string[]; rows: string[][]; }
export interface FinancialNarrative { title: string; sections: NarrativeSection[]; comparisonTable?: NarrativeTable; }

export interface CohortEconomicSnapshot {
  label: string;
  startYear: number;
  startSemester: 1 | 2;
  initialStudents: number;
  activeStudents: number;
  grossTuition: number;
  discountsAndScholarships: number;
  badDebt: number;
  netIncome: number;
  incomePerStudent: number | null;
  totalExpenses: number;
  costPerStudent: number | null;
  economicResult: number;
  resultPerStudent: number | null;
  margin: number | null;
}

const money = (value: number) => formatCLP(Math.round(value));
const pct = (value: number) => formatPercent(value);
const qty = (value: number, decimals = 1) => value.toLocaleString("es-CL", { maximumFractionDigits: decimals });
const sum = (values: number[]) => values.reduce((total, value) => total + value, 0);

function safePerStudent(value: number, students: number): number | null {
  return students > 0 ? value / students : null;
}
function moneyOrNA(value: number | null): string { return value == null ? "No informado" : money(value); }
function pctOrNA(value: number | null): string { return value == null ? "No comparable" : pct(value); }
function periodRank(year: number, semester: 1 | 2): number { return year * 2 + semester; }
function variation(current: number, previous: number): number | null { return Math.abs(previous) < 0.000001 ? null : (current - previous) / Math.abs(previous); }
function variationText(current: number, previous: number): string {
  const value = variation(current, previous);
  if (value == null) return "no es comparable por tener una base anterior igual a cero";
  const sign = value > 0 ? "+" : "";
  return `${sign}${pct(value)}`;
}

export function cohortEconomicSnapshot(budget: CohortBudget, result: BudgetResult): CohortEconomicSnapshot {
  const initialStudents = Math.max(0, budget.initialStudents);
  const activeStudents = Math.max(0, budget.semesters.at(-1)?.activeStudents ?? initialStudents);
  const grossTuition = sum(result.annualFlows.map((flow) => flow.grossTuition));
  const discountsAndScholarships = sum(result.annualFlows.map((flow) => flow.discounts + flow.internalTuitionScholarships));
  const badDebt = sum(result.annualFlows.map((flow) => flow.badDebt));
  const netIncome = sum(result.annualFlows.map((flow) => flow.totalIncome));
  const totalExpenses = sum(result.annualFlows.map((flow) => flow.totalExpenses));
  const economicResult = netIncome - totalExpenses;
  return {
    label: `Cohorte ${budget.startYear}-${budget.startSemester}S`,
    startYear: budget.startYear,
    startSemester: budget.startSemester,
    initialStudents,
    activeStudents,
    grossTuition,
    discountsAndScholarships,
    badDebt,
    netIncome,
    incomePerStudent: safePerStudent(netIncome, initialStudents),
    totalExpenses,
    costPerStudent: safePerStudent(totalExpenses, initialStudents),
    economicResult,
    resultPerStudent: safePerStudent(economicResult, initialStudents),
    margin: Math.abs(netIncome) > 0.000001 ? economicResult / netIncome : null,
  };
}

/**
 * Serie histórica para el PDF. Se comparan sólo cohortes anteriores aprobadas
 * del mismo programa y se conserva una única revisión por cohorte.
 */
export function buildHistoricalCohortSnapshots(
  currentBudget: CohortBudget,
  allBudgets: CohortBudget[],
  parameters: InstitutionalParameters,
  maxPrevious = 4,
): CohortEconomicSnapshot[] {
  const currentRank = periodRank(currentBudget.startYear, currentBudget.startSemester);
  const approved = allBudgets.filter((candidate) =>
    candidate.id !== currentBudget.id
    && candidate.program.id === currentBudget.program.id
    && candidate.status === "Aprobado"
    && !candidate.deletedAt
    && periodRank(candidate.startYear, candidate.startSemester) < currentRank,
  );
  const byCohort = new Map<string, CohortBudget>();
  for (const candidate of approved) {
    const key = `${candidate.startYear}-${candidate.startSemester}`;
    const prior = byCohort.get(key);
    if (!prior || candidate.version > prior.version || (candidate.version === prior.version && (candidate.updatedAt ?? candidate.createdAt) > (prior.updatedAt ?? prior.createdAt))) {
      byCohort.set(key, candidate);
    }
  }
  return [...byCohort.values()]
    .sort((a, b) => periodRank(b.startYear, b.startSemester) - periodRank(a.startYear, a.startSemester))
    .slice(0, Math.max(0, maxPrevious))
    .sort((a, b) => periodRank(a.startYear, a.startSemester) - periodRank(b.startYear, b.startSemester))
    .map((budget) => cohortEconomicSnapshot(budget, calculateBudget(budget, parameters)));
}

function annualIncomeDetail(budget: CohortBudget, result: BudgetResult, parameters: InstitutionalParameters): string {
  return result.annualFlows.map((flow) => {
    const annual = resolvedAnnualOverrideForYear(budget, parameters, flow.year);
    const tuitionBasis = budget.tuitionPricingMode === "PROGRAM_TOTAL"
      ? `participación ${(flow.tuitionDistributionShare * 100).toLocaleString("es-CL", { maximumFractionDigits: 2 })}% del arancel total de ${money(budget.programTotalTuition ?? 0)}`
      : `arancel ${money(annual.annualTuition)} por estudiante`;
    return `${flow.year}: ${tuitionBasis}, arancel bruto ${money(flow.grossTuition)}, descuentos y becas ${money(flow.discounts + flow.internalTuitionScholarships)}, incobrabilidad ${money(flow.badDebt)} e ingresos netos ${money(flow.totalIncome)}`;
  }).join("; ");
}

function costGroups(result: BudgetResult) {
  const teaching = sum(result.annualFlows.map((flow) => flow.directTeachingCost + flow.replacementTeachingCost));
  const academic = sum(result.annualFlows.map((flow) => flow.thesisGuidanceCost));
  const administrative = sum(result.annualFlows.map((flow) => flow.nonAcademicHonoraria));
  const marketing = sum(result.annualFlows.map((flow) => flow.diffusion));
  const total = sum(result.annualFlows.map((flow) => flow.totalExpenses));
  const other = Math.max(0, total - teaching - academic - administrative - marketing);
  return { teaching, academic, administrative, marketing, other, total };
}

function comparisonTable(history: CohortEconomicSnapshot[], current: CohortEconomicSnapshot): NarrativeTable | undefined {
  if (!history.length) return undefined;
  const series = [...history, current].slice(-5);
  return {
    title: "Evolución de los principales indicadores",
    headers: ["Indicador", ...series.map((item) => item.label.replace("Cohorte ", ""))],
    rows: [
      ["Matriculados", ...series.map((item) => qty(item.initialStudents, 0))],
      ["Ingresos netos", ...series.map((item) => money(item.netIncome))],
      ["Ingreso por alumno", ...series.map((item) => moneyOrNA(item.incomePerStudent))],
      ["Costos totales", ...series.map((item) => money(item.totalExpenses))],
      ["Costo por alumno", ...series.map((item) => moneyOrNA(item.costPerStudent))],
      ["Resultado económico", ...series.map((item) => money(item.economicResult))],
      ["Margen económico %", ...series.map((item) => pctOrNA(item.margin))],
      ["Becas y descuentos", ...series.map((item) => money(item.discountsAndScholarships))],
    ],
  };
}

export function buildFinancialNarrative(
  budget: CohortBudget,
  result: BudgetResult,
  parameters: InstitutionalParameters,
  history: CohortEconomicSnapshot[] = [],
): FinancialNarrative {
  const current = cohortEconomicSnapshot(budget, result);
  const lastPeriod = result.periods.at(-1);
  const periodText = lastPeriod ? `${budget.startYear}-${budget.startSemester}S a ${lastPeriod.year}-${lastPeriod.semester}S` : `${budget.startYear}-${budget.startSemester}S`;
  const enrollmentGross = sum(result.annualFlows.map((flow) => flow.grossEnrollmentFee));
  const enrollmentRecognized = sum(result.annualFlows.map((flow) => flow.recognizedEnrollmentFee));
  const institutionalFinancing = sum(result.annualFlows.map((flow) => flow.institutionalFinancing));
  const badDebtRate = effectiveBadDebtRate(budget, parameters);
  const externalIncome = sum(result.annualFlows.map((flow) => flow.externalIncome + flow.otherIncome));
  const groups = costGroups(result);
  const previous = history.at(-1);

  const pricingContext = budget.tuitionPricingMode === "PROGRAM_TOTAL"
    ? `El precio académico se define como un arancel total del programa de ${money(budget.programTotalTuition ?? 0)}, distribuido presupuestariamente entre los semestres sin alterar dicho precio.`
    : "La formulación conserva la estructura histórica de arancel anual.";
  const antecedents = `La cohorte analizada corresponde a ${budget.program.name}, versión ${budget.programVersionLabel}, con inicio ${budget.startYear}-${budget.startSemester}S y una duración presupuestada de ${budget.durationSemesters} semestres (${periodText}). ${pricingContext} La formulación considera ${current.initialStudents} estudiante(s) inicialmente matriculados o proyectados y ${current.activeStudents} estudiante(s) vigentes en el último semestre presupuestado. El valor bruto de matrícula asciende a ${money(enrollmentGross)} durante el horizonte. Conforme al porcentaje de reconocimiento definido en la formulación, ${money(enrollmentRecognized)} se incorpora como ingreso del programa. Este ingreso no forma parte de la base de overhead.`;

  const income = `Los ingresos brutos por aranceles alcanzan ${money(current.grossTuition)} para el ciclo completo. Sobre dicho monto se aplican becas y descuentos por ${money(current.discountsAndScholarships)} e incobrabilidad por ${money(current.badDebt)} (${formatPercent(badDebtRate)} aplicado en esta formulación). La matrícula reconocida aporta ${money(enrollmentRecognized)} a los ingresos del programa. Los ingresos extraordinarios calculados por estudiante u otras bases ascienden a ${money(externalIncome)}, mientras que el financiamiento institucional fijo registrado para el proyecto/programa alcanza ${money(institutionalFinancing)}. Como resultado, los ingresos netos presupuestados totalizan ${money(current.netIncome)}, equivalentes a ${moneyOrNA(current.incomePerStudent)} por estudiante inicial. El overhead se mantiene calculado exclusivamente sobre el arancel neto sujeto a cobro, sin incorporar matrícula reconocida ni financiamiento institucional. El detalle anual es: ${annualIncomeDetail(budget, result, parameters)}.`;

  const costs = `Los costos totales del programa ascienden a ${money(groups.total)}, equivalentes a ${moneyOrNA(current.costPerStudent)} por estudiante inicial. De este total, ${money(groups.teaching)} corresponden a costos docentes, ${money(groups.academic)} a costos académicos asociados a guía o revisión de tesis, ${money(groups.administrative)} a costos administrativos y honorarios no académicos, y ${money(groups.marketing)} a difusión o captación. Los restantes ${money(groups.other)} corresponden a otros costos del modelo, incluyendo según corresponda gastos operacionales, becas y ayudas, equipamiento, overhead y otras partidas registradas.`;

  const resultText = `La relación entre ingresos y costos determina un resultado económico de ${money(current.economicResult)} para la cohorte, equivalente a ${moneyOrNA(current.resultPerStudent)} por estudiante inicial. El margen económico asociado es ${pctOrNA(current.margin)}. Por año, el flujo se distribuye de la siguiente forma: ${result.annualFlows.map((flow) => `${flow.year}: ingresos ${money(flow.totalIncome)}, costos ${money(flow.totalExpenses)} y resultado ${money(flow.netFlow)}`).join("; ")}. El saldo final acumulado del horizonte es ${money(result.finalAccumulatedFlow)}.`;

  let comparison: string;
  let variations: string;
  if (previous) {
    comparison = `La cohorte actual registra ${current.initialStudents} estudiante(s), frente a ${previous.initialStudents} en ${previous.label.toLowerCase()}. Los ingresos netos alcanzan ${money(current.netIncome)}, comparados con ${money(previous.netIncome)}; el ingreso promedio por alumno pasa de ${moneyOrNA(previous.incomePerStudent)} a ${moneyOrNA(current.incomePerStudent)}. Los costos totales pasan de ${money(previous.totalExpenses)} a ${money(current.totalExpenses)}, mientras que el resultado económico cambia de ${money(previous.economicResult)} a ${money(current.economicResult)} y el margen económico de ${pctOrNA(previous.margin)} a ${pctOrNA(current.margin)}.`;
    variations = `Respecto de ${previous.label.toLowerCase()}, la matrícula varía en ${variationText(current.initialStudents, previous.initialStudents)}, los ingresos netos en ${variationText(current.netIncome, previous.netIncome)} y los costos totales en ${variationText(current.totalExpenses, previous.totalExpenses)}. El ingreso por alumno cambia de ${moneyOrNA(previous.incomePerStudent)} a ${moneyOrNA(current.incomePerStudent)}, el costo por alumno de ${moneyOrNA(previous.costPerStudent)} a ${moneyOrNA(current.costPerStudent)}, y el resultado económico de ${money(previous.economicResult)} a ${money(current.economicResult)}. Las becas y descuentos pasan de ${money(previous.discountsAndScholarships)} a ${money(current.discountsAndScholarships)}.`;
  } else {
    comparison = "No existen cohortes anteriores aprobadas del mismo programa disponibles en D1 para efectuar una comparación histórica homogénea. Por esta razón, el análisis se limita a la cohorte actualmente formulada.";
    variations = "Al no existir una cohorte anterior aprobada comparable, no se calculan variaciones intercohorte. Esta sección se completará automáticamente cuando el sistema disponga de una serie histórica aprobada del programa.";
  }

  const evolution = history.length
    ? `La serie histórica disponible incorpora ${history.length} cohorte(s) anterior(es) aprobada(s) del mismo programa, más la cohorte actual. La tabla siguiente resume matriculados, ingresos netos, ingresos y costos por alumno, costos totales, resultado económico, margen y becas o descuentos para un máximo de cinco cohortes.`
    : "No se genera tabla histórica porque no existen cohortes anteriores aprobadas comparables del mismo programa.";

  return {
    title: "Análisis económico-financiero de la cohorte",
    sections: [
      { heading: "1. Antecedentes de la cohorte", paragraphs: [antecedents] },
      { heading: "2. Ingresos de la cohorte", paragraphs: [income] },
      { heading: "3. Costos del programa", paragraphs: [costs] },
      { heading: "4. Resultado económico", paragraphs: [resultText] },
      { heading: "5. Comparación con cohortes anteriores", paragraphs: [comparison] },
      { heading: "6. Evolución de los principales indicadores", paragraphs: [evolution] },
      { heading: "7. Variaciones entre cohortes", paragraphs: [variations] },
    ],
    comparisonTable: comparisonTable(history, current),
  };
}
