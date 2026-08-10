export type ProgramType = "DOCTORADO" | "MAGISTER_ACADEMICO" | "MAGISTER_PROFESIONAL" | "OTRO";
export type SemesterNumber = 1 | 2;
export type BudgetStatus = "Borrador" | "En revisión" | "Observado" | "Aprobado" | "Reemplazado";
export type TuitionSource = "PROPIO" | "PLANTILLA_DOCTORADO" | "PLANTILLA_MAGISTER_ACADEMICO" | "PLANTILLA_MAGISTER_PROFESIONAL";
export type AccessRole = "ADMIN" | "CREADOR" | "LECTOR" | "GESTOR" | "VISTO_BUENO" | "APROBADOR";
export type WorkflowStage = "GESTION" | "VISTO_BUENO" | "APROBACION" | "FINALIZADO";
export type ReviewDecision = "ENVIADO" | "VISTO_BUENO" | "OBSERVADO" | "APROBADO" | "RECHAZADO";
export type TemplateItemKind = "DESCUENTO" | "BECA_ARANCEL" | "BECA_MANUTENCION" | "COSTO" | "INGRESO_EXTRAORDINARIO";
export type StudentQuantityMode = "TODOS_ACTIVOS" | "CANTIDAD";
export type BudgetCostType = "Único de esta versión" | "Compartido con otras cohortes";

export interface Program {
  id: string;
  code: string;
  name: string;
  type: ProgramType;
  faculty: string;
  director: string;
  officialDurationSemesters: number;
  status: "Activo" | "Inactivo" | "En diseño";
  costCenter?: string;
  annualTuition?: Record<number, number>;
  tuitionSource?: TuitionSource;
}

export interface ProgramTypeParameters {
  annualDirection: Record<number, number>;
  annualAssistance: Record<number, number>;
  referenceOperational: Record<number, number>;
  softwareLicenses: Record<number, number>;
  diffusionAdmission: Record<number, number>;
  congressesInternships: Record<number, number>;
  thesisGuidancePerGraduatingStudent: Record<number, number>;
  centralOverheadRate: number;
  facultyOverheadRate: number;
  badDebtRate: number;
}

export interface InstitutionalParameters {
  teachingHour: Record<number, number>;
  replacementHour: number;
  maintenanceScholarshipMonthly: Record<number, number>;
  doctorateTuitionTemplate: Record<number, number>;
  tuitionTemplates: Record<ProgramType, Record<number, number>>;
  annualEnrollmentFee: Record<number, number>;
  annualAdjustmentRate: number;
  planningHorizonYears: number;
  byProgramType: Record<ProgramType, ProgramTypeParameters>;
}

export interface SemesterParameters {
  year: number;
  semester: SemesterNumber;
  activeStudents: number;
  graduatingStudents: number;
  directTeachingHours: number;
  replacementTeachingHours: number;
  electiveSubjects: number;
  electiveSections: number;
  specializedCourses: number;
  specializedSections: number;
  internalTuitionScholarshipStudents: number;
  internalTuitionScholarshipCoverage: number;
  maintenanceScholarshipStudents: number;
  maintenanceScholarshipMonths: number;
  notes?: string;
}

export interface CohortDiscount {
  id: string;
  name: string;
  percentage: number;
  students: number;
  startYear: number;
  startSemester: SemesterNumber;
  endYear: number;
  endSemester: SemesterNumber;
  note?: string;
  originTemplateItemKey?: string;
}

export interface ExternalIncome {
  id: string;
  type: "Beca ANID" | "Otra beca externa" | "Convenio" | "Aporte institucional" | "Proyecto" | "Donación" | "Ingreso extraordinario" | "Otro";
  description: string;
  year: number;
  semester: SemesterNumber;
  students: number;
  amountPerStudent: number;
  source: string;
  note?: string;
  originTemplateItemKey?: string;
}

export interface BudgetItem {
  id: string;
  name: string;
  description: string;
  category: "Honorarios académicos" | "Honorarios no académicos" | "Dirección" | "Asistencia" | "Gastos operacionales" | "Software" | "Difusión" | "Congresos" | "Pasantías" | "Becas de manutención" | "Bienes y servicios" | "Libros y publicaciones" | "Pasajes y fletes" | "Viáticos" | "Otros";
  year: number;
  semester?: SemesterNumber;
  amount: number;
  costType: BudgetCostType;
  periodicity: "Único" | "Semestral" | "Anual";
  note?: string;
  originTemplateItemKey?: string;
}

export interface DiscountTemplateConfig {
  percentage: number;
  students: number;
  periodMode?: "TODOS" | "ULTIMO";
  note?: string;
}
export interface TuitionScholarshipTemplateConfig {
  studentMode: StudentQuantityMode;
  students: number;
  coverage: number;
  periodMode?: "TODOS" | "ULTIMO";
}
export interface MaintenanceScholarshipTemplateConfig {
  studentMode: StudentQuantityMode;
  students: number;
  months: number;
  periodMode?: "TODOS" | "ULTIMO";
}
export interface CostTemplateConfig {
  description?: string;
  category: BudgetItem["category"];
  year?: number;
  semester?: SemesterNumber;
  amount: number;
  costType: BudgetCostType;
  periodicity: BudgetItem["periodicity"];
  note?: string;
}
export interface IncomeTemplateConfig {
  type: ExternalIncome["type"];
  year?: number;
  semester?: SemesterNumber;
  students: number;
  amountPerStudent: number;
  source: string;
  note?: string;
}
export type BudgetTemplateConfig = DiscountTemplateConfig | TuitionScholarshipTemplateConfig | MaintenanceScholarshipTemplateConfig | CostTemplateConfig | IncomeTemplateConfig;

export interface BudgetTemplateItem {
  id: string;
  key: string;
  kind: TemplateItemKind;
  name: string;
  active: boolean;
  position: number;
  config: BudgetTemplateConfig;
}

export interface BudgetTemplate {
  id: string;
  code: string;
  name: string;
  programType: ProgramType;
  description: string;
  version: number;
  active: boolean;
  items: BudgetTemplateItem[];
}

export interface ReviewEvent {
  id: string;
  role: AccessRole;
  decision: ReviewDecision;
  user: string;
  comment?: string;
  createdAt: string;
  fromStage: WorkflowStage;
  toStage: WorkflowStage;
}

export interface CohortBudget {
  id: string;
  program: Program;
  cohortName: string;
  startYear: number;
  startSemester: SemesterNumber;
  durationSemesters: number;
  initialStudents: number;
  status: BudgetStatus;
  workflowStage: WorkflowStage;
  facultyOverheadRate: number;
  enrollmentRecognitionRate: number;
  authorizedInitialCarryover: number;
  includeAuthorizedCarryover: boolean;
  normalizeSharedCosts: boolean;
  alertPotentialDuplicates: boolean;
  appliedTemplateId?: string;
  appliedTemplateCode?: string;
  appliedTemplateVersion?: number;
  responsible: string;
  version: number;
  createdAt: string;
  updatedAt?: string;
  deletedAt?: string;
  notes?: string;
  semesters: SemesterParameters[];
  discounts: CohortDiscount[];
  externalIncome: ExternalIncome[];
  manualItems: BudgetItem[];
  reviewHistory: ReviewEvent[];
}

export interface AnnualFlow {
  year: number;
  activeSemesters: number;
  tuitionFactor: number;
  annualTuition: number;
  grossTuition: number;
  discounts: number;
  internalTuitionScholarships: number;
  tuitionAfterBenefits: number;
  equivalentEnrollments: number;
  roundedEquivalentStudents: number;
  badDebt: number;
  netTuitionIncome: number;
  recognizedEnrollmentFee: number;
  externalIncome: number;
  otherIncome: number;
  totalIncome: number;
  directTeachingCost: number;
  replacementTeachingCost: number;
  thesisGuidanceCost: number;
  manualAcademicHonoraria: number;
  academicHonoraria: number;
  nonAcademicHonoraria: number;
  direction: number;
  assistance: number;
  operational: number;
  software: number;
  diffusion: number;
  maintenanceScholarships: number;
  congressesInternships: number;
  booksPublications: number;
  travelFreight: number;
  perDiem: number;
  otherCosts: number;
  centralOverhead: number;
  facultyOverhead: number;
  totalExpenses: number;
  netFlow: number;
  startingCarryover: number;
  accumulatedFlow: number;
  thesisStudents: number;
  graduatingStudents: number;
  operatingMargin: number | null;
}

export interface BudgetResult {
  periods: Array<{ year: number; semester: SemesterNumber; index: number }>;
  years: number[];
  annualFlows: AnnualFlow[];
  finalAccumulatedFlow: number;
  viable: boolean | null;
  worstDeficitYear: number | null;
  breakEvenYear: number | null;
  warnings: string[];
}

export interface DuplicateCostAlert {
  key: string;
  programId: string;
  year: number;
  category: BudgetItem["category"];
  name: string;
  budgetIds: string[];
  cohorts: string[];
  totalAmount: number;
  allMarkedShared: boolean;
  message: string;
}
