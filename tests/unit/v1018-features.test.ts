import { describe, expect, it } from "vitest";
import { calculateBudget, defaultAnnualOverrideForYear } from "@/lib/calculations/budget-engine";
import type { BudgetTemplate } from "@/lib/calculations/types";
import { demoBudget, institutionalParameters, programs } from "@/lib/demo-data";
import { buildFinancialNarrative } from "@/lib/export/financial-narrative";
import { applyBudgetTemplate } from "@/lib/templates/apply-template";

const clone = <T,>(value: T): T => structuredClone(value);

describe("v10.18 plantillas, modalidades y economía de escala", () => {
  it("separa docencia sincrónica y asincrónica con valores hora distintos", () => {
    const budget = clone(demoBudget);
    budget.deliveryModality = "SEMIPRESENCIAL";
    budget.semesters.forEach((semester) => {
      semester.directTeachingHours = 0;
      semester.synchronousTeachingHours = 10;
      semester.asynchronousTeachingHours = 20;
      semester.replacementTeachingHours = 0;
    });
    budget.annualOverrides = [2027, 2028].map((year) => ({
      ...defaultAnnualOverrideForYear(budget, institutionalParameters, year),
      synchronousTeachingHourValue: 30_000,
      asynchronousTeachingHourValue: 15_000,
    }));
    const first = calculateBudget(budget, institutionalParameters).annualFlows[0];
    expect(first.synchronousTeachingCost).toBe(20 * 30_000);
    expect(first.asynchronousTeachingCost).toBe(40 * 15_000);
    expect(first.directTeachingCost).toBe(first.synchronousTeachingCost + first.asynchronousTeachingCost);
  });

  it("sólo aplica ahorro de asignatura compartida cuando participan al menos dos programas", () => {
    const budget = clone(demoBudget);
    budget.deliveryModality = "PRESENCIAL";
    budget.semesters.filter((semester) => semester.year === 2027).forEach((semester) => { semester.directTeachingHours = 100; });
    budget.annualOverrides = [{
      ...defaultAnnualOverrideForYear(budget, institutionalParameters, 2027),
      directTeachingHourValue: 20_000,
    }];
    budget.sharedCourses = [{
      id: "shared-1", courseName: "Gestión compartida", year: 2027, semester: 1,
      teachingMode: "PRESENCIAL", hours: 40, participantProgramIds: [programs[0].id], allocationRate: 0.5,
    }];
    const withoutScale = calculateBudget(budget, institutionalParameters).annualFlows[0];
    expect(withoutScale.sharedCourseSavings).toBe(0);

    budget.sharedCourses[0].participantProgramIds = [programs[0].id, programs[3].id];
    const withScale = calculateBudget(budget, institutionalParameters).annualFlows[0];
    expect(withScale.sharedCourseSavings).toBe(40 * 20_000 * 0.5);
    expect(withScale.directTeachingCost).toBe(withoutScale.directTeachingCost - withScale.sharedCourseSavings);
  });

  it("aplica parámetros anuales y modalidad desde una plantilla editable", () => {
    const template: BudgetTemplate = {
      id: "template-test", code: "TEST_SEMI", name: "Semipresencial prueba", programType: "MAGISTER_PROFESIONAL",
      description: "", version: 3, active: true,
      settings: { modality: "SEMIPRESENCIAL" },
      items: [
        { id: "i1", key: "arancel", kind: "PARAMETRO_ANUAL", name: "Arancel", active: true, position: 0,
          config: { parameter: "ARANCEL", values: { 2027: 5_000_000, 2028: 5_250_000 }, annualAdjustmentRate: 0.05 } },
        { id: "i2", key: "sync", kind: "PARAMETRO_ANUAL", name: "Sincrónica", active: true, position: 1,
          config: { parameter: "DOCENCIA_SINCRONICA", values: { 2027: 30_000, 2028: 31_500 }, annualAdjustmentRate: 0.05 } },
        { id: "i3", key: "async", kind: "PARAMETRO_ANUAL", name: "Asincrónica", active: true, position: 2,
          config: { parameter: "DOCENCIA_ASINCRONICA", values: { 2027: 15_000, 2028: 15_750 }, annualAdjustmentRate: 0.05 } },
      ],
    };
    const applied = applyBudgetTemplate(clone(demoBudget), template, institutionalParameters);
    expect(applied.deliveryModality).toBe("SEMIPRESENCIAL");
    expect(applied.annualOverrides.find((item) => item.year === 2027)?.annualTuition).toBe(5_000_000);
    expect(applied.annualOverrides.find((item) => item.year === 2028)?.synchronousTeachingHourValue).toBe(31_500);
    expect(applied.annualOverrides.find((item) => item.year === 2028)?.asynchronousTeachingHourValue).toBe(15_750);
  });
});

describe("v10.18 relato financiero", () => {
  it("genera un análisis trazable sin lenguaje administrativo de aprobación", () => {
    const budget = clone(demoBudget);
    const result = calculateBudget(budget, institutionalParameters);
    const narrative = buildFinancialNarrative(budget, result, institutionalParameters);
    const text = [narrative.title, ...narrative.sections.flatMap((section) => [section.heading, ...section.paragraphs])].join(" ");
    expect(text).toContain("Análisis financiero y principales consideraciones");
    expect(text.toLowerCase()).toContain("arancel bruto");
    expect(text).toContain("incobrabilidad");
    expect(text).toContain("no se suma a los ingresos totales");
    expect(text).toContain("Conclusión financiera");
    expect(text.toLowerCase()).not.toContain("esta vicerrectoría aprueba");
    expect(text.toLowerCase()).not.toContain("se rechaza");
  });
});
