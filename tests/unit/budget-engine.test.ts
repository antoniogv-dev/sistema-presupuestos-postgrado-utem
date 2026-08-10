import { describe, expect, it } from "vitest";
import { calculateBudget, overheadApplies } from "@/lib/calculations/budget-engine";
import { buildConsolidationGroups, consolidateBudgets, detectPotentialDuplicateCosts } from "@/lib/calculations/consolidation";
import { demoBudget, institutionalParameters, secondDemoBudget } from "@/lib/demo-data";
import { applyWorkflowAction, canDeleteBudget, canEditBudget } from "@/lib/workflow/budget-workflow";
import { applyBudgetTemplate } from "@/lib/templates/apply-template";
import { defaultBudgetTemplates } from "@/lib/templates/default-templates";

const clone = <T,>(value: T): T => structuredClone(value);

describe("motor financiero", () => {
  it("calcula grupos con descuento sin alterar estudiantes sin descuento", () => {
    const budget = clone(demoBudget);
    budget.initialStudents = 15;
    budget.semesters.forEach((semester) => { semester.activeStudents = 15; });
    budget.discounts = [{ id: "d", name: "Convenio", percentage: 0.2, students: 10, startYear: 2027, startSemester: 1, endYear: 2028, endSemester: 2 }];
    const result = calculateBudget(budget, institutionalParameters);
    const expected2027 = 10 * (demoBudget.program.annualTuition?.[2027] ?? 0) * 0.2;
    expect(result.annualFlows[0].discounts).toBe(expected2027);
  });

  it("aplica incobrabilidad después de descuentos y no a matrícula", () => {
    const result = calculateBudget(demoBudget, institutionalParameters);
    const first = result.annualFlows[0];
    const rate = institutionalParameters.byProgramType.MAGISTER_PROFESIONAL.badDebtRate;
    expect(first.badDebt).toBeCloseTo(first.tuitionAfterBenefits * rate, 2);
    expect(first.recognizedEnrollmentFee).toBeGreaterThan(0);
  });

  it("aplica overhead sólo a programas profesionales", () => {
    const professional = calculateBudget(demoBudget, institutionalParameters).annualFlows[0];
    expect(professional.centralOverhead).toBeGreaterThan(0);
    const academic = clone(demoBudget);
    academic.program.type = "MAGISTER_ACADEMICO";
    academic.facultyOverheadRate = 0.10;
    const academicFlow = calculateBudget(academic, institutionalParameters).annualFlows[0];
    expect(overheadApplies(academic.program.type)).toBe(false);
    expect(academicFlow.centralOverhead).toBe(0);
    expect(academicFlow.facultyOverhead).toBe(0);
  });

  it("calcula matrículas equivalentes y aproxima hacia arriba", () => {
    const first = calculateBudget(demoBudget, institutionalParameters).annualFlows[0];
    expect(first.equivalentEnrollments).toBeGreaterThan(0);
    expect(first.roundedEquivalentStudents).toBe(Math.ceil(first.equivalentEnrollments));
  });

  it("muestra 11,2 matrículas equivalentes como aproximadamente 12 estudiantes", () => {
    const budget = clone(demoBudget);
    budget.discounts = [{ id: "eq", name: "Ajuste equivalencia", percentage: 0.38, students: 10, startYear: 2027, startSemester: 1, endYear: 2027, endSemester: 2 }];
    const flow = calculateBudget(budget, institutionalParameters).annualFlows[0];
    expect(flow.equivalentEnrollments).toBeCloseTo(11.2, 8);
    expect(flow.roundedEquivalentStudents).toBe(12);
  });

  it("multiplica el valor guía de tesis por estudiantes en graduación", () => {
    const budget = clone(demoBudget);
    budget.semesters.forEach((semester) => { semester.graduatingStudents = 0; });
    budget.semesters.at(-1)!.graduatingStudents = 7;
    const last = calculateBudget(budget, institutionalParameters).annualFlows.at(-1)!;
    const unit = institutionalParameters.byProgramType.MAGISTER_PROFESIONAL.thesisGuidancePerGraduatingStudent[last.year];
    expect(last.thesisGuidanceCost).toBe(7 * unit);
  });

  it("reconoce ingreso externo sólo en el año configurado", () => {
    const result = calculateBudget(demoBudget, institutionalParameters);
    expect(result.annualFlows.find((flow) => flow.year === 2027)?.externalIncome).toBe(0);
    expect(result.annualFlows.find((flow) => flow.year === 2028)?.externalIncome).toBe(2400000);
  });

  it("convierte el acumulado anterior en arrastre siguiente", () => {
    const result = calculateBudget(demoBudget, institutionalParameters);
    expect(result.annualFlows[1].startingCarryover).toBe(result.annualFlows[0].accumulatedFlow);
  });

  it("no duplica costos compartidos en consolidación", () => {
    const rows = consolidateBudgets([demoBudget, secondDemoBudget], institutionalParameters);
    expect(rows.some((row) => row.duplicateAvoided > 0)).toBe(true);
  });

  it("construye consolidados académicos, profesionales y por programa", () => {
    const groups = buildConsolidationGroups([demoBudget, secondDemoBudget], institutionalParameters);
    expect(groups.some((group) => group.id === "academic")).toBe(true);
    expect(groups.some((group) => group.id === "professional")).toBe(true);
    expect(groups.some((group) => group.kind === "PROGRAM")).toBe(true);
  });

  it("calcula el rendimiento operacional con el flujo neto anual", () => {
    const flow = calculateBudget(demoBudget, institutionalParameters).annualFlows[0];
    expect(flow.operatingMargin).toBeCloseTo(flow.netFlow / flow.totalIncome, 8);
  });

  it("usa el arancel propio antes que la plantilla doctoral", () => {
    const budget = clone(demoBudget);
    budget.program.annualTuition = { 2027: 5000000, 2028: 5250000 };
    const result = calculateBudget(budget, institutionalParameters);
    expect(result.annualFlows[0].grossTuition).toBe(15 * 5000000);
  });

  it("usa la plantilla de arancel correspondiente al tipo de programa cuando no existe arancel propio", () => {
    for (const type of ["DOCTORADO", "MAGISTER_ACADEMICO", "MAGISTER_PROFESIONAL"] as const) {
      const budget = clone(demoBudget);
      budget.program.type = type;
      budget.program.annualTuition = {};
      const result = calculateBudget(budget, institutionalParameters);
      const expected = institutionalParameters.tuitionTemplates[type][result.annualFlows[0].year];
      expect(result.annualFlows[0].annualTuition).toBe(expected);
    }
  });
  it("aplica las becas de las plantillas académicas y sólo descuento en la profesional", () => {
    for (const type of ["DOCTORADO", "MAGISTER_ACADEMICO"] as const) {
      const source = clone(demoBudget); source.program.type = type;
      const template = defaultBudgetTemplates.find((item) => item.programType === type)!;
      const applied = applyBudgetTemplate(source, template);
      expect(applied.semesters.every((semester) => semester.internalTuitionScholarshipStudents === semester.activeStudents)).toBe(true);
      expect(applied.semesters.every((semester) => semester.maintenanceScholarshipStudents === semester.activeStudents)).toBe(true);
    }
    const professional = applyBudgetTemplate(clone(demoBudget), defaultBudgetTemplates.find((item) => item.programType === "MAGISTER_PROFESIONAL")!);
    expect(professional.discounts.some((discount) => discount.originTemplateItemKey)).toBe(true);
    expect(professional.semesters.every((semester) => semester.internalTuitionScholarshipStudents === 0)).toBe(true);
  });

  it("conserva ajustes manuales al reaplicar una plantilla", () => {
    const source = clone(demoBudget);
    const template = defaultBudgetTemplates.find((item) => item.programType === "MAGISTER_PROFESIONAL")!;
    const twice = applyBudgetTemplate(applyBudgetTemplate(source, template), template);
    expect(twice.discounts.filter((discount) => !discount.originTemplateItemKey)).toHaveLength(source.discounts.length);
    expect(twice.discounts.filter((discount) => discount.originTemplateItemKey)).toHaveLength(1);
  });

  it("permite incluir o excluir el arrastre autorizado", () => {
    const source = clone(demoBudget); source.authorizedInitialCarryover = 5000000;
    expect(calculateBudget(source, institutionalParameters).annualFlows[0].startingCarryover).toBe(5000000);
    source.includeAuthorizedCarryover = false;
    expect(calculateBudget(source, institutionalParameters).annualFlows[0].startingCarryover).toBe(0);
  });

  it("alerta duplicidades y respeta la normalización por presupuesto", () => {
    const a = clone(demoBudget); const b = clone(secondDemoBudget);
    a.manualItems.push({ id: "dup-a", name: "Licencia institucional", description: "", category: "Software", year: 2027, amount: 1000000, costType: "Compartido con otras cohortes", periodicity: "Anual" });
    b.manualItems.push({ id: "dup-b", name: "Licencia institucional", description: "", category: "Software", year: 2027, amount: 1000000, costType: "Compartido con otras cohortes", periodicity: "Anual" });
    expect(detectPotentialDuplicateCosts([a,b])).toHaveLength(1);
    expect(consolidateBudgets([a,b], institutionalParameters).some((row) => row.duplicateAvoided > 0)).toBe(true);
    a.normalizeSharedCosts = false; b.normalizeSharedCosts = false;
    expect(consolidateBudgets([a,b], institutionalParameters).every((row) => row.duplicateAvoided === 0)).toBe(true);
  });

});

describe("circuito de revisión", () => {
  it("permite al administrador operar el flujo sin convertir a lector o creador en gestores", () => {
    const source = clone(demoBudget);
    expect(canEditBudget(source, "ADMIN")).toBe(true);
    expect(canEditBudget(source, "LECTOR")).toBe(false);
    expect(canEditBudget(source, "CREADOR")).toBe(false);
    const submitted = applyWorkflowAction(source, "ADMIN", "SUBMIT_VB", "Administrador");
    expect(submitted.workflowStage).toBe("VISTO_BUENO");
    expect(submitted.reviewHistory[0].role).toBe("GESTOR");
  });

  it("cumple la secuencia Gestor, V°B° y Aprobación", () => {
    let budget = clone(demoBudget);
    expect(canEditBudget(budget, "GESTOR")).toBe(true);
    budget = applyWorkflowAction(budget, "GESTOR", "SUBMIT_VB", "Gestor");
    expect(budget.workflowStage).toBe("VISTO_BUENO");
    budget = applyWorkflowAction(budget, "VISTO_BUENO", "VB_APPROVE", "Revisor");
    expect(budget.workflowStage).toBe("APROBACION");
    budget = applyWorkflowAction(budget, "APROBADOR", "FINAL_APPROVE", "Director");
    expect(budget.status).toBe("Aprobado");
    expect(canDeleteBudget(budget, "APROBADOR")).toBe(true);
    expect(budget.reviewHistory).toHaveLength(3);
  });
});
