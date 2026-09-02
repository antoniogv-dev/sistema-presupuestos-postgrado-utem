import type { SemesterNumber } from "../calculations/types";

export interface CohortSemesterSnapshot {
  year: number;
  semester: SemesterNumber;
  activeStudents: number;
  graduatingStudents: number;
  internalTuitionScholarshipStudents: number;
}

export interface CohortDiscountSnapshot {
  target?: "TUITION" | "ENROLLMENT";
  students: number;
  startYear: number;
  startSemester: SemesterNumber;
  endYear: number;
  endSemester: SemesterNumber;
}

export interface SharedCourseSnapshot {
  year: number;
  semester: SemesterNumber;
  participantProgramIds: string[];
}

export interface CohortConsistencyInput {
  programId: string;
  startYear: number;
  startSemester: SemesterNumber;
  durationSemesters: number;
  scholarshipsEnabled: boolean;
  semesters: CohortSemesterSnapshot[];
  discounts: CohortDiscountSnapshot[];
  sharedCourses: SharedCourseSnapshot[];
}

export interface CohortConsistencyIssue {
  code:
    | "SEMESTER_OUTSIDE_HORIZON"
    | "GRADUATION_EXCEEDS_ACTIVE"
    | "TUITION_COVERAGE_EXCEEDS_ACTIVE"
    | "ENROLLMENT_DISCOUNT_EXCEEDS_ACTIVE"
    | "DISCOUNT_RANGE_INVALID"
    | "SHARED_COURSE_OUTSIDE_HORIZON"
    | "SHARED_COURSE_PARTICIPANTS_INVALID"
    | "SHARED_COURSE_PROGRAM_MISSING";
  message: string;
}

const ordinal = (year: number, semester: SemesterNumber) => year * 2 + semester;

export function activePeriodKeys(startYear: number, startSemester: SemesterNumber, durationSemesters: number): Set<string> {
  const result = new Set<string>();
  let year = startYear;
  let semester: SemesterNumber = startSemester;
  for (let index = 0; index < durationSemesters; index += 1) {
    result.add(`${year}-${semester}`);
    if (semester === 1) semester = 2;
    else { semester = 1; year += 1; }
  }
  return result;
}

function applies(discount: CohortDiscountSnapshot, year: number, semester: SemesterNumber): boolean {
  const value = ordinal(year, semester);
  return value >= ordinal(discount.startYear, discount.startSemester) && value <= ordinal(discount.endYear, discount.endSemester);
}

export function cohortConsistencyIssues(input: CohortConsistencyInput): CohortConsistencyIssue[] {
  const issues: CohortConsistencyIssue[] = [];
  const activePeriods = activePeriodKeys(input.startYear, input.startSemester, input.durationSemesters);

  for (const discount of input.discounts) {
    if (ordinal(discount.startYear, discount.startSemester) > ordinal(discount.endYear, discount.endSemester)) {
      issues.push({ code: "DISCOUNT_RANGE_INVALID", message: "El periodo de inicio de un descuento no puede ser posterior a su periodo de término." });
    }
  }

  for (const semester of input.semesters) {
    const key = `${semester.year}-${semester.semester}`;
    if (!activePeriods.has(key)) {
      issues.push({ code: "SEMESTER_OUTSIDE_HORIZON", message: `${key}: el semestre no pertenece al horizonte activo de la cohorte.` });
      continue;
    }
    if (semester.graduatingStudents > semester.activeStudents) {
      issues.push({ code: "GRADUATION_EXCEEDS_ACTIVE", message: `${key}: los estudiantes en graduación superan los estudiantes activos.` });
    }
    const tuitionDiscountStudents = input.discounts
      .filter((discount) => discount.target !== "ENROLLMENT" && applies(discount, semester.year, semester.semester))
      .reduce((total, discount) => total + Math.max(0, discount.students), 0);
    const enrollmentDiscountStudents = input.discounts
      .filter((discount) => discount.target === "ENROLLMENT" && applies(discount, semester.year, semester.semester))
      .reduce((total, discount) => total + Math.max(0, discount.students), 0);
    const scholarshipStudents = input.scholarshipsEnabled ? Math.max(0, semester.internalTuitionScholarshipStudents) : 0;
    if (tuitionDiscountStudents + scholarshipStudents > semester.activeStudents) {
      issues.push({ code: "TUITION_COVERAGE_EXCEEDS_ACTIVE", message: `${key}: descuentos de arancel y becas internas superan los estudiantes activos.` });
    }
    if (enrollmentDiscountStudents > semester.activeStudents) {
      issues.push({ code: "ENROLLMENT_DISCOUNT_EXCEEDS_ACTIVE", message: `${key}: los descuentos de matrícula superan los estudiantes activos.` });
    }
  }

  for (const rule of input.sharedCourses) {
    const key = `${rule.year}-${rule.semester}`;
    if (!activePeriods.has(key)) {
      issues.push({ code: "SHARED_COURSE_OUTSIDE_HORIZON", message: `${key}: una asignatura compartida está fuera del horizonte activo de la cohorte.` });
    }
    const participants = new Set(rule.participantProgramIds.filter(Boolean));
    if (participants.size < 2) {
      issues.push({ code: "SHARED_COURSE_PARTICIPANTS_INVALID", message: "Una asignatura compartida debe involucrar al menos dos programas distintos." });
    }
    if (!participants.has(input.programId)) {
      issues.push({ code: "SHARED_COURSE_PROGRAM_MISSING", message: "La cohorte actual debe formar parte de los programas participantes de toda asignatura compartida." });
    }
  }
  return issues;
}

export function assertCohortConsistency(input: CohortConsistencyInput): void {
  const issues = cohortConsistencyIssues(input);
  if (issues.length) throw new Error(`COHORT_CONFIGURATION_INVALID: ${issues.map((issue) => issue.message).join(" ")}`);
}
