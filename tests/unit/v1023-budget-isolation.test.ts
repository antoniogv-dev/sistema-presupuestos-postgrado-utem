import { describe, expect, it } from "vitest";
import { auditBudgetIntegrity, canonicalCohortName, templateAppliesToProgram } from "@/lib/validation/budget-integrity";
import type { BudgetTemplate, CohortBudget, Program } from "@/lib/calculations/types";
import { demoBudget, programs } from "@/lib/demo-data";

const clone = <T,>(value: T): T => structuredClone(value);

function programByCode(code: string): Program {
  const program = programs.find((item) => item.code === code);
  if (!program) throw new Error(`Programa ${code} no existe en demo-data.`);
  return program;
}

describe("v10.23 aislamiento programa-presupuesto", () => {
  it("detecta una cohorte cuyo código pertenece a otro programa", () => {
    const budget = clone(demoBudget) as CohortBudget;
    const other = programs.find((item) => item.id !== budget.program.id)!;
    budget.cohortName = `${other.code} 2027-1S`;
    const issues = auditBudgetIntegrity(budget, programs, []);
    const mismatch = issues.find((issue) => issue.code === "COHORT_PROGRAM_PREFIX_MISMATCH");
    expect(mismatch?.severity).toBe("error");
    expect(mismatch?.suggestedCohortName).toBe(canonicalCohortName(budget.program, budget.startYear, budget.startSemester));
  });

  it("permite cohorte automática coherente con el programa activo", () => {
    const budget = clone(demoBudget) as CohortBudget;
    budget.cohortName = canonicalCohortName(budget.program, budget.startYear, budget.startSemester);
    const issues = auditBudgetIntegrity(budget, programs, []);
    expect(issues.some((issue) => issue.code === "COHORT_PROGRAM_PREFIX_MISMATCH")).toBe(false);
  });

  it("una plantilla específica sólo puede aplicarse a su propio programa", () => {
    const budget = clone(demoBudget) as CohortBudget;
    const other = programs.find((item) => item.type === budget.program.type && item.id !== budget.program.id) ?? programs.find((item) => item.id !== budget.program.id)!;
    const template: BudgetTemplate = {
      id: "specific-template",
      code: "SPECIFIC",
      name: "Plantilla específica",
      description: "",
      version: 1,
      active: true,
      programType: budget.program.type,
      programId: other.id,
      items: [],
    };
    expect(templateAppliesToProgram(template, budget.program)).toBe(false);
  });

  it("la identidad canónica conserva código y nombre completo del programa", () => {
    const program = programByCode(demoBudget.program.code);
    expect(program.id).toBe(demoBudget.program.id);
    expect(program.name.trim().length).toBeGreaterThan(5);
  });
});
