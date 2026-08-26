import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const source = readFileSync(path.join(here, '..', 'src', 'engine.js'), 'utf8');
vm.runInThisContext(`${source}\nglobalThis.__utemEngine={parameters,programCatalogSeed,budgetTemplateSeed,activePeriods,createBudget,seedBudgets,calculateBudget,consolidateBudgets,consolidationGroups,applyTemplateToBudget,detectPotentialDuplicateCosts,applyWorkflow,canEdit,canDelete,clone};`);
const e = globalThis.__utemEngine;

function budget(type = 'MAGISTER_PROFESIONAL') {
  const program = e.programCatalogSeed.find((item) => item.type === type);
  return e.createBudget(`test-${type}`, program, 2027, 2, 15);
}

test('periodos activos no incluyen años previos', () => {
  assert.deepEqual(e.activePeriods(2028, 2, 4).map((p) => `${p.year}-${p.semester}`), ['2028-2','2029-1','2029-2','2030-1']);
});

test('arancel semestral y matrícula equivalente', () => {
  const b = budget();
  b.discounts = [{ id:'d', name:'Convenio', percentage:.2, students:10, startYear:2027, startSemester:2, endYear:2029, endSemester:1 }];
  const first = e.calculateBudget(b).annualFlows[0];
  assert.equal(first.tuitionFactor, .5);
  assert.ok(first.equivalentEnrollments > 0);
  assert.equal(first.roundedEquivalentStudents, Math.ceil(first.equivalentEnrollments));
});

test('guía de tesis multiplica valor por estudiantes en graduación', () => {
  const b = budget(); const last = b.semesters.at(-1); last.graduatingStudents = 7;
  const flow = e.calculateBudget(b).annualFlows.find((item) => item.year === last.year);
  assert.equal(flow.thesisGuidanceCost, 7 * e.parameters.byType.MAGISTER_PROFESIONAL.thesisGuidance[last.year]);
});

test('programas académicos no aplican overhead', () => {
  for (const type of ['DOCTORADO','MAGISTER_ACADEMICO']) {
    const flow = e.calculateBudget(budget(type)).annualFlows[0];
    assert.equal(flow.centralOverhead, 0); assert.equal(flow.facultyOverhead, 0);
  }
});

test('plantilla doctoral incorpora las dos becas', () => {
  const b = budget('DOCTORADO');
  const template = e.budgetTemplateSeed.find((item) => item.code === 'DOCTORADO');
  const applied = e.applyTemplateToBudget(b, template);
  assert.ok(applied.semesters.every((semester) => semester.scholarshipStudents === semester.activeStudents));
  assert.ok(applied.semesters.every((semester) => semester.maintenanceStudents === semester.activeStudents));
});

test('plantilla magíster académico incorpora las dos becas', () => {
  const b = budget('MAGISTER_ACADEMICO');
  const template = e.budgetTemplateSeed.find((item) => item.code === 'MAGISTER_ACADEMICO');
  const applied = e.applyTemplateToBudget(b, template);
  assert.ok(applied.semesters.every((semester) => semester.scholarshipStudents === semester.activeStudents));
  assert.ok(applied.semesters.every((semester) => semester.maintenanceStudents === semester.activeStudents));
});

test('plantilla profesional sólo incorpora descuento', () => {
  const b = budget('MAGISTER_PROFESIONAL');
  const template = e.budgetTemplateSeed.find((item) => item.code === 'MAGISTER_PROFESIONAL');
  const applied = e.applyTemplateToBudget(b, template);
  assert.equal(applied.discounts.length, 1);
  assert.ok(applied.semesters.every((semester) => semester.scholarshipStudents === 0 && semester.maintenanceStudents === 0));
});

test('reaplicar plantilla preserva ajustes manuales', () => {
  const b = budget('MAGISTER_PROFESIONAL');
  b.discounts.push({ id:'manual', name:'Manual', percentage:.1, students:2, startYear:2027,startSemester:2,endYear:2029,endSemester:1 });
  const template = e.budgetTemplateSeed.find((item) => item.code === 'MAGISTER_PROFESIONAL');
  const applied = e.applyTemplateToBudget(e.applyTemplateToBudget(b, template), template);
  assert.equal(applied.discounts.filter((item) => item.id === 'manual').length, 1);
  assert.equal(applied.discounts.filter((item) => item.originTemplateItemKey).length, 1);
});

test('arrastre autorizado puede incluirse o excluirse', () => {
  const b = budget(); b.carryover = 5000000;
  assert.equal(e.calculateBudget(b).annualFlows[0].startingCarryover, 5000000);
  b.includeAuthorizedCarryover = false;
  assert.equal(e.calculateBudget(b).annualFlows[0].startingCarryover, 0);
});

test('alerta costos duplicados entre cohortes del mismo programa', () => {
  const budgets = e.seedBudgets(e.programCatalogSeed);
  const alerts = e.detectPotentialDuplicateCosts(budgets);
  assert.ok(alerts.some((alert) => alert.name === 'Licencia institucional' && alert.budgetIds.length === 2));
});

test('normalización evita duplicidad de costos compartidos', () => {
  const budgets = e.seedBudgets(e.programCatalogSeed).filter((item) => item.program.id === 'mgp');
  assert.ok(e.consolidateBudgets(budgets).some((row) => row.duplicateAvoided > 0));
  budgets.forEach((item) => { item.normalizeSharedCosts = false; });
  assert.ok(e.consolidateBudgets(budgets).every((row) => row.duplicateAvoided === 0));
});

test('flujo de revisión respeta tres roles', () => {
  const b = budget();
  assert.equal(e.canEdit(b, 'GESTOR'), true);
  e.applyWorkflow(b, 'GESTOR', 'SUBMIT_VB');
  e.applyWorkflow(b, 'VISTO_BUENO', 'VB_APPROVE');
  e.applyWorkflow(b, 'APROBADOR', 'FINAL_APPROVE');
  assert.equal(b.status, 'Aprobado'); assert.equal(b.workflowStage, 'FINALIZADO');
});


test('financiamiento institucional se incorpora una vez y no depende de estudiantes', () => {
  const b = budget();
  b.externalIncome = [{ id:'fi', type:'Financiamiento institucional', description:'Aporte interno', year:2027, semester:2, students:99, amountPerStudent:12500000, source:'UTEM' }];
  const flow = e.calculateBudget(b).annualFlows[0];
  assert.equal(flow.institutionalFinancing, 12500000);
  assert.equal(flow.externalIncome, 0);
  assert.equal(flow.totalIncome, flow.netTuitionIncome + flow.enrollment + 12500000);
});
