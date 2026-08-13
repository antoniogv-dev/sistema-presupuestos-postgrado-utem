"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { StatusBadge } from "@/components/StatusBadge";
import { calculateBudget, defaultAnnualOverrideForYear, hydrateAnnualOverrides, manualItemAmountForYear, overheadApplies, programTypeParameters, resolvedAnnualOverrideForYear, tuitionForProgramYear } from "@/lib/calculations/budget-engine";
import { detectPotentialDuplicateCosts } from "@/lib/calculations/consolidation";
import { formatCLP, formatPercent } from "@/lib/calculations/currency";
import { getActivePeriods, getActiveYears } from "@/lib/calculations/periods";
import type {
  AccessRole,
  BudgetAnnualOverride,
  BudgetItem,
  BudgetTemplate,
  CohortBudget,
  ExternalIncome,
  InstitutionalParameters,
  Program,
  SemesterParameters,
  TuitionSource,
} from "@/lib/calculations/types";
import { institutionalParameters as fallbackParameters } from "@/lib/demo-data";
import { downloadBudgetPdf, downloadBudgetXlsx } from "@/lib/export/download";
import type { ApiBudgetRecord, ApiIdentity, ApiProgram } from "@/lib/mappers/budget-api";
import { numberValue, responseBody, toBudget, toProgram } from "@/lib/mappers/budget-api";
import { tuitionSourceLabel } from "@/lib/programs/tuition-source";
import { applyBudgetTemplate } from "@/lib/templates/apply-template";
import { defaultBudgetTemplates } from "@/lib/templates/default-templates";
import { availableWorkflowActions, canDeleteBudget, canEditBudget, type WorkflowAction } from "@/lib/workflow/budget-workflow";

const ROLE_KEY = "utem-postgrado-active-role-v10";
const FUNCTIONAL_RELEASE = "v10.11";
const COST_CATEGORIES: BudgetItem["category"][] = [
  "Otros honorarios no académicos",
  "Dirección",
  "Asistencia de dirección",
  "Gastos operacionales / Bienes y servicios",
  "Software y licencias",
  "Difusión",
  "Congresos y pasantías",
  "Becas de manutención",
  "Libros y publicaciones",
  "Pasajes y fletes",
  "Viáticos",
  "Alimentos y bebidas",
  "Otros costos y gastos",
];

const FLOW_COST_GROUPS = {
  otherNonAcademic: ["Honorarios no académicos", "Otros honorarios no académicos"] as BudgetItem["category"][],
  operational: ["Gastos operacionales", "Bienes y servicios", "Gastos operacionales / Bienes y servicios"] as BudgetItem["category"][],
  software: ["Software", "Software y licencias"] as BudgetItem["category"][],
  diffusion: ["Difusión"] as BudgetItem["category"][],
  congressesInternships: ["Congresos", "Pasantías", "Congresos y pasantías"] as BudgetItem["category"][],
  booksPublications: ["Libros y publicaciones"] as BudgetItem["category"][],
  travelFreight: ["Pasajes y fletes"] as BudgetItem["category"][],
  perDiem: ["Viáticos"] as BudgetItem["category"][],
  foodBeverages: ["Alimentos y bebidas"] as BudgetItem["category"][],
  otherCosts: ["Otros", "Otros costos y gastos", "Honorarios académicos"] as BudgetItem["category"][],
} as const;

type EditableAnnualCostKey =
  | "annualOperational"
  | "annualSoftware"
  | "annualDiffusion"
  | "annualCongressesInternships"
  | "annualBooksPublications"
  | "annualTravelFreight"
  | "annualPerDiem"
  | "annualFoodBeverages"
  | "annualOtherCosts";
const INCOME_TYPES: ExternalIncome["type"][] = ["Beca ANID", "Otra beca externa", "Convenio", "Aporte institucional", "Proyecto", "Donación", "Ingreso extraordinario", "Otro"];
const roleLabels: Record<AccessRole, string> = { ADMIN: "Administrador", CREADOR: "Creador", LECTOR: "Lector", GESTOR: "Gestor", VISTO_BUENO: "V°B°", APROBADOR: "Aprobación" };
const actionLabels: Record<WorkflowAction, string> = { SUBMIT_VB: "Enviar a V°B°", VB_APPROVE: "Otorgar V°B°", VB_OBSERVE: "Observar", FINAL_APPROVE: "Aprobar", FINAL_OBSERVE: "Observar y devolver" };

const uid = (prefix: string) => `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

function emptySemester(year: number, semester: 1 | 2, students: number): SemesterParameters {
  return {
    year, semester, activeStudents: students, graduatingStudents: 0,
    directTeachingHours: 0, replacementTeachingHours: 0,
    electiveSubjects: 0, electiveSections: 0, specializedCourses: 0, specializedSections: 0,
    internalTuitionScholarshipStudents: 0, internalTuitionScholarshipCoverage: 1,
    maintenanceScholarshipStudents: 0, maintenanceScholarshipMonths: 0, notes: "",
  };
}

function freshBudget(program: Program, responsible: string, parameters: InstitutionalParameters): CohortBudget {
  const startYear = Math.min(...Object.keys(parameters.annualEnrollmentFee).map(Number).filter(Number.isFinite));
  const year = Number.isFinite(startYear) ? startYear : new Date().getFullYear();
  const duration = Math.min(8, Math.max(2, program.officialDurationSemesters));
  const semesters = getActivePeriods(year, 1, duration).map((period, index) => ({
    ...emptySemester(period.year, period.semester, 0),
    graduatingStudents: index === duration - 1 ? 0 : 0,
  }));
  const typeParameters = programTypeParameters(parameters, program.type);
  return {
    id: uid("draft"), program, cohortName: `${program.code} ${year}-1S`, startYear: year, startSemester: 1,
    durationSemesters: duration, initialStudents: 0, status: "Borrador", workflowStage: "GESTION",
    facultyOverheadRate: overheadApplies(program.type) ? typeParameters.facultyOverheadRate : 0,
    enrollmentRecognitionRate: 0,
    programVersionLabel: program.versionLabel ?? "1",
    scholarshipsEnabled: program.type !== "MAGISTER_PROFESIONAL",
    authorizedInitialCarryover: 0, includeAuthorizedCarryover: true,
    normalizeSharedCosts: true, alertPotentialDuplicates: true, responsible, version: 1,
    annualOverrides: getActiveYears(getActivePeriods(year, 1, duration)).map((activeYear) =>
      defaultAnnualOverrideForYear({ program, facultyOverheadRate: overheadApplies(program.type) ? typeParameters.facultyOverheadRate : 0 }, parameters, activeYear)),
    createdAt: new Date().toISOString(), semesters, discounts: [], externalIncome: [], manualItems: [], reviewHistory: [],
  };
}

function canCreate(roles: AccessRole[]) {
  return roles.includes("ADMIN") || roles.includes("GESTOR") || roles.includes("CREADOR");
}

function templateTypeFromSource(source: TuitionSource): Program["type"] | null {
  if (source === "PLANTILLA_DOCTORADO") return "DOCTORADO";
  if (source === "PLANTILLA_MAGISTER_ACADEMICO") return "MAGISTER_ACADEMICO";
  if (source === "PLANTILLA_MAGISTER_PROFESIONAL") return "MAGISTER_PROFESIONAL";
  return null;
}

export function BudgetWorkspace() {
  const [budgets, setBudgets] = useState<CohortBudget[]>([]);
  const [programs, setPrograms] = useState<Program[]>([]);
  const [templates, setTemplates] = useState<BudgetTemplate[]>(defaultBudgetTemplates);
  const [parameters, setParameters] = useState<InstitutionalParameters>(() => structuredClone(fallbackParameters));
  const [identity, setIdentity] = useState<ApiIdentity | null>(null);
  const [selectedId, setSelectedId] = useState("");
  const [role, setRole] = useState<AccessRole>("LECTOR");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  async function load(preferredId?: string) {
    setLoading(true);
    try {
      const [budgetRecords, programRecords, templateRecords, parameterValues, me] = await Promise.all([
        responseBody<ApiBudgetRecord[]>(await fetch("/api/budgets", { cache: "no-store" })),
        responseBody<ApiProgram[]>(await fetch("/api/programs", { cache: "no-store" })),
        responseBody<BudgetTemplate[]>(await fetch("/api/templates", { cache: "no-store" })),
        responseBody<InstitutionalParameters>(await fetch("/api/parameters", { cache: "no-store" })),
        responseBody<ApiIdentity>(await fetch("/api/me", { cache: "no-store" })),
      ]);
      const mapped = budgetRecords.map(toBudget).map((item) => hydrateAnnualOverrides(item, parameterValues));
      const mappedPrograms = programRecords.map(toProgram);
      setBudgets(mapped);
      setPrograms(mappedPrograms);
      setTemplates(templateRecords.length ? templateRecords : defaultBudgetTemplates);
      setParameters(parameterValues);
      setIdentity(me);
      const storedRole = typeof window !== "undefined" ? window.localStorage.getItem(ROLE_KEY) as AccessRole | null : null;
      const resolvedRole = storedRole && me.roles.includes(storedRole) ? storedRole : me.roles[0] ?? "LECTOR";
      setRole(resolvedRole);
      const nextId = preferredId && mapped.some((item) => item.id === preferredId) ? preferredId : mapped[0]?.id ?? "";
      setSelectedId(nextId);
      setMessage("");
    } catch (reason) {
      setMessage(reason instanceof Error ? reason.message : "No fue posible cargar el espacio de presupuestos.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, []);

  const budget = budgets.find((item) => item.id === selectedId) ?? null;
  const result = useMemo(() => budget ? calculateBudget(budget, parameters) : null, [budget, parameters]);
  const editable = budget ? canEditBudget(budget, role) : false;
  const deletable = budget ? canDeleteBudget(budget, role) : false;
  const workflowActions = budget ? availableWorkflowActions(budget.workflowStage, role) : [];
  const duplicateAlerts = budget ? detectPotentialDuplicateCosts(budgets, budget.id) : [];
  const relevantTemplates = budget ? templates.filter((template) => template.programType === budget.program.type && template.active) : [];

  function setActiveRole(next: AccessRole) {
    setRole(next);
    window.localStorage.setItem(ROLE_KEY, next);
  }

  function replaceBudget(next: CohortBudget) {
    setBudgets((current) => current.map((item) => item.id === next.id ? next : item));
  }

  function patchBudget(patch: Partial<CohortBudget>) {
    if (!budget) return;
    replaceBudget({ ...budget, ...patch, updatedAt: new Date().toISOString() });
  }

  function updateSemester(index: number, field: keyof SemesterParameters, value: number | string) {
    if (!budget) return;
    replaceBudget({ ...budget, semesters: budget.semesters.map((semester, candidate) => candidate === index ? { ...semester, [field]: value } : semester) });
  }

  function regeneratePeriods(startYear: number, startSemester: 1 | 2, durationSemesters: number, initialStudents: number) {
    if (!budget) return;
    const current = new Map(budget.semesters.map((semester) => [`${semester.year}-${semester.semester}`, semester]));
    const periods = getActivePeriods(startYear, startSemester, durationSemesters);
    const semesters = periods.map((period, index) => current.get(`${period.year}-${period.semester}`) ?? {
      ...emptySemester(period.year, period.semester, initialStudents),
      graduatingStudents: index === periods.length - 1 ? initialStudents : 0,
    });
    const base = { ...budget, startYear, startSemester, durationSemesters, initialStudents, semesters };
    replaceBudget(hydrateAnnualOverrides(base, parameters));
  }

  async function createBudget() {
    if (!identity || !programs.length) return;
    const program = programs[0];
    const draft = freshBudget(program, identity.name, parameters);
    try {
      const response = await fetch("/api/budgets", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({
          programId: program.id, cohortName: draft.cohortName, startYear: draft.startYear, startSemester: draft.startSemester,
          durationSemesters: draft.durationSemesters, initialStudents: draft.initialStudents,
          facultyOverheadRate: draft.facultyOverheadRate, enrollmentRecognitionRate: draft.enrollmentRecognitionRate,
          programVersionLabel: draft.programVersionLabel, scholarshipsEnabled: draft.scholarshipsEnabled,
          annualOverrides: draft.annualOverrides,
          authorizedInitialCarryover: 0, includeAuthorizedCarryover: true, normalizeSharedCosts: true, alertPotentialDuplicates: true,
          appliedTemplateId: null, appliedTemplateVersion: null, responsibleId: identity.userId,
        }),
      });
      const created = await responseBody<{ id: string }>(response);
      await load(created.id);
      setMessage("Presupuesto creado. Complete la formulación y guarde los cambios.");
    } catch (reason) {
      setMessage(reason instanceof Error ? reason.message : "No fue posible crear el presupuesto.");
    }
  }

  async function saveBudget() {
    if (!budget) return;
    setSaving(true);
    try {
      const response = await fetch(`/api/budgets/${budget.id}`, {
        method: "PUT", headers: { "content-type": "application/json" },
        body: JSON.stringify({
          programId: budget.program.id,
          cohortName: budget.cohortName,
          startYear: budget.startYear,
          startSemester: budget.startSemester,
          durationSemesters: budget.durationSemesters,
          initialStudents: budget.initialStudents,
          facultyOverheadRate: budget.facultyOverheadRate,
          enrollmentRecognitionRate: budget.enrollmentRecognitionRate,
          programVersionLabel: budget.programVersionLabel,
          scholarshipsEnabled: budget.scholarshipsEnabled,
          annualOverrides: budget.annualOverrides,
          authorizedInitialCarryover: budget.authorizedInitialCarryover,
          includeAuthorizedCarryover: budget.includeAuthorizedCarryover,
          normalizeSharedCosts: budget.normalizeSharedCosts,
          alertPotentialDuplicates: budget.alertPotentialDuplicates,
          appliedTemplateId: budget.appliedTemplateId ?? null,
          appliedTemplateVersion: budget.appliedTemplateVersion ?? null,
          notes: budget.notes ?? null,
          changeNote: "Actualización desde formulario presupuestario",
          semesters: budget.semesters.map((semester, position) => ({ ...semester, position })),
          discounts: budget.discounts,
          externalIncome: budget.externalIncome,
          items: budget.manualItems,
        }),
      });
      await responseBody(response);
      await load(budget.id);
      setMessage("Presupuesto guardado y versionado en D1.");
    } catch (reason) {
      setMessage(reason instanceof Error ? reason.message : "No fue posible guardar el presupuesto.");
    } finally {
      setSaving(false);
    }
  }

  async function deleteBudget() {
    if (!budget || !window.confirm(`¿Eliminar lógicamente el presupuesto ${budget.cohortName}?`)) return;
    try {
      const response = await fetch(`/api/budgets/${budget.id}`, { method: "DELETE" });
      if (!response.ok) await responseBody(response);
      await load();
      setMessage("Presupuesto eliminado lógicamente. El historial permanece auditable.");
    } catch (reason) {
      setMessage(reason instanceof Error ? reason.message : "No fue posible eliminar el presupuesto.");
    }
  }

  async function executeWorkflow(action: WorkflowAction) {
    if (!budget) return;
    const comment = window.prompt("Comentario de revisión (opcional):", "") ?? "";
    try {
      await responseBody(await fetch(`/api/budgets/${budget.id}/workflow`, {
        method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action, comment }),
      }));
      await load(budget.id);
      setMessage("Acción de flujo registrada correctamente.");
    } catch (reason) {
      setMessage(reason instanceof Error ? reason.message : "No fue posible ejecutar la acción de flujo.");
    }
  }

  function applyTemplate(template: BudgetTemplate) {
    if (!budget) return;
    replaceBudget(applyBudgetTemplate(budget, template));
    setMessage(`${template.name} aplicada al presupuesto. Guarde para persistir los cambios.`);
  }

  function applyTuitionTemplate(source: TuitionSource) {
    if (!budget || source === "PROPIO") return;
    const type = templateTypeFromSource(source);
    if (!type) return;
    const tuitionValues = { ...(parameters.tuitionTemplates[type] ?? {}) };
    replaceBudget({
      ...budget,
      program: { ...budget.program, tuitionSource: source, annualTuition: tuitionValues },
      annualOverrides: budget.annualOverrides.map((annual) => ({
        ...annual,
        annualTuition: tuitionValues[annual.year] ?? tuitionForProgramYear({ program: { ...budget.program, annualTuition: tuitionValues } }, parameters, annual.year),
      })),
    });
    setMessage(`${tuitionSourceLabel(source)} aplicada al cálculo actual. Para convertirla en el arancel maestro del programa, guárdela en “Programas”.`);
  }

  function updateAnnualOverride(year: number, patch: Partial<BudgetAnnualOverride>) {
    if (!budget) return;
    const current = budget.annualOverrides.find((item) => item.year === year)
      ?? defaultAnnualOverrideForYear(budget, parameters, year);
    patchBudget({
      annualOverrides: [
        ...budget.annualOverrides.filter((item) => item.year !== year),
        { ...current, ...patch, year },
      ].sort((a, b) => a.year - b.year),
    });
  }

  function overlappingBudgets(year: number): CohortBudget[] {
    if (!budget) return [];
    return budgets.filter((candidate) => {
      // Sólo los presupuestos aprobados representan compromisos previos firmes para el prorrateo.
      if (candidate.id === budget.id || candidate.program.id !== budget.program.id || candidate.status !== "Aprobado") return false;
      return getActivePeriods(candidate.startYear, candidate.startSemester, candidate.durationSemesters).some((period) => period.year === year);
    });
  }

  function overlappingBudgetCount(year: number): number {
    return overlappingBudgets(year).length;
  }

  function priorCommitments(year: number) {
    return overlappingBudgets(year).reduce((totals, candidate) => {
      const annual = resolvedAnnualOverrideForYear(candidate, parameters, year);
      totals.direction += annual.annualDirection * (annual.directionProrated ? annual.directionAllocationRate : 1);
      totals.assistance += annual.annualAssistance * (annual.assistanceProrated ? annual.assistanceAllocationRate : 1);
      totals.otherNonAcademic += annual.annualOtherNonAcademicHonoraria
        * (annual.otherNonAcademicProrated ? annual.otherNonAcademicAllocationRate : 1);
      return totals;
    }, { direction: 0, assistance: 0, otherNonAcademic: 0 });
  }

  function suggestedAllocationRate(year: number): number {
    return 1 / (1 + overlappingBudgetCount(year));
  }

  function manualCostAmount(year: number, categories: readonly BudgetItem["category"][]): number {
    if (!budget) return 0;
    const currentBudget = budget;
    return currentBudget.manualItems
      .filter((item) => categories.includes(item.category))
      .reduce((total, item) => total + manualItemAmountForYear(item, currentBudget, year), 0);
  }

  function updateEditableFlowCost(
    year: number,
    key: EditableAnnualCostKey,
    categories: readonly BudgetItem["category"][],
    desiredTotal: number,
  ) {
    const manualAmount = manualCostAmount(year, categories);
    updateAnnualOverride(year, { [key]: Math.max(0, desiredTotal - manualAmount) } as Partial<BudgetAnnualOverride>);
  }

  function exportBudget(format: "xlsx" | "pdf") {
    if (!budget || !result) return;
    try {
      if (format === "xlsx") downloadBudgetXlsx(budget, result);
      else downloadBudgetPdf(budget, result);
      setMessage(`Exportación ${format.toUpperCase()} generada.`);
    } catch (reason) {
      setMessage(reason instanceof Error ? reason.message : "No fue posible generar la exportación.");
    }
  }

  if (loading && !budget) return <div className="notice info"><p>Cargando presupuestos desde D1…</p></div>;

  if (!budget || !result) {
    return <div className="budget-workspace">
      {message ? <div className="notice info"><p>{message}</p></div> : null}
      <section className="panel budget-selector"><div><label>Presupuesto<select disabled><option>No existen presupuestos</option></select></label><label>Rol activo<select value={role} onChange={(event) => setActiveRole(event.target.value as AccessRole)}>{identity?.roles.map((candidate) => <option key={candidate} value={candidate}>{roleLabels[candidate]}</option>)}</select></label></div><div className="workspace-actions"><button className="button primary" type="button" disabled={!canCreate(identity?.roles ?? []) || !programs.length} onClick={() => void createBudget()}>Nuevo presupuesto</button></div></section>
      <section className="panel empty-state"><h2>No hay presupuestos registrados</h2><p>Use “Nuevo presupuesto” para crear la primera cohorte. Si aún no hay programas, créelos primero en el módulo Programas.</p></section>
    </div>;
  }

  const typeParameters = programTypeParameters(parameters, budget.program.type);
  const overhead = overheadApplies(budget.program.type);
  const roles = identity?.roles ?? [];

  return <div className="budget-workspace">
    {message ? <div className="notice info"><p>{message}</p></div> : null}
    <section className="panel budget-selector">
      <div><label>Presupuesto<select value={selectedId} onChange={(event) => setSelectedId(event.target.value)}>{budgets.map((item) => <option key={item.id} value={item.id}>{item.program.code} · {item.cohortName} · Versión {item.programVersionLabel} · R{item.version}</option>)}</select></label><label>Rol activo<select value={role} onChange={(event) => setActiveRole(event.target.value as AccessRole)}>{roles.map((candidate) => <option key={candidate} value={candidate}>{roleLabels[candidate]}</option>)}</select></label></div>
      <div className="workspace-actions"><button className="button secondary" type="button" onClick={() => exportBudget("xlsx")}>Exportar XLSX</button><button className="button secondary" type="button" onClick={() => exportBudget("pdf")}>Exportar PDF</button><button className="button primary" type="button" disabled={!editable || saving} onClick={() => void saveBudget()}>{saving ? "Guardando…" : "Guardar cambios"}</button><button className="button secondary" type="button" disabled={!canCreate(roles)} onClick={() => void createBudget()}>Nuevo presupuesto</button><button className="text-button danger-text" type="button" disabled={!deletable} onClick={() => void deleteBudget()}>Eliminar</button></div>
    </section>

    <section className="panel">
      <SectionHeading number="1" id="identificacion" title="Identificación" description="Programa, cohorte, duración y versión del plan/programa." />
      <div className="form-grid cols-4">
        <label>Programa<select disabled={!editable} value={budget.program.id} onChange={(event) => {
          const program = programs.find((candidate) => candidate.id === event.target.value);
          if (!program) return;
          const facultyOverheadRate = overheadApplies(program.type) ? programTypeParameters(parameters, program.type).facultyOverheadRate : 0;
          const next = hydrateAnnualOverrides({ ...budget, program, facultyOverheadRate, programVersionLabel: program.versionLabel ?? "1", scholarshipsEnabled: program.type !== "MAGISTER_PROFESIONAL", annualOverrides: [] }, parameters);
          replaceBudget(next);
        }}>{programs.map((program) => <option key={program.id} value={program.id}>{program.code} · {program.name}</option>)}</select></label>
        <label>Cohorte<input disabled={!editable} value={budget.cohortName} onChange={(event) => patchBudget({ cohortName: event.target.value })} /></label>
        <label>Versión del programa / plan<input disabled={!editable} value={budget.programVersionLabel} onChange={(event) => patchBudget({ programVersionLabel: event.target.value })} /></label>
        <label>Revisión interna<div className="input-like">R{budget.version}</div></label>
        <label>Año inicio<input disabled={!editable} type="number" value={budget.startYear} onChange={(event) => regeneratePeriods(numberValue(event.target.value), budget.startSemester, budget.durationSemesters, budget.initialStudents)} /></label>
        <label>Semestre inicio<select disabled={!editable} value={budget.startSemester} onChange={(event) => regeneratePeriods(budget.startYear, numberValue(event.target.value) as 1 | 2, budget.durationSemesters, budget.initialStudents)}><option value="1">1S</option><option value="2">2S</option></select></label>
        <label>Duración<input disabled={!editable} type="number" min="2" max="8" value={budget.durationSemesters} onChange={(event) => regeneratePeriods(budget.startYear, budget.startSemester, Math.min(8, Math.max(2, numberValue(event.target.value))), budget.initialStudents)} /></label>
        <label>Estudiantes iniciales<input disabled={!editable} type="number" min="0" value={budget.initialStudents} onChange={(event) => regeneratePeriods(budget.startYear, budget.startSemester, budget.durationSemesters, numberValue(event.target.value))} /></label>
        <label>Estado<div className="input-like"><StatusBadge status={budget.status} /></div></label>
      </div>
    </section>

    <section className="panel">
      <SectionHeading number="2" id="parametros" title="Parámetros y plantillas" description="Parámetros particulares por año, matrícula, overhead, prorrateos y plantilla funcional." />
      <div className="form-grid cols-4">
        <label>Fuente del arancel<select disabled={!editable} value={budget.program.tuitionSource ?? "PROPIO"} onChange={(event) => { const source = event.target.value as TuitionSource; if (source === "PROPIO") patchBudget({ program: { ...budget.program, tuitionSource: source } }); else applyTuitionTemplate(source); }}><option value="PROPIO">Arancel propio del programa</option><option value="PLANTILLA_DOCTORADO">Plantilla Doctoral</option><option value="PLANTILLA_MAGISTER_ACADEMICO">Plantilla Magíster Académico</option><option value="PLANTILLA_MAGISTER_PROFESIONAL">Plantilla Magíster Profesional</option></select></label>
        <label>Reconocimiento matrícula (%)<div className="percent-input"><input disabled={!editable} type="number" min="0" max="100" step="1" value={(budget.enrollmentRecognitionRate * 100).toFixed(0)} onChange={(event) => patchBudget({ enrollmentRecognitionRate: numberValue(event.target.value) / 100 })} /><span>%</span></div></label>
        <label>Arrastre autorizado<input disabled={!editable} type="number" value={budget.authorizedInitialCarryover} onChange={(event) => patchBudget({ authorizedInitialCarryover: numberValue(event.target.value) })} /></label>
      </div>
      <div className="setting-grid"><CheckSetting label="Incluir arrastre autorizado" note="Suma el arrastre al primer año del flujo." checked={budget.includeAuthorizedCarryover} disabled={!editable} onChange={(value) => patchBudget({ includeAuthorizedCarryover: value })} /><CheckSetting label="Normalizar costos compartidos" note="Evita duplicar costos en consolidación." checked={budget.normalizeSharedCosts} disabled={!editable} onChange={(value) => patchBudget({ normalizeSharedCosts: value })} /><CheckSetting label="Alertar posibles duplicidades" note="Busca coincidencias de gastos entre cohortes." checked={budget.alertPotentialDuplicates} disabled={!editable} onChange={(value) => patchBudget({ alertPotentialDuplicates: value })} /></div>

      <div className="subpanel annual-parameter-panel"><h3>Valores anuales del presupuesto</h3><p>Estos valores se aplican sólo a esta versión del programa. El arancel se define para cada año activo. La matrícula se cobra una vez por cada dos semestres activos, es informativa y no recibe descuentos. Los años sin cobro de matrícula se muestran sólo como referencia y no generan ingreso.</p>
        <div className="table-wrap"><table className="data-table editable-list"><thead><tr><th>Año</th><th>Arancel anual</th><th>Periodo de cobro matrícula</th><th>Matrícula anual</th><th>Valor hora docente directa</th><th>Guía de tesis por graduando</th></tr></thead><tbody>{budget.annualOverrides.map((annual) => { const chargePeriods = getActivePeriods(budget.startYear, budget.startSemester, budget.durationSemesters).filter((period, index) => index % 2 === 0 && period.year === annual.year); return <tr key={`annual-values-${annual.year}`}><th>{annual.year}</th><InputCell label={`Arancel ${annual.year}`} value={annual.annualTuition} disabled={!editable} onChange={(value) => updateAnnualOverride(annual.year, { annualTuition: value })} /><td>{chargePeriods.length ? chargePeriods.map((period) => `${period.year}-${period.semester}S`).join(", ") : <span className="muted">Sin cobro</span>}</td><InputCell label={`Matrícula ${annual.year}`} value={annual.annualEnrollmentFee} disabled={!editable || chargePeriods.length === 0} onChange={(value) => updateAnnualOverride(annual.year, { annualEnrollmentFee: value })} /><InputCell label={`Hora directa ${annual.year}`} value={annual.directTeachingHourValue} disabled={!editable} onChange={(value) => updateAnnualOverride(annual.year, { directTeachingHourValue: value })} /><InputCell label={`Guía de tesis ${annual.year}`} value={annual.thesisGuidancePerGraduatingStudent} disabled={!editable} onChange={(value) => updateAnnualOverride(annual.year, { thesisGuidancePerGraduatingStudent: value })} /></tr>; })}</tbody></table></div>
      </div>

      <div className="subpanel annual-parameter-panel">
        <h3>Staff comprometido/prorrateable y overhead</h3>
        <p>Dirección, asistencia de dirección y otros honorarios no académicos pueden distribuirse entre versiones/cohortes aprobadas y superpuestas del mismo programa profesional. El sistema detecta compromisos previos y propone una distribución equitativa; el porcentaje aplicado siempre queda editable. “Honorarios no académicos” se presenta en el flujo como subtotal de estas tres líneas.</p>
        <div className="table-wrap">
          <table className="data-table editable-list annual-cost-table">
            <thead><tr><th>Año</th><th>Dirección base</th><th>Comprometido</th><th>Prorratear</th><th>%</th><th>Dirección aplicada</th><th>Asistencia base</th><th>Comprometido</th><th>Prorratear</th><th>%</th><th>Asistencia aplicada</th><th>Otros honorarios no académicos</th><th>Comprometido</th><th>Prorratear</th><th>%</th><th>Otros aplicados</th><th>OH central %</th><th>OH facultad %</th></tr></thead>
            <tbody>{budget.annualOverrides.map((annual) => {
              const suggested = suggestedAllocationRate(annual.year);
              const overlapping = overlappingBudgetCount(annual.year);
              const committed = priorCommitments(annual.year);
              return <tr key={`annual-cost-${annual.year}`}>
                <th>{annual.year}<small>{overlapping ? `${overlapping} otra(s) versión(es) aprobada(s); sugerido ${formatPercent(suggested)}` : "Sin otras versiones aprobadas"}</small></th>
                <InputCell label={`Dirección ${annual.year}`} value={annual.annualDirection} disabled={!editable} onChange={(value) => updateAnnualOverride(annual.year, { annualDirection: value })} />
                <td className="numeric">{formatCLP(committed.direction)}</td>
                <td><input aria-label={`Prorratear dirección ${annual.year}`} type="checkbox" disabled={!editable || budget.program.type !== "MAGISTER_PROFESIONAL"} checked={annual.directionProrated} onChange={(event) => updateAnnualOverride(annual.year, { directionProrated: event.target.checked, directionAllocationRate: event.target.checked ? suggested : 1 })} /></td>
                <PercentCell label={`Porcentaje dirección ${annual.year}`} value={annual.directionAllocationRate} disabled={!editable || !annual.directionProrated} onChange={(value) => updateAnnualOverride(annual.year, { directionAllocationRate: value })} />
                <td className="numeric"><strong>{formatCLP(annual.annualDirection * (annual.directionProrated ? annual.directionAllocationRate : 1))}</strong></td>
                <InputCell label={`Asistencia de dirección ${annual.year}`} value={annual.annualAssistance} disabled={!editable} onChange={(value) => updateAnnualOverride(annual.year, { annualAssistance: value })} />
                <td className="numeric">{formatCLP(committed.assistance)}</td>
                <td><input aria-label={`Prorratear asistencia ${annual.year}`} type="checkbox" disabled={!editable || budget.program.type !== "MAGISTER_PROFESIONAL"} checked={annual.assistanceProrated} onChange={(event) => updateAnnualOverride(annual.year, { assistanceProrated: event.target.checked, assistanceAllocationRate: event.target.checked ? suggested : 1 })} /></td>
                <PercentCell label={`Porcentaje asistencia ${annual.year}`} value={annual.assistanceAllocationRate} disabled={!editable || !annual.assistanceProrated} onChange={(value) => updateAnnualOverride(annual.year, { assistanceAllocationRate: value })} />
                <td className="numeric"><strong>{formatCLP(annual.annualAssistance * (annual.assistanceProrated ? annual.assistanceAllocationRate : 1))}</strong></td>
                <InputCell label={`Otros honorarios no académicos ${annual.year}`} value={annual.annualOtherNonAcademicHonoraria} disabled={!editable} onChange={(value) => updateAnnualOverride(annual.year, { annualOtherNonAcademicHonoraria: value })} />
                <td className="numeric">{formatCLP(committed.otherNonAcademic)}</td>
                <td><input aria-label={`Prorratear otros honorarios no académicos ${annual.year}`} type="checkbox" disabled={!editable || budget.program.type !== "MAGISTER_PROFESIONAL"} checked={annual.otherNonAcademicProrated} onChange={(event) => updateAnnualOverride(annual.year, { otherNonAcademicProrated: event.target.checked, otherNonAcademicAllocationRate: event.target.checked ? suggested : 1 })} /></td>
                <PercentCell label={`Porcentaje otros honorarios no académicos ${annual.year}`} value={annual.otherNonAcademicAllocationRate} disabled={!editable || !annual.otherNonAcademicProrated} onChange={(value) => updateAnnualOverride(annual.year, { otherNonAcademicAllocationRate: value })} />
                <td className="numeric"><strong>{formatCLP(annual.annualOtherNonAcademicHonoraria * (annual.otherNonAcademicProrated ? annual.otherNonAcademicAllocationRate : 1))}</strong></td>
                <PercentCell label={`Overhead central ${annual.year}`} value={annual.centralOverheadRate} disabled={!editable || !overhead} onChange={(value) => updateAnnualOverride(annual.year, { centralOverheadRate: value })} />
                <PercentCell label={`Overhead facultad ${annual.year}`} value={annual.facultyOverheadRate} disabled={!editable || !overhead} onChange={(value) => updateAnnualOverride(annual.year, { facultyOverheadRate: value })} />
              </tr>;
            })}</tbody>
          </table>
        </div>
      </div>

      <div className="template-grid">{relevantTemplates.length ? relevantTemplates.map((template) => <article className="template-card" key={template.id}><div><span>{template.name}</span><strong>V{template.version}</strong></div><p>{template.description}</p><button className="button secondary" type="button" disabled={!editable} onClick={() => applyTemplate(template)}>Usar plantilla</button></article>) : <p>No existe una plantilla funcional activa para este tipo de programa.</p>}</div>
      <div className="notice info"><strong>Referencia institucional</strong><p>Hora de reemplazo {formatCLP(parameters.replacementHour)} · Incobrabilidad {formatPercent(typeParameters.badDebtRate)}{!overhead ? " · Los programas académicos no aplican overhead en el cálculo." : ""}</p></div>
    </section>

    <section className="panel"><SectionHeading number="3" id="estudiantes" title="Estudiantes y graduación" description="Matrícula activa y estudiantes que se encuentran en etapa de graduación por semestre." /><div className="table-wrap"><table className="data-table semester-table"><thead><tr><th>Periodo</th><th>Estudiantes activos</th><th>Estudiantes en graduación</th></tr></thead><tbody>{budget.semesters.map((semester, index) => <tr key={`${semester.year}-${semester.semester}`}><th>{semester.year}-{semester.semester}S</th><InputCell label={`Activos ${semester.year}-${semester.semester}`} value={semester.activeStudents} disabled={!editable} onChange={(value) => updateSemester(index, "activeStudents", value)} /><InputCell label={`Graduación ${semester.year}-${semester.semester}`} value={semester.graduatingStudents} disabled={!editable} onChange={(value) => updateSemester(index, "graduatingStudents", value)} /></tr>)}</tbody></table></div></section>

    <section className="panel"><SectionHeading number="4" id="carga-academica" title="Carga académica" description="Las horas docentes directas y las horas de reemplazo se gestionan separadamente de estudiantes y becas." /><div className="academic-hours-grid"><div className="subpanel"><h3>Horas docentes directas</h3><p>Se valorizan con el parámetro anual de hora docente directa.</p><div className="table-wrap"><table className="data-table"><thead><tr><th>Periodo</th><th>Horas directas</th></tr></thead><tbody>{budget.semesters.map((semester, index) => <tr key={`direct-${semester.year}-${semester.semester}`}><th>{semester.year}-{semester.semester}S</th><InputCell label={`Horas directas ${semester.year}-${semester.semester}`} value={semester.directTeachingHours} disabled={!editable} step="0.5" onChange={(value) => updateSemester(index, "directTeachingHours", value)} /></tr>)}</tbody></table></div></div><div className="subpanel"><h3>Horas docentes de reemplazo</h3><p>Se valorizan con el parámetro general de hora de reemplazo.</p><div className="table-wrap"><table className="data-table"><thead><tr><th>Periodo</th><th>Horas de reemplazo</th></tr></thead><tbody>{budget.semesters.map((semester, index) => <tr key={`replacement-${semester.year}-${semester.semester}`}><th>{semester.year}-{semester.semester}S</th><InputCell label={`Horas reemplazo ${semester.year}-${semester.semester}`} value={semester.replacementTeachingHours} disabled={!editable} step="0.5" onChange={(value) => updateSemester(index, "replacementTeachingHours", value)} /></tr>)}</tbody></table></div></div></div></section>

    <section className="panel">
      <SectionHeading number="5" id="becas" title="Becas" description="En programas profesionales se mantienen deshabilitadas por defecto y se habilitan sólo cuando corresponda." action={budget.program.type === "MAGISTER_PROFESIONAL" ? <button className="button secondary" type="button" disabled={!editable} onClick={() => patchBudget({ scholarshipsEnabled: !budget.scholarshipsEnabled })}>{budget.scholarshipsEnabled ? "Deshabilitar becas" : "Habilitar becas"}</button> : undefined} />
      {!budget.scholarshipsEnabled && budget.program.type === "MAGISTER_PROFESIONAL" ? <div className="notice info"><strong>Becas deshabilitadas</strong><p>Este programa profesional no incorpora beca interna de arancel ni de manutención por defecto. Puede habilitarlas expresamente si existe una autorización.</p></div> : <div className="table-wrap"><table className="data-table"><thead><tr><th>Periodo</th><th>Estudiantes beca arancel</th><th>Cobertura arancel (%)</th><th>Estudiantes manutención</th><th>Meses manutención</th></tr></thead><tbody>{budget.semesters.map((semester, index) => <tr key={`scholarship-${semester.year}-${semester.semester}`}><th>{semester.year}-{semester.semester}S</th><InputCell label="Becarios arancel" value={semester.internalTuitionScholarshipStudents} disabled={!editable} onChange={(value) => updateSemester(index, "internalTuitionScholarshipStudents", value)} /><PercentCell label="Cobertura beca" value={semester.internalTuitionScholarshipCoverage} disabled={!editable} onChange={(value) => updateSemester(index, "internalTuitionScholarshipCoverage", value)} /><InputCell label="Becarios manutención" value={semester.maintenanceScholarshipStudents} disabled={!editable} onChange={(value) => updateSemester(index, "maintenanceScholarshipStudents", value)} /><InputCell label="Meses manutención" value={semester.maintenanceScholarshipMonths} disabled={!editable} onChange={(value) => updateSemester(index, "maintenanceScholarshipMonths", value)} /></tr>)}</tbody></table></div>}
    </section>

    <section className="panel"><SectionHeading number="6" id="descuentos" title="Descuentos" description="Agregue, modifique o elimine descuentos por periodo." action={<button className="button secondary" type="button" disabled={!editable} onClick={() => patchBudget({ discounts: [...budget.discounts, { id: uid("discount"), name: "Nuevo descuento", percentage: 0, students: 0, startYear: budget.startYear, startSemester: budget.startSemester, endYear: budget.startYear, endSemester: budget.startSemester }] })}>Agregar descuento</button>} /><div className="table-wrap"><table className="data-table editable-list"><thead><tr><th>Nombre</th><th>Porcentaje</th><th>Estudiantes</th><th>Inicio</th><th>Término</th><th>Acción</th></tr></thead><tbody>{budget.discounts.length ? budget.discounts.map((discount, index) => <tr key={discount.id}><td><input disabled={!editable} value={discount.name} onChange={(event) => patchBudget({ discounts: budget.discounts.map((item, candidate) => candidate === index ? { ...item, name: event.target.value } : item) })} /></td><PercentCell label={`Descuento ${discount.name}`} value={discount.percentage} disabled={!editable} onChange={(value) => patchBudget({ discounts: budget.discounts.map((item, candidate) => candidate === index ? { ...item, percentage: value } : item) })} /><td><input disabled={!editable} type="number" min="0" value={discount.students} onChange={(event) => patchBudget({ discounts: budget.discounts.map((item, candidate) => candidate === index ? { ...item, students: numberValue(event.target.value) } : item) })} /></td><td><PeriodInputs disabled={!editable} years={result.years} year={discount.startYear} semester={discount.startSemester} onYear={(value) => patchBudget({ discounts: budget.discounts.map((item, candidate) => candidate === index ? { ...item, startYear: value } : item) })} onSemester={(value) => patchBudget({ discounts: budget.discounts.map((item, candidate) => candidate === index ? { ...item, startSemester: value } : item) })} /></td><td><PeriodInputs disabled={!editable} years={result.years} year={discount.endYear} semester={discount.endSemester} onYear={(value) => patchBudget({ discounts: budget.discounts.map((item, candidate) => candidate === index ? { ...item, endYear: value } : item) })} onSemester={(value) => patchBudget({ discounts: budget.discounts.map((item, candidate) => candidate === index ? { ...item, endSemester: value } : item) })} /></td><td><button className="text-button danger-text" type="button" disabled={!editable} onClick={() => patchBudget({ discounts: budget.discounts.filter((_, candidate) => candidate !== index) })}>Quitar</button></td></tr>) : <tr><td colSpan={6}>No hay descuentos.</td></tr>}</tbody></table></div></section>

    <section className="panel"><SectionHeading number="7" id="ingresos-extra" title="Ingresos extraordinarios" description="Becas externas, convenios, aportes y otros ingresos." action={<button className="button secondary" type="button" disabled={!editable} onClick={() => patchBudget({ externalIncome: [...budget.externalIncome, { id: uid("income"), type: "Ingreso extraordinario", description: "Nuevo ingreso", year: result.years[0] ?? budget.startYear, semester: 1, students: 1, amountPerStudent: 0, source: "" }] })}>Agregar ingreso</button>} /><div className="table-wrap"><table className="data-table editable-list"><thead><tr><th>Tipo y descripción</th><th>Periodo</th><th>Estudiantes</th><th>Monto unitario</th><th>Fuente</th><th>Acción</th></tr></thead><tbody>{budget.externalIncome.length ? budget.externalIncome.map((income, index) => <tr key={income.id}><td><select disabled={!editable} value={income.type} onChange={(event) => patchBudget({ externalIncome: budget.externalIncome.map((item, candidate) => candidate === index ? { ...item, type: event.target.value as ExternalIncome["type"] } : item) })}>{INCOME_TYPES.map((type) => <option key={type}>{type}</option>)}</select><input disabled={!editable} value={income.description} onChange={(event) => patchBudget({ externalIncome: budget.externalIncome.map((item, candidate) => candidate === index ? { ...item, description: event.target.value } : item) })} /></td><td><PeriodInputs disabled={!editable} years={result.years} year={income.year} semester={income.semester} onYear={(value) => patchBudget({ externalIncome: budget.externalIncome.map((item, candidate) => candidate === index ? { ...item, year: value } : item) })} onSemester={(value) => patchBudget({ externalIncome: budget.externalIncome.map((item, candidate) => candidate === index ? { ...item, semester: value } : item) })} /></td><td><input disabled={!editable} type="number" min="0" value={income.students} onChange={(event) => patchBudget({ externalIncome: budget.externalIncome.map((item, candidate) => candidate === index ? { ...item, students: numberValue(event.target.value) } : item) })} /></td><td><input disabled={!editable} type="number" min="0" value={income.amountPerStudent} onChange={(event) => patchBudget({ externalIncome: budget.externalIncome.map((item, candidate) => candidate === index ? { ...item, amountPerStudent: numberValue(event.target.value) } : item) })} /></td><td><input disabled={!editable} value={income.source} onChange={(event) => patchBudget({ externalIncome: budget.externalIncome.map((item, candidate) => candidate === index ? { ...item, source: event.target.value } : item) })} /></td><td><button className="text-button danger-text" type="button" disabled={!editable} onClick={() => patchBudget({ externalIncome: budget.externalIncome.filter((_, candidate) => candidate !== index) })}>Quitar</button></td></tr>) : <tr><td colSpan={6}>No hay ingresos extraordinarios.</td></tr>}</tbody></table></div></section>

    <section className="panel"><SectionHeading number="8" id="costos" title="Costos y gastos" description="Los costos Anuales se repiten desde el año de inicio hasta el término; los Semestrales se aplican a cada semestre activo desde su periodo de inicio." action={<button className="button secondary" type="button" disabled={!editable} onClick={() => patchBudget({ manualItems: [...budget.manualItems, { id: uid("cost"), name: "Nuevo costo", description: "", category: "Otros costos y gastos", year: result.years[0] ?? budget.startYear, amount: 0, costType: "Único de esta versión", periodicity: "Único" }] })}>Agregar gasto o costo</button>} /><div className="table-wrap"><table className="data-table editable-list"><thead><tr><th>Nombre y descripción</th><th>Categoría</th><th>Año</th><th>Monto</th><th>Alcance</th><th>Periodicidad</th><th>Acción</th></tr></thead><tbody>{budget.manualItems.length ? budget.manualItems.map((item, index) => <tr key={item.id}><td><input disabled={!editable} value={item.name} onChange={(event) => patchBudget({ manualItems: budget.manualItems.map((candidate, position) => position === index ? { ...candidate, name: event.target.value } : candidate) })} /><input disabled={!editable} value={item.description} onChange={(event) => patchBudget({ manualItems: budget.manualItems.map((candidate, position) => position === index ? { ...candidate, description: event.target.value } : candidate) })} /></td><td><select disabled={!editable} value={item.category} onChange={(event) => patchBudget({ manualItems: budget.manualItems.map((candidate, position) => position === index ? { ...candidate, category: event.target.value as BudgetItem["category"] } : candidate) })}>{COST_CATEGORIES.map((category) => <option key={category}>{category}</option>)}</select></td><td><select disabled={!editable} value={item.year} onChange={(event) => patchBudget({ manualItems: budget.manualItems.map((candidate, position) => position === index ? { ...candidate, year: numberValue(event.target.value) } : candidate) })}>{result.years.map((year) => <option key={year}>{year}</option>)}</select></td><td><input disabled={!editable} type="number" min="0" value={item.amount} onChange={(event) => patchBudget({ manualItems: budget.manualItems.map((candidate, position) => position === index ? { ...candidate, amount: numberValue(event.target.value) } : candidate) })} /></td><td><select disabled={!editable} value={item.costType} onChange={(event) => patchBudget({ manualItems: budget.manualItems.map((candidate, position) => position === index ? { ...candidate, costType: event.target.value as BudgetItem["costType"] } : candidate) })}><option>Único de esta versión</option><option>Compartido con otras cohortes</option></select></td><td><select disabled={!editable} value={item.periodicity} onChange={(event) => patchBudget({ manualItems: budget.manualItems.map((candidate, position) => position === index ? { ...candidate, periodicity: event.target.value as BudgetItem["periodicity"] } : candidate) })}><option>Único</option><option>Semestral</option><option>Anual</option></select></td><td><button className="text-button danger-text" type="button" disabled={!editable} onClick={() => patchBudget({ manualItems: budget.manualItems.filter((_, position) => position !== index) })}>Quitar</button></td></tr>) : <tr><td colSpan={7}>No hay costos manuales.</td></tr>}</tbody></table></div>{budget.alertPotentialDuplicates ? duplicateAlerts.length ? <div className="notice warning"><strong>Posibles duplicidades</strong><ul>{duplicateAlerts.map((alert) => <li key={alert.key}>{alert.message} {alert.allMarkedShared ? "Se normalizará si la opción está activa." : "Revise si debe marcarse como compartido."}</li>)}</ul></div> : <div className="notice success"><p>No se detectaron coincidencias evidentes.</p></div> : null}</section>

    <section className="panel summary-panel"><SectionHeading number="9" id="resumen" title="Resumen financiero" description="Matrículas equivalentes, ingresos, egresos y saldo final." /><div className="summary-grid"><div><span>Ingresos</span><strong>{formatCLP(result.annualFlows.reduce((sum, flow) => sum + flow.totalIncome, 0))}</strong></div><div><span>Egresos</span><strong>{formatCLP(result.annualFlows.reduce((sum, flow) => sum + flow.totalExpenses, 0))}</strong></div><div><span>Saldo final</span><strong>{formatCLP(result.finalAccumulatedFlow)}</strong></div><div><span>Viabilidad</span><strong>{result.viable === null ? "Informativo" : result.viable ? "Viable" : "No viable"}</strong></div></div><div className="equivalent-grid">{result.annualFlows.map((flow) => <div key={flow.year}><span>{flow.year}</span><strong>{flow.equivalentEnrollments.toLocaleString("es-CL", { maximumFractionDigits: 1 })} matrículas equivalentes</strong><small>≈ {flow.roundedEquivalentStudents} estudiantes</small></div>)}</div></section>

    <section className="panel">
      <SectionHeading
        number="10"
        id="flujo"
        title="Flujo de caja anual"
        description={`Flujo integrado y editable por año: staff, costos registrados, overhead y arrastre · ${FUNCTIONAL_RELEASE}.`}
      />
      <div className="notice info">
        <strong>Edición del flujo</strong>
        <p>Los montos de las categorías de costos y gastos se pueden ajustar directamente en esta tabla. Cada costo registrado en la sección “Costos y gastos” se incorpora inmediatamente bajo su categoría y forma parte del subtotal correspondiente, sin una tabla de detalle separada.</p>
      </div>
      <div className="table-wrap financial-flow">
        <table className="data-table financial-table cashflow-editable-table">
          <thead><tr><th>Concepto</th>{result.years.map((year) => <th className="numeric" key={year}>{year}</th>)}</tr></thead>
          <tbody>
            <FlowRow label="Matrícula anual (informativa, sin descuentos)" values={result.annualFlows.map((flow) => flow.grossEnrollmentFee)} tone="income" />
            {budget.enrollmentRecognitionRate > 0 ? <FlowRow label="Matrícula reconocida (informativa)" values={result.annualFlows.map((flow) => flow.recognizedEnrollmentFee)} tone="income" /> : null}
            <FlowRow label="Arancel bruto" values={result.annualFlows.map((flow) => flow.grossTuition)} tone="income" />
            <FlowRow label="Descuentos arancel" values={result.annualFlows.map((flow) => -flow.discounts)} tone="income" />
            {budget.scholarshipsEnabled ? <FlowRow label="Beca interna de arancel" values={result.annualFlows.map((flow) => -flow.internalTuitionScholarships)} tone="income" /> : null}
            <FlowRow label="Incobrables" values={result.annualFlows.map((flow) => -flow.badDebt)} tone="income" />
            <FlowRow label="Ingresos extraordinarios" values={result.annualFlows.map((flow) => flow.externalIncome)} tone="income" />
            <FlowRow label="INGRESOS TOTAL (sin matrícula)" values={result.annualFlows.map((flow) => flow.totalIncome)} total tone="income" />

            <FlowRow label="Horas docentes directas" values={result.annualFlows.map((flow) => -flow.directTeachingCost)} />
            <FlowRow label="Horas docentes de reemplazo" values={result.annualFlows.map((flow) => -flow.replacementTeachingCost)} />
            <FlowRow label="Guía de tesis" values={result.annualFlows.map((flow) => -flow.thesisGuidanceCost)} />

            <FlowRow label="Dirección" values={result.annualFlows.map((flow) => -flow.direction)} />
            <ManualCostRows items={budget.manualItems} years={result.years} budget={budget} categories={["Dirección"]} />
            <FlowRow label="Asistencia de dirección" values={result.annualFlows.map((flow) => -flow.assistance)} />
            <ManualCostRows items={budget.manualItems} years={result.years} budget={budget} categories={["Asistencia", "Asistencia de dirección"]} />
            <FlowRow label="Otros honorarios no académicos" values={result.annualFlows.map((flow) => -flow.otherNonAcademicHonoraria)} />
            <ManualCostRows items={budget.manualItems} years={result.years} budget={budget} categories={FLOW_COST_GROUPS.otherNonAcademic} />
            <FlowRow label="HONORARIOS NO ACADÉMICOS (SUBTOTAL)" values={result.annualFlows.map((flow) => -flow.nonAcademicHonoraria)} total />

            {budget.scholarshipsEnabled || result.annualFlows.some((flow) => flow.maintenanceScholarships > 0) ? <>
              <FlowRow label="Becas de manutención" values={result.annualFlows.map((flow) => -flow.maintenanceScholarships)} />
              <ManualCostRows items={budget.manualItems} years={result.years} budget={budget} categories={["Becas de manutención"]} />
            </> : null}

            <EditableCostFlowRow
              label="Gastos operacionales / Bienes y servicios"
              years={result.years}
              values={result.annualFlows.map((flow) => flow.operational)}
              disabled={!editable}
              onChange={(year, value) => updateEditableFlowCost(year, "annualOperational", FLOW_COST_GROUPS.operational, value)}
            />
            <ManualCostRows items={budget.manualItems} years={result.years} budget={budget} categories={FLOW_COST_GROUPS.operational} />

            <EditableCostFlowRow
              label="Software y licencias"
              years={result.years}
              values={result.annualFlows.map((flow) => flow.software)}
              disabled={!editable}
              onChange={(year, value) => updateEditableFlowCost(year, "annualSoftware", FLOW_COST_GROUPS.software, value)}
            />
            <ManualCostRows items={budget.manualItems} years={result.years} budget={budget} categories={FLOW_COST_GROUPS.software} />

            <EditableCostFlowRow
              label="Difusión"
              years={result.years}
              values={result.annualFlows.map((flow) => flow.diffusion)}
              disabled={!editable}
              onChange={(year, value) => updateEditableFlowCost(year, "annualDiffusion", FLOW_COST_GROUPS.diffusion, value)}
            />
            <ManualCostRows items={budget.manualItems} years={result.years} budget={budget} categories={FLOW_COST_GROUPS.diffusion} />

            <EditableCostFlowRow
              label="Congresos y pasantías"
              years={result.years}
              values={result.annualFlows.map((flow) => flow.congressesInternships)}
              disabled={!editable}
              onChange={(year, value) => updateEditableFlowCost(year, "annualCongressesInternships", FLOW_COST_GROUPS.congressesInternships, value)}
            />
            <ManualCostRows items={budget.manualItems} years={result.years} budget={budget} categories={FLOW_COST_GROUPS.congressesInternships} />

            <EditableCostFlowRow
              label="Libros y publicaciones"
              years={result.years}
              values={result.annualFlows.map((flow) => flow.booksPublications)}
              disabled={!editable}
              onChange={(year, value) => updateEditableFlowCost(year, "annualBooksPublications", FLOW_COST_GROUPS.booksPublications, value)}
            />
            <ManualCostRows items={budget.manualItems} years={result.years} budget={budget} categories={FLOW_COST_GROUPS.booksPublications} />

            <EditableCostFlowRow
              label="Pasajes y fletes"
              years={result.years}
              values={result.annualFlows.map((flow) => flow.travelFreight)}
              disabled={!editable}
              onChange={(year, value) => updateEditableFlowCost(year, "annualTravelFreight", FLOW_COST_GROUPS.travelFreight, value)}
            />
            <ManualCostRows items={budget.manualItems} years={result.years} budget={budget} categories={FLOW_COST_GROUPS.travelFreight} />

            <EditableCostFlowRow
              label="Viáticos"
              years={result.years}
              values={result.annualFlows.map((flow) => flow.perDiem)}
              disabled={!editable}
              onChange={(year, value) => updateEditableFlowCost(year, "annualPerDiem", FLOW_COST_GROUPS.perDiem, value)}
            />
            <ManualCostRows items={budget.manualItems} years={result.years} budget={budget} categories={FLOW_COST_GROUPS.perDiem} />

            <EditableCostFlowRow
              label="Alimentos y bebidas"
              years={result.years}
              values={result.annualFlows.map((flow) => flow.foodBeverages)}
              disabled={!editable}
              onChange={(year, value) => updateEditableFlowCost(year, "annualFoodBeverages", FLOW_COST_GROUPS.foodBeverages, value)}
            />
            <ManualCostRows items={budget.manualItems} years={result.years} budget={budget} categories={FLOW_COST_GROUPS.foodBeverages} />

            <EditableCostFlowRow
              label="Otros costos y gastos"
              years={result.years}
              values={result.annualFlows.map((flow) => flow.otherCosts)}
              disabled={!editable}
              onChange={(year, value) => updateEditableFlowCost(year, "annualOtherCosts", FLOW_COST_GROUPS.otherCosts, value)}
            />
            <ManualCostRows items={budget.manualItems} years={result.years} budget={budget} categories={FLOW_COST_GROUPS.otherCosts} />

            <FlowRow label="Base overhead" values={result.annualFlows.map((flow) => flow.overheadBase)} />
            <FlowRow label="Overhead central" values={result.annualFlows.map((flow) => -flow.centralOverhead)} />
            <FlowRow label="Overhead facultad" values={result.annualFlows.map((flow) => -flow.facultyOverhead)} />
            <FlowRow label="TOTAL COSTOS Y GASTOS" values={result.annualFlows.map((flow) => -flow.totalExpenses)} total tone="result" />
            <FlowRow label="FLUJO NETO" values={result.annualFlows.map((flow) => flow.netFlow)} total tone="result" signed />
            <FlowRow label="Arrastre inicial anual" values={result.annualFlows.map((flow) => flow.startingCarryover)} tone="result" />
            <FlowRow label="SALDO FINAL ACUMULADO" values={result.annualFlows.map((flow) => flow.accumulatedFlow)} total tone="result" signed />
          </tbody>
        </table>
      </div>
    </section>

    <section className="panel"><SectionHeading number="11" id="workflow" title="Revisión y aprobación" description="Gestión → V°B° → Aprobación, con historial auditable." /><div className="workflow-actions">{workflowActions.length ? workflowActions.map((transition) => <button key={transition.action} className="button primary" type="button" onClick={() => void executeWorkflow(transition.action)}>{actionLabels[transition.action]}</button>) : <span>No hay acciones disponibles para el rol y etapa actuales.</span>}</div></section>
  </div>;
}

function SectionHeading({ number, id, title, description, action }: { number: string; id: string; title: string; description: string; action?: ReactNode }) {
  return <div className="section-heading"><div><span className="section-number">{number}</span><h2 id={id}>{title}</h2></div><div className="section-heading-action"><p>{description}</p>{action}</div></div>;
}
function CheckSetting({ label, note, checked, disabled, onChange }: { label: string; note: string; checked: boolean; disabled: boolean; onChange: (value: boolean) => void }) {
  return <label className="setting-card"><input type="checkbox" checked={checked} disabled={disabled} onChange={(event) => onChange(event.target.checked)} /><span><strong>{label}</strong><small>{note}</small></span></label>;
}
function InputCell({ label, value, onChange, disabled, step = "1" }: { label: string; value: number; onChange: (value: number) => void; disabled: boolean; step?: string }) {
  return <td><input aria-label={label} type="number" min="0" step={step} value={value} disabled={disabled} onChange={(event) => onChange(numberValue(event.target.value))} /></td>;
}
function PercentCell({ label, value, onChange, disabled }: { label: string; value: number; onChange: (value: number) => void; disabled: boolean }) {
  return <td><div className="percent-input"><input aria-label={label} type="number" min="0" max="100" step="0.1" value={(value * 100).toFixed(1)} disabled={disabled} onChange={(event) => onChange(Math.min(1, Math.max(0, numberValue(event.target.value) / 100)))} /><span>%</span></div></td>;
}
function PeriodInputs({ year, semester, years, onYear, onSemester, disabled }: { year: number; semester: 1 | 2; years: number[]; onYear: (value: number) => void; onSemester: (value: 1 | 2) => void; disabled: boolean }) {
  return <div className="period-inputs"><select disabled={disabled} value={year} onChange={(event) => onYear(numberValue(event.target.value))}>{years.map((candidate) => <option key={candidate}>{candidate}</option>)}</select><select disabled={disabled} value={semester} onChange={(event) => onSemester(numberValue(event.target.value) as 1 | 2)}><option value="1">1S</option><option value="2">2S</option></select></div>;
}
function FlowRow({ label, values, total = false, signed = false, tone = "" }: { label: string; values: number[]; total?: boolean; signed?: boolean; tone?: "income" | "result" | "" }) {
  const resolved = tone || (total ? "" : "expense");
  return <tr className={`${total ? "row-total" : ""} ${resolved ? `row-${resolved}` : ""}`}><th>{label}</th>{values.map((value, index) => <td key={index} className={`numeric ${signed ? value >= 0 ? "positive-text" : "negative-text" : ""}`}>{formatCLP(value)}</td>)}</tr>;
}

function EditableCostFlowRow({
  label,
  years,
  values,
  disabled,
  onChange,
}: {
  label: string;
  years: number[];
  values: number[];
  disabled: boolean;
  onChange: (year: number, value: number) => void;
}) {
  return <tr className="row-expense flow-editable-row">
    <th>{label}<small>Editable; incluye los costos registrados bajo esta categoría.</small></th>
    {years.map((year, index) => <td key={`${label}-${year}`} className="numeric">
      {disabled
        ? formatCLP(-values[index])
        : <div className="flow-money-input"><span>$ -</span><input aria-label={`${label} ${year}`} type="number" min="0" step="1" value={values[index]} onChange={(event) => onChange(year, numberValue(event.target.value))} /></div>}
    </td>)}
  </tr>;
}

function ManualCostRows({
  items,
  years,
  budget,
  categories,
}: {
  items: BudgetItem[];
  years: number[];
  budget: CohortBudget;
  categories: readonly BudgetItem["category"][];
}) {
  const matching = items.filter((item) => categories.includes(item.category));
  if (!matching.length) return null;
  return <>
    {matching.map((item) => <tr className="flow-detail-row" key={`flow-detail-${item.id}`}>
      <th><span>Incluido: {item.name}</span><small>{item.periodicity} · {item.costType}</small></th>
      {years.map((year) => <td className="numeric" key={`flow-detail-${item.id}-${year}`}>{formatCLP(-manualItemAmountForYear(item, budget, year))}</td>)}
    </tr>)}
  </>;
}
