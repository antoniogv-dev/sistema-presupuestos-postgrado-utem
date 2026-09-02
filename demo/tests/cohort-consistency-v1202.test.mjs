import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const { cohortConsistencyIssues, activePeriodKeys } = await import(pathToFileURL(path.join(root, ".engine-build/lib/validation/cohort-consistency.js")).href);

const base = () => ({
  programId: "program-a",
  startYear: 2027,
  startSemester: 1,
  durationSemesters: 3,
  scholarshipsEnabled: false,
  semesters: [
    { year: 2027, semester: 1, activeStudents: 10, graduatingStudents: 0, internalTuitionScholarshipStudents: 0 },
    { year: 2027, semester: 2, activeStudents: 10, graduatingStudents: 0, internalTuitionScholarshipStudents: 0 },
    { year: 2028, semester: 1, activeStudents: 10, graduatingStudents: 10, internalTuitionScholarshipStudents: 0 },
  ],
  discounts: [],
  sharedCourses: [],
});

test("v12.0.2: el horizonte activo de 3 semestres no admite 2028-2S", () => {
  assert.deepEqual([...activePeriodKeys(2027, 1, 3)], ["2027-1", "2027-2", "2028-1"]);
});

test("v12.0.2: bloquea descuentos de matrícula sobre más estudiantes que los activos", () => {
  const value = base();
  value.discounts = [{ target: "ENROLLMENT", students: 11, startYear: 2027, startSemester: 1, endYear: 2028, endSemester: 1 }];
  assert.ok(cohortConsistencyIssues(value).some((issue) => issue.code === "ENROLLMENT_DISCOUNT_EXCEEDS_ACTIVE"));
});

test("v12.0.2: bloquea rangos de descuento invertidos", () => {
  const value = base();
  value.discounts = [{ target: "TUITION", students: 3, startYear: 2028, startSemester: 1, endYear: 2027, endSemester: 2 }];
  assert.ok(cohortConsistencyIssues(value).some((issue) => issue.code === "DISCOUNT_RANGE_INVALID"));
});

test("v12.0.2: una economía de escala exige dos programas e incluye la cohorte actual", () => {
  const value = base();
  value.sharedCourses = [{ year: 2027, semester: 1, participantProgramIds: ["program-b"] }];
  const codes = cohortConsistencyIssues(value).map((issue) => issue.code);
  assert.ok(codes.includes("SHARED_COURSE_PARTICIPANTS_INVALID"));
  assert.ok(codes.includes("SHARED_COURSE_PROGRAM_MISSING"));
});

test("v12.0.2: bloquea una asignatura compartida fuera del horizonte académico", () => {
  const value = base();
  value.sharedCourses = [{ year: 2028, semester: 2, participantProgramIds: ["program-a", "program-b"] }];
  assert.ok(cohortConsistencyIssues(value).some((issue) => issue.code === "SHARED_COURSE_OUTSIDE_HORIZON"));
});
