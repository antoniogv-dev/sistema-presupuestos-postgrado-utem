import type { CohortBudget, InstitutionalParameters, Program, ProgramType, ProgramTypeParameters } from "./calculations/types";
import { getActivePeriods } from "./calculations/periods";

const years = [2026, 2027, 2028, 2029, 2030];
const yearly = (values: number[]) => Object.fromEntries(years.map((year, index) => [year, values[index]]));

function scopedParameters(type: ProgramType): ProgramTypeParameters {
  const academic = type === "DOCTORADO" || type === "MAGISTER_ACADEMICO";
  const doctoral = type === "DOCTORADO";
  return {
    annualDirection: yearly([3954929, 4152675, 4360309, 4578324, 4807240]),
    annualAssistance: yearly([2000000, 2100000, 2205000, 2315250, 2431013]),
    referenceOperational: yearly([1800000, 1890000, 1984500, 2083725, 2187911]),
    softwareLicenses: yearly([750000, 787500, 826875, 868219, 911630]),
    diffusionAdmission: yearly([1000000, 1050000, 1102500, 1157625, 1215506]),
    congressesInternships: doctoral ? yearly([22500000, 22500000, 22500000, 22500000, 22500000]) : yearly([0, 0, 0, 0, 0]),
    thesisGuidancePerGraduatingStudent: yearly([250000, 262500, 275625, 289406, 303876]),
    centralOverheadRate: academic ? 0 : 0.20,
    facultyOverheadRate: academic ? 0 : 0.10,
    badDebtRate: 0.15,
  };
}

export const institutionalParameters: InstitutionalParameters = {
  teachingHour: yearly([23152, 24310, 25526, 26802, 28142]),
  replacementHour: 23152,
  maintenanceScholarshipMonthly: yearly([577500, 606375, 636694, 668529, 701956]),
  doctorateTuitionTemplate: yearly([4023852, 4182884, 4348182, 4519991, 4745991]),
  tuitionTemplates: {
    DOCTORADO: yearly([4023852, 4182884, 4348182, 4519991, 4745991]),
    MAGISTER_ACADEMICO: yearly([4023852, 4182884, 4348182, 4519991, 4745991]),
    MAGISTER_PROFESIONAL: yearly([4350000, 4567500, 4795875, 5035669, 5287452]),
    OTRO: yearly([0, 0, 0, 0, 0]),
  },
  annualEnrollmentFee: yearly([192150, 201758, 211846, 222439, 233561]),
  annualAdjustmentRate: 0.05,
  planningHorizonYears: 6,
  byProgramType: {
    DOCTORADO: scopedParameters("DOCTORADO"),
    MAGISTER_ACADEMICO: scopedParameters("MAGISTER_ACADEMICO"),
    MAGISTER_PROFESIONAL: scopedParameters("MAGISTER_PROFESIONAL"),
    OTRO: scopedParameters("OTRO"),
  },
};

export const programs: Program[] = [
  { id: "mgp", code: "MGP", name: "Magíster en Gestión de Personas", type: "MAGISTER_PROFESIONAL", faculty: "Facultad de Administración y Economía", director: "Leonardo Gatica", officialDurationSemesters: 4, status: "Activo", versionLabel: "1", costCenter: "01080300-021", annualTuition: yearly([4350000, 4567500, 4795875, 5035669, 5287452]), tuitionSource: "PROPIO" },
  { id: "docmip", code: "DOCMIP", name: "Doctorado en Ciencias de Materiales e Ingeniería de Procesos", type: "DOCTORADO", faculty: "Facultad de Ciencias Naturales, Matemática y del Medio Ambiente", director: "Abdoulaye Thiam", officialDurationSemesters: 8, status: "Activo", versionLabel: "1", costCenter: "01080300-011", annualTuition: { ...institutionalParameters.doctorateTuitionTemplate }, tuitionSource: "PLANTILLA_DOCTORADO" },
  { id: "mq", code: "MQ", name: "Magíster en Química", type: "MAGISTER_ACADEMICO", faculty: "Facultad de Ciencias Naturales, Matemática y del Medio Ambiente", director: "Katherine Paredes", officialDurationSemesters: 4, status: "Activo", versionLabel: "1", annualTuition: yearly([4023852, 4182884, 4348182, 4519991, 4745991]), tuitionSource: "PROPIO" },
  { id: "mees", code: "MEES", name: "Magíster en Eficiencia Energética y Sustentabilidad", type: "MAGISTER_PROFESIONAL", faculty: "Facultad de Ingeniería", director: "Siva Avudaiappan", officialDurationSemesters: 4, status: "Activo", versionLabel: "1", annualTuition: yearly([4150000, 4357500, 4575375, 4804144, 5044351]), tuitionSource: "PROPIO" },
];

function semesters(startYear: number, startSemester: 1 | 2, duration: number, students: number) {
  return getActivePeriods(startYear, startSemester, duration).map((period, index) => ({
    year: period.year,
    semester: period.semester,
    activeStudents: Math.max(0, students - Math.floor(index / 2)),
    graduatingStudents: index === duration - 1 ? Math.max(0, students - Math.floor(index / 2)) : 0,
    directTeachingHours: index < duration - 1 ? 144 : 72,
    replacementTeachingHours: index === 1 ? 18 : 0,
    electiveSubjects: index >= 2 ? 2 : 0,
    electiveSections: index >= 2 ? 2 : 0,
    specializedCourses: 0,
    specializedSections: 0,
    internalTuitionScholarshipStudents: 0,
    internalTuitionScholarshipCoverage: 1,
    maintenanceScholarshipStudents: 0,
    maintenanceScholarshipMonths: 0,
    notes: "",
  }));
}

function baseBudget(id: string, program: Program, startYear: number, startSemester: 1 | 2, students: number, status: CohortBudget["status"]): CohortBudget {
  return {
    id,
    program,
    cohortName: `Cohorte ${startYear} · ${startSemester === 1 ? "Primer" : "Segundo"} semestre`,
    startYear,
    startSemester,
    durationSemesters: program.officialDurationSemesters,
    initialStudents: students,
    status,
    workflowStage: status === "Aprobado" ? "FINALIZADO" : "GESTION",
    facultyOverheadRate: program.type === "MAGISTER_PROFESIONAL" ? 0.10 : 0,
    enrollmentRecognitionRate: 0,
    programVersionLabel: program.versionLabel ?? "1",
    scholarshipsEnabled: program.type !== "MAGISTER_PROFESIONAL",
    authorizedInitialCarryover: 0,
    includeAuthorizedCarryover: true,
    normalizeSharedCosts: true,
    alertPotentialDuplicates: true,
    responsible: "M. Antonio Gutiérrez Varas",
    version: status === "Aprobado" ? 3 : 1,
    annualOverrides: [],
    createdAt: "2026-08-02",
    notes: "Presupuesto de demostración para formulación institucional.",
    semesters: semesters(startYear, startSemester, program.officialDurationSemesters, students),
    discounts: [],
    externalIncome: [],
    manualItems: [],
    reviewHistory: [],
  };
}

export const demoBudget: CohortBudget = {
  ...baseBudget("mgp-2027-1", programs[0], 2027, 1, 15, "Borrador"),
  discounts: [
    { id: "d1", name: "Convenio institucional", percentage: 0.20, students: 10, startYear: 2027, startSemester: 1, endYear: 2028, endSemester: 2, note: "Grupo de convenio" },
  ],
  externalIncome: [
    { id: "e1", type: "Convenio", description: "Aporte asociado a convenio", year: 2028, semester: 1, students: 2, amountPerStudent: 1200000, source: "Convenio institucional" },
  ],
  manualItems: [
    { id: "c1", name: "Apoyo metodológico", description: "Servicio específico para la cohorte", category: "Otros honorarios no académicos", year: 2028, semester: 1, amount: 1200000, costType: "Único de esta versión", periodicity: "Único" },
    { id: "c2", name: "Textos y publicaciones", description: "Material bibliográfico", category: "Libros y publicaciones", year: 2027, amount: 1000000, costType: "Único de esta versión", periodicity: "Anual" },
  ],
};

export const secondDemoBudget: CohortBudget = baseBudget("mgp-2026-2", programs[0], 2026, 2, 12, "Aprobado");
export const academicDemoBudget: CohortBudget = baseBudget("mq-2027-1", programs[2], 2027, 1, 8, "En revisión");
export const doctorateDemoBudget: CohortBudget = baseBudget("docmip-2026-1", programs[1], 2026, 1, 6, "Aprobado");

export const demoBudgets: CohortBudget[] = [demoBudget, secondDemoBudget, academicDemoBudget, doctorateDemoBudget];
