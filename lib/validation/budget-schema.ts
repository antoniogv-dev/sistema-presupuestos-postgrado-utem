import { z } from "zod";

const percentage = z.number().min(0).max(1);
const nonNegativeInteger = z.number().int().min(0);

export const semesterParametersSchema = z.object({
  year: z.number().int().min(2000).max(2100),
  semester: z.union([z.literal(1), z.literal(2)]),
  activeStudents: nonNegativeInteger,
  graduatingStudents: nonNegativeInteger,
  directTeachingHours: z.number().min(0),
  replacementTeachingHours: z.number().min(0),
  electiveSubjects: nonNegativeInteger,
  electiveSections: nonNegativeInteger,
  specializedCourses: nonNegativeInteger,
  specializedSections: nonNegativeInteger,
  internalTuitionScholarshipStudents: nonNegativeInteger,
  internalTuitionScholarshipCoverage: percentage,
  maintenanceScholarshipStudents: nonNegativeInteger,
  maintenanceScholarshipMonths: z.number().int().min(0).max(12),
  notes: z.string().optional(),
});

export const cohortDiscountSchema = z.object({
  id: z.string(),
  name: z.string().min(1),
  percentage,
  students: nonNegativeInteger,
  startYear: z.number().int(),
  startSemester: z.union([z.literal(1), z.literal(2)]),
  endYear: z.number().int(),
  endSemester: z.union([z.literal(1), z.literal(2)]),
  note: z.string().optional(),
  originTemplateItemKey: z.string().optional(),
});

export const externalIncomeSchema = z.object({
  id: z.string(),
  type: z.string(),
  description: z.string().min(1),
  year: z.number().int(),
  semester: z.union([z.literal(1), z.literal(2)]),
  students: nonNegativeInteger,
  amountPerStudent: nonNegativeInteger,
  source: z.string(),
  note: z.string().optional(),
  originTemplateItemKey: z.string().optional(),
});

export const budgetItemSchema = z.object({
  id: z.string(),
  name: z.string().min(1),
  description: z.string(),
  category: z.string(),
  year: z.number().int(),
  semester: z.union([z.literal(1), z.literal(2)]).optional(),
  amount: nonNegativeInteger,
  costType: z.enum(["Único de esta versión", "Compartido con otras cohortes"]),
  periodicity: z.enum(["Único", "Semestral", "Anual"]),
  note: z.string().optional(),
  originTemplateItemKey: z.string().optional(),
});

export const budgetAnnualOverrideSchema = z.object({
  year: z.number().int().min(2000).max(2100),
  directTeachingHourValue: z.number().min(0),
  annualEnrollmentFee: nonNegativeInteger,
  annualTuition: z.number().int().positive(),
  thesisGuidancePerGraduatingStudent: nonNegativeInteger,
  annualDirection: nonNegativeInteger,
  directionProrated: z.boolean(),
  directionAllocationRate: percentage,
  annualAssistance: nonNegativeInteger,
  assistanceProrated: z.boolean(),
  assistanceAllocationRate: percentage,
  centralOverheadRate: percentage,
  facultyOverheadRate: percentage,
});

export const cohortBudgetSchema = z.object({
  cohortName: z.string().trim().min(3, "Ingrese una identificación de cohorte."),
  startYear: z.number().int().min(2000).max(2100),
  startSemester: z.union([z.literal(1), z.literal(2)]),
  durationSemesters: z.number().int().min(2).max(8),
  initialStudents: nonNegativeInteger,
  facultyOverheadRate: percentage,
  enrollmentRecognitionRate: percentage,
  programVersionLabel: z.string().trim().min(1).max(80),
  scholarshipsEnabled: z.boolean(),
  authorizedInitialCarryover: z.number().int(),
  includeAuthorizedCarryover: z.boolean(),
  normalizeSharedCosts: z.boolean(),
  alertPotentialDuplicates: z.boolean(),
  annualOverrides: z.array(budgetAnnualOverrideSchema).max(20),
  semesters: z.array(semesterParametersSchema).min(2).max(8),
  discounts: z.array(cohortDiscountSchema),
  externalIncome: z.array(externalIncomeSchema),
  manualItems: z.array(budgetItemSchema),
}).superRefine((budget, context) => {
  for (const [index, semester] of budget.semesters.entries()) {
    if (semester.graduatingStudents > semester.activeStudents) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ["semesters", index, "graduatingStudents"], message: "Los estudiantes en graduación superan los estudiantes activos." });
    }
    const discountStudents = budget.discounts
      .filter((discount) => semester.year * 2 + semester.semester >= discount.startYear * 2 + discount.startSemester && semester.year * 2 + semester.semester <= discount.endYear * 2 + discount.endSemester)
      .reduce((acc, discount) => acc + discount.students, 0);
    const scholarshipStudents = budget.scholarshipsEnabled ? semester.internalTuitionScholarshipStudents : 0;
    if (discountStudents + scholarshipStudents > semester.activeStudents) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ["semesters", index, "internalTuitionScholarshipStudents"], message: "Descuentos y becas de arancel superan los estudiantes activos." });
    }
  }
});

export type CohortBudgetFormData = z.infer<typeof cohortBudgetSchema>;
