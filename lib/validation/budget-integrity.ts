import { getActivePeriods, getActiveYears } from "../calculations/periods";
import type { BudgetTemplate, CohortBudget, Program } from "../calculations/types";

export type BudgetIntegritySeverity = "error" | "warning";
export type BudgetIntegrityCode =
  | "PROGRAM_NOT_CANONICAL"
  | "COHORT_PROGRAM_PREFIX_MISMATCH"
  | "TEMPLATE_PROGRAM_MISMATCH"
  | "SEMESTER_RANGE_MISMATCH"
  | "ANNUAL_RANGE_MISMATCH"
  | "PROFESSIONAL_SCHOLARSHIP_MISMATCH"
  | "ACADEMIC_OVERHEAD_MISMATCH";

export interface BudgetIntegrityIssue {
  code: BudgetIntegrityCode;
  severity: BudgetIntegritySeverity;
  message: string;
  suggestedCohortName?: string;
}

function normalizedCode(value: string): string {
  return value.trim().toUpperCase().replace(/[^A-ZÁÉÍÓÚÜÑ0-9]/g, "");
}

export function cohortProgramPrefix(cohortName: string, programs: Program[]): Program | undefined {
  const firstToken = cohortName.trim().split(/[\s·|/]+/)[0] ?? "";
  const code = normalizedCode(firstToken);
  return programs.find((program) => normalizedCode(program.code) === code);
}

export function canonicalCohortName(program: Program, startYear: number, startSemester: 1 | 2): string {
  return `${program.code} ${startYear}-${startSemester}S`;
}

export function templateAppliesToProgram(template: BudgetTemplate, program: Program): boolean {
  return template.programType === program.type && (!template.programId || template.programId === program.id);
}

export function auditBudgetIntegrity(
  budget: CohortBudget,
  programs: Program[],
  templates: BudgetTemplate[],
): BudgetIntegrityIssue[] {
  const issues: BudgetIntegrityIssue[] = [];
  const canonicalProgram = programs.find((program) => program.id === budget.program.id);
  if (!canonicalProgram || canonicalProgram.code !== budget.program.code || canonicalProgram.name !== budget.program.name || canonicalProgram.type !== budget.program.type) {
    issues.push({
      code: "PROGRAM_NOT_CANONICAL",
      severity: "error",
      message: "La identidad del programa cargada en el presupuesto no coincide con el catálogo institucional. Recargue el presupuesto desde D1 antes de editarlo.",
    });
  }

  const prefixProgram = cohortProgramPrefix(budget.cohortName, programs);
  if (prefixProgram && prefixProgram.id !== budget.program.id) {
    issues.push({
      code: "COHORT_PROGRAM_PREFIX_MISMATCH",
      severity: "error",
      message: `La cohorte “${budget.cohortName}” comienza con ${prefixProgram.code}, pero el presupuesto está vinculado a ${budget.program.code} · ${budget.program.name}. No guarde hasta corregir la identificación.`,
      suggestedCohortName: canonicalCohortName(budget.program, budget.startYear, budget.startSemester),
    });
  }

  if (budget.appliedTemplateId) {
    const template = templates.find((item) => item.id === budget.appliedTemplateId);
    if (template && !templateAppliesToProgram(template, budget.program)) {
      issues.push({
        code: "TEMPLATE_PROGRAM_MISMATCH",
        severity: "error",
        message: `La plantilla aplicada “${template.name}” no corresponde al programa ${budget.program.code}.`,
      });
    }
  }

  const expectedPeriods = getActivePeriods(budget.startYear, budget.startSemester, budget.durationSemesters)
    .map((period) => `${period.year}-${period.semester}`);
  const actualPeriods = budget.semesters.map((period) => `${period.year}-${period.semester}`);
  if (expectedPeriods.join("|") !== actualPeriods.join("|")) {
    issues.push({
      code: "SEMESTER_RANGE_MISMATCH",
      severity: "error",
      message: "Los semestres almacenados no coinciden con el año, semestre de inicio y duración de este presupuesto.",
    });
  }

  const expectedYears = getActiveYears(getActivePeriods(budget.startYear, budget.startSemester, budget.durationSemesters));
  const actualYears = [...budget.annualOverrides.map((item) => item.year)].sort((a, b) => a - b);
  if (expectedYears.join("|") !== actualYears.join("|")) {
    issues.push({
      code: "ANNUAL_RANGE_MISMATCH",
      severity: "warning",
      message: "Los valores anuales no cubren exactamente los años activos del presupuesto. La recarga/hidratación debe normalizarlos antes de guardar.",
    });
  }

  if (budget.program.type === "MAGISTER_PROFESIONAL" && !budget.scholarshipsEnabled) {
    const hiddenScholarshipData = budget.semesters.some((semester) =>
      semester.internalTuitionScholarshipStudents > 0 || semester.maintenanceScholarshipStudents > 0 || semester.maintenanceScholarshipMonths > 0,
    );
    if (hiddenScholarshipData) {
      issues.push({
        code: "PROFESSIONAL_SCHOLARSHIP_MISMATCH",
        severity: "error",
        message: "Las becas están deshabilitadas, pero existen cantidades de becarios o meses de manutención ocultos en los semestres. Habilite las becas o deje esos valores en cero antes de guardar.",
      });
    }
  }

  if ((budget.program.type === "DOCTORADO" || budget.program.type === "MAGISTER_ACADEMICO") && budget.facultyOverheadRate > 0) {
    issues.push({
      code: "ACADEMIC_OVERHEAD_MISMATCH",
      severity: "warning",
      message: "El programa académico/doctoral conserva overhead de facultad, aunque la regla vigente lo excluye del cálculo.",
    });
  }

  return issues;
}
