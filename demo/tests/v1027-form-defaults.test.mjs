import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "../..");
const { fullProgramDiscountRange, synchronizeInitialStudents, synchronizeLastSemesterGraduation } = await import(path.join(root, ".engine-build/lib/budgets/form-defaults.js"));

function semester(year, term, active = 3, graduating = 0) {
  return { year, semester: term, activeStudents: active, graduatingStudents: graduating, directTeachingHours: 0, synchronousTeachingHours: 0, asynchronousTeachingHours: 0, replacementTeachingHours: 0, electiveSubjects: 0, electiveSections: 0, specializedCourses: 0, specializedSections: 0, internalTuitionScholarshipStudents: 0, internalTuitionScholarshipCoverage: 1, maintenanceScholarshipStudents: 0, maintenanceScholarshipMonths: 0 };
}

test("v10.27 estudiantes iniciales completan graduación del último semestre", () => {
  const result = synchronizeInitialStudents([semester(2027,1), semester(2027,2), semester(2028,1), semester(2028,2)], 15);
  assert.deepEqual(result.map((item) => item.activeStudents), [15,15,15,15]);
  assert.deepEqual(result.map((item) => item.graduatingStudents), [0,0,0,15]);
});

test("v10.27 regeneración preserva activos manuales y actualiza graduación final", () => {
  const result = synchronizeLastSemesterGraduation([semester(2027,1,15), semester(2027,2,14), semester(2028,1,12), semester(2028,2,10)], 15);
  assert.deepEqual(result.map((item) => item.activeStudents), [15,14,12,10]);
  assert.deepEqual(result.map((item) => item.graduatingStudents), [0,0,0,15]);
});

test("v10.27 descuento nuevo termina en el último semestre", () => {
  assert.deepEqual(fullProgramDiscountRange(2027,1,4), { startYear: 2027, startSemester: 1, endYear: 2028, endSemester: 2 });
  assert.deepEqual(fullProgramDiscountRange(2027,2,4), { startYear: 2027, startSemester: 2, endYear: 2029, endSemester: 1 });
});
