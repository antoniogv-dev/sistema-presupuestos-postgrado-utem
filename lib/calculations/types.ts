export type ProgramType = "DOCTORADO" | "MAGISTER_ACADEMICO" | "MAGISTER_PROFESIONAL" | "OTRO";
export type SemesterNumber = 1 | 2;
export type BudgetStatus = "Borrador" | "En revisión" | "Observado" | "Aprobado" | "Reemplazado";
export type TuitionSource = "PROPIO" | "PLANTILLA_DOCTORADO" | "PLANTILLA_MAGISTER_ACADEMICO" | "PLANTILLA_MAGISTER_PROFESIONAL";
export type AccessRole = "ADMIN" | "CREADOR" | "LECTOR" | "GESTOR" | "VISTO_BUENO" | "APROBADOR";
export type WorkflowStage = "GESTION" | "VISTO_BUENO" | "APROBACION" | "FINALIZADO";
export type ReviewDecision = "ENVIADO" | "VISTO_BUENO" | "OBSERVADO" | "APROBADO" | "RECHAZADO";
export type TemplateItemKind = "DESCUENTO" | "BECA_ARANCEL" | "BECA_MANUTENCION" | "COSTO" | "INGRESO_EXTRAORDINARIO" | "PARAMETRO_ANUAL";
export type DeliveryModality = "PRESENCIAL" | "SEMIPRESENCIAL" | "E_LEARNING";
export type TeachingMode = "PRESENCIAL" | "SINCRONICA" | "ASINCRONICA";
export type CurriculumCourseKind = "OBLIGATORIA" | "ELECTIVA" | "ESPECIALIZACION" | "GRADUACION" | "COMPETENCIA_GENERICA";
export type AnnualTemplateParameter = "ARANCEL" | "MATRICULA" | "BECA_MANUTENCION" | "DOCENCIA_PRESENCIAL" | "DOCENCIA_SINCRONICA" | "DOCENCIA_ASINCRONICA" | "GUIA_TESIS" | "DIRECCION" | "ASISTENCIA" | "OTROS_HONORARIOS_NO_ACADEMICOS";
export type StudentQuantityMode = "TODOS_ACTIVOS" | "CANTIDAD";
export type BudgetCostType = "Único de esta versión" | "Compartido con otras cohortes";
export type TuitionPricingMode = "ANNUAL_LEGACY" | "PROGRAM_TOTAL";
export type EnrollmentBillingMode = "ANNUAL" | "SINGLE_SPECIAL" | "SEMESTER";
export type TuitionDistributionMode = "PROPORTIONAL" | "CUSTOM";
export type DiscountTarget = "TUITION" | "ENROLLMENT";


export interface ProgramCourse {
  id: string;
  code?: string;
  name: string;
  semester: number;
  kind: CurriculumCourseKind;
  weeks: number;
  sections: number;
  theoryWeeklyHours: number;
  laboratoryWeeklyHours: number;
  workshopWeeklyHours: number;
  directWeeklyHours: number;
  autonomousWeeklyHours: number;
  teachingMode: TeachingMode;
  asynchronousRateFactor: number;
  sharedWithProgramIds: string[];
  allocationRate: number;
  sctCredits: number;
  prerequisites?: string;
  position: number;
}

export interface ProgramIntakeWindow {
  id: string;
  code: string;
  name: string;
  academicSemester: SemesterNumber;
  month: number;
  day?: number;
  active: boolean;
  displayOrder: number;
}

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
  versionLabel?: string;
  curriculumCourses?: ProgramCourse[];
  annualPlanningEnabled?: boolean;
  maxAnnualIntakes?: number;
  intakeWindows?: ProgramIntakeWindow[];
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
  synchronousTeachingHours: number;
  asynchronousTeachingHours: number;
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
  target?: DiscountTarget;
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
  type: "Beca ANID" | "Otra beca externa" | "Convenio" | "Aporte institucional" | "Financiamiento institucional" | "Proyecto" | "Donación" | "Ingreso extraordinario" | "Otro";
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
  category: "Honorarios académicos" | "Honorarios no académicos" | "Otros honorarios no académicos" | "Dirección" | "Asistencia" | "Asistencia de dirección" | "Gastos operacionales" | "Bienes y servicios" | "Gastos operacionales / Bienes y servicios" | "Software" | "Software y licencias" | "Difusión" | "Congresos" | "Pasantías" | "Congresos y pasantías" | "Becas de manutención" | "Becas y ayudas" | "Equipamiento" | "Libros y publicaciones" | "Pasajes y fletes" | "Viáticos" | "Alimentos y bebidas" | "Otros" | "Otros costos y gastos";
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

export interface AnnualParameterTemplateConfig {
  parameter: AnnualTemplateParameter;
  values: Record<number, number>;
  annualAdjustmentRate: number;
  /** Año desde el cual se proyecta el valor base manual. */
  baseYear?: number;
  /** Valor inicial manual que puede reemplazar la referencia institucional antes de proyectar. */
  baseValue?: number;
  note?: string;
}

export interface SharedCourseTemplatePreset {
  id: string;
  courseName: string;
  semesterOffset: number;
  teachingMode: TeachingMode;
  hours: number;
  participantProgramIds: string[];
  allocationRate: number;
  note?: string;
}

export interface BudgetTemplateSettings {
  modality?: DeliveryModality;
  sharedCourses?: SharedCourseTemplatePreset[];
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
export type BudgetTemplateConfig = DiscountTemplateConfig | TuitionScholarshipTemplateConfig | MaintenanceScholarshipTemplateConfig | CostTemplateConfig | IncomeTemplateConfig | AnnualParameterTemplateConfig;

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
  programId?: string;
  settings?: BudgetTemplateSettings;
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

export interface BudgetAnnualOverride {
  year: number;
  directTeachingHourValue: number;
  synchronousTeachingHourValue: number;
  asynchronousTeachingHourValue: number;
  maintenanceScholarshipMonthlyValue: number;
  annualEnrollmentFee: number;
  annualTuition: number;
  thesisGuidancePerGraduatingStudent: number;
  annualDirection: number;
  directionProrated: boolean;
  directionAllocationRate: number;
  annualAssistance: number;
  assistanceProrated: boolean;
  assistanceAllocationRate: number;
  annualOtherNonAcademicHonoraria: number;
  otherNonAcademicProrated: boolean;
  otherNonAcademicAllocationRate: number;
  annualOperational: number;
  annualSoftware: number;
  annualDiffusion: number;
  annualCongressesInternships: number;
  annualBooksPublications: number;
  annualTravelFreight: number;
  annualPerDiem: number;
  annualFoodBeverages: number;
  annualOtherCosts: number;
  centralOverheadRate: number;
  facultyOverheadRate: number;
}


export interface SharedCourseEconomyRule {
  id: string;
  courseName: string;
  year: number;
  semester: SemesterNumber;
  teachingMode: TeachingMode;
  hours: number;
  participantProgramIds: string[];
  allocationRate: number;
  note?: string;
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
  /** Modelo histórico por año o precio total del programa académico completo. */
  tuitionPricingMode?: TuitionPricingMode;
  /** Modalidad de cobro de matrícula. ANNUAL conserva la regla histórica. */
  enrollmentBillingMode?: EnrollmentBillingMode;
  /** Precio bruto total del programa completo cuando tuitionPricingMode = PROGRAM_TOTAL. */
  programTotalTuition?: number;
  /** Matrícula cobrada una sola vez, al inicio del programa. */
  singleEnrollmentFee?: number;
  /** Matrícula cobrada en cada semestre activo. */
  semesterEnrollmentFee?: number;
  /** Número de cuotas del arancel. Es sólo una forma de pago y no altera el ingreso total. */
  tuitionInstallments?: number;
  /** Distribución temporal del arancel total entre semestres. */
  tuitionDistributionMode?: TuitionDistributionMode;
  /** Participaciones por semestre activo, expresadas como decimales; deben sumar 1. */
  tuitionSemesterDistribution?: number[];
  /** Secciones por asignatura aplicables sólo a esta cohorte; clave = id de ProgramCourse. */
  curriculumSectionOverrides?: Record<string, number>;
  /** Incobrabilidad particular de esta formulación. Si no está informada, usa la referencia institucional del tipo de programa. */
  badDebtRate?: number;
  programVersionLabel: string;
  scholarshipsEnabled: boolean;
  deliveryModality: DeliveryModality;
  authorizedInitialCarryover: number;
  includeAuthorizedCarryover: boolean;
  normalizeSharedCosts: boolean;
  alertPotentialDuplicates: boolean;
  appliedTemplateId?: string;
  appliedTemplateCode?: string;
  appliedTemplateVersion?: number;
  responsible: string;
  version: number;
  annualOverrides: BudgetAnnualOverride[];
  createdAt: string;
  updatedAt?: string;
  deletedAt?: string;
  notes?: string;
  semesters: SemesterParameters[];
  discounts: CohortDiscount[];
  externalIncome: ExternalIncome[];
  manualItems: BudgetItem[];
  sharedCourses: SharedCourseEconomyRule[];
  reviewHistory: ReviewEvent[];
}


export interface PricingTrace {
  pricingMode: TuitionPricingMode;
  enrollmentBillingMode: EnrollmentBillingMode;
  durationSemesters: number;
  programTotalTuition: number;
  equivalentTuitionPerSemester: number;
  tuitionInstallments: number;
  distribution: Array<{ index: number; year: number; semester: SemesterNumber; share: number }>;
}

export interface SemesterRevenueTrace {
  index: number;
  year: number;
  semester: SemesterNumber;
  activeStudents: number;
  tuitionUnitPrice: number;
  tuitionShare: number;
  grossTuition: number;
  tuitionDiscounts: number;
  internalTuitionScholarships: number;
  tuitionAfterBenefits: number;
  badDebt: number;
  netTuitionIncome: number;
  enrollmentUnitPrice: number;
  grossEnrollmentFee: number;
  enrollmentDiscounts: number;
  netEnrollmentFee: number;
  recognizedEnrollmentFee: number;
}

export interface AnnualFlow {
  year: number;
  activeSemesters: number;
  tuitionFactor: number;
  /** Participación del arancel total reconocida presupuestariamente en el año; en modo histórico conserva el factor de ciclos cobrados. */
  tuitionDistributionShare: number;
  annualTuition: number;
  grossTuition: number;
  discounts: number;
  internalTuitionScholarships: number;
  tuitionAfterBenefits: number;
  equivalentEnrollments: number;
  roundedEquivalentStudents: number;
  badDebt: number;
  netTuitionIncome: number;
  grossEnrollmentFee: number;
  enrollmentDiscounts: number;
  netEnrollmentFee: number;
  recognizedEnrollmentFee: number;
  externalIncome: number;
  institutionalFinancing: number;
  otherIncome: number;
  totalIncome: number;
  directTeachingCost: number;
  synchronousTeachingCost: number;
  asynchronousTeachingCost: number;
  sharedCourseSavings: number;
  replacementTeachingCost: number;
  thesisGuidanceCost: number;
  academicHonoraria: number;
  otherNonAcademicHonoraria: number;
  nonAcademicHonoraria: number;
  direction: number;
  assistance: number;
  operational: number;
  software: number;
  diffusion: number;
  maintenanceScholarships: number;
  scholarshipsAndAid: number;
  equipment: number;
  otherExpenses: number;
  congressesInternships: number;
  booksPublications: number;
  travelFreight: number;
  perDiem: number;
  foodBeverages: number;
  otherCosts: number;
  centralOverhead: number;
  overheadBase: number;
  centralOverheadRate: number;
  facultyOverheadRate: number;
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
  /** Contrato de precio y distribución utilizado por el motor v12. */
  pricing: PricingTrace;
  /** Libro mayor semestral de ingresos previo a la agregación anual. */
  revenueLedger: SemesterRevenueTrace[];
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
