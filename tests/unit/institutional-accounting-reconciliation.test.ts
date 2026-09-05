import { describe, expect, it } from "vitest";
import { calculateBudget } from "../../lib/calculations/budget-engine";
import { demoBudget, institutionalParameters } from "../../lib/demo-data";
import { institutionalAccountingProjection } from "../../lib/export/institutional-budget-final-reconciliation";

const clone = <T,>(value: T): T => structuredClone(value);

describe("conciliación contable del XLSX institucional", () => {
  it("clasifica un docente extranjero u otro honorario académico dentro de COSTOS ACADÉMICOS", () => {
    const base = clone(demoBudget);
    base.manualItems = [];
    const withTeacher = clone(base);
    withTeacher.manualItems = [{
      id: "docente-extranjero",
      name: "Docente extranjero",
      description: "Honorario académico adicional",
      category: "Honorarios académicos",
      year: 2027,
      amount: 700_000,
      costType: "Único de esta versión",
      periodicity: "Único",
    }];

    const before = calculateBudget(base, institutionalParameters).annualFlows.find((flow) => flow.year === 2027)!;
    const after = calculateBudget(withTeacher, institutionalParameters).annualFlows.find((flow) => flow.year === 2027)!;

    expect(after.academicHonoraria).toBeCloseTo(before.academicHonoraria + 700_000, 6);
    expect(after.otherCosts).toBeCloseTo(before.otherCosts, 6);
    expect(after.totalExpenses).toBeCloseTo(before.totalExpenses + 700_000, 6);
  });

  it("agrupa Dirección, Asistencia y otros honorarios dentro de HONORARIOS NO ACADÉMICOS", () => {
    const budget = clone(demoBudget);
    budget.manualItems = [
      { id: "dir", name: "Apoyo dirección", description: "", category: "Dirección", year: 2027, amount: 120_000, costType: "Único de esta versión", periodicity: "Único" },
      { id: "asis", name: "Apoyo asistencia", description: "", category: "Asistencia de dirección", year: 2027, amount: 80_000, costType: "Único de esta versión", periodicity: "Único" },
      { id: "otro", name: "Apoyo técnico adicional", description: "", category: "Otros honorarios no académicos", year: 2027, amount: 60_000, costType: "Único de esta versión", periodicity: "Único" },
    ];
    const flow = calculateBudget(budget, institutionalParameters).annualFlows.find((item) => item.year === 2027)!;
    const projection = institutionalAccountingProjection(budget, flow);

    expect(flow.nonAcademicHonoraria).toBeCloseTo(flow.direction + flow.assistance + flow.otherNonAcademicHonoraria, 6);
    expect(projection.nonAcademicSubtotal).toBeCloseTo(flow.nonAcademicHonoraria, 6);
    expect(projection.manualOtherNonAcademicHonoraria).toBe(60_000);
  });

  it("hace que la suma de todos los subtotales visibles sea exactamente TOTAL COSTOS", () => {
    const budget = clone(demoBudget);
    budget.manualItems = [
      { id: "acad", name: "Docente invitado", description: "", category: "Honorarios académicos", year: 2027, amount: 250_000, costType: "Único de esta versión", periodicity: "Único" },
      { id: "equipo", name: "Equipamiento", description: "", category: "Equipamiento", year: 2027, amount: 300_000, costType: "Único de esta versión", periodicity: "Único" },
      { id: "libro", name: "Bibliografía", description: "", category: "Libros y publicaciones", year: 2027, amount: 90_000, costType: "Único de esta versión", periodicity: "Único" },
      { id: "dif", name: "Difusión", description: "", category: "Difusión", year: 2027, amount: 70_000, costType: "Único de esta versión", periodicity: "Único" },
      { id: "pas", name: "Pasantía", description: "", category: "Pasantías", year: 2027, amount: 110_000, costType: "Único de esta versión", periodicity: "Único" },
      { id: "beca", name: "Ayuda estudiante", description: "", category: "Becas y ayudas", year: 2027, amount: 50_000, costType: "Único de esta versión", periodicity: "Único" },
      { id: "ops", name: "Gasto menor", description: "", category: "Gastos operacionales", year: 2027, amount: 45_000, costType: "Único de esta versión", periodicity: "Único" },
      { id: "food", name: "Coffee break", description: "", category: "Alimentos y bebidas", year: 2027, amount: 35_000, costType: "Único de esta versión", periodicity: "Único" },
    ];
    const flow = calculateBudget(budget, institutionalParameters).annualFlows.find((item) => item.year === 2027)!;
    const projection = institutionalAccountingProjection(budget, flow);

    expect(projection.academicSubtotal).toBeCloseTo(flow.academicHonoraria, 6);
    expect(projection.nonAcademicSubtotal).toBeCloseTo(flow.nonAcademicHonoraria, 6);
    expect(projection.totalExpenses).toBeCloseTo(flow.totalExpenses, 6);
  });

  it("reconcilia todos los años de una cohorte multianual", () => {
    const budget = clone(demoBudget);
    const result = calculateBudget(budget, institutionalParameters);
    for (const flow of result.annualFlows) {
      const projection = institutionalAccountingProjection(budget, flow);
      expect(projection.academicSubtotal).toBeCloseTo(flow.academicHonoraria, 6);
      expect(projection.nonAcademicSubtotal).toBeCloseTo(flow.nonAcademicHonoraria, 6);
      expect(projection.totalExpenses).toBeCloseTo(flow.totalExpenses, 6);
    }
  });
});
