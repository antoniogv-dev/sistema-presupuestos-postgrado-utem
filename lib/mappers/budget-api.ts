import { getActivePeriods } from "@/lib/calculations/periods";
import type {
  AccessRole,
  BudgetAnnualOverride,
  CohortBudget,
  ExternalIncome,
  Program,
  ProgramCourse,
  ReviewDecision,
  SemesterParameters,
  TuitionSource,
} from "@/lib/calculations/types";

export type ApiIdentity = {
  userId: string;
  email: string;
  name: string;
  roles: AccessRole[];
  source?: string;
};

export type ApiTuition = {
  year: number;
  amount: string | number;
  source: TuitionSource | string;
  templateType?: Program["type"] | null;
};

export type ApiProgram = {
  id: string;
  code: string;
  name: string;
  type: Program["type"];
  faculty: string;
  director: string;
  officialDurationSemesters: number;
  status: "ACTIVO" | "INACTIVO" | "EN_DISENO";
  costCenter?: string | null;
  versionLabel?: string | null;
  annualTuitions?: ApiTuition[];
  curriculumCourses?: Array<Record<string, unknown>>;
  annualPlanningEnabled?: boolean;
  maxAnnualIntakes?: number;
  intakeWindows?: Array<Record<string, unknown>>;
};

export type ApiBudgetRecord = {
  id: string;
  program: ApiProgram;
  cohortName: string;
  startYear: number;
  startSemester: 1 | 2;
  durationSemesters: number;
  initialStudents: number;
  status: string;
  workflowStage: CohortBudget["workflowStage"];
  facultyOverheadRate: string | number;
  enrollmentRecognitionRate: string | number;
  badDebtRate?: string | number | null;
  programVersionLabel?: string | null;
  scholarshipsEnabled?: boolean | number;
  deliveryModality?: CohortBudget["deliveryModality"];
  authorizedInitialCarryover: string | number;
  includeAuthorizedCarryover?: boolean;
  normalizeSharedCosts?: boolean;
  alertPotentialDuplicates?: boolean;
  appliedTemplateId?: string | null;
  appliedTemplateVersion?: number | null;
  appliedTemplate?: { code?: string } | null;
  responsible?: { id?: string; name: string; email?: string };
  createdAt: string;
  updatedAt?: string;
  notes?: string | null;
  semesterPeriods?: Array<{
    year: number;
    semester: 1 | 2;
    position: number;
    parameters?: Record<string, unknown> | null;
  }>;
  discounts?: Array<Record<string, unknown>>;
  externalIncome?: Array<Record<string, unknown>>;
  items?: Array<Record<string, unknown>>;
  annualOverrides?: Array<Record<string, unknown>>;
  sharedCourses?: Array<Record<string, unknown>>;
  versions?: Array<{ id?: string; number: number; status?: string; snapshot?: unknown; changeNote?: string | null; createdAt?: string }>;
  workflowEvents?: Array<{
    id: string;
    role: AccessRole;
    action: string;
    fromStage: CohortBudget["workflowStage"];
    toStage: CohortBudget["workflowStage"];
    comment?: string | null;
    createdAt: string;
    user?: { name: string };
  }>;
};

export const numberValue = (value: unknown): number =>
  Number.isFinite(Number(value)) ? Number(value) : 0;

const optionalNumberValue = (value: unknown): number =>
  value === null || value === undefined ? Number.NaN : numberValue(value);

function canonicalCostCategory(value: unknown): CohortBudget["manualItems"][number]["category"] {
  const category = String(value ?? "Otros costos y gastos");
  const aliases: Record<string, CohortBudget["manualItems"][number]["category"]> = {
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
  return aliases[category] ?? category as CohortBudget["manualItems"][number]["category"];
}

export function apiErrorMessage(body: unknown): string {
  if (typeof body !== "object" || body === null || !("error" in body)) {
    return "No fue posible completar la operación.";
  }
  const value = (body as { error?: unknown }).error;
  return typeof value === "string" && value.trim()
    ? value
    : "No fue posible completar la operación.";
}

export async function responseBody<T>(response: Response): Promise<T> {
  const body: unknown = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(apiErrorMessage(body));
  return body as T;
}

export function tuitionSourceFromRecord(
  source: string,
  templateType?: Program["type"] | null,
): TuitionSource {
  if (source === "PROPIO") return "PROPIO";
  if (templateType === "MAGISTER_ACADEMICO") return "PLANTILLA_MAGISTER_ACADEMICO";
  if (templateType === "MAGISTER_PROFESIONAL") return "PLANTILLA_MAGISTER_PROFESIONAL";
  if (templateType === "OTRO") return "PROPIO";
  return "PLANTILLA_DOCTORADO";
}

export function toProgram(record: ApiProgram): Program {
  const annualTuition = Object.fromEntries(
    (record.annualTuitions ?? []).map((item) => [item.year, numberValue(item.amount)]),
  );
  const tuitionSources = (record.annualTuitions ?? []).map((item) =>
    tuitionSourceFromRecord(item.source, item.templateType),
  );
  const tuitionSource: TuitionSource = tuitionSources.length
    ? tuitionSources.every((source) => source === tuitionSources[0])
      ? tuitionSources[0]
      : tuitionSources.includes("PROPIO")
        ? "PROPIO"
        : tuitionSources[0]
    : "PROPIO";

  const curriculumCourses = (record.curriculumCourses ?? []).map((item, index) => ({
    id: String(item.id ?? `course-${index}`),
    code: typeof item.code === "string" && item.code.trim() ? item.code : undefined,
    name: String(item.name ?? "Asignatura"),
    semester: Math.max(1, Math.round(numberValue(item.semester))),
    kind: String(item.kind ?? "OBLIGATORIA") as ProgramCourse["kind"],
    weeks: Math.max(1, Math.round(numberValue(item.weeks) || 18)),
    sections: Math.max(1, Math.round(numberValue(item.sections) || 1)),
    theoryWeeklyHours: Math.max(0, numberValue(item.theoryWeeklyHours)),
    laboratoryWeeklyHours: Math.max(0, numberValue(item.laboratoryWeeklyHours)),
    workshopWeeklyHours: Math.max(0, numberValue(item.workshopWeeklyHours)),
    directWeeklyHours: Math.max(0, numberValue(item.directWeeklyHours)),
    autonomousWeeklyHours: Math.max(0, numberValue(item.autonomousWeeklyHours)),
    teachingMode: String(item.teachingMode ?? "SINCRONICA") as "PRESENCIAL" | "SINCRONICA" | "ASINCRONICA",
    asynchronousRateFactor: Math.max(0, Math.min(1, numberValue(item.asynchronousRateFactor ?? 0.5))),
    sharedWithProgramIds: Array.isArray(item.sharedWithProgramIds) ? item.sharedWithProgramIds.map(String) : [],
    allocationRate: Math.max(0, Math.min(1, numberValue(item.allocationRate ?? 1))),
    sctCredits: Math.max(0, numberValue(item.sctCredits)),
    prerequisites: typeof item.prerequisites === "string" && item.prerequisites.trim() ? item.prerequisites : undefined,
    position: Math.max(0, Math.round(numberValue(item.position ?? index))),
  }));

  return {
    id: record.id,
    code: record.code,
    name: record.name,
    type: record.type,
    faculty: record.faculty,
    director: record.director,
    officialDurationSemesters: record.officialDurationSemesters,
    status: record.status === "ACTIVO"
      ? "Activo"
      : record.status === "INACTIVO"
        ? "Inactivo"
        : "En diseño",
    costCenter: record.costCenter ?? undefined,
    versionLabel: record.versionLabel?.trim() || "1",
    annualTuition,
    tuitionSource,
    curriculumCourses,
    annualPlanningEnabled: Boolean(record.annualPlanningEnabled),
    maxAnnualIntakes: Math.max(1, Math.round(numberValue(record.maxAnnualIntakes ?? 2))),
    intakeWindows: (record.intakeWindows ?? []).map((item, index) => ({
      id: String(item.id ?? `window-${index}`), code: String(item.code ?? `I${index + 1}`), name: String(item.name ?? `Inicio ${index + 1}`),
      academicSemester: (numberValue(item.academicSemester) === 2 ? 2 : 1) as 1 | 2, month: Math.min(12, Math.max(1, Math.round(numberValue(item.month) || 3))),
      day: numberValue(item.day) > 0 ? Math.round(numberValue(item.day)) : undefined, active: item.active === undefined ? true : Boolean(item.active),
      displayOrder: Math.max(0, Math.round(numberValue(item.displayOrder ?? index))),
    })),
  };
}

export function emptySemester(year: number, semester: 1 | 2, students = 0): SemesterParameters {
  return {
    year,
    semester,
    activeStudents: students,
    graduatingStudents: 0,
    directTeachingHours: 0,
    synchronousTeachingHours: 0,
    asynchronousTeachingHours: 0,
    replacementTeachingHours: 0,
    electiveSubjects: 0,
    electiveSections: 0,
    specializedCourses: 0,
    specializedSections: 0,
    internalTuitionScholarshipStudents: 0,
    internalTuitionScholarshipCoverage: 1,
    maintenanceScholarshipStudents: 0,
    maintenanceScholarshipMonths: 0,
    notes: "",
  };
}

function budgetStatus(value: string): CohortBudget["status"] {
  const table: Record<string, CohortBudget["status"]> = {
    BORRADOR: "Borrador",
    EN_REVISION: "En revisión",
    OBSERVADO: "Observado",
    APROBADO: "Aprobado",
    REEMPLAZADO: "Reemplazado",
  };
  return table[value] ?? (value as CohortBudget["status"]);
}

function workflowDecision(action: string): ReviewDecision {
  const table: Record<string, ReviewDecision> = {
    SUBMIT_VB: "ENVIADO",
    VB_APPROVE: "VISTO_BUENO",
    VB_OBSERVE: "OBSERVADO",
    FINAL_APPROVE: "APROBADO",
    FINAL_OBSERVE: "RECHAZADO",
  };
  return table[action] ?? "OBSERVADO";
}

function annualOverride(item: Record<string, unknown>): BudgetAnnualOverride {
  return {
    year: numberValue(item.year),
    directTeachingHourValue: numberValue(item.directTeachingHourValue),
    synchronousTeachingHourValue: numberValue(item.synchronousTeachingHourValue),
    asynchronousTeachingHourValue: numberValue(item.asynchronousTeachingHourValue),
    maintenanceScholarshipMonthlyValue: numberValue(item.maintenanceScholarshipMonthlyValue),
    annualEnrollmentFee: numberValue(item.annualEnrollmentFee),
    annualTuition: numberValue(item.annualTuition),
    thesisGuidancePerGraduatingStudent: numberValue(item.thesisGuidancePerGraduatingStudent),
    annualDirection: numberValue(item.annualDirection),
    directionProrated: Boolean(item.directionProrated),
    directionAllocationRate: numberValue(item.directionAllocationRate ?? 1),
    annualAssistance: numberValue(item.annualAssistance),
    assistanceProrated: Boolean(item.assistanceProrated),
    assistanceAllocationRate: numberValue(item.assistanceAllocationRate ?? 1),
    annualOtherNonAcademicHonoraria: optionalNumberValue(item.annualOtherNonAcademicHonoraria),
    otherNonAcademicProrated: Boolean(item.otherNonAcademicProrated),
    otherNonAcademicAllocationRate: item.otherNonAcademicAllocationRate === null || item.otherNonAcademicAllocationRate === undefined ? Number.NaN : numberValue(item.otherNonAcademicAllocationRate),
    annualOperational: optionalNumberValue(item.annualOperational),
    annualSoftware: optionalNumberValue(item.annualSoftware),
    annualDiffusion: optionalNumberValue(item.annualDiffusion),
    annualCongressesInternships: optionalNumberValue(item.annualCongressesInternships),
    annualBooksPublications: optionalNumberValue(item.annualBooksPublications),
    annualTravelFreight: optionalNumberValue(item.annualTravelFreight),
    annualPerDiem: optionalNumberValue(item.annualPerDiem),
    annualFoodBeverages: optionalNumberValue(item.annualFoodBeverages),
    annualOtherCosts: optionalNumberValue(item.annualOtherCosts),
    centralOverheadRate: numberValue(item.centralOverheadRate),
    facultyOverheadRate: numberValue(item.facultyOverheadRate),
  };
}

export function toBudget(record: ApiBudgetRecord): CohortBudget {
  const semesters = (record.semesterPeriods ?? []).map((period) => {
    const parameters = period.parameters ?? {};
    return {
      ...emptySemester(period.year, period.semester),
      activeStudents: numberValue(parameters.activeStudents),
      graduatingStudents: numberValue(parameters.graduatingStudents),
      directTeachingHours: numberValue(parameters.directTeachingHours),
      synchronousTeachingHours: numberValue(parameters.synchronousTeachingHours),
      asynchronousTeachingHours: numberValue(parameters.asynchronousTeachingHours),
      replacementTeachingHours: numberValue(parameters.replacementTeachingHours),
      electiveSubjects: numberValue(parameters.electiveSubjects),
      electiveSections: numberValue(parameters.electiveSections),
      specializedCourses: numberValue(parameters.specializedCourses),
      specializedSections: numberValue(parameters.specializedSections),
      internalTuitionScholarshipStudents: numberValue(parameters.internalTuitionScholarshipStudents),
      internalTuitionScholarshipCoverage: numberValue(parameters.internalTuitionScholarshipCoverage ?? 1),
      maintenanceScholarshipStudents: numberValue(parameters.maintenanceScholarshipStudents),
      maintenanceScholarshipMonths: numberValue(parameters.maintenanceScholarshipMonths),
      notes: typeof parameters.notes === "string" ? parameters.notes : "",
    } satisfies SemesterParameters;
  });

  const activeSemesters = semesters.length
    ? semesters
    : getActivePeriods(record.startYear, record.startSemester, record.durationSemesters).map(
      (period, index) => ({
        ...emptySemester(period.year, period.semester, record.initialStudents),
        graduatingStudents: index === record.durationSemesters - 1 ? record.initialStudents : 0,
      }),
    );

  return {
    id: record.id,
    program: toProgram(record.program),
    cohortName: record.cohortName,
    startYear: record.startYear,
    startSemester: record.startSemester,
    durationSemesters: record.durationSemesters,
    initialStudents: record.initialStudents,
    status: budgetStatus(record.status),
    workflowStage: record.workflowStage,
    facultyOverheadRate: numberValue(record.facultyOverheadRate),
    enrollmentRecognitionRate: numberValue(record.enrollmentRecognitionRate),
    badDebtRate: optionalNumberValue(record.badDebtRate),
    programVersionLabel: record.programVersionLabel?.trim() || record.program.versionLabel?.trim() || "1",
    scholarshipsEnabled: record.scholarshipsEnabled === undefined ? record.program.type !== "MAGISTER_PROFESIONAL" : Boolean(record.scholarshipsEnabled),
    deliveryModality: record.deliveryModality ?? "PRESENCIAL",
    authorizedInitialCarryover: numberValue(record.authorizedInitialCarryover),
    includeAuthorizedCarryover: record.includeAuthorizedCarryover ?? true,
    normalizeSharedCosts: record.normalizeSharedCosts ?? true,
    alertPotentialDuplicates: record.alertPotentialDuplicates ?? true,
    appliedTemplateId: record.appliedTemplateId ?? undefined,
    appliedTemplateCode: record.appliedTemplate?.code,
    appliedTemplateVersion: record.appliedTemplateVersion ?? undefined,
    responsible: record.responsible?.name ?? "Gestión de Postgrado",
    version: record.versions?.[0]?.number ?? 1,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    notes: record.notes ?? undefined,
    semesters: activeSemesters,
    annualOverrides: (record.annualOverrides ?? []).map(annualOverride).sort((a, b) => a.year - b.year),
    discounts: (record.discounts ?? []).map((item) => ({
      id: String(item.id),
      name: String(item.name),
      percentage: numberValue(item.percentage),
      students: numberValue(item.students),
      startYear: numberValue(item.startYear),
      startSemester: numberValue(item.startSemester) as 1 | 2,
      endYear: numberValue(item.endYear),
      endSemester: numberValue(item.endSemester) as 1 | 2,
      note: typeof item.note === "string" ? item.note : undefined,
      originTemplateItemKey: typeof item.originTemplateItemKey === "string" ? item.originTemplateItemKey : undefined,
    })),
    externalIncome: (record.externalIncome ?? []).map((item) => ({
      id: String(item.id),
      type: String(item.type) as ExternalIncome["type"],
      description: String(item.description),
      year: numberValue(item.year),
      semester: numberValue(item.semester) as 1 | 2,
      students: numberValue(item.students),
      amountPerStudent: numberValue(item.amountPerStudent),
      source: String(item.source),
      note: typeof item.note === "string" ? item.note : undefined,
      originTemplateItemKey: typeof item.originTemplateItemKey === "string" ? item.originTemplateItemKey : undefined,
    })),
    sharedCourses: (record.sharedCourses ?? []).map((item) => ({
      id: String(item.id),
      courseName: String(item.courseName),
      year: numberValue(item.year),
      semester: numberValue(item.semester) as 1 | 2,
      teachingMode: String(item.teachingMode ?? "PRESENCIAL") as CohortBudget["sharedCourses"][number]["teachingMode"],
      hours: numberValue(item.hours),
      participantProgramIds: Array.isArray(item.participantProgramIds) ? item.participantProgramIds.map(String) : (() => { try { return JSON.parse(String(item.participantProgramIds ?? "[]")) as string[]; } catch { return []; } })(),
      allocationRate: numberValue(item.allocationRate ?? 1),
      note: typeof item.note === "string" ? item.note : undefined,
    })),
    manualItems: (record.items ?? []).map((item) => ({
      id: String(item.id),
      name: String(item.name),
      description: String(item.description ?? ""),
      category: canonicalCostCategory(item.category),
      year: numberValue(item.year),
      semester: item.semester ? numberValue(item.semester) as 1 | 2 : undefined,
      amount: numberValue(item.amount),
      costType: String(item.costType) === "COMPARTIDO" ? "Compartido con otras cohortes" : "Único de esta versión",
      periodicity: String(item.periodicity) as CohortBudget["manualItems"][number]["periodicity"],
      note: typeof item.note === "string" ? item.note : undefined,
      originTemplateItemKey: typeof item.originTemplateItemKey === "string" ? item.originTemplateItemKey : undefined,
    })),
    reviewHistory: (record.workflowEvents ?? []).map((event) => ({
      id: event.id,
      role: event.role,
      decision: workflowDecision(event.action),
      user: event.user?.name ?? "Usuario",
      comment: event.comment ?? undefined,
      createdAt: event.createdAt,
      fromStage: event.fromStage,
      toStage: event.toStage,
    })),
  };
}
