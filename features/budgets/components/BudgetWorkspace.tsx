"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { StatusBadge } from "@/components/StatusBadge";
import { calculateBudget, defaultAnnualOverrideForYear, effectiveBadDebtRate, hydrateAnnualOverrides, manualItemAmountForYear, overheadApplies, programTypeParameters, resolvedAnnualOverrideForYear, tuitionForProgramYear } from "@/lib/calculations/budget-engine";
import { calculateBreakEvenEquivalentEnrollments } from "@/lib/calculations/break-even";
import { detectPotentialDuplicateCosts } from "@/lib/calculations/consolidation";
import { formatCLP, formatPercent } from "@/lib/calculations/currency";
import { getActivePeriods, getActiveYears, getAnnualEnrollmentChargePeriods } from "@/lib/calculations/periods";
import type {
  AccessRole,
  BudgetAnnualOverride,
  BudgetItem,
  BudgetTemplate,
  CohortBudget,
  DeliveryModality,
  TeachingMode,
  ExternalIncome,
  InstitutionalParameters,
  Program,
  SemesterParameters,
  TuitionSource,
} from "@/lib/calculations/types";
import { institutionalParameters as fallbackParameters } from "@/lib/demo-data";
import { downloadBudgetMemorandum, downloadBudgetPdf, downloadBudgetXlsx } from "@/lib/export/download";
import type { ApiBudgetRecord, ApiIdentity, ApiProgram } from "@/lib/mappers/budget-api";
import { numberValue, responseBody, toBudget, toProgram } from "@/lib/mappers/budget-api";
import { tuitionSourceLabel } from "@/lib/programs/tuition-source";
import { applyBudgetTemplate } from "@/lib/templates/apply-template";
import { defaultBudgetTemplates } from "@/lib/templates/default-templates";
import { availableWorkflowActions, canDeleteBudget, canEditBudget, type WorkflowAction } from "@/lib/workflow/budget-workflow";
import { auditBudgetIntegrity } from "@/lib/validation/budget-integrity";
import { applyProgramCurriculumToBudget, curriculumCourseAppliedMode, curriculumCourseEffectiveHours, curriculumCourseRawHours, curriculumCourseWeeklyDirectHours, payableCurriculumCourses } from "@/lib/curriculum/budget-load";
import { fullProgramDiscountRange, synchronizeInitialStudents, synchronizeLastSemesterGraduation } from "@/lib/budgets/form-defaults";

const ROLE_KEY = "utem-postgrado-active-role-v10";
const FUNCTIONAL_RELEASE = "v11.0.5";
const COST_CATEGORIES: BudgetItem["category"][] = [
  "Otros honorarios no académicos",
  "Dirección",
  "Asistencia de dirección",
  "Gastos operacionales / Bienes y servicios",
  "Software y licencias",
  "Difusión",
  "Congresos y pasantías",
  "Becas de manutención",
  "Becas y ayudas",
  "Equipamiento",
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
  scholarshipsAid: ["Becas de manutención", "Becas y ayudas"] as BudgetItem["category"][],
  equipment: ["Equipamiento"] as BudgetItem["category"][],
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
const INCOME_TYPES: ExternalIncome["type"][] = ["Beca ANID", "Otra beca externa", "Convenio", "Aporte institucional", "Financiamiento institucional", "Proyecto", "Donación", "Ingreso extraordinario", "Otro"];
const roleLabels: Record<AccessRole, string> = { ADMIN: "Administrador", CREADOR: "Creador", LECTOR: "Lector", GESTOR: "Gestor", VISTO_BUENO: "V°B°", APROBADOR: "Aprobación" };
const actionLabels: Record<WorkflowAction, string> = { SUBMIT_VB: "Enviar a V°B°", VB_APPROVE: "Otorgar V°B°", VB_OBSERVE: "Observar", FINAL_APPROVE: "Aprobar", FINAL_OBSERVE: "Observar y devolver" };

const uid = (prefix: string) => `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

function emptySemester(year: number, semester: 1 | 2, students: number): SemesterParameters {
  return {
    year, semester, activeStudents: students, graduatingStudents: 0,
    directTeachingHours: 0, synchronousTeachingHours: 0, asynchronousTeachingHours: 0, replacementTeachingHours: 0,
    electiveSubjects: 0, electiveSections: 0, specializedCourses: 0, specializedSections: 0,
    internalTuitionScholarshipStudents: 0, internalTuitionScholarshipCoverage: 1,
    maintenanceScholarshipStudents: 0, maintenanceScholarshipMonths: 0, notes: "",
  };
}

function freshBudget(program: Program, responsible: string, parameters: InstitutionalParameters): CohortBudget {
  const startYear = Math.min(...Object.keys(parameters.annualEnrollmentFee).map(Number).filter(Number.isFinite));
  const institutionalStartYear = Number.isFinite(startYear) ? startYear : new Date().getFullYear();
  const year = program.type === "MAGISTER_PROFESIONAL" ? Math.max(2027, institutionalStartYear) : institutionalStartYear;
  const duration = Math.min(8, Math.max(2, program.officialDurationSemesters));
  const semesters = getActivePeriods(year, 1, duration).map((period, index) => ({
    ...emptySemester(period.year, period.semester, 0),
    graduatingStudents: index === duration - 1 ? 0 : 0,
  }));
  const typeParameters = programTypeParameters(parameters, program.type);
  const base: CohortBudget = {
    id: uid("draft"), program, cohortName: `${program.code} ${year}-1S`, startYear: year, startSemester: 1,
    durationSemesters: duration, initialStudents: 0, status: "Borrador", workflowStage: "GESTION",
    facultyOverheadRate: overheadApplies(program.type) ? typeParameters.facultyOverheadRate : 0,
    enrollmentRecognitionRate: 0,
    badDebtRate: typeParameters.badDebtRate,
    programVersionLabel: program.versionLabel ?? "1",
    scholarshipsEnabled: program.type !== "MAGISTER_PROFESIONAL",
    deliveryModality: "PRESENCIAL",
    authorizedInitialCarryover: 0, includeAuthorizedCarryover: true,
    normalizeSharedCosts: true, alertPotentialDuplicates: true, responsible, version: 1,
    annualOverrides: getActiveYears(getActivePeriods(year, 1, duration)).map((activeYear) =>
      defaultAnnualOverrideForYear({ program, facultyOverheadRate: overheadApplies(program.type) ? typeParameters.facultyOverheadRate : 0 }, parameters, activeYear)),
    createdAt: new Date().toISOString(), semesters, discounts: [], externalIncome: [], manualItems: [], sharedCourses: [], reviewHistory: [],
  };
  return applyProgramCurriculumToBudget(base);
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
  const [programFilterId, setProgramFilterId] = useState("");
  const [draftBudget, setDraftBudget] = useState<CohortBudget | null>(null);
  const [dirty, setDirty] = useState(false);
  const [role, setRole] = useState<AccessRole>("LECTOR");
  const [message, setMessage] = useState("");
  const [curriculumBreakEvenSuggestion, setCurriculumBreakEvenSuggestion] = useState<ReturnType<typeof calculateBreakEvenEquivalentEnrollments> | null>(null);
  const [curriculumApplying, setCurriculumApplying] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [mailDialog, setMailDialog] = useState<{ action?: WorkflowAction; role: string; title: string } | null>(null);
  const [recipients, setRecipients] = useState<Array<{ id: string; name: string; email: string; roles: string[] }>>([]);
  const [recipientEmail, setRecipientEmail] = useState("");
  const [recipientName, setRecipientName] = useState("");
  const [recipientMode, setRecipientMode] = useState("");
  const [mailComment, setMailComment] = useState("");
  const [selectedTemplateId, setSelectedTemplateId] = useState("");
  const [staffAdjustmentPercent, setStaffAdjustmentPercent] = useState(5);

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
      const mappedPrograms = programRecords.map(toProgram);
      let mapped = budgetRecords.map(toBudget).map((item) => hydrateAnnualOverrides(item, parameterValues));
      const nextId = preferredId && mapped.some((item) => item.id === preferredId) ? preferredId : mapped[0]?.id ?? "";
      let nextBudget = mapped.find((item) => item.id === nextId) ?? null;
      if (nextId) {
        const exactRecord = await responseBody<ApiBudgetRecord>(await fetch(`/api/budgets/${nextId}`, { cache: "no-store" }));
        nextBudget = hydrateAnnualOverrides(toBudget(exactRecord), parameterValues);
        mapped = mapped.map((item) => item.id === nextId ? nextBudget! : item);
      }
      setBudgets(mapped);
      setPrograms(mappedPrograms);
      setTemplates(templateRecords.length ? templateRecords : defaultBudgetTemplates);
      setParameters(parameterValues);
      setStaffAdjustmentPercent(Math.max(0, parameterValues.annualAdjustmentRate * 100));
      setIdentity(me);
      const storedRole = typeof window !== "undefined" ? window.localStorage.getItem(ROLE_KEY) as AccessRole | null : null;
      const resolvedRole = storedRole && me.roles.includes(storedRole) ? storedRole : me.roles[0] ?? "LECTOR";
      setRole(resolvedRole);
      setSelectedId(nextId);
      setProgramFilterId(nextBudget?.program.id ?? mappedPrograms[0]?.id ?? "");
      setSelectedTemplateId(nextBudget?.appliedTemplateId ?? "");
      setDraftBudget(nextBudget ? structuredClone(nextBudget) : null);
      setDirty(false);
      setCurriculumBreakEvenSuggestion(null);
      if (typeof window !== "undefined" && nextId) {
        const url = new URL(window.location.href);
        url.searchParams.set("budget", nextId);
        window.history.replaceState({}, "", url.toString());
      }
      setMessage("");
    } catch (reason) {
      setMessage(reason instanceof Error ? reason.message : "No fue posible cargar el espacio de presupuestos.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (typeof window === "undefined") return;
    const query = new URLSearchParams(window.location.search);
    const preferredBudget = query.get("budget") ?? undefined;
    const preferredProgram = query.get("program") ?? "";
    void load(preferredBudget).then(() => {
      if (preferredBudget || !preferredProgram) return;
      setProgramFilterId((current) => current || preferredProgram);
    });
  }, []);

  useEffect(() => {
    const warnBeforeUnload = (event: BeforeUnloadEvent) => {
      if (!dirty) return;
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warnBeforeUnload);
    return () => window.removeEventListener("beforeunload", warnBeforeUnload);
  }, [dirty]);

  async function selectBudget(nextId: string) {
    if (!nextId) return;
    const candidate = budgets.find((item) => item.id === nextId);
    if (!candidate) return;
    if (nextId === selectedId && !dirty) return;
    if (dirty && !window.confirm(`El presupuesto activo “${budget?.cohortName ?? ""}” tiene cambios sin guardar. ¿Desea descartarlos y cargar “${candidate.cohortName}”?`)) return;
    await load(nextId);
    setMessage(`Presupuesto cargado: ${candidate.program.code} · ${candidate.program.name} · ${candidate.cohortName}. Toda la página quedó sincronizada con este presupuesto.`);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function selectProgram(nextProgramId: string) {
    if (!nextProgramId) return;
    const program = programs.find((item) => item.id === nextProgramId);
    if (!program) return;
    if (dirty && !window.confirm(`El presupuesto activo “${budget?.cohortName ?? ""}” tiene cambios sin guardar. ¿Desea descartarlos para cambiar a ${program.code}?`)) return;

    setProgramFilterId(nextProgramId);
    const programBudgets = budgets
      .filter((item) => item.program.id === nextProgramId)
      .sort((a, b) => (b.updatedAt ?? "").localeCompare(a.updatedAt ?? ""));

    if (!programBudgets.length) {
      setSelectedId("");
      setSelectedTemplateId("");
      setDraftBudget(null);
      setDirty(false);
      if (typeof window !== "undefined") {
        const url = new URL(window.location.href);
        url.searchParams.delete("budget");
        url.searchParams.set("program", nextProgramId);
        window.history.replaceState({}, "", url.toString());
      }
      setMessage(`${program.code} · ${program.name} está disponible y todavía no tiene presupuestos. Presione “Nuevo presupuesto” para crear su primera cohorte.`);
      window.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }

    await load(programBudgets[0].id);
    setMessage(`Programa seleccionado: ${program.code} · ${program.name}. Se cargó su presupuesto más reciente y toda la formulación quedó sincronizada.`);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  const budget = draftBudget;
  const result = useMemo(() => budget ? calculateBudget(budget, parameters) : null, [budget, parameters]);
  const breakEven = useMemo(() => budget && budget.program.type === "MAGISTER_PROFESIONAL"
    ? calculateBreakEvenEquivalentEnrollments(budget, parameters)
    : null, [budget, parameters]);
  const editable = budget ? canEditBudget(budget, role) && !loading : false;
  const deletable = budget ? canDeleteBudget(budget, role) && !loading : false;
  const workflowActions = budget ? availableWorkflowActions(budget.workflowStage, role) : [];
  const budgetsForChecks = budget ? budgets.map((item) => item.id === budget.id ? budget : item) : budgets;
  const duplicateAlerts = budget ? detectPotentialDuplicateCosts(budgetsForChecks, budget.id) : [];
  const integrityIssues = budget ? auditBudgetIntegrity(budget, programs, templates) : [];
  const blockingIntegrityIssues = integrityIssues.filter((issue) => issue.severity === "error");
  const relevantTemplates = budget ? templates
    .filter((template) => template.programType === budget.program.type && template.active && (!template.programId || template.programId === budget.program.id))
    .sort((a, b) => a.name.localeCompare(b.name, "es")) : [];
  const effectiveTemplateId = relevantTemplates.some((template) => template.id === selectedTemplateId)
    ? selectedTemplateId
    : (relevantTemplates[0]?.id ?? "");
  const curriculumCourses = budget ? [...(budget.program.curriculumCourses ?? [])].sort((a, b) => a.semester - b.semester || a.position - b.position) : [];
  const payableCurriculum = budget ? payableCurriculumCourses(budget.program) : [];
  const curriculumHasPayableHours = payableCurriculum.some((course) => curriculumCourseRawHours(course) > 0);
  const importPendingFields = budget?.notes?.match(/Campos pendientes de completar:\s*([^.]*)\./i)?.[1]?.trim() ?? "";

  function setActiveRole(next: AccessRole) {
    setRole(next);
    window.localStorage.setItem(ROLE_KEY, next);
  }

  function replaceBudget(next: CohortBudget) {
    if (!draftBudget || next.id !== draftBudget.id) return;
    setDraftBudget(structuredClone(next));
    setDirty(true);
    setCurriculumBreakEvenSuggestion(null);
  }

  function patchBudget(patch: Partial<CohortBudget>) {
    if (!budget) return;
    replaceBudget({ ...budget, ...patch, updatedAt: new Date().toISOString() });
  }

  function markImportedPendingFieldsReviewed() {
    if (!budget || !importPendingFields) return;
    const nextNotes = (budget.notes ?? "")
      .replace(/\s*Campos pendientes de completar:\s*[^.]*\./i, "")
      .replace(/\s{2,}/g, " ")
      .trim();
    patchBudget({ notes: nextNotes || undefined });
    setMessage("Pendientes de importación marcados como revisados. Presione “Guardar cambios” para persistir esta confirmación.");
  }

  function updateSemester(index: number, field: keyof SemesterParameters, value: number | string) {
    if (!budget) return;
    replaceBudget({ ...budget, semesters: budget.semesters.map((semester, candidate) => candidate === index ? { ...semester, [field]: value } : semester) });
  }

  function regeneratePeriods(startYear: number, startSemester: 1 | 2, durationSemesters: number, initialStudents: number) {
    if (!budget) return;
    const current = new Map(budget.semesters.map((semester) => [`${semester.year}-${semester.semester}`, semester]));
    const periods = getActivePeriods(startYear, startSemester, durationSemesters);
    const semesters = periods.map((period, index) => {
      const existing = current.get(`${period.year}-${period.semester}`);
      const baseSemester = existing ?? emptySemester(period.year, period.semester, initialStudents);
      return {
        ...baseSemester,
        activeStudents: existing?.activeStudents ?? initialStudents,
        graduatingStudents: index === periods.length - 1 ? Math.max(0, Math.round(initialStudents)) : baseSemester.graduatingStudents,
      };
    });
    const synchronizedSemesters = synchronizeLastSemesterGraduation(semesters, initialStudents);
    const base = { ...budget, startYear, startSemester, durationSemesters, initialStudents, semesters: synchronizedSemesters };
    replaceBudget(hydrateAnnualOverrides(base, parameters));
  }

  function setInitialStudentsForAllSemesters(initialStudents: number) {
    if (!budget) return;
    const value = Math.max(0, Math.round(initialStudents));
    patchBudget({
      initialStudents: value,
      semesters: synchronizeInitialStudents(budget.semesters, value),
    });
    setMessage(`Estudiantes iniciales actualizado a ${value}. Se replicó en todos los semestres activos y en graduación del último semestre; puede ajustar cada periodo después.`);
  }

  function curriculumHourTotals(candidate: CohortBudget) {
    return candidate.semesters.reduce((totals, semester) => ({
      presencial: totals.presencial + Math.max(0, semester.directTeachingHours),
      sincronica: totals.sincronica + Math.max(0, semester.synchronousTeachingHours),
      asincronica: totals.asincronica + Math.max(0, semester.asynchronousTeachingHours),
    }), { presencial: 0, sincronica: 0, asincronica: 0 });
  }

  async function applyCurriculumToActiveBudget(showSuggestion = false) {
    if (!budget) return;
    setCurriculumApplying(true);
    try {
      // La malla se vuelve a leer desde D1 antes de aplicarla. Así el presupuesto no usa
      // una copia antigua del programa que haya quedado cargada antes de importar/editar la malla.
      const latestRecord = await responseBody<ApiProgram>(await fetch(`/api/programs/${budget.program.id}`, { cache: "no-store" }));
      const latestProgram = toProgram(latestRecord);
      if (!latestProgram.curriculumCourses?.length) {
        setMessage(`El programa ${latestProgram.code} no tiene una malla curricular guardada en D1. Si acaba de importarla, vuelva a Programas y presione “Guardar modificaciones” antes de aplicarla al presupuesto.`);
        setCurriculumBreakEvenSuggestion(null);
        return;
      }
      setPrograms((current) => current.map((program) => program.id === latestProgram.id ? latestProgram : program));
      const next = applyProgramCurriculumToBudget({ ...budget, program: latestProgram });
      const totals = curriculumHourTotals(next);
      const totalHours = totals.presencial + totals.sincronica + totals.asincronica;
      const semesterSummary = next.semesters.map((semester) => {
        const hours = Math.max(0, semester.directTeachingHours) + Math.max(0, semester.synchronousTeachingHours) + Math.max(0, semester.asynchronousTeachingHours);
        return `${semester.year}-${semester.semester}S: ${hours.toLocaleString("es-CL", { maximumFractionDigits: 2 })} h`;
      }).join(" · ");
      replaceBudget(next);
      if (showSuggestion && next.program.type === "MAGISTER_PROFESIONAL") {
        const suggestion = calculateBreakEvenEquivalentEnrollments(next, parameters);
        setCurriculumBreakEvenSuggestion(suggestion);
        setMessage(suggestion.minimumEquivalentEnrollments === null
          ? `Malla aplicada desde D1 (${totalHours.toLocaleString("es-CL")} horas docentes equivalentes). No se encontró un punto de equilibrio dentro del rango de búsqueda.`
          : `Malla aplicada desde D1. Punto de equilibrio sugerido: ${suggestion.minimumEquivalentEnrollments.toLocaleString("es-CL", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} matrículas equivalentes (≈ ${suggestion.minimumWholeStudents} estudiantes a arancel completo).`);
        return;
      }
      setCurriculumBreakEvenSuggestion(null);
      setMessage(totalHours > 0
        ? `Malla curricular aplicada desde D1: ${totals.presencial.toLocaleString("es-CL")} h presenciales · ${totals.sincronica.toLocaleString("es-CL")} h sincrónicas · ${totals.asincronica.toLocaleString("es-CL")} h asincrónicas equivalentes. Consolidación semestral: ${semesterSummary}.`
        : `La malla guardada contiene ${latestProgram.curriculumCourses.length} registros, pero no produjo horas docentes valorizables. Revise semanas, trabajo directo y tipo de docencia de las asignaturas en Programas.`);
    } catch (reason) {
      setMessage(reason instanceof Error ? reason.message : "No fue posible cargar y aplicar la malla curricular desde D1.");
    } finally {
      setCurriculumApplying(false);
    }
  }

  function addDiscount() {
    if (!budget) return;
    const range = fullProgramDiscountRange(budget.startYear, budget.startSemester, budget.durationSemesters);
    patchBudget({
      discounts: [...budget.discounts, {
        id: uid("discount"), name: "Nuevo descuento", percentage: 0, students: 0,
        ...range,
      }],
    });
  }

  async function createBudget() {
    if (!identity || !programs.length) return;
    if (dirty && !window.confirm(`El presupuesto activo “${budget?.cohortName ?? ""}” tiene cambios sin guardar. Crear un presupuesto nuevo descartará esos cambios locales. ¿Desea continuar?`)) return;
    const program = programs.find((item) => item.id === programFilterId) ?? budget?.program ?? programs[0];
    if (!program) return;
    const draft = freshBudget(program, identity.name, parameters);
    try {
      const response = await fetch("/api/budgets", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({
          programId: program.id, cohortName: draft.cohortName, startYear: draft.startYear, startSemester: draft.startSemester,
          durationSemesters: draft.durationSemesters, initialStudents: draft.initialStudents,
          facultyOverheadRate: draft.facultyOverheadRate, enrollmentRecognitionRate: draft.enrollmentRecognitionRate, badDebtRate: draft.badDebtRate,
          programVersionLabel: draft.programVersionLabel, scholarshipsEnabled: draft.scholarshipsEnabled, deliveryModality: draft.deliveryModality,
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
          cohortName: budget.cohortName,
          startYear: budget.startYear,
          startSemester: budget.startSemester,
          durationSemesters: budget.durationSemesters,
          initialStudents: budget.initialStudents,
          facultyOverheadRate: budget.facultyOverheadRate,
          enrollmentRecognitionRate: budget.enrollmentRecognitionRate,
          badDebtRate: Number.isFinite(budget.badDebtRate) ? budget.badDebtRate : null,
          programVersionLabel: budget.programVersionLabel,
          scholarshipsEnabled: budget.scholarshipsEnabled,
          deliveryModality: budget.deliveryModality,
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
          sharedCourses: budget.sharedCourses,
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

  function workflowRecipientRole(action: WorkflowAction): string {
    if (action === "SUBMIT_VB") return "VISTO_BUENO";
    if (action === "VB_APPROVE") return "APROBADOR";
    return "GESTOR";
  }

  async function openMailDialog(action?: WorkflowAction) {
    if (dirty) {
      setMessage("Guarde o descarte los cambios locales antes de enviar el presupuesto o avanzar en el flujo de aprobación. Los correos y el workflow siempre usan la versión persistida en D1.");
      return;
    }
    if (blockingIntegrityIssues.length) {
      setMessage("Resuelva las inconsistencias de identidad del presupuesto antes de enviarlo o avanzar en el flujo de aprobación.");
      return;
    }
    const targetRole = action ? workflowRecipientRole(action) : "TODOS";
    try {
      const list = await responseBody<Array<{ id: string; name: string; email: string; roles: string[] }>>(await fetch(`/api/workflow/recipients?role=${targetRole}`, { cache: "no-store" }));
      setRecipients(list); setRecipientMode(list[0]?.email ?? "OTROS"); setRecipientEmail(list[0]?.email ?? ""); setRecipientName(list[0]?.name ?? ""); setMailComment("");
      setMailDialog({ action, role: targetRole, title: action ? `${actionLabels[action]} y notificar` : "Enviar presupuesto por correo" });
    } catch (reason) { setMessage(reason instanceof Error ? reason.message : "No fue posible cargar los destinatarios."); }
  }

  async function confirmMailAction() {
    if (!budget || !mailDialog || !recipientEmail.trim()) return;
    try {
      if (mailDialog.action) {
        await responseBody(await fetch(`/api/budgets/${budget.id}/workflow`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: mailDialog.action, comment: mailComment }) }));
      }
      const notice = await responseBody<{ sent: boolean; mailtoUrl: string; warning?: string | null }>(await fetch("/api/notifications/email", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ budgetId: budget.id, recipientEmail: recipientEmail.trim(), recipientName: recipientName.trim() || undefined, action: mailDialog.action ?? "SHARE", comment: mailComment }) }));
      setMailDialog(null); await load(budget.id);
      setMessage(notice.sent ? "Acción registrada y aviso enviado por correo." : (notice.warning ?? "Aviso preparado. Se abrirá su cliente de correo para enviarlo."));
      if (!notice.sent && notice.mailtoUrl) window.location.href = notice.mailtoUrl;
    } catch (reason) { setMessage(reason instanceof Error ? reason.message : "No fue posible completar la acción y el aviso."); }
  }

  async function cloneBudget() {
    if (!budget || !identity || !canCreate(identity.roles)) return;
    if (dirty && !window.confirm("El presupuesto activo tiene cambios sin guardar. La copia incluirá esos cambios locales, pero el presupuesto original permanecerá sin guardarlos. ¿Desea continuar?")) return;
    try {
      const cloneTag = new Date().toISOString().replace(/[-:TZ.]/g, "").slice(0, 14);
      const clonedCohortName = `${budget.cohortName} · copia ${cloneTag}`;
      const created = await responseBody<{ id: string }>(await fetch("/api/budgets", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ programId: budget.program.id, cohortName: clonedCohortName, startYear: budget.startYear, startSemester: budget.startSemester, durationSemesters: budget.durationSemesters, initialStudents: budget.initialStudents, facultyOverheadRate: budget.facultyOverheadRate, enrollmentRecognitionRate: budget.enrollmentRecognitionRate, badDebtRate: Number.isFinite(budget.badDebtRate) ? budget.badDebtRate : null, programVersionLabel: budget.programVersionLabel, scholarshipsEnabled: budget.scholarshipsEnabled, deliveryModality: budget.deliveryModality, annualOverrides: budget.annualOverrides, authorizedInitialCarryover: budget.authorizedInitialCarryover, includeAuthorizedCarryover: budget.includeAuthorizedCarryover, normalizeSharedCosts: budget.normalizeSharedCosts, alertPotentialDuplicates: budget.alertPotentialDuplicates, appliedTemplateId: budget.appliedTemplateId ?? null, appliedTemplateVersion: budget.appliedTemplateVersion ?? null, notes: `Clonado desde ${budget.cohortName}`, responsibleId: identity.userId }) }));
      await responseBody(await fetch(`/api/budgets/${created.id}`, { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ deliveryModality: budget.deliveryModality, annualOverrides: budget.annualOverrides, semesters: budget.semesters.map((semester, position) => ({ ...semester, position })), discounts: budget.discounts, externalIncome: budget.externalIncome, items: budget.manualItems, sharedCourses: budget.sharedCourses, notes: `Clonado desde ${budget.program.code} · ${budget.cohortName}`, changeNote: "Clonación de presupuesto" }) }));
      await load(created.id); setMessage("Presupuesto clonado como nuevo borrador independiente.");
    } catch (reason) { setMessage(reason instanceof Error ? reason.message : "No fue posible clonar el presupuesto."); }
  }

  function applyTemplate(template: BudgetTemplate) {
    if (!budget) return;
    if (template.programType !== budget.program.type || (template.programId && template.programId !== budget.program.id)) {
      setMessage(`La plantilla “${template.name}” no corresponde a ${budget.program.code}. No se aplicó ningún cambio.`);
      return;
    }
    let next = applyBudgetTemplate(budget, template, parameters);
    if (next.program.type === "MAGISTER_PROFESIONAL") {
      next = {
        ...next,
        scholarshipsEnabled: false,
        annualOverrides: next.annualOverrides.map((annual) => ({
          ...annual,
          maintenanceScholarshipMonthlyValue: 0,
          directTeachingHourValue: annual.synchronousTeachingHourValue,
          asynchronousTeachingHourValue: annual.synchronousTeachingHourValue,
        })),
        semesters: next.semesters.map((semester) => ({
          ...semester,
          internalTuitionScholarshipStudents: 0,
          maintenanceScholarshipStudents: 0,
          maintenanceScholarshipMonths: 0,
        })),
      };
    }
    replaceBudget(next);
    setSelectedTemplateId(template.id);
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

  function applyStaffAdjustmentToNextYear(year: number) {
    if (!budget) return;
    const ordered = [...budget.annualOverrides].sort((a, b) => a.year - b.year);
    const currentIndex = ordered.findIndex((item) => item.year === year);
    const current = ordered[currentIndex];
    const next = ordered[currentIndex + 1];
    if (!current || !next) {
      setMessage(`${year}: no existe un año siguiente activo dentro de este presupuesto.`);
      return;
    }
    const factor = 1 + Math.max(0, staffAdjustmentPercent) / 100;
    updateAnnualOverride(next.year, {
      annualDirection: Math.round(current.annualDirection * factor),
      annualAssistance: Math.round(current.annualAssistance * factor),
      annualOtherNonAcademicHonoraria: Math.round(current.annualOtherNonAcademicHonoraria * factor),
    });
    setMessage(`Staff ${next.year} proyectado desde ${year} con reajuste de ${staffAdjustmentPercent.toLocaleString("es-CL", { maximumFractionDigits: 2 })} %.`);
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

  function addManualCost() {
    if (!budget) return;
    patchBudget({
      manualItems: [...budget.manualItems, {
        id: uid("cost"),
        name: "Nuevo costo",
        description: "",
        category: "Otros costos y gastos",
        year: result?.years[0] ?? budget.startYear,
        amount: 0,
        costType: "Único de esta versión",
        periodicity: "Único",
      }],
    });
    setMessage("Nuevo costo agregado. Puede editarlo en la sección Costos y gastos o directamente verificarlo en el flujo de caja.");
  }

  function removeManualCost(itemId: string) {
    if (!budget) return;
    const item = budget.manualItems.find((candidate) => candidate.id === itemId);
    if (!item) return;
    if (!window.confirm(`¿Quitar del presupuesto el costo “${item.name}”?`)) return;
    patchBudget({ manualItems: budget.manualItems.filter((candidate) => candidate.id !== itemId) });
    setMessage(`Costo “${item.name}” quitado del flujo. Presione “Guardar cambios” para persistir la eliminación.`);
  }

  async function exportBudget(format: "xlsx" | "pdf" | "memo") {
    if (!budget || !result) return;
    try {
      if (format === "xlsx") await downloadBudgetXlsx(budget, result, parameters);
      else if (format === "pdf") await downloadBudgetPdf(budget, result, parameters, budgetsForChecks);
      else await downloadBudgetMemorandum(budget, result, parameters);
      setMessage(format === "memo" ? "Memorándum institucional generado." : `Exportación ${format.toUpperCase()} generada.`);
    } catch (reason) {
      setMessage(reason instanceof Error ? reason.message : "No fue posible generar la exportación.");
    }
  }

  if (loading && !budget) return <div className="notice info"><p>Cargando presupuestos desde D1…</p></div>;

  if (!budget || !result) {
    const chosenProgram = programs.find((item) => item.id === programFilterId) ?? programs[0] ?? null;
    const roles = identity?.roles ?? [];
    return <div className="budget-workspace">
      {message ? <div className="notice info"><p>{message}</p></div> : null}
      <section className="panel budget-selector isolated-budget-selector compact-selector">
        <div className="budget-filter-controls">
          <label>Programa
            <select value={chosenProgram?.id ?? ""} onChange={(event) => void selectProgram(event.target.value)}>
              {programs.map((program) => <option key={program.id} value={program.id}>{program.code} · {program.name}</option>)}
            </select>
            <small>Todos los programas activos creados en el módulo Programas quedan disponibles aquí.</small>
          </label>
          <label>Presupuesto / cohorte<select disabled><option>Sin presupuestos para este programa</option></select></label>
          <label>Rol activo<select value={role} onChange={(event) => setActiveRole(event.target.value as AccessRole)}>{roles.map((candidate) => <option key={candidate} value={candidate}>{roleLabels[candidate]}</option>)}</select></label>
        </div>
        <div className="active-budget-context empty-budget-context" aria-live="polite">
          <span>Programa seleccionado</span>
          <strong>{chosenProgram ? `${chosenProgram.code} · ${chosenProgram.name}` : "Sin programa seleccionado"}</strong>
          <small>{chosenProgram ? "Todavía no existe una cohorte presupuestaria para este programa." : "Cree primero un programa en el módulo Programas."}</small>
        </div>
        <div className="workspace-actions"><button className="button primary" type="button" disabled={!canCreate(roles) || !chosenProgram} onClick={() => void createBudget()}>Nuevo presupuesto</button></div>
      </section>
      <section className="panel empty-state"><h2>{chosenProgram ? `Crear presupuesto para ${chosenProgram.code}` : "No hay programas disponibles"}</h2><p>{chosenProgram ? `El programa ${chosenProgram.name} ya está disponible en Presupuestos. Cree su primera cohorte para comenzar la formulación.` : "Agregue un programa en el módulo Programas y luego vuelva a Presupuestos."}</p></section>
    </div>;
  }

  const typeParameters = programTypeParameters(parameters, budget.program.type);
  const overhead = overheadApplies(budget.program.type);
  const roles = identity?.roles ?? [];

  return <div className="budget-workspace">
    {message ? <div className="notice info"><p>{message}</p></div> : null}
    <section className="panel budget-selector isolated-budget-selector">
      <div className="budget-filter-controls">
        <label>Programa
          <select value={programFilterId || budget.program.id} onChange={(event) => void selectProgram(event.target.value)}>
            {programs.map((program) => <option key={program.id} value={program.id}>{program.code} · {program.name}</option>)}
          </select>
          <small>Elegir un programa carga un presupuesto de ese programa; nunca reasigna el presupuesto activo.</small>
        </label>
        <label>Presupuesto / cohorte
          <select value={selectedId} onChange={(event) => void selectBudget(event.target.value)}>
            {budgets.filter((item) => item.program.id === (programFilterId || budget.program.id)).map((item) => <option key={item.id} value={item.id}>[{item.status}] {item.cohortName} · Versión {item.programVersionLabel} · R{item.version}</option>)}
          </select>
          <small>Al cambiar de cohorte se vuelve a leer ese presupuesto desde D1 y se reemplaza toda la página.</small>
        </label>
        <button className="button secondary budget-filter-button" type="button" disabled={loading || !dirty} onClick={() => void selectBudget(selectedId)}>{loading ? "Cargando…" : "Descartar cambios y recargar"}</button><button className="button secondary budget-filter-button" type="button" disabled={loading} onClick={() => void load(selectedId || undefined)}>Actualizar listas</button>
        <label>Rol activo<select value={role} onChange={(event) => setActiveRole(event.target.value as AccessRole)}>{roles.map((candidate) => <option key={candidate} value={candidate}>{roleLabels[candidate]}</option>)}</select></label>
      </div>
      <div className="active-budget-context" aria-live="polite">
        <span>Presupuesto activo</span>
        <strong>{budget.program.code} · {budget.program.name} · {budget.cohortName} · Versión {budget.programVersionLabel} · R{budget.version}</strong>
        <small>{dirty ? "Cambios locales sin guardar. Sólo afectan este presupuesto hasta que presione Guardar cambios." : "Datos cargados desde D1. La edición está aislada de los demás presupuestos."}</small>
        {dirty ? <span className="badge dirty-badge">Cambios sin guardar</span> : <span className="badge approved">Presupuesto cargado</span>}
      </div>
      <div className="workspace-actions"><button className="button secondary" type="button" onClick={() => void exportBudget("xlsx")}>Exportar XLSX</button><button className="button secondary" type="button" onClick={() => void exportBudget("pdf")}>Exportar PDF</button><button className="button secondary" type="button" onClick={() => void exportBudget("memo")}>Descargar memorándum</button><button className="button secondary" type="button" disabled={dirty || blockingIntegrityIssues.length > 0} onClick={() => void openMailDialog()}>Enviar por correo</button><button className="button secondary" type="button" disabled={!canCreate(roles)} onClick={() => void cloneBudget()}>Clonar presupuesto</button><button className="button primary" type="button" disabled={!editable || saving || blockingIntegrityIssues.length > 0} onClick={() => void saveBudget()}>{saving ? "Guardando…" : "Guardar cambios"}</button><button className="button secondary" type="button" disabled={!canCreate(roles)} onClick={() => void createBudget()}>Nuevo presupuesto</button><button className="text-button danger-text" type="button" disabled={!deletable} onClick={() => void deleteBudget()}>Eliminar</button></div>
    </section>

    {importPendingFields ? <section className="panel import-pending-panel"><div className="notice warning"><strong>Presupuesto importado con datos pendientes de completar</strong><p>{importPendingFields}.</p><small>La importación se conservó como Borrador para no perder la información reconocida. Complete o valide estos campos antes de continuar con el flujo de V°B°.</small>{editable ? <div className="workspace-actions"><button className="button secondary" type="button" onClick={markImportedPendingFieldsReviewed}>Marcar pendientes como revisados</button></div> : null}</div></section> : null}

    {integrityIssues.length ? <section className="panel integrity-panel"><div className="notice warning"><strong>Auditoría de integridad del presupuesto</strong><ul>{integrityIssues.map((issue) => <li key={issue.code}>{issue.message}{issue.suggestedCohortName && editable ? <> <button className="text-button" type="button" onClick={() => patchBudget({ cohortName: issue.suggestedCohortName })}>Usar “{issue.suggestedCohortName}”</button></> : null}</li>)}</ul>{blockingIntegrityIssues.length ? <p><strong>Guardar queda bloqueado hasta resolver las inconsistencias de identidad.</strong></p> : null}</div></section> : null}

    <section className="panel">
      <SectionHeading number="1" id="identificacion" title="Identificación" description="Programa, cohorte, duración y versión del plan/programa." />
      <div className="form-grid cols-4">
        <label>Programa del presupuesto<div className="input-like program-identity"><strong>{budget.program.code}</strong> · {budget.program.name}</div><small className="field-help">El programa es parte de la identidad del presupuesto y no puede reasignarse. Para trabajar con otro programa use el selector superior o cree una nueva cohorte.</small></label>
        <label>Cohorte<input disabled={!editable} value={budget.cohortName} onChange={(event) => patchBudget({ cohortName: event.target.value })} /></label>
        <label>Versión del programa / plan<input disabled={!editable} value={budget.programVersionLabel} onChange={(event) => patchBudget({ programVersionLabel: event.target.value })} /></label>
        <label>Revisión interna<div className="input-like">R{budget.version}</div></label>
        <label>Año inicio<input disabled={!editable} type="number" value={budget.startYear} onChange={(event) => regeneratePeriods(numberValue(event.target.value), budget.startSemester, budget.durationSemesters, budget.initialStudents)} /></label>
        <label>Semestre inicio<select disabled={!editable} value={budget.startSemester} onChange={(event) => regeneratePeriods(budget.startYear, numberValue(event.target.value) as 1 | 2, budget.durationSemesters, budget.initialStudents)}><option value="1">1S</option><option value="2">2S</option></select></label>
        <label>Duración<input disabled={!editable} type="number" min="2" max="8" value={budget.durationSemesters} onChange={(event) => regeneratePeriods(budget.startYear, budget.startSemester, Math.min(8, Math.max(2, numberValue(event.target.value))), budget.initialStudents)} /></label>
        <label>Estudiantes iniciales<input disabled={!editable} type="number" min="0" value={budget.initialStudents} onChange={(event) => setInitialStudentsForAllSemesters(numberValue(event.target.value))} /><small>Al cambiar este valor se replica automáticamente en “Estudiantes activos” de todos los semestres.</small></label>
        <label>Estado<div className="input-like"><StatusBadge status={budget.status} /></div></label>
        {budget.program.type === "MAGISTER_PROFESIONAL" ? <label>Modalidad<select disabled={!editable} value={budget.deliveryModality} onChange={(event) => patchBudget({ deliveryModality: event.target.value as DeliveryModality })}><option value="PRESENCIAL">Presencial</option><option value="SEMIPRESENCIAL">Semipresencial</option><option value="E_LEARNING">E-learning</option></select></label> : null}
      </div>
    </section>

    <section className="panel">
      <SectionHeading number="2" id="parametros" title="Parámetros y plantillas" description="Parámetros particulares por año, matrícula, overhead, prorrateos y plantilla funcional." />
      <div className="form-grid cols-4">
        <label>Fuente del arancel<select disabled={!editable} value={budget.program.tuitionSource ?? "PROPIO"} onChange={(event) => { const source = event.target.value as TuitionSource; if (source === "PROPIO") patchBudget({ program: { ...budget.program, tuitionSource: source } }); else applyTuitionTemplate(source); }}><option value="PROPIO">Arancel propio del programa</option><option value="PLANTILLA_DOCTORADO">Plantilla Doctoral</option><option value="PLANTILLA_MAGISTER_ACADEMICO">Plantilla Magíster Académico</option><option value="PLANTILLA_MAGISTER_PROFESIONAL">Plantilla Magíster Profesional</option></select></label>
        <label>Reconocimiento matrícula (%)<div className="percent-input"><input disabled={!editable} type="number" min="0" max="100" step="1" value={(budget.enrollmentRecognitionRate * 100).toFixed(0)} onChange={(event) => patchBudget({ enrollmentRecognitionRate: numberValue(event.target.value) / 100 })} /><span>%</span></div><small>La proporción reconocida se incorpora a ingresos; no se aplica overhead sobre este concepto.</small></label>
        <label>Incobrabilidad (%)<div className="percent-input"><input disabled={!editable} type="number" min="0" max="100" step="0.1" value={(effectiveBadDebtRate(budget, parameters) * 100).toFixed(1)} onChange={(event) => patchBudget({ badDebtRate: Math.min(1, Math.max(0, numberValue(event.target.value) / 100)) })} /><span>%</span></div><small>Editable para esta formulación. Referencia institucional: {formatPercent(typeParameters.badDebtRate)}. Se aplica al arancel después de descuentos y modifica la base de overhead.</small></label>
        <label>Arrastre autorizado<input disabled={!editable} type="number" value={budget.authorizedInitialCarryover} onChange={(event) => patchBudget({ authorizedInitialCarryover: numberValue(event.target.value) })} /></label>
        <label>Usar plantilla
          <select disabled={!editable || !relevantTemplates.length} value={effectiveTemplateId} onChange={(event) => setSelectedTemplateId(event.target.value)}>
            {relevantTemplates.length ? relevantTemplates.map((template) => <option key={template.id} value={template.id}>{template.name} · V{template.version}</option>) : <option value="">Sin plantillas activas</option>}
          </select>
          <small>{budget.program.type === "MAGISTER_PROFESIONAL" ? "Seleccione Presencial, Semipresencial o E-learning." : "Aplica la plantilla funcional al presupuesto activo."}</small>
        </label>
        <div className="field-action"><span>Aplicación de plantilla</span><button className="button secondary" type="button" disabled={!editable || !effectiveTemplateId} onClick={() => { const template = relevantTemplates.find((candidate) => candidate.id === effectiveTemplateId); if (template) applyTemplate(template); }}>Aplicar plantilla</button></div>
      </div>
      <div className="setting-grid"><CheckSetting label="Incluir arrastre autorizado" note="Suma el arrastre al primer año del flujo." checked={budget.includeAuthorizedCarryover} disabled={!editable} onChange={(value) => patchBudget({ includeAuthorizedCarryover: value })} /><CheckSetting label="Normalizar costos compartidos" note="Evita duplicar costos en consolidación." checked={budget.normalizeSharedCosts} disabled={!editable} onChange={(value) => patchBudget({ normalizeSharedCosts: value })} /><CheckSetting label="Alertar posibles duplicidades" note="Busca coincidencias de gastos entre cohortes." checked={budget.alertPotentialDuplicates} disabled={!editable} onChange={(value) => patchBudget({ alertPotentialDuplicates: value })} /></div>

      <div className="subpanel annual-parameter-panel"><h3>Valores anuales del presupuesto</h3><p>Estos valores se aplican sólo a esta versión del programa. El arancel se define para cada año activo. La matrícula se cobra una vez por cada dos semestres activos y no recibe descuentos. La proporción definida en “Reconocimiento matrícula” se incorpora como ingreso del programa; los años sin cobro se muestran sólo como referencia.</p>
        <div className="table-wrap"><table className="data-table editable-list"><thead><tr><th>Año</th><th>Arancel anual</th><th>Periodo de cobro matrícula</th><th>Estudiantes matrícula</th><th>Matrícula anual</th><th>Guía de tesis por graduando</th></tr></thead><tbody>{budget.annualOverrides.map((annual) => { const chargePeriods = getAnnualEnrollmentChargePeriods(budget.startYear, budget.startSemester, budget.durationSemesters).filter((period) => period.year === annual.year); const chargedStudents = chargePeriods.reduce((total, period) => total + (budget.semesters.find((semester) => semester.year === period.year && semester.semester === period.semester)?.activeStudents ?? 0), 0); return <tr key={`annual-values-${annual.year}`}><th>{annual.year}</th><InputCell label={`Arancel ${annual.year}`} value={annual.annualTuition} disabled={!editable} onChange={(value) => updateAnnualOverride(annual.year, { annualTuition: value })} /><td>{chargePeriods.length ? chargePeriods.map((period) => `${period.year}-${period.semester}S`).join(", ") : <span className="muted">Sin cobro</span>}</td><td>{chargePeriods.length ? chargedStudents : <span className="muted">—</span>}</td><InputCell label={`Matrícula ${annual.year}`} value={annual.annualEnrollmentFee} disabled={!editable || chargePeriods.length === 0} onChange={(value) => updateAnnualOverride(annual.year, { annualEnrollmentFee: value })} /><InputCell label={`Guía de tesis ${annual.year}`} value={annual.thesisGuidancePerGraduatingStudent} disabled={!editable} onChange={(value) => updateAnnualOverride(annual.year, { thesisGuidancePerGraduatingStudent: value })} /></tr>; })}</tbody></table></div>
      </div>

      {budget.program.type === "MAGISTER_PROFESIONAL" ? <div className="subpanel annual-parameter-panel"><h3>Valores hora según modalidad</h3><p>Para programas profesionales se utiliza un único valor hora sincrónica visible en la formulación. Al modificarlo se sincroniza la referencia horaria interna de la modalidad para evitar valores ocultos contradictorios.</p><div className="table-wrap"><table className="data-table"><thead><tr><th>Año</th><th>Hora sincrónica</th></tr></thead><tbody>{budget.annualOverrides.map((annual) => <tr key={`modality-rate-${annual.year}`}><th>{annual.year}</th><InputCell label={`Hora sincrónica ${annual.year}`} value={annual.synchronousTeachingHourValue} disabled={!editable} onChange={(value) => updateAnnualOverride(annual.year, { synchronousTeachingHourValue: value, asynchronousTeachingHourValue: value, directTeachingHourValue: value })} /></tr>)}</tbody></table></div><div className="notice info"><p>En programas profesionales la beca de manutención mensual parte en $0 y no se activa por defecto.</p></div></div> : null}

      <div className="subpanel annual-parameter-panel">
        <h3>Staff comprometido/prorrateable y overhead</h3>
        <p>Dirección, asistencia de dirección y otros honorarios no académicos pueden distribuirse entre versiones/cohortes aprobadas y superpuestas del mismo programa profesional. El sistema detecta compromisos previos y propone una distribución equitativa; el porcentaje aplicado siempre queda editable. “Honorarios no académicos” se presenta en el flujo como subtotal de estas tres líneas.</p>
        <div className="staff-adjustment-bar"><label>Reajuste para el año siguiente (%)<input disabled={!editable} type="number" min="0" step="0.1" value={staffAdjustmentPercent} onChange={(event) => setStaffAdjustmentPercent(numberValue(event.target.value))} /></label><small>El botón de cada fila proyecta Dirección, Asistencia y Otros honorarios al siguiente año activo.</small></div>
        <div className="table-wrap">
          <table className="data-table editable-list annual-cost-table">
            <thead><tr><th>Año</th><th>Dirección base</th><th>Comprometido</th><th>Prorratear</th><th>%</th><th>Dirección aplicada</th><th>Asistencia base</th><th>Comprometido</th><th>Prorratear</th><th>%</th><th>Asistencia aplicada</th><th>Otros honorarios no académicos</th><th>Comprometido</th><th>Prorratear</th><th>%</th><th>Otros aplicados</th><th>OH central %</th><th>OH facultad %</th><th>Reajuste</th></tr></thead>
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
                <td><button className="button compact secondary" type="button" disabled={!editable || annual.year === budget.annualOverrides.at(-1)?.year} onClick={() => applyStaffAdjustmentToNextYear(annual.year)}>Aplicar → siguiente año</button></td>
              </tr>;
            })}</tbody>
          </table>
        </div>
      </div>

      <div className="notice info"><strong>Referencia institucional</strong><p>Hora de reemplazo {formatCLP(parameters.replacementHour)} · Incobrabilidad institucional {formatPercent(typeParameters.badDebtRate)} · Incobrabilidad aplicada a esta formulación {formatPercent(effectiveBadDebtRate(budget, parameters))}{!overhead ? " · Los programas académicos no aplican overhead en el cálculo." : ""}</p></div>
    </section>

    <section className="panel"><SectionHeading number="3" id="estudiantes" title="Estudiantes y graduación" description="Matrícula activa y estudiantes que se encuentran en etapa de graduación por semestre." /><div className="table-wrap"><table className="data-table semester-table"><thead><tr><th>Periodo</th><th>Estudiantes activos</th><th>Estudiantes en graduación</th></tr></thead><tbody>{budget.semesters.map((semester, index) => <tr key={`${semester.year}-${semester.semester}`}><th>{semester.year}-{semester.semester}S</th><InputCell label={`Activos ${semester.year}-${semester.semester}`} value={semester.activeStudents} disabled={!editable} onChange={(value) => updateSemester(index, "activeStudents", value)} /><InputCell label={`Graduación ${semester.year}-${semester.semester}`} value={semester.graduatingStudents} disabled={!editable} onChange={(value) => updateSemester(index, "graduatingStudents", value)} /></tr>)}</tbody></table></div></section>

    <section className="panel"><SectionHeading number="4" id="carga-academica" title="Carga académica" description={budget.program.curriculumCourses?.length ? `La malla del programa contiene ${budget.program.curriculumCourses.length} registros. Sincronícela para recalcular horas y economías de escala.` : "La modalidad define qué horas docentes se valorizan; las horas de reemplazo se mantienen separadas."} action={budget.program.curriculumCourses?.length ? <div className="section-action-group"><button className="button secondary" type="button" disabled={!editable || curriculumApplying} onClick={() => void applyCurriculumToActiveBudget(false)}>{curriculumApplying ? "Aplicando…" : "Aplicar malla curricular"}</button>{budget.program.type === "MAGISTER_PROFESIONAL" ? <button className="button secondary" type="button" disabled={!editable || curriculumApplying} onClick={() => void applyCurriculumToActiveBudget(true)}>Sugerir equilibrio</button> : null}</div> : undefined} />
      {budget.program.curriculumCourses?.length ? <div className="notice info"><strong>Malla curricular vinculada</strong><p>Las competencias genéricas se excluyen del costo. Las asignaturas pueden combinar docencia presencial, sincrónica y asincrónica; por eso las tres bolsas de horas se muestran cuando existe una malla. Las asincrónicas aplican su factor y las compartidas generan economía de escala según su porcentaje de imputación.</p></div> : null}
      {budget.program.curriculumCourses?.length && !curriculumHasPayableHours ? <div className="notice warning"><strong>Malla reconocida, pero sin horas docentes</strong><p>Los {budget.program.curriculumCourses.length} registros están vinculados, pero las asignaturas pagables tienen 0 horas directas. Si esta malla fue importada con v10.26/v10.27 desde el formato de curriculistas, vuelva a importarla en Programas y guarde las modificaciones: v10.28 reconoce correctamente los encabezados de dos filas.</p></div> : null}
      {curriculumCourses.length ? <div className="subpanel curriculum-applied-panel"><h3>Asignaturas vinculadas a esta formulación</h3><p>Esta tabla permite comprobar qué asignaturas alimentan la carga. “Horas aplicadas” incorpora semanas, secciones y, cuando corresponde, el factor asincrónico. La columna “Bolsa de carga” indica dónde se sumará cada asignatura al aplicar la malla.</p><div className="table-wrap"><table className="data-table curriculum-applied-table"><thead><tr><th>Periodo</th><th>Código</th><th>Asignatura</th><th>Tipo</th><th>Modalidad malla</th><th>Bolsa de carga</th><th>Semanas</th><th>Secciones</th><th>Horas/sem.</th><th>Horas aplicadas</th><th>Condición</th></tr></thead><tbody>{curriculumCourses.map((course) => { const semester = budget.semesters[course.semester - 1]; const generic = course.kind === "COMPETENCIA_GENERICA"; const rawHours = generic ? 0 : curriculumCourseRawHours(course); const effectiveHours = generic ? 0 : curriculumCourseEffectiveHours(course, budget.deliveryModality); const appliedMode = curriculumCourseAppliedMode(course, budget.deliveryModality); const condition = generic ? "Competencia genérica · sin costo" : course.sharedWithProgramIds.length ? `Compartida · ${(course.allocationRate * 100).toLocaleString("es-CL", { maximumFractionDigits: 1 })}% imputado` : "Programa"; const modeLabel = course.teachingMode === "SINCRONICA" ? "Sincrónica" : course.teachingMode === "ASINCRONICA" ? "Asincrónica" : "Presencial"; const appliedModeLabel = generic ? "Sin costo" : appliedMode === "PRESENCIAL" ? "Horas docentes presenciales" : appliedMode === "ASINCRONICA" ? "Horas asincrónicas" : "Horas sincrónicas"; return <tr key={course.id}><td>{semester ? `${semester.year}-${semester.semester}S` : `Sem. ${course.semester}`}</td><td>{course.code || "—"}</td><td><strong>{course.name}</strong>{course.teachingMode === "ASINCRONICA" ? <small className="cell-note"> Factor {(course.asynchronousRateFactor * 100).toLocaleString("es-CL", { maximumFractionDigits: 1 })}%</small> : null}</td><td>{course.kind.replaceAll("_", " ")}</td><td>{modeLabel}</td><td><strong>{appliedModeLabel}</strong>{budget.deliveryModality === "PRESENCIAL" && course.teachingMode === "SINCRONICA" && !generic ? <small className="cell-note"> Cohorte presencial</small> : null}</td><td className="numeric">{course.weeks}</td><td className="numeric">{course.sections}</td><td className="numeric">{curriculumCourseWeeklyDirectHours(course).toLocaleString("es-CL", { maximumFractionDigits: 2 })}</td><td className="numeric"><strong>{effectiveHours.toLocaleString("es-CL", { maximumFractionDigits: 2 })}</strong>{rawHours !== effectiveHours && rawHours > 0 ? <small className="cell-note"> de {rawHours.toLocaleString("es-CL", { maximumFractionDigits: 2 })} h brutas</small> : null}</td><td>{condition}</td></tr>; })}</tbody></table></div></div> : null}
      {curriculumBreakEvenSuggestion ? <div className="notice success"><strong>Sugerencia de viabilidad tras aplicar la malla</strong><p>{curriculumBreakEvenSuggestion.minimumEquivalentEnrollments === null ? "No se encontró un punto de equilibrio dentro del rango de búsqueda." : `Se requieren al menos ${curriculumBreakEvenSuggestion.minimumEquivalentEnrollments.toLocaleString("es-CL", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} matrículas equivalentes (≈ ${curriculumBreakEvenSuggestion.minimumWholeStudents} estudiantes a arancel completo) para mantener saldo final no negativo.`}</p></div> : null}
      <div className="academic-hours-grid">
        {(budget.deliveryModality === "PRESENCIAL" || Boolean(budget.program.curriculumCourses?.length)) ? <div className="subpanel"><h3>Horas docentes presenciales</h3><p>Suma semestral de horas directas/trabajo directo de la malla que corresponden a docencia presencial. En una cohorte presencial, las asignaturas sincrónicas importadas sin modalidad explícita se consolidan aquí.</p><div className="table-wrap"><table className="data-table"><thead><tr><th>Periodo</th><th>Horas</th></tr></thead><tbody>{budget.semesters.map((semester, index) => <tr key={`direct-${semester.year}-${semester.semester}`}><th>{semester.year}-{semester.semester}S</th><InputCell label={`Horas presenciales ${semester.year}-${semester.semester}`} value={semester.directTeachingHours} disabled={!editable} step="0.5" onChange={(value) => updateSemester(index, "directTeachingHours", value)} /></tr>)}</tbody></table></div></div> : null}
        {(budget.deliveryModality !== "PRESENCIAL" || Boolean(budget.program.curriculumCourses?.length)) ? <>
          <div className="subpanel"><h3>Horas sincrónicas</h3><p>Asignaturas en tiempo real; al aplicar la malla se cargan aquí aunque la modalidad global sea presencial.</p><div className="table-wrap"><table className="data-table"><thead><tr><th>Periodo</th><th>Horas</th></tr></thead><tbody>{budget.semesters.map((semester, index) => <tr key={`sync-${semester.year}-${semester.semester}`}><th>{semester.year}-{semester.semester}S</th><InputCell label={`Horas sincrónicas ${semester.year}-${semester.semester}`} value={semester.synchronousTeachingHours} disabled={!editable} step="0.5" onChange={(value) => updateSemester(index, "synchronousTeachingHours", value)} /></tr>)}</tbody></table></div></div>
          <div className="subpanel"><h3>Horas asincrónicas</h3><p>Horas equivalentes después de aplicar el factor asincrónico definido por asignatura.</p><div className="table-wrap"><table className="data-table"><thead><tr><th>Periodo</th><th>Horas</th></tr></thead><tbody>{budget.semesters.map((semester, index) => <tr key={`async-${semester.year}-${semester.semester}`}><th>{semester.year}-{semester.semester}S</th><InputCell label={`Horas asincrónicas ${semester.year}-${semester.semester}`} value={semester.asynchronousTeachingHours} disabled={!editable} step="0.5" onChange={(value) => updateSemester(index, "asynchronousTeachingHours", value)} /></tr>)}</tbody></table></div></div>
        </> : null}
        <div className="subpanel"><h3>Horas docentes de reemplazo</h3><p>Se valorizan con el parámetro general de reemplazo.</p><div className="table-wrap"><table className="data-table"><thead><tr><th>Periodo</th><th>Horas</th></tr></thead><tbody>{budget.semesters.map((semester, index) => <tr key={`replacement-${semester.year}-${semester.semester}`}><th>{semester.year}-{semester.semester}S</th><InputCell label={`Horas reemplazo ${semester.year}-${semester.semester}`} value={semester.replacementTeachingHours} disabled={!editable} step="0.5" onChange={(value) => updateSemester(index, "replacementTeachingHours", value)} /></tr>)}</tbody></table></div></div>
      </div>
    </section>

    {budget.program.type === "MAGISTER_PROFESIONAL" ? <section className="panel"><SectionHeading number="4.1" id="economias-escala" title="Economías de escala" description="Asignaturas compartidas entre dos o más programas. El porcentaje imputado reduce el costo docente de esta cohorte." action={<button className="button secondary" disabled={!editable} onClick={() => { const period = getActivePeriods(budget.startYear, budget.startSemester, budget.durationSemesters)[0]; patchBudget({ sharedCourses: [...budget.sharedCourses, { id: uid("shared-course"), courseName: "Asignatura compartida", year: period.year, semester: period.semester, teachingMode: budget.deliveryModality === "PRESENCIAL" ? "PRESENCIAL" : "SINCRONICA", hours: 0, participantProgramIds: [budget.program.id], allocationRate: 0.5 }] }); }}>Agregar asignatura compartida</button>} />
      <div className="table-wrap"><table className="data-table editable-list"><thead><tr><th>Asignatura</th><th>Periodo</th><th>Tipo de docencia</th><th>Horas</th><th>Programas participantes</th><th>% imputado</th><th>Acción</th></tr></thead><tbody>{budget.sharedCourses.length ? budget.sharedCourses.map((rule, index) => <tr key={rule.id}><td><input disabled={!editable} value={rule.courseName} onChange={(event) => patchBudget({ sharedCourses: budget.sharedCourses.map((candidate, i) => i === index ? { ...candidate, courseName: event.target.value } : candidate) })} /></td><td><PeriodInputs disabled={!editable} years={result.years} year={rule.year} semester={rule.semester} onYear={(value) => patchBudget({ sharedCourses: budget.sharedCourses.map((candidate, i) => i === index ? { ...candidate, year: value } : candidate) })} onSemester={(value) => patchBudget({ sharedCourses: budget.sharedCourses.map((candidate, i) => i === index ? { ...candidate, semester: value } : candidate) })} /></td><td><select disabled={!editable} value={rule.teachingMode} onChange={(event) => patchBudget({ sharedCourses: budget.sharedCourses.map((candidate, i) => i === index ? { ...candidate, teachingMode: event.target.value as TeachingMode } : candidate) })}><option value="PRESENCIAL">Presencial</option><option value="SINCRONICA">Sincrónica</option><option value="ASINCRONICA">Asincrónica</option></select></td><td><input disabled={!editable} type="number" min="0" value={rule.hours} onChange={(event) => patchBudget({ sharedCourses: budget.sharedCourses.map((candidate, i) => i === index ? { ...candidate, hours: numberValue(event.target.value) } : candidate) })} /></td><td><select multiple disabled={!editable} value={rule.participantProgramIds} onChange={(event) => { const values = Array.from((event.currentTarget as HTMLSelectElement).selectedOptions, (option) => option.value); if (!values.includes(budget.program.id)) values.unshift(budget.program.id); patchBudget({ sharedCourses: budget.sharedCourses.map((candidate, i) => i === index ? { ...candidate, participantProgramIds: values, allocationRate: values.length > 1 ? 1 / values.length : candidate.allocationRate } : candidate) }); }}>{programs.filter((program) => program.type === "MAGISTER_PROFESIONAL").map((program) => <option key={program.id} value={program.id}>{program.code} · {program.name}</option>)}</select></td><PercentCell label={`Imputación ${rule.courseName}`} value={rule.allocationRate} disabled={!editable} onChange={(value) => patchBudget({ sharedCourses: budget.sharedCourses.map((candidate, i) => i === index ? { ...candidate, allocationRate: value } : candidate) })} /><td><button className="text-button danger-text" disabled={!editable} onClick={() => patchBudget({ sharedCourses: budget.sharedCourses.filter((_, i) => i !== index) })}>Quitar</button></td></tr>) : <tr><td colSpan={7}>No hay asignaturas compartidas.</td></tr>}</tbody></table></div>
      {result.annualFlows.some((flow) => flow.sharedCourseSavings > 0) ? <div className="notice success"><strong>Ahorro docente estimado por economía de escala:</strong> {formatCLP(result.annualFlows.reduce((sum, flow) => sum + flow.sharedCourseSavings, 0))}</div> : null}
    </section> : null}

    <section className="panel">
      <SectionHeading number="5" id="becas" title="Becas" description="En programas profesionales se mantienen deshabilitadas por defecto y se habilitan sólo cuando corresponda." action={budget.program.type === "MAGISTER_PROFESIONAL" ? <button className="button secondary" type="button" disabled={!editable} onClick={() => patchBudget({ scholarshipsEnabled: !budget.scholarshipsEnabled })}>{budget.scholarshipsEnabled ? "Deshabilitar becas" : "Habilitar becas"}</button> : undefined} />
      {!budget.scholarshipsEnabled && budget.program.type === "MAGISTER_PROFESIONAL" ? <div className="notice info"><strong>Becas deshabilitadas</strong><p>Este programa profesional no incorpora beca interna de arancel ni de manutención por defecto. Puede habilitarlas expresamente si existe una autorización.</p></div> : <div className="table-wrap"><table className="data-table"><thead><tr><th>Periodo</th><th>Estudiantes beca arancel</th><th>Cobertura arancel (%)</th><th>Estudiantes manutención</th><th>Meses manutención</th></tr></thead><tbody>{budget.semesters.map((semester, index) => <tr key={`scholarship-${semester.year}-${semester.semester}`}><th>{semester.year}-{semester.semester}S</th><InputCell label="Becarios arancel" value={semester.internalTuitionScholarshipStudents} disabled={!editable} onChange={(value) => updateSemester(index, "internalTuitionScholarshipStudents", value)} /><PercentCell label="Cobertura beca" value={semester.internalTuitionScholarshipCoverage} disabled={!editable} onChange={(value) => updateSemester(index, "internalTuitionScholarshipCoverage", value)} /><InputCell label="Becarios manutención" value={semester.maintenanceScholarshipStudents} disabled={!editable} onChange={(value) => updateSemester(index, "maintenanceScholarshipStudents", value)} /><InputCell label="Meses manutención" value={semester.maintenanceScholarshipMonths} disabled={!editable} onChange={(value) => updateSemester(index, "maintenanceScholarshipMonths", value)} /></tr>)}</tbody></table></div>}
    </section>

    <section className="panel"><SectionHeading number="6" id="descuentos" title="Descuentos" description="Agregue, modifique o elimine descuentos por periodo." action={<button className="button secondary" type="button" disabled={!editable} onClick={addDiscount}>Agregar descuento</button>} /><div className="table-wrap"><table className="data-table editable-list"><thead><tr><th>Nombre</th><th>Porcentaje</th><th>Estudiantes</th><th>Inicio</th><th>Término</th><th>Acción</th></tr></thead><tbody>{budget.discounts.length ? budget.discounts.map((discount, index) => <tr key={discount.id}><td><input disabled={!editable} value={discount.name} onChange={(event) => patchBudget({ discounts: budget.discounts.map((item, candidate) => candidate === index ? { ...item, name: event.target.value } : item) })} /></td><PercentCell label={`Descuento ${discount.name}`} value={discount.percentage} disabled={!editable} onChange={(value) => patchBudget({ discounts: budget.discounts.map((item, candidate) => candidate === index ? { ...item, percentage: value } : item) })} /><td><input disabled={!editable} type="number" min="0" value={discount.students} onChange={(event) => patchBudget({ discounts: budget.discounts.map((item, candidate) => candidate === index ? { ...item, students: numberValue(event.target.value) } : item) })} /></td><td><PeriodInputs disabled={!editable} years={result.years} year={discount.startYear} semester={discount.startSemester} onYear={(value) => patchBudget({ discounts: budget.discounts.map((item, candidate) => candidate === index ? { ...item, startYear: value } : item) })} onSemester={(value) => patchBudget({ discounts: budget.discounts.map((item, candidate) => candidate === index ? { ...item, startSemester: value } : item) })} /></td><td><PeriodInputs disabled={!editable} years={result.years} year={discount.endYear} semester={discount.endSemester} onYear={(value) => patchBudget({ discounts: budget.discounts.map((item, candidate) => candidate === index ? { ...item, endYear: value } : item) })} onSemester={(value) => patchBudget({ discounts: budget.discounts.map((item, candidate) => candidate === index ? { ...item, endSemester: value } : item) })} /></td><td><button className="text-button danger-text" type="button" disabled={!editable} onClick={() => patchBudget({ discounts: budget.discounts.filter((_, candidate) => candidate !== index) })}>Quitar</button></td></tr>) : <tr><td colSpan={6}>No hay descuentos.</td></tr>}</tbody></table></div></section>

    <section className="panel">
      <SectionHeading
        number="7"
        id="ingresos-extra"
        title="Ingresos extraordinarios y financiamiento institucional"
        description="Becas externas, convenios y otros ingresos por estudiante, además de financiamiento institucional fijo para el proyecto/programa."
        action={<div className="section-action-group"><button className="button secondary" type="button" disabled={!editable} onClick={() => patchBudget({ externalIncome: [...budget.externalIncome, { id: uid("income"), type: "Ingreso extraordinario", description: "Nuevo ingreso", year: result.years[0] ?? budget.startYear, semester: 1, students: 1, amountPerStudent: 0, source: "" }] })}>Agregar ingreso</button><button className="button secondary" type="button" disabled={!editable} onClick={() => patchBudget({ externalIncome: [...budget.externalIncome, { id: uid("income"), type: "Financiamiento institucional", description: "Financiamiento institucional", year: result.years[0] ?? budget.startYear, semester: 1, students: 1, amountPerStudent: 0, source: "UTEM" }] })}>Agregar financiamiento institucional</button></div>}
      />
      <div className="notice info"><strong>Criterio financiero</strong><p>El financiamiento institucional se registra como un monto fijo del año y no se multiplica por estudiantes ni semestres. La matrícula reconocida sí integra los ingresos del programa; ambos conceptos quedan fuera de la base de overhead, que continúa calculándose sólo sobre el arancel neto sujeto a cobro.</p></div>
      <div className="table-wrap"><table className="data-table editable-list"><thead><tr><th>Tipo y descripción</th><th>Periodo</th><th>Base</th><th>Monto</th><th>Fuente</th><th>Acción</th></tr></thead><tbody>
        {budget.externalIncome.length ? budget.externalIncome.map((income, index) => {
          const fixedInstitutional = income.type === "Financiamiento institucional";
          return <tr key={income.id}>
            <td><select disabled={!editable} value={income.type} onChange={(event) => patchBudget({ externalIncome: budget.externalIncome.map((item, candidate) => candidate === index ? { ...item, type: event.target.value as ExternalIncome["type"], students: event.target.value === "Financiamiento institucional" ? 1 : item.students } : item) })}>{INCOME_TYPES.map((type) => <option key={type}>{type}</option>)}</select><input disabled={!editable} value={income.description} onChange={(event) => patchBudget({ externalIncome: budget.externalIncome.map((item, candidate) => candidate === index ? { ...item, description: event.target.value } : item) })} /></td>
            <td>{fixedInstitutional ? <label>Año<select disabled={!editable} value={income.year} onChange={(event) => patchBudget({ externalIncome: budget.externalIncome.map((item, candidate) => candidate === index ? { ...item, year: numberValue(event.target.value) } : item) })}>{result.years.map((year) => <option key={year}>{year}</option>)}</select></label> : <PeriodInputs disabled={!editable} years={result.years} year={income.year} semester={income.semester} onYear={(value) => patchBudget({ externalIncome: budget.externalIncome.map((item, candidate) => candidate === index ? { ...item, year: value } : item) })} onSemester={(value) => patchBudget({ externalIncome: budget.externalIncome.map((item, candidate) => candidate === index ? { ...item, semester: value } : item) })} />}</td>
            <td>{fixedInstitutional ? <span className="muted">Monto fijo del proyecto</span> : <input disabled={!editable} aria-label={`Estudiantes ingreso ${index + 1}`} type="number" min="0" value={income.students} onChange={(event) => patchBudget({ externalIncome: budget.externalIncome.map((item, candidate) => candidate === index ? { ...item, students: numberValue(event.target.value) } : item) })} />}</td>
            <td><input disabled={!editable} aria-label={fixedInstitutional ? `Monto total financiamiento ${index + 1}` : `Monto unitario ingreso ${index + 1}`} type="number" min="0" value={income.amountPerStudent} onChange={(event) => patchBudget({ externalIncome: budget.externalIncome.map((item, candidate) => candidate === index ? { ...item, amountPerStudent: numberValue(event.target.value) } : item) })} /><small>{fixedInstitutional ? "Monto total, una sola vez en el año" : "Monto por estudiante"}</small></td>
            <td><input disabled={!editable} value={income.source} onChange={(event) => patchBudget({ externalIncome: budget.externalIncome.map((item, candidate) => candidate === index ? { ...item, source: event.target.value } : item) })} /></td>
            <td><button className="text-button danger-text" type="button" disabled={!editable} onClick={() => patchBudget({ externalIncome: budget.externalIncome.filter((_, candidate) => candidate !== index) })}>Quitar</button></td>
          </tr>;
        }) : <tr><td colSpan={6}>No hay ingresos extraordinarios ni financiamiento institucional.</td></tr>}
      </tbody></table></div>
    </section>

    <section className="panel"><SectionHeading number="8" id="costos" title="Costos y gastos" description="Los costos Anuales se repiten desde el año de inicio hasta el término; los Semestrales se aplican a cada semestre activo desde su periodo de inicio." action={<button className="button secondary" type="button" disabled={!editable} onClick={addManualCost}>Agregar gasto o costo</button>} /><div className="table-wrap"><table className="data-table editable-list"><thead><tr><th>Nombre y descripción</th><th>Categoría</th><th>Año</th><th>Monto</th><th>Alcance</th><th>Periodicidad</th><th>Acción</th></tr></thead><tbody>{budget.manualItems.length ? budget.manualItems.map((item, index) => <tr key={item.id}><td><input disabled={!editable} value={item.name} onChange={(event) => patchBudget({ manualItems: budget.manualItems.map((candidate, position) => position === index ? { ...candidate, name: event.target.value } : candidate) })} /><input disabled={!editable} value={item.description} onChange={(event) => patchBudget({ manualItems: budget.manualItems.map((candidate, position) => position === index ? { ...candidate, description: event.target.value } : candidate) })} /></td><td><select disabled={!editable} value={item.category} onChange={(event) => patchBudget({ manualItems: budget.manualItems.map((candidate, position) => position === index ? { ...candidate, category: event.target.value as BudgetItem["category"] } : candidate) })}>{COST_CATEGORIES.map((category) => <option key={category}>{category}</option>)}</select></td><td><select disabled={!editable} value={item.year} onChange={(event) => patchBudget({ manualItems: budget.manualItems.map((candidate, position) => position === index ? { ...candidate, year: numberValue(event.target.value) } : candidate) })}>{result.years.map((year) => <option key={year}>{year}</option>)}</select></td><td><input disabled={!editable} type="number" min="0" value={item.amount} onChange={(event) => patchBudget({ manualItems: budget.manualItems.map((candidate, position) => position === index ? { ...candidate, amount: numberValue(event.target.value) } : candidate) })} /></td><td><select disabled={!editable} value={item.costType} onChange={(event) => patchBudget({ manualItems: budget.manualItems.map((candidate, position) => position === index ? { ...candidate, costType: event.target.value as BudgetItem["costType"] } : candidate) })}><option>Único de esta versión</option><option>Compartido con otras cohortes</option></select></td><td><select disabled={!editable} value={item.periodicity} onChange={(event) => patchBudget({ manualItems: budget.manualItems.map((candidate, position) => position === index ? { ...candidate, periodicity: event.target.value as BudgetItem["periodicity"] } : candidate) })}><option>Único</option><option>Semestral</option><option>Anual</option></select></td><td><button className="text-button danger-text" type="button" disabled={!editable} onClick={() => patchBudget({ manualItems: budget.manualItems.filter((_, position) => position !== index) })}>Quitar</button></td></tr>) : <tr><td colSpan={7}>No hay costos manuales.</td></tr>}</tbody></table></div>{budget.alertPotentialDuplicates ? duplicateAlerts.length ? <div className="notice warning"><strong>Posibles duplicidades</strong><ul>{duplicateAlerts.map((alert) => <li key={alert.key}>{alert.message} {alert.allMarkedShared ? "Se normalizará si la opción está activa." : "Revise si debe marcarse como compartido."}</li>)}</ul></div> : <div className="notice success"><p>No se detectaron coincidencias evidentes.</p></div> : null}</section>

    <section className="panel summary-panel"><SectionHeading number="9" id="resumen" title="Resumen financiero" description="Matrículas equivalentes, ingresos, egresos, punto de equilibrio y saldo final." /><div className="summary-grid"><div><span>Ingresos</span><strong>{formatCLP(result.annualFlows.reduce((sum, flow) => sum + flow.totalIncome, 0))}</strong></div><div><span>Egresos</span><strong>{formatCLP(result.annualFlows.reduce((sum, flow) => sum + flow.totalExpenses, 0))}</strong></div><div><span>Saldo final</span><strong>{formatCLP(result.finalAccumulatedFlow)}</strong></div><div><span>Viabilidad</span><strong>{result.viable === null ? "Informativo" : result.viable ? "Viable" : "No viable"}</strong></div>{breakEven ? <div className="break-even-kpi"><span>Punto de equilibrio</span><strong>{breakEven.minimumEquivalentEnrollments === null ? "No alcanzado" : `${breakEven.minimumEquivalentEnrollments.toLocaleString("es-CL", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} matrículas equivalentes`}</strong><small>{breakEven.minimumEquivalentEnrollments === null ? "No se encontró equilibrio dentro del rango de simulación." : `≈ ${breakEven.minimumWholeStudents} estudiantes a arancel completo`}</small></div> : null}</div>{breakEven ? <div className={`notice ${breakEven.equivalentEnrollmentGap !== null && breakEven.equivalentEnrollmentGap <= 0 ? "success" : "warning"}`}><strong>Viabilidad mínima de dictación</strong><p>El modelo simula matrículas equivalentes a arancel completo manteniendo los costos, arrastre e ingresos extraordinarios del presupuesto. {breakEven.minimumEquivalentEnrollments !== null ? `Se requieren al menos ${breakEven.minimumEquivalentEnrollments.toLocaleString("es-CL", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} matrículas equivalentes para que el saldo final no sea negativo (≈ ${breakEven.minimumWholeStudents} estudiantes a arancel completo). La formulación actual alcanza como referencia ${breakEven.currentEquivalentEnrollments.toLocaleString("es-CL", { maximumFractionDigits: 1 })} equivalentes.` : "Con la estructura actual no se alcanza un saldo no negativo dentro del rango de búsqueda."}</p></div> : null}<div className="equivalent-grid">{result.annualFlows.map((flow) => <div key={flow.year}><span>{flow.year}</span><strong>{flow.equivalentEnrollments.toLocaleString("es-CL", { maximumFractionDigits: 1 })} matrículas equivalentes</strong><small>≈ {flow.roundedEquivalentStudents} estudiantes</small></div>)}</div></section>

    <section className="panel">
      <SectionHeading
        number="10"
        id="flujo"
        title="Flujo de caja anual"
        description={`Flujo integrado y editable por año: staff, costos registrados, overhead y arrastre · ${FUNCTIONAL_RELEASE}.`}
        action={<button className="button secondary" type="button" disabled={!editable} onClick={addManualCost}>Agregar costo al flujo</button>}
      />
      <div className="notice info">
        <strong>Edición del flujo</strong>
        <p>Los montos de las categorías de costos y gastos se pueden ajustar directamente en esta tabla. Cada costo registrado en la sección “Costos y gastos” se incorpora inmediatamente bajo su categoría y forma parte del subtotal correspondiente, sin una tabla de detalle separada.</p>
      </div>
      <div className="table-wrap financial-flow">
        <table className="data-table financial-table cashflow-editable-table">
          <thead><tr><th>Concepto</th>{result.years.map((year) => <th className="numeric" key={year}>{year}</th>)}<th className="flow-action-header">Acción</th></tr></thead>
          <tbody>
            <FlowRow label="Matrícula anual bruta (referencial, sin descuentos)" values={result.annualFlows.map((flow) => flow.grossEnrollmentFee)} tone="income" />
            {budget.enrollmentRecognitionRate > 0 ? <FlowRow label="Matrícula reconocida (ingreso del programa)" values={result.annualFlows.map((flow) => flow.recognizedEnrollmentFee)} tone="income" /> : null}
            <FlowRow label="Arancel bruto" values={result.annualFlows.map((flow) => flow.grossTuition)} tone="income" />
            <FlowRow label="Descuentos arancel" values={result.annualFlows.map((flow) => -flow.discounts)} tone="income" />
            {budget.scholarshipsEnabled ? <FlowRow label="Beca interna de arancel" values={result.annualFlows.map((flow) => -flow.internalTuitionScholarships)} tone="income" /> : null}
            <FlowRow label="Incobrables" values={result.annualFlows.map((flow) => -flow.badDebt)} tone="income" />
            <FlowRow label="Ingresos extraordinarios" values={result.annualFlows.map((flow) => flow.externalIncome)} tone="income" />
            {result.annualFlows.some((flow) => flow.institutionalFinancing > 0) ? <FlowRow label="Financiamiento institucional" values={result.annualFlows.map((flow) => flow.institutionalFinancing)} tone="income" /> : null}
            <FlowRow label="INGRESOS TOTAL" values={result.annualFlows.map((flow) => flow.totalIncome)} total tone="income" />

            {budget.deliveryModality === "PRESENCIAL" ? <FlowRow label="Horas docentes presenciales" values={result.annualFlows.map((flow) => -flow.directTeachingCost)} /> : <><FlowRow label="Docencia sincrónica" values={result.annualFlows.map((flow) => -flow.synchronousTeachingCost)} /><FlowRow label="Docencia asincrónica" values={result.annualFlows.map((flow) => -flow.asynchronousTeachingCost)} />{result.annualFlows.some((flow) => flow.sharedCourseSavings > 0) ? <FlowRow label="Ahorro economía de escala (informativo)" values={result.annualFlows.map((flow) => flow.sharedCourseSavings)} tone="income" /> : null}</>}
            <FlowRow label="Horas docentes de reemplazo" values={result.annualFlows.map((flow) => -flow.replacementTeachingCost)} />
            <FlowRow label="Guía de tesis" values={result.annualFlows.map((flow) => -flow.thesisGuidanceCost)} />
            <FlowRow label="HONORARIOS ACADÉMICOS (SUBTOTAL)" values={result.annualFlows.map((flow) => -flow.academicHonoraria)} total />

            <FlowRow label="Dirección" values={result.annualFlows.map((flow) => -flow.direction)} />
            <ManualCostRows items={budget.manualItems} years={result.years} budget={budget} disabled={!editable} onRemove={removeManualCost} categories={["Dirección"]} />
            <FlowRow label="Asistencia de dirección" values={result.annualFlows.map((flow) => -flow.assistance)} />
            <ManualCostRows items={budget.manualItems} years={result.years} budget={budget} disabled={!editable} onRemove={removeManualCost} categories={["Asistencia", "Asistencia de dirección"]} />
            <FlowRow label="Otros honorarios no académicos" values={result.annualFlows.map((flow) => -flow.otherNonAcademicHonoraria)} />
            <ManualCostRows items={budget.manualItems} years={result.years} budget={budget} disabled={!editable} onRemove={removeManualCost} categories={FLOW_COST_GROUPS.otherNonAcademic} />
            <FlowRow label="HONORARIOS NO ACADÉMICOS (SUBTOTAL)" values={result.annualFlows.map((flow) => -flow.nonAcademicHonoraria)} total />

            <EditableCostFlowRow
              label="Gastos operacionales / Bienes y servicios"
              years={result.years}
              values={result.annualFlows.map((flow) => flow.operational)}
              disabled={!editable}
              onChange={(year, value) => updateEditableFlowCost(year, "annualOperational", FLOW_COST_GROUPS.operational, value)}
            />
            <ManualCostRows items={budget.manualItems} years={result.years} budget={budget} disabled={!editable} onRemove={removeManualCost} categories={FLOW_COST_GROUPS.operational} />

            <EditableCostFlowRow
              label="Software y licencias"
              years={result.years}
              values={result.annualFlows.map((flow) => flow.software)}
              disabled={!editable}
              onChange={(year, value) => updateEditableFlowCost(year, "annualSoftware", FLOW_COST_GROUPS.software, value)}
            />
            <ManualCostRows items={budget.manualItems} years={result.years} budget={budget} disabled={!editable} onRemove={removeManualCost} categories={FLOW_COST_GROUPS.software} />

            <EditableCostFlowRow
              label="Difusión"
              years={result.years}
              values={result.annualFlows.map((flow) => flow.diffusion)}
              disabled={!editable}
              onChange={(year, value) => updateEditableFlowCost(year, "annualDiffusion", FLOW_COST_GROUPS.diffusion, value)}
            />
            <ManualCostRows items={budget.manualItems} years={result.years} budget={budget} disabled={!editable} onRemove={removeManualCost} categories={FLOW_COST_GROUPS.diffusion} />

            <EditableCostFlowRow
              label="Congresos y pasantías"
              years={result.years}
              values={result.annualFlows.map((flow) => flow.congressesInternships)}
              disabled={!editable}
              onChange={(year, value) => updateEditableFlowCost(year, "annualCongressesInternships", FLOW_COST_GROUPS.congressesInternships, value)}
            />
            <ManualCostRows items={budget.manualItems} years={result.years} budget={budget} disabled={!editable} onRemove={removeManualCost} categories={FLOW_COST_GROUPS.congressesInternships} />

            <EditableCostFlowRow
              label="Libros y publicaciones"
              years={result.years}
              values={result.annualFlows.map((flow) => flow.booksPublications)}
              disabled={!editable}
              onChange={(year, value) => updateEditableFlowCost(year, "annualBooksPublications", FLOW_COST_GROUPS.booksPublications, value)}
            />
            <ManualCostRows items={budget.manualItems} years={result.years} budget={budget} disabled={!editable} onRemove={removeManualCost} categories={FLOW_COST_GROUPS.booksPublications} />

            <EditableCostFlowRow
              label="Pasajes y fletes"
              years={result.years}
              values={result.annualFlows.map((flow) => flow.travelFreight)}
              disabled={!editable}
              onChange={(year, value) => updateEditableFlowCost(year, "annualTravelFreight", FLOW_COST_GROUPS.travelFreight, value)}
            />
            <ManualCostRows items={budget.manualItems} years={result.years} budget={budget} disabled={!editable} onRemove={removeManualCost} categories={FLOW_COST_GROUPS.travelFreight} />

            <EditableCostFlowRow
              label="Viáticos"
              years={result.years}
              values={result.annualFlows.map((flow) => flow.perDiem)}
              disabled={!editable}
              onChange={(year, value) => updateEditableFlowCost(year, "annualPerDiem", FLOW_COST_GROUPS.perDiem, value)}
            />
            <ManualCostRows items={budget.manualItems} years={result.years} budget={budget} disabled={!editable} onRemove={removeManualCost} categories={FLOW_COST_GROUPS.perDiem} />

            <EditableCostFlowRow
              label="Alimentos y bebidas"
              years={result.years}
              values={result.annualFlows.map((flow) => flow.foodBeverages)}
              disabled={!editable}
              onChange={(year, value) => updateEditableFlowCost(year, "annualFoodBeverages", FLOW_COST_GROUPS.foodBeverages, value)}
            />
            <ManualCostRows items={budget.manualItems} years={result.years} budget={budget} disabled={!editable} onRemove={removeManualCost} categories={FLOW_COST_GROUPS.foodBeverages} />

            <EditableCostFlowRow
              label="Otros costos y gastos"
              years={result.years}
              values={result.annualFlows.map((flow) => flow.otherCosts)}
              disabled={!editable}
              onChange={(year, value) => updateEditableFlowCost(year, "annualOtherCosts", FLOW_COST_GROUPS.otherCosts, value)}
            />
            <ManualCostRows items={budget.manualItems} years={result.years} budget={budget} disabled={!editable} onRemove={removeManualCost} categories={FLOW_COST_GROUPS.otherCosts} />
            <FlowRow label="OTROS GASTOS (SUBTOTAL)" values={result.annualFlows.map((flow) => -flow.otherExpenses)} total />

            {result.annualFlows.some((flow) => flow.equipment > 0) ? <>
              <ManualCostRows items={budget.manualItems} years={result.years} budget={budget} disabled={!editable} onRemove={removeManualCost} categories={FLOW_COST_GROUPS.equipment} />
              <FlowRow label="EQUIPAMIENTOS (SUBTOTAL)" values={result.annualFlows.map((flow) => -flow.equipment)} total />
            </> : null}

            {result.annualFlows.some((flow) => flow.scholarshipsAndAid > 0) ? <>
              {result.annualFlows.some((flow) => flow.maintenanceScholarships > 0)
                ? <FlowRow label="Becas de manutención" values={result.annualFlows.map((flow) => -flow.maintenanceScholarships)} />
                : null}
              <ManualCostRows items={budget.manualItems} years={result.years} budget={budget} disabled={!editable} onRemove={removeManualCost} categories={FLOW_COST_GROUPS.scholarshipsAid} />
              <FlowRow label="BECAS Y AYUDAS (SUBTOTAL)" values={result.annualFlows.map((flow) => -flow.scholarshipsAndAid)} total />
            </> : null}

            <FlowRow label="Base overhead (solo arancel neto sujeto a cobro)" values={result.annualFlows.map((flow) => flow.overheadBase)} />
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

    <section className="panel"><SectionHeading number="11" id="workflow" title="Revisión y aprobación" description="Gestión → V°B° → Aprobación, con historial auditable y aviso por correo." /><div className="workflow-actions">{workflowActions.length ? workflowActions.map((transition) => <button key={transition.action} className="button primary" type="button" disabled={dirty || blockingIntegrityIssues.length > 0} onClick={() => void openMailDialog(transition.action)}>{actionLabels[transition.action]}</button>) : <span>No hay acciones disponibles para el rol y etapa actuales.</span>}</div></section>
    {mailDialog ? <div className="modal-backdrop" role="presentation"><div className="modal-card" role="dialog" aria-modal="true"><h3>{mailDialog.title}</h3><p>Seleccione a quién avisar. El correo identifica programa, cohorte, revisión y estado del presupuesto.</p><label>Destinatario<select value={recipientMode} onChange={(event) => { const value = event.target.value; setRecipientMode(value); if (value === "OTROS") { setRecipientEmail(""); setRecipientName(""); } else { const found = recipients.find((item) => item.email === value); setRecipientEmail(value); setRecipientName(found?.name ?? ""); } }}>{recipients.map((item) => <option key={item.id} value={item.email}>{item.name} · {item.email}</option>)}<option value="OTROS">Otros</option></select></label>{recipientMode === "OTROS" ? <><label>Correo<input type="email" value={recipientEmail} onChange={(event) => setRecipientEmail(event.target.value)} /></label><label>Nombre (opcional)<input value={recipientName} onChange={(event) => setRecipientName(event.target.value)} /></label></> : null}<label>Comentario<textarea value={mailComment} onChange={(event) => setMailComment(event.target.value)} rows={4} /></label><div className="workspace-actions"><button className="button secondary" onClick={() => setMailDialog(null)}>Cancelar</button><button className="button primary" disabled={!recipientEmail.trim()} onClick={() => void confirmMailAction()}>{mailDialog.action ? "Registrar y preparar aviso" : "Preparar correo"}</button></div></div></div> : null}
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
  return <tr className={`${total ? "row-total" : ""} ${resolved ? `row-${resolved}` : ""}`}><th>{label}</th>{values.map((value, index) => <td key={index} className={`numeric ${signed ? value >= 0 ? "positive-text" : "negative-text" : ""}`}>{formatCLP(value)}</td>)}<td className="flow-action-cell" aria-hidden="true" /></tr>;
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
    <td className="flow-action-cell" aria-hidden="true" />
  </tr>;
}

function ManualCostRows({
  items,
  years,
  budget,
  categories,
  disabled,
  onRemove,
}: {
  items: BudgetItem[];
  years: number[];
  budget: CohortBudget;
  categories: readonly BudgetItem["category"][];
  disabled: boolean;
  onRemove: (itemId: string) => void;
}) {
  const matching = items.filter((item) => categories.includes(item.category));
  if (!matching.length) return null;
  return <>
    {matching.map((item) => <tr className="flow-detail-row" key={`flow-detail-${item.id}`}>
      <th><span>Costo: {item.name}</span><small>{item.category} · {item.periodicity} · {item.costType}</small></th>
      {years.map((year) => <td className="numeric" key={`flow-detail-${item.id}-${year}`}>{formatCLP(-manualItemAmountForYear(item, budget, year))}</td>)}
      <td className="flow-action-cell"><button className="button flow-remove-button" type="button" disabled={disabled} onClick={() => onRemove(item.id)}>Quitar</button></td>
    </tr>)}
  </>;
}
