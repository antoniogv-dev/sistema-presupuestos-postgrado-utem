import { describe, expect, it } from "vitest";
import { fullProgramDiscountRange, synchronizeInitialStudents, synchronizeLastSemesterGraduation } from "../../lib/budgets/form-defaults";
import type { SemesterParameters } from "../../lib/calculations/types";

function semester(year: number, term: 1 | 2, active = 3, graduating = 0): SemesterParameters {
  return {
    year, semester: term, activeStudents: active, graduatingStudents: graduating,
    directTeachingHours: 0, synchronousTeachingHours: 0, asynchronousTeachingHours: 0, replacementTeachingHours: 0,
    electiveSubjects: 0, electiveSections: 0, specializedCourses: 0, specializedSections: 0,
    internalTuitionScholarshipStudents: 0, internalTuitionScholarshipCoverage: 1,
    maintenanceScholarshipStudents: 0, maintenanceScholarshipMonths: 0,
  };
}

describe("v10.27 defaults de formulación", () => {
  it("replica estudiantes activos y lleva la misma cantidad a graduación del último semestre", () => {
    const resolved = synchronizeInitialStudents([
      semester(2027, 1, 3, 0), semester(2027, 2, 3, 1), semester(2028, 1, 3, 0), semester(2028, 2, 3, 0),
    ], 15);
    expect(resolved.map((item) => item.activeStudents)).toEqual([15, 15, 15, 15]);
    expect(resolved.map((item) => item.graduatingStudents)).toEqual([0, 1, 0, 15]);
  });

  it("al regenerar periodos preserva activos manuales y sincroniza sólo graduación final", () => {
    const resolved = synchronizeLastSemesterGraduation([
      semester(2027, 1, 15, 0), semester(2027, 2, 14, 0), semester(2028, 1, 12, 0), semester(2028, 2, 10, 0),
    ], 15);
    expect(resolved.map((item) => item.activeStudents)).toEqual([15, 14, 12, 10]);
    expect(resolved.map((item) => item.graduatingStudents)).toEqual([0, 0, 0, 15]);
  });

  it("crea descuentos con término por defecto en el último semestre del programa", () => {
    expect(fullProgramDiscountRange(2027, 1, 4)).toEqual({ startYear: 2027, startSemester: 1, endYear: 2028, endSemester: 2 });
    expect(fullProgramDiscountRange(2027, 2, 4)).toEqual({ startYear: 2027, startSemester: 2, endYear: 2029, endSemester: 1 });
  });
});
