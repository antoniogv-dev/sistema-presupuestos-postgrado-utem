import { describe, expect, it } from "vitest";
import { calculateBudget, defaultAnnualOverrideForYear, hydrateAnnualOverrides, overheadApplies, professionalEnrollmentFeeForYear, resolvedAnnualOverrideForYear } from "@/lib/calculations/budget-engine";
import { calculateBreakEvenEquivalentEnrollments } from "@/lib/calculations/break-even";
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

  it("cobra arancel anual con estudiantes completos aunque el segundo año tenga un solo semestre", () => {
    const budget = clone(demoBudget);
    budget.durationSemesters = 3;
    budget.initialStudents = 11;
    budget.program.annualTuition = { 2027: 3_937_500, 2028: 3_937_500 };
    budget.semesters = budget.semesters.slice(0, 3).map((semester) => ({
      ...semester,
      activeStudents: 11,
      graduatingStudents: semester.year === 2028 ? 11 : 0,
    }));
    budget.annualOverrides = [
      { ...defaultAnnualOverrideForYear(budget, institutionalParameters, 2027), annualTuition: 3_937_500 },
      { ...defaultAnnualOverrideForYear(budget, institutionalParameters, 2028), annualTuition: 3_937_500 },
    ];
    budget.discounts = [
      { id: "d20", name: "Descuento 20%", percentage: 0.20, students: 5, startYear: 2027, startSemester: 1, endYear: 2028, endSemester: 1 },
      { id: "d30", name: "Descuento 30%", percentage: 0.30, students: 5, startYear: 2027, startSemester: 1, endYear: 2028, endSemester: 1 },
    ];

    const result = calculateBudget(budget, institutionalParameters);
    const first = result.annualFlows.find((flow) => flow.year === 2027)!;
    const second = result.annualFlows.find((flow) => flow.year === 2028)!;
    const expectedGross = 11 * 3_937_500;
    const expectedDiscounts = 5 * 3_937_500 * 0.20 + 5 * 3_937_500 * 0.30;
    const expectedEquivalent = 1 + 5 * 0.80 + 5 * 0.70;

    expect(first.grossTuition).toBe(expectedGross);
    expect(second.grossTuition).toBe(expectedGross);
    expect(first.discounts).toBe(expectedDiscounts);
    expect(second.discounts).toBe(expectedDiscounts);
    expect(first.equivalentEnrollments).toBeCloseTo(expectedEquivalent, 8);
    expect(second.equivalentEnrollments).toBeCloseTo(expectedEquivalent, 8);
    expect(second.tuitionFactor).toBe(1);
  });

  it("aplica incobrabilidad después de descuentos y no a matrícula", () => {
    const result = calculateBudget(demoBudget, institutionalParameters);
    const first = result.annualFlows[0];
    const rate = institutionalParameters.byProgramType.MAGISTER_PROFESIONAL.badDebtRate;
    expect(first.badDebt).toBeCloseTo(first.tuitionAfterBenefits * rate, 2);
    expect(first.grossEnrollmentFee).toBeGreaterThan(0);
    expect(first.recognizedEnrollmentFee).toBe(0);
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

  it("cobra matrícula una vez por cada dos semestres, no aplica descuentos y no la suma a ingresos total", () => {
    const budget = clone(demoBudget);
    budget.enrollmentRecognitionRate = 1;
    budget.semesters.forEach((semester) => { semester.activeStudents = 10; });
    budget.discounts = [{ id: "mat", name: "Convenio", percentage: 0.2, students: 5, startYear: 2027, startSemester: 1, endYear: 2028, endSemester: 2 }];
    const result = calculateBudget(budget, institutionalParameters);
    const first = result.annualFlows[0];
    const enrollment = professionalEnrollmentFeeForYear(institutionalParameters, first.year);
    expect(first.grossEnrollmentFee).toBe(10 * enrollment);
    expect(first.enrollmentDiscounts).toBe(0);
    expect(first.netEnrollmentFee).toBe(first.grossEnrollmentFee);
    expect(first.recognizedEnrollmentFee).toBe(first.grossEnrollmentFee);
    expect(first.totalIncome).toBe(first.netTuitionIncome + first.externalIncome + first.otherIncome);
  });

  it("calcula correctamente la matrícula anual profesional en cada bloque de dos semestres", () => {
    const budget = clone(demoBudget);
    budget.program.type = "MAGISTER_PROFESIONAL";
    budget.semesters.forEach((semester, index) => { semester.activeStudents = index < 2 ? 20 : 18; });
    const flows = calculateBudget(budget, institutionalParameters).annualFlows;
    const first = flows.find((flow) => flow.year === 2027)!;
    const second = flows.find((flow) => flow.year === 2028)!;
    expect(first.grossEnrollmentFee).toBe(20 * professionalEnrollmentFeeForYear(institutionalParameters, 2027));
    expect(second.grossEnrollmentFee).toBe(18 * professionalEnrollmentFeeForYear(institutionalParameters, 2028));
    expect(first.enrollmentDiscounts).toBe(0);
    expect(second.enrollmentDiscounts).toBe(0);
  });

  it("recupera la matrícula anual profesional cuando un override histórico quedó en cero", () => {
    const budget = clone(demoBudget);
    budget.program.type = "MAGISTER_PROFESIONAL";
    budget.annualOverrides = [
      { ...defaultAnnualOverrideForYear(budget, institutionalParameters, 2027), annualEnrollmentFee: 0 },
      { ...defaultAnnualOverrideForYear(budget, institutionalParameters, 2028), annualEnrollmentFee: 0 },
    ];
    const hydrated = hydrateAnnualOverrides(budget, institutionalParameters);
    expect(hydrated.annualOverrides.find((annual) => annual.year === 2027)?.annualEnrollmentFee).toBe(192150);
    expect(hydrated.annualOverrides.find((annual) => annual.year === 2028)?.annualEnrollmentFee).toBe(201758);
    const flows = calculateBudget(hydrated, institutionalParameters).annualFlows;
    expect(flows.find((flow) => flow.year === 2027)?.grossEnrollmentFee).toBeGreaterThan(0);
    expect(flows.find((flow) => flow.year === 2028)?.grossEnrollmentFee).toBeGreaterThan(0);
  });

  it("cobra dos matrículas en un programa profesional de cuatro semestres que inicia en 2S", () => {
    const budget = clone(demoBudget);
    budget.startYear = 2027; budget.startSemester = 2; budget.durationSemesters = 4;
    budget.semesters = [
      { ...budget.semesters[0], year: 2027, semester: 2, activeStudents: 12 },
      { ...budget.semesters[1], year: 2028, semester: 1, activeStudents: 12 },
      { ...budget.semesters[2], year: 2028, semester: 2, activeStudents: 11 },
      { ...budget.semesters[3], year: 2029, semester: 1, activeStudents: 11 },
    ];
    budget.annualOverrides = [];
    const flows = calculateBudget(budget, institutionalParameters).annualFlows;
    expect(flows.find((flow) => flow.year === 2027)?.grossEnrollmentFee).toBe(12 * professionalEnrollmentFeeForYear(institutionalParameters, 2027));
    expect(flows.find((flow) => flow.year === 2028)?.grossEnrollmentFee).toBe(11 * professionalEnrollmentFeeForYear(institutionalParameters, 2028));
    expect(flows.find((flow) => flow.year === 2029)?.grossEnrollmentFee).toBe(0);
  });

  it("inicia matrícula profesional 2027 en $192.150 y reajusta 2028 a $201.758", () => {
    expect(professionalEnrollmentFeeForYear(institutionalParameters, 2027)).toBe(192150);
    expect(professionalEnrollmentFeeForYear(institutionalParameters, 2028)).toBe(201758);
  });

  it("deja la beca de manutención mensual profesional en cero y usa una sola tarifa sincrónica", () => {
    const budget = clone(demoBudget);
    budget.program.type = "MAGISTER_PROFESIONAL";
    budget.annualOverrides = [{
      ...defaultAnnualOverrideForYear(budget, institutionalParameters, 2027),
      directTeachingHourValue: 40000,
      synchronousTeachingHourValue: 30000,
      asynchronousTeachingHourValue: 50000,
      maintenanceScholarshipMonthlyValue: 577500,
    }];
    const resolved = resolvedAnnualOverrideForYear(budget, institutionalParameters, 2027);
    expect(resolved.maintenanceScholarshipMonthlyValue).toBe(0);
    expect(resolved.synchronousTeachingHourValue).toBe(30000);
    expect(resolved.directTeachingHourValue).toBe(30000);
    expect(resolved.asynchronousTeachingHourValue).toBe(30000);
  });

  it("elimina los costos operacionales, software y difusión sembrados por defecto", () => {
    const annual = defaultAnnualOverrideForYear(demoBudget, institutionalParameters, 2027);
    expect(annual.annualOperational).toBe(0);
    expect(annual.annualSoftware).toBe(0);
    expect(annual.annualDiffusion).toBe(0);
  });

  it("calcula un punto de equilibrio profesional con saldo final no negativo", () => {
    const budget = clone(demoBudget);
    const breakEven = calculateBreakEvenEquivalentEnrollments(budget, institutionalParameters);
    expect(breakEven.reached).toBe(true);
    expect(breakEven.minimumEquivalentEnrollments).not.toBeNull();
    expect(breakEven.projectedFinalFlowAtMinimum).not.toBeNull();
    expect(breakEven.projectedFinalFlowAtMinimum!).toBeGreaterThanOrEqual(0);
  });

  it("permite sobrescribir por año hora directa y guía de tesis", () => {
    const budget = clone(demoBudget);
    budget.annualOverrides = [{
      ...defaultAnnualOverrideForYear(budget, institutionalParameters, 2027),
      directTeachingHourValue: 30000, synchronousTeachingHourValue: 30000, asynchronousTeachingHourValue: 30000,
      annualEnrollmentFee: 200000, annualTuition: 5000000, thesisGuidancePerGraduatingStudent: 500000,
      annualDirection: 4000000, directionProrated: false, directionAllocationRate: 1, annualAssistance: 2000000,
      assistanceProrated: false, assistanceAllocationRate: 1, centralOverheadRate: 0.2, facultyOverheadRate: 0.1,
    }];
    budget.semesters.filter((s) => s.year === 2027).forEach((s) => { s.directTeachingHours = 10; s.graduatingStudents = 2; });
    const flow = calculateBudget(budget, institutionalParameters).annualFlows[0];
    expect(flow.directTeachingCost).toBe(20 * 30000);
    expect(flow.thesisGuidanceCost).toBe(2 * 500000);
  });

  it("mantiene arancel anual configurable en cada año activo del presupuesto", () => {
    const budget = clone(demoBudget);
    budget.annualOverrides = [
      { ...defaultAnnualOverrideForYear(budget, institutionalParameters, 2027), annualTuition: 5000000 },
      { ...defaultAnnualOverrideForYear(budget, institutionalParameters, 2028), annualTuition: 5500000 },
    ];
    const flows = calculateBudget(budget, institutionalParameters).annualFlows;
    expect(flows.find((flow) => flow.year === 2027)?.annualTuition).toBe(5000000);
    expect(flows.find((flow) => flow.year === 2028)?.annualTuition).toBe(5500000);
  });

  it("recupera el arancel de un año activo cuando un registro histórico quedó en cero", () => {
    const budget = clone(demoBudget);
    budget.program.annualTuition = { 2027: 3250000, 2028: 3412500 };
    budget.annualOverrides = [
      { ...defaultAnnualOverrideForYear(budget, institutionalParameters, 2027), annualTuition: 3250000 },
      { ...defaultAnnualOverrideForYear(budget, institutionalParameters, 2028), annualTuition: 0 },
    ];
    const flows = calculateBudget(budget, institutionalParameters).annualFlows;
    expect(flows.find((flow) => flow.year === 2027)?.grossTuition).toBeGreaterThan(0);
    expect(flows.find((flow) => flow.year === 2028)?.annualTuition).toBe(3412500);
    expect(flows.find((flow) => flow.year === 2028)?.grossTuition).toBeGreaterThan(0);
    expect(flows.find((flow) => flow.year === 2028)?.totalIncome).toBeGreaterThan(0);
  });

  it("incorpora alimentos y bebidas como costo y gasto del flujo", () => {
    const budget = clone(demoBudget);
    budget.manualItems = [{ id: "food", name: "Coffee break", description: "Actividad", category: "Alimentos y bebidas", year: 2027, amount: 350000, costType: "Único de esta versión", periodicity: "Único" }];
    const flow = calculateBudget(budget, institutionalParameters).annualFlows.find((item) => item.year === 2027)!;
    expect(flow.foodBeverages).toBe(350000);
    expect(flow.totalExpenses).toBeGreaterThanOrEqual(350000);
  });

  it("repite un costo anual en todos los años activos desde su año de inicio", () => {
    const budget = clone(demoBudget);
    budget.manualItems = [{ id: "annual", name: "Soporte anual", description: "", category: "Otros honorarios no académicos", year: 2027, amount: 1000000, costType: "Único de esta versión", periodicity: "Anual" }];
    const flows = calculateBudget(budget, institutionalParameters).annualFlows;
    expect(flows.map((flow) => flow.otherNonAcademicHonoraria)).toEqual(flows.map(() => 1000000));
    expect(flows.every((flow) => flow.nonAcademicHonoraria === flow.direction + flow.assistance + flow.otherNonAcademicHonoraria)).toBe(true);
  });

  it("calcula subtotales de honorarios académicos, no académicos y otros gastos", () => {
    const budget = clone(demoBudget);
    const flow = calculateBudget(budget, institutionalParameters).annualFlows[0];
    expect(flow.academicHonoraria).toBe(flow.directTeachingCost + flow.replacementTeachingCost + flow.thesisGuidanceCost);
    expect(flow.nonAcademicHonoraria).toBe(flow.direction + flow.assistance + flow.otherNonAcademicHonoraria);
    expect(flow.otherExpenses).toBe(
      flow.operational + flow.software + flow.diffusion + flow.congressesInternships
      + flow.booksPublications + flow.travelFreight + flow.perDiem + flow.foodBeverages + flow.otherCosts,
    );
  });

  it("separa equipamiento y becas/ayudas de otros gastos y los suma al total sólo cuando existen", () => {
    const budget = clone(demoBudget);
    budget.scholarshipsEnabled = false;
    budget.manualItems = [
      { id: "eq", name: "Pantalla interactiva", description: "Bien de capital", category: "Equipamiento", year: 2027, amount: 2000000, costType: "Único de esta versión", periodicity: "Único" },
      { id: "aid", name: "Ayuda de movilidad", description: "Apoyo a estudiante", category: "Becas y ayudas", year: 2027, amount: 300000, costType: "Único de esta versión", periodicity: "Único" },
    ];
    const flow = calculateBudget(budget, institutionalParameters).annualFlows[0];
    expect(flow.equipment).toBe(2000000);
    expect(flow.scholarshipsAndAid).toBe(300000);
    expect(flow.otherExpenses).not.toBeGreaterThanOrEqual(flow.otherExpenses + flow.equipment);
    expect(flow.totalExpenses).toBeCloseTo(
      flow.academicHonoraria + flow.nonAcademicHonoraria + flow.otherExpenses + flow.equipment
      + flow.scholarshipsAndAid + flow.centralOverhead + flow.facultyOverhead,
      2,
    );
  });

  it("calcula overhead anual sobre arancel bruto menos descuentos menos incobrables", () => {
    const budget = clone(demoBudget);
    budget.annualOverrides = [{
      ...defaultAnnualOverrideForYear(budget, institutionalParameters, 2027),
      directTeachingHourValue: 1, annualEnrollmentFee: 1, annualTuition: 5000000, thesisGuidancePerGraduatingStudent: 0,
      annualDirection: 0, directionProrated: false, directionAllocationRate: 1, annualAssistance: 0, assistanceProrated: false,
      assistanceAllocationRate: 1, centralOverheadRate: 0.25, facultyOverheadRate: 0.05,
    }];
    const flow = calculateBudget(budget, institutionalParameters).annualFlows[0];
    expect(flow.overheadBase).toBeCloseTo(Math.max(0, flow.grossTuition - flow.discounts - flow.badDebt), 2);
    expect(flow.centralOverhead).toBeCloseTo(flow.overheadBase * 0.25, 2);
    expect(flow.facultyOverhead).toBeCloseTo(flow.overheadBase * 0.05, 2);
  });

  it("prorratea dirección y asistencia al 50 por ciento cuando se configura", () => {
    const budget = clone(demoBudget);
    budget.annualOverrides = [{
      ...defaultAnnualOverrideForYear(budget, institutionalParameters, 2027),
      directTeachingHourValue: 1, annualEnrollmentFee: 1, annualTuition: 5000000, thesisGuidancePerGraduatingStudent: 0,
      annualDirection: 4152675, directionProrated: true, directionAllocationRate: 0.5, annualAssistance: 2000000,
      assistanceProrated: true, assistanceAllocationRate: 0.5, centralOverheadRate: 0, facultyOverheadRate: 0,
    }];
    const flow = calculateBudget(budget, institutionalParameters).annualFlows[0];
    expect(flow.direction).toBeCloseTo(4152675 * 0.5, 2);
    expect(flow.assistance).toBe(1000000);
  });

  it("trata honorarios no académicos como subtotal de dirección, asistencia y otros honorarios", () => {
    const budget = clone(demoBudget);
    budget.annualOverrides = [{
      ...defaultAnnualOverrideForYear(budget, institutionalParameters, 2027),
      annualDirection: 4000000,
      directionProrated: true,
      directionAllocationRate: 0.5,
      annualAssistance: 2000000,
      assistanceProrated: true,
      assistanceAllocationRate: 0.5,
      annualOtherNonAcademicHonoraria: 1000000,
      otherNonAcademicProrated: true,
      otherNonAcademicAllocationRate: 0.5,
    }];
    const flow = calculateBudget(budget, institutionalParameters).annualFlows[0];
    expect(flow.direction).toBe(2000000);
    expect(flow.assistance).toBe(1000000);
    expect(flow.otherNonAcademicHonoraria).toBe(500000);
    expect(flow.nonAcademicHonoraria).toBe(3500000);
  });

  it("incorpora los costos registrados dentro del subtotal editable de su categoría", () => {
    const budget = clone(demoBudget);
    budget.annualOverrides = [{
      ...defaultAnnualOverrideForYear(budget, institutionalParameters, 2027),
      annualOperational: 1000000,
      annualFoodBeverages: 200000,
    }];
    budget.manualItems = [
      { id: "ops", name: "Giro para rendir", description: "", category: "Gastos operacionales / Bienes y servicios", year: 2027, amount: 250000, costType: "Único de esta versión", periodicity: "Único" },
      { id: "food", name: "Coffee break", description: "", category: "Alimentos y bebidas", year: 2027, amount: 300000, costType: "Único de esta versión", periodicity: "Único" },
    ];
    const flow = calculateBudget(budget, institutionalParameters).annualFlows[0];
    expect(flow.operational).toBe(1250000);
    expect(flow.foodBeverages).toBe(500000);
  });

  it("mantiene becas deshabilitadas en profesional hasta habilitación explícita", () => {
    const budget = clone(demoBudget);
    budget.scholarshipsEnabled = false;
    budget.semesters.forEach((semester) => { semester.internalTuitionScholarshipStudents = 5; semester.maintenanceScholarshipStudents = 5; semester.maintenanceScholarshipMonths = 6; });
    const flows = calculateBudget(budget, institutionalParameters).annualFlows;
    expect(flows.every((flow) => flow.internalTuitionScholarships === 0 && flow.maintenanceScholarships === 0)).toBe(true);
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
