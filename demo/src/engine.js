'use strict';

const YEARS = [2026, 2027, 2028, 2029, 2030, 2031];
const yearly = (values) => Object.fromEntries(YEARS.map((year, index) => [year, values[index] ?? values.at(-1) ?? 0]));
const academicType = (type) => type === 'DOCTORADO' || type === 'MAGISTER_ACADEMICO';
const clone = (value) => structuredClone(value);
const sum = (values) => values.reduce((a, b) => a + b, 0);
const safe = (value) => Math.max(0, Number.isFinite(Number(value)) ? Number(value) : 0);
const uid = (prefix) => `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const formatCLP = (value) => {
  const rounded = Math.round(Number(value) || 0);
  if (rounded === 0) return '-';
  const text = `$ ${Math.abs(rounded).toLocaleString('es-CL')}`;
  return rounded < 0 ? `(${text})` : text;
};
const formatPercent = (value) => `${((Number(value) || 0) * 100).toLocaleString('es-CL', { maximumFractionDigits: 1 })}%`;
const valueForYear = (values, year) => {
  if (values?.[year] !== undefined) return Number(values[year]) || 0;
  const keys = Object.keys(values || {}).map(Number).sort((a, b) => a - b);
  const previous = keys.filter((candidate) => candidate <= year).at(-1);
  return previous !== undefined ? Number(values[previous]) || 0 : Number(values?.[keys[0]]) || 0;
};

function scoped(type) {
  const academic = academicType(type);
  const doctoral = type === 'DOCTORADO';
  return {
    annualDirection: yearly([3954929, 4152675, 4360309, 4578324, 4807240, 5047602]),
    annualAssistance: yearly([2000000, 2100000, 2205000, 2315250, 2431013, 2552563]),
    referenceOperational: yearly([1800000, 1890000, 1984500, 2083725, 2187911, 2297307]),
    softwareLicenses: yearly([750000, 787500, 826875, 868219, 911630, 957212]),
    diffusionAdmission: yearly([1000000, 1050000, 1102500, 1157625, 1215506, 1276281]),
    congressesInternships: doctoral ? yearly([22500000, 22500000, 22500000, 22500000, 22500000, 22500000]) : yearly([0, 0, 0, 0, 0, 0]),
    thesisGuidance: yearly([250000, 262500, 275625, 289406, 303876, 319070]),
    centralOverheadRate: academic ? 0 : 0.20,
    facultyOverheadRate: academic ? 0 : 0.10,
    badDebtRate: 0.15,
  };
}

const parameters = {
  teachingHour: yearly([23152, 24310, 25526, 26802, 28142, 29549]),
  replacementHour: 23152,
  maintenanceMonthly: yearly([577500, 606375, 636694, 668529, 701956, 737054]),
  doctorateTuitionTemplate: yearly([4023852, 4182884, 4348182, 4519991, 4745991, 4983291]),
  enrollmentFee: yearly([192150, 201758, 211846, 222439, 233561, 245239]),
  adjustmentRate: 0.05,
  planningHorizon: 6,
  byType: {
    DOCTORADO: scoped('DOCTORADO'),
    MAGISTER_ACADEMICO: scoped('MAGISTER_ACADEMICO'),
    MAGISTER_PROFESIONAL: scoped('MAGISTER_PROFESIONAL'),
    OTRO: scoped('OTRO'),
  },
};

const programCatalogSeed = [
  { id: 'mgp', code: 'MGP', name: 'Magíster en Gestión de Personas', type: 'MAGISTER_PROFESIONAL', faculty: 'Facultad de Administración y Economía', director: 'Leonardo Gatica', duration: 4, annualTuition: yearly([4350000, 4567500, 4795875, 5035669, 5287452, 5551825]), tuitionSource: 'PROPIO' },
  { id: 'docmip', code: 'DOCMIP', name: 'Doctorado en Ciencias de Materiales e Ingeniería de Procesos', type: 'DOCTORADO', faculty: 'FCNMMA', director: 'Abdoulaye Thiam', duration: 8, annualTuition: { ...parameters.doctorateTuitionTemplate }, tuitionSource: 'PLANTILLA_DOCTORADO' },
  { id: 'mq', code: 'MQ', name: 'Magíster en Química', type: 'MAGISTER_ACADEMICO', faculty: 'FCNMMA', director: 'Katherine Paredes', duration: 4, annualTuition: yearly([4023852, 4182884, 4348182, 4519991, 4745991, 4983291]), tuitionSource: 'PROPIO' },
  { id: 'mees', code: 'MEES', name: 'Magíster en Eficiencia Energética y Sustentabilidad', type: 'MAGISTER_PROFESIONAL', faculty: 'Facultad de Ingeniería', director: 'Siva Avudaiappan', duration: 4, annualTuition: yearly([4150000, 4357500, 4575375, 4804144, 5044351, 5296569]), tuitionSource: 'PROPIO' },
];

const budgetTemplateSeed = [
  {
    id: 'template-doctorado', code: 'DOCTORADO', name: 'Plantilla Doctoral', programType: 'DOCTORADO', version: 1, active: true,
    description: 'Becas de excelencia académica (arancel) y atención económica (manutención).',
    items: [
      { id: 'td-1', key: 'beca-excelencia-arancel', kind: 'BECA_ARANCEL', name: 'Beca de excelencia académica (arancel)', active: true, position: 1, config: { studentMode: 'TODOS_ACTIVOS', students: 0, coverage: 1, periodMode: 'TODOS' } },
      { id: 'td-2', key: 'beca-atencion-economica', kind: 'BECA_MANUTENCION', name: 'Beca de atención económica (manutención)', active: true, position: 2, config: { studentMode: 'TODOS_ACTIVOS', students: 0, months: 0, periodMode: 'TODOS' } },
    ],
  },
  {
    id: 'template-magister-academico', code: 'MAGISTER_ACADEMICO', name: 'Plantilla Magíster Académico', programType: 'MAGISTER_ACADEMICO', version: 1, active: true,
    description: 'Becas de excelencia académica (arancel) y atención económica (manutención).',
    items: [
      { id: 'tma-1', key: 'beca-excelencia-arancel', kind: 'BECA_ARANCEL', name: 'Beca de excelencia académica (arancel)', active: true, position: 1, config: { studentMode: 'TODOS_ACTIVOS', students: 0, coverage: 1, periodMode: 'TODOS' } },
      { id: 'tma-2', key: 'beca-atencion-economica', kind: 'BECA_MANUTENCION', name: 'Beca de atención económica (manutención)', active: true, position: 2, config: { studentMode: 'TODOS_ACTIVOS', students: 0, months: 0, periodMode: 'TODOS' } },
    ],
  },
  {
    id: 'template-magister-profesional', code: 'MAGISTER_PROFESIONAL', name: 'Plantilla Magíster Profesional', programType: 'MAGISTER_PROFESIONAL', version: 1, active: true,
    description: 'Incluye sólo descuentos incorporables y no agrega becas académicas por defecto.',
    items: [
      { id: 'tmp-1', key: 'descuento-incorporable', kind: 'DESCUENTO', name: 'Descuento incorporable', active: true, position: 1, config: { percentage: 0, students: 0, periodMode: 'TODOS', note: 'Ajustar según autorización.' } },
    ],
  },
];

function activePeriods(startYear, startSemester, duration) {
  return Array.from({ length: duration }, (_, index) => {
    const offset = (startSemester - 1) + index;
    return { year: startYear + Math.floor(offset / 2), semester: (offset % 2) + 1, index };
  });
}
function activeYears(periods) { return [...new Set(periods.map((period) => period.year))]; }
function periodKey(year, semester) { return `${year}-${semester}`; }
function within(year, semester, sy, ss, ey, es) {
  const value = year * 2 + semester;
  return value >= sy * 2 + ss && value <= ey * 2 + es;
}
function boundsFor(budget, periodMode = 'TODOS') {
  const periods = activePeriods(budget.startYear, budget.startSemester, budget.durationSemesters);
  const first = periodMode === 'ULTIMO' ? periods.at(-1) : periods[0];
  return { first, last: periods.at(-1) };
}

function syncSemesters(budget) {
  const periods = activePeriods(budget.startYear, budget.startSemester, budget.durationSemesters);
  const current = new Map((budget.semesters || []).map((semester) => [periodKey(semester.year, semester.semester), semester]));
  budget.semesters = periods.map((period, index) => {
    const found = current.get(periodKey(period.year, period.semester));
    return found ? {
      ...found,
      scholarshipStudents: safe(found.scholarshipStudents ?? found.internalTuitionScholarshipStudents),
      scholarshipCoverage: safe(found.scholarshipCoverage ?? found.internalTuitionScholarshipCoverage ?? 1),
      maintenanceStudents: safe(found.maintenanceStudents ?? found.maintenanceScholarshipStudents),
      maintenanceMonths: safe(found.maintenanceMonths ?? found.maintenanceScholarshipMonths),
    } : {
      year: period.year, semester: period.semester, activeStudents: budget.initialStudents,
      graduatingStudents: index === periods.length - 1 ? budget.initialStudents : 0,
      directTeachingHours: 0, replacementTeachingHours: 0,
      scholarshipStudents: 0, scholarshipCoverage: 1, maintenanceStudents: 0, maintenanceMonths: 0,
    };
  });
}

function createBudget(id, program, startYear, startSemester, students, status = 'Borrador') {
  const budget = {
    id, program: clone(program), cohortName: `Cohorte ${startYear} · ${startSemester === 1 ? 'Primer' : 'Segundo'} semestre`,
    startYear, startSemester, durationSemesters: program.duration, initialStudents: students, status,
    workflowStage: status === 'Aprobado' ? 'FINALIZADO' : 'GESTION',
    facultyOverheadRate: academicType(program.type) ? 0 : 0.10, enrollmentRecognitionRate: 0.50,
    carryover: 0, includeAuthorizedCarryover: true, normalizeSharedCosts: true, alertPotentialDuplicates: true,
    responsible: 'M. Antonio Gutiérrez Varas', version: status === 'Aprobado' ? 3 : 1,
    appliedTemplateId: null, appliedTemplateCode: null, appliedTemplateVersion: null,
    discounts: [], externalIncome: [], items: [], reviewHistory: [], createdAt: new Date().toISOString(),
  };
  syncSemesters(budget);
  budget.semesters.forEach((semester, index) => {
    semester.activeStudents = Math.max(0, students - Math.floor(index / 2));
    semester.graduatingStudents = index === budget.semesters.length - 1 ? semester.activeStudents : 0;
    semester.directTeachingHours = index < budget.semesters.length - 1 ? 144 : 72;
    semester.replacementTeachingHours = index === 1 ? 18 : 0;
  });
  return budget;
}

function applyTemplateToBudget(sourceBudget, template) {
  const budget = clone(sourceBudget);
  syncSemesters(budget);
  budget.discounts = (budget.discounts || []).filter((item) => !item.originTemplateItemKey);
  budget.externalIncome = (budget.externalIncome || []).filter((item) => !item.originTemplateItemKey);
  budget.items = (budget.items || []).filter((item) => !item.originTemplateItemKey);
  budget.semesters = budget.semesters.map((semester) => ({ ...semester, scholarshipStudents: 0, scholarshipCoverage: 1, maintenanceStudents: 0, maintenanceMonths: 0 }));
  for (const item of (template.items || []).filter((candidate) => candidate.active).sort((a, b) => a.position - b.position)) {
    const config = item.config || {};
    const { first, last } = boundsFor(budget, config.periodMode || 'TODOS');
    if (item.kind === 'DESCUENTO') budget.discounts.push({ id: uid('discount'), name: item.name, percentage: safe(config.percentage), students: safe(config.students), startYear: first.year, startSemester: first.semester, endYear: last.year, endSemester: last.semester, note: config.note || '', originTemplateItemKey: item.key });
    if (item.kind === 'BECA_ARANCEL') budget.semesters = budget.semesters.map((semester) => within(semester.year, semester.semester, first.year, first.semester, last.year, last.semester) ? { ...semester, scholarshipStudents: config.studentMode === 'TODOS_ACTIVOS' ? semester.activeStudents : safe(config.students), scholarshipCoverage: safe(config.coverage) } : semester);
    if (item.kind === 'BECA_MANUTENCION') budget.semesters = budget.semesters.map((semester) => within(semester.year, semester.semester, first.year, first.semester, last.year, last.semester) ? { ...semester, maintenanceStudents: config.studentMode === 'TODOS_ACTIVOS' ? semester.activeStudents : safe(config.students), maintenanceMonths: safe(config.months) } : semester);
    if (item.kind === 'COSTO') budget.items.push({ id: uid('cost'), name: item.name, description: config.description || '', category: config.category || 'Otros', year: safe(config.year) || first.year, semester: config.semester || null, amount: safe(config.amount), costType: config.costType || 'Único de esta versión', periodicity: config.periodicity || 'Único', note: config.note || '', originTemplateItemKey: item.key });
    if (item.kind === 'INGRESO_EXTRAORDINARIO') budget.externalIncome.push({ id: uid('income'), type: config.type || 'Ingreso extraordinario', description: item.name, year: safe(config.year) || first.year, semester: config.semester || first.semester, students: safe(config.students), amountPerStudent: safe(config.amountPerStudent), source: config.source || '', note: config.note || '', originTemplateItemKey: item.key });
  }
  budget.appliedTemplateId = template.id;
  budget.appliedTemplateCode = template.code;
  budget.appliedTemplateVersion = template.version;
  return budget;
}

function seedBudgets(programs) {
  const mgp = programs.find((p) => p.id === 'mgp');
  const mq = programs.find((p) => p.id === 'mq');
  const docmip = programs.find((p) => p.id === 'docmip');
  const first = createBudget('mgp-2027-1', mgp, 2027, 1, 15);
  first.discounts = [{ id: 'd1', name: 'Convenio institucional', percentage: 0.2, students: 10, startYear: 2027, startSemester: 1, endYear: 2028, endSemester: 2, note: '' }];
  first.externalIncome = [{ id: 'e1', description: 'Aporte de convenio', type: 'Convenio', year: 2028, semester: 1, students: 2, amountPerStudent: 1200000, source: 'Convenio externo', note: '' }];
  first.items = [{ id: 'i1', name: 'Licencia institucional', description: 'Licencia compartida del programa', category: 'Software', year: 2027, semester: null, amount: 1000000, costType: 'Compartido con otras cohortes', periodicity: 'Anual', note: '' }];
  const second = createBudget('mgp-2026-2', mgp, 2026, 2, 12, 'Aprobado');
  second.items = [{ id: 'i2', name: 'Licencia institucional', description: 'Misma licencia informada en otra cohorte', category: 'Software', year: 2027, semester: null, amount: 1000000, costType: 'Compartido con otras cohortes', periodicity: 'Anual', note: '' }];
  const academic = applyTemplateToBudget(createBudget('mq-2027-1', mq, 2027, 1, 8, 'En revisión'), budgetTemplateSeed.find((item) => item.code === 'MAGISTER_ACADEMICO'));
  return [first, second, academic, applyTemplateToBudget(createBudget('docmip-2026-1', docmip, 2026, 1, 6, 'Aprobado'), budgetTemplateSeed.find((item) => item.code === 'DOCTORADO'))];
}

function tuitionFor(budget, year) { return valueForYear(budget.program.annualTuition || parameters.doctorateTuitionTemplate, year); }
function itemTotal(budget, year, categories) { return sum((budget.items || []).filter((item) => item.year === year && categories.includes(item.category)).map((item) => safe(item.amount))); }

function calculateBudget(budget) {
  syncSemesters(budget);
  const periods = activePeriods(budget.startYear, budget.startSemester, budget.durationSemesters);
  const years = activeYears(periods);
  const map = new Map(budget.semesters.map((semester) => [periodKey(semester.year, semester.semester), semester]));
  const typeParameters = parameters.byType[budget.program.type] || parameters.byType.OTRO;
  const warnings = [];
  let previous = budget.includeAuthorizedCarryover === false ? 0 : safe(budget.carryover);
  const annualFlows = years.map((year, yearIndex) => {
    const semesters = periods.filter((p) => p.year === year).map((p) => map.get(periodKey(p.year, p.semester))).filter(Boolean);
    const annualTuition = tuitionFor(budget, year);
    const tuitionFactor = semesters.length * 0.5;
    const grossTuition = sum(semesters.map((semester) => safe(semester.activeStudents) * annualTuition * 0.5));
    const discounts = sum(semesters.flatMap((semester) => (budget.discounts || []).filter((d) => within(semester.year, semester.semester, d.startYear, d.startSemester, d.endYear, d.endSemester)).map((d) => Math.min(safe(d.students), safe(semester.activeStudents)) * annualTuition * 0.5 * Math.min(1, safe(d.percentage)))));
    const tuitionScholarships = sum(semesters.map((semester) => Math.min(safe(semester.scholarshipStudents), safe(semester.activeStudents)) * annualTuition * 0.5 * Math.min(1, safe(semester.scholarshipCoverage))));
    const tuitionAfterBenefits = Math.max(0, grossTuition - discounts - tuitionScholarships);
    const equivalentEnrollments = annualTuition * tuitionFactor > 0 ? tuitionAfterBenefits / (annualTuition * tuitionFactor) : 0;
    const roundedEquivalentStudents = Math.ceil(equivalentEnrollments);
    const badDebtRate = Number.isFinite(Number(budget.badDebtRate)) ? Math.min(1, Math.max(0, Number(budget.badDebtRate))) : typeParameters.badDebtRate;
    const badDebt = tuitionAfterBenefits * badDebtRate;
    const netTuitionIncome = tuitionAfterBenefits - badDebt;
    const enrollment = sum(semesters.map((semester) => safe(semester.activeStudents) * valueForYear(parameters.enrollmentFee, year) * 0.5 * safe(budget.enrollmentRecognitionRate)));
    const institutionalFinancing = sum((budget.externalIncome || []).filter((income) => income.year === year && income.type === 'Financiamiento institucional').map((income) => safe(income.amountPerStudent)));
    const externalIncome = sum((budget.externalIncome || []).filter((income) => income.year === year && income.type !== 'Financiamiento institucional').map((income) => safe(income.students) * safe(income.amountPerStudent)));
    const totalIncome = netTuitionIncome + enrollment + externalIncome + institutionalFinancing;
    const directTeachingCost = sum(semesters.map((semester) => safe(semester.directTeachingHours) * valueForYear(parameters.teachingHour, year)));
    const replacementTeachingCost = sum(semesters.map((semester) => safe(semester.replacementTeachingHours) * parameters.replacementHour));
    const graduatingStudents = Math.max(0, ...semesters.map((semester) => safe(semester.graduatingStudents)));
    const thesisGuidanceCost = graduatingStudents * valueForYear(typeParameters.thesisGuidance, year);
    const manualAcademic = itemTotal(budget, year, ['Honorarios académicos']);
    const academicHonoraria = directTeachingCost + replacementTeachingCost + thesisGuidanceCost + manualAcademic;
    const nonAcademicHonoraria = itemTotal(budget, year, ['Honorarios no académicos']);
    const direction = valueForYear(typeParameters.annualDirection, year) + itemTotal(budget, year, ['Dirección']);
    const assistance = valueForYear(typeParameters.annualAssistance, year) + itemTotal(budget, year, ['Asistencia']);
    const operational = valueForYear(typeParameters.referenceOperational, year) + itemTotal(budget, year, ['Gastos operacionales', 'Bienes y servicios']);
    const software = valueForYear(typeParameters.softwareLicenses, year) + itemTotal(budget, year, ['Software']);
    const diffusion = valueForYear(typeParameters.diffusionAdmission, year) + itemTotal(budget, year, ['Difusión']);
    const maintenance = sum(semesters.map((semester) => Math.min(safe(semester.maintenanceStudents), safe(semester.activeStudents)) * safe(semester.maintenanceMonths) * valueForYear(parameters.maintenanceMonthly, year)));
    const congresses = valueForYear(typeParameters.congressesInternships, year) + itemTotal(budget, year, ['Congresos', 'Pasantías']);
    const books = itemTotal(budget, year, ['Libros y publicaciones']);
    const travel = itemTotal(budget, year, ['Pasajes y fletes']);
    const perDiem = itemTotal(budget, year, ['Viáticos']);
    const other = itemTotal(budget, year, ['Otros']);
    const centralOverhead = academicType(budget.program.type) ? 0 : netTuitionIncome * typeParameters.centralOverheadRate;
    const facultyOverhead = academicType(budget.program.type) ? 0 : netTuitionIncome * safe(budget.facultyOverheadRate);
    const totalExpenses = academicHonoraria + nonAcademicHonoraria + direction + assistance + operational + software + diffusion + maintenance + congresses + books + travel + perDiem + other + centralOverhead + facultyOverhead;
    const netFlow = totalIncome - totalExpenses;
    const startingCarryover = yearIndex === 0 ? (budget.includeAuthorizedCarryover === false ? 0 : safe(budget.carryover)) : previous;
    const accumulatedFlow = startingCarryover + netFlow;
    previous = accumulatedFlow;
    semesters.forEach((semester) => {
      if (safe(semester.graduatingStudents) > safe(semester.activeStudents)) warnings.push(`${semester.year}-${semester.semester}: estudiantes en graduación superan activos.`);
      const discountStudents = sum((budget.discounts || []).filter((d) => within(semester.year, semester.semester, d.startYear, d.startSemester, d.endYear, d.endSemester)).map((d) => safe(d.students)));
      if (discountStudents + safe(semester.scholarshipStudents) > safe(semester.activeStudents)) warnings.push(`${semester.year}-${semester.semester}: descuentos y becas superan estudiantes activos.`);
    });
    return { year, annualTuition, tuitionFactor, grossTuition, discounts, tuitionScholarships, tuitionAfterBenefits, equivalentEnrollments, roundedEquivalentStudents, badDebt, netTuitionIncome, enrollment, externalIncome, institutionalFinancing, totalIncome, directTeachingCost, replacementTeachingCost, thesisGuidanceCost, academicHonoraria, nonAcademicHonoraria, direction, assistance, operational, software, diffusion, maintenance, congresses, books, travel, perDiem, other, centralOverhead, facultyOverhead, totalExpenses, netFlow, startingCarryover, accumulatedFlow, graduatingStudents, operatingMargin: totalIncome ? netFlow / totalIncome : 0 };
  });
  const finalAccumulatedFlow = annualFlows.at(-1)?.accumulatedFlow || (budget.includeAuthorizedCarryover === false ? 0 : safe(budget.carryover));
  return { periods, years, annualFlows, finalAccumulatedFlow, viable: budget.program.type === 'MAGISTER_PROFESIONAL' ? finalAccumulatedFlow >= 0 : null, warnings: [...new Set(warnings)] };
}

const normalizeName = (value) => String(value || '').trim().toLocaleLowerCase('es-CL').replace(/\s+/g, ' ');
function detectPotentialDuplicateCosts(budgets, selectedBudgetId = null) {
  const groups = new Map();
  budgets.filter((budget) => budget.alertPotentialDuplicates !== false).forEach((budget) => (budget.items || []).forEach((item) => {
    const key = `${budget.program.id}|${item.year}|${item.category}|${normalizeName(item.name)}`;
    const entries = groups.get(key) || [];
    entries.push({ budget, item });
    groups.set(key, entries);
  }));
  return [...groups.entries()].filter(([, entries]) => new Set(entries.map((entry) => entry.budget.id)).size > 1)
    .filter(([, entries]) => !selectedBudgetId || entries.some((entry) => entry.budget.id === selectedBudgetId))
    .map(([key, entries]) => ({ key, year: entries[0].item.year, category: entries[0].item.category, name: entries[0].item.name, budgetIds: [...new Set(entries.map((entry) => entry.budget.id))], cohorts: [...new Set(entries.map((entry) => entry.budget.cohortName))], totalAmount: sum(entries.map((entry) => safe(entry.item.amount))), allMarkedShared: entries.every((entry) => entry.item.costType === 'Compartido con otras cohortes'), message: `${entries[0].item.name} aparece en ${new Set(entries.map((entry) => entry.budget.id)).size} cohortes del mismo programa para ${entries[0].item.year}.` }));
}

function consolidateBudgets(budgets) {
  const calculated = budgets.map((budget) => ({ budget, result: calculateBudget(budget) }));
  const years = [...new Set(calculated.flatMap((entry) => entry.result.years))].sort((a, b) => a - b);
  return years.map((year) => {
    const entries = calculated.flatMap((entry) => {
      const flow = entry.result.annualFlows.find((candidate) => candidate.year === year);
      return flow ? [{ budget: entry.budget, flow }] : [];
    });
    const grossIncome = sum(entries.map((entry) => entry.flow.totalIncome));
    const grossExpenses = sum(entries.map((entry) => entry.flow.totalExpenses));
    const automatic = new Map();
    entries.filter(({ budget }) => budget.normalizeSharedCosts !== false).forEach(({ budget, flow }) => {
      const list = automatic.get(budget.program.id) || [];
      list.push(flow.direction + flow.assistance + flow.operational + flow.software);
      automatic.set(budget.program.id, list);
    });
    const automaticAvoided = sum([...automatic.values()].map((amounts) => Math.max(0, sum(amounts) - Math.max(...amounts))));
    const manual = new Map();
    entries.filter(({ budget }) => budget.normalizeSharedCosts !== false).forEach(({ budget }) => (budget.items || []).filter((item) => item.year === year && item.costType === 'Compartido con otras cohortes').forEach((item) => {
      const key = `${budget.program.id}|${year}|${item.category}|${normalizeName(item.name)}`;
      const list = manual.get(key) || [];
      list.push(safe(item.amount));
      manual.set(key, list);
    }));
    const manualAvoided = sum([...manual.values()].map((amounts) => Math.max(0, sum(amounts) - Math.max(...amounts))));
    const duplicateAvoided = automaticAvoided + manualAvoided;
    const normalizedExpenses = grossExpenses - duplicateAvoided;
    return { year, grossIncome, grossExpenses, normalizedExpenses, duplicateAvoided, netFlow: grossIncome - normalizedExpenses };
  });
}

function consolidationGroups(budgets) {
  const programs = [...new Map(budgets.map((budget) => [budget.program.id, budget.program])).values()];
  return [
    { id: 'institutional', label: 'Consolidado institucional', budgets },
    { id: 'academic', label: 'Programas académicos', budgets: budgets.filter((budget) => academicType(budget.program.type)) },
    { id: 'professional', label: 'Programas profesionales', budgets: budgets.filter((budget) => budget.program.type === 'MAGISTER_PROFESIONAL') },
    ...programs.map((program) => ({ id: `program-${program.id}`, label: `${program.code} · ${program.name}`, budgets: budgets.filter((budget) => budget.program.id === program.id) })),
  ].map((group) => ({ ...group, rows: consolidateBudgets(group.budgets) }));
}

const workflowTransitions = {
  SUBMIT_VB: { role: 'GESTOR', from: 'GESTION', to: 'VISTO_BUENO', status: 'En revisión', decision: 'ENVIADO' },
  VB_APPROVE: { role: 'VISTO_BUENO', from: 'VISTO_BUENO', to: 'APROBACION', status: 'En revisión', decision: 'VISTO BUENO' },
  VB_OBSERVE: { role: 'VISTO_BUENO', from: 'VISTO_BUENO', to: 'GESTION', status: 'Observado', decision: 'OBSERVADO' },
  FINAL_APPROVE: { role: 'APROBADOR', from: 'APROBACION', to: 'FINALIZADO', status: 'Aprobado', decision: 'APROBADO' },
  FINAL_OBSERVE: { role: 'APROBADOR', from: 'APROBACION', to: 'GESTION', status: 'Observado', decision: 'OBSERVADO' },
};
function canEdit(budget, role) { return role === 'GESTOR' && budget.workflowStage === 'GESTION' && budget.status !== 'Aprobado'; }
function canDelete(budget, role) { return budget.status === 'Aprobado' ? role === 'APROBADOR' : role === 'GESTOR' && budget.workflowStage === 'GESTION'; }
function applyWorkflow(budget, role, action) {
  const transition = workflowTransitions[action];
  if (!transition || transition.role !== role || transition.from !== budget.workflowStage) throw new Error('El rol o la etapa actual no permiten esta acción.');
  budget.status = transition.status;
  budget.workflowStage = transition.to;
  budget.reviewHistory.push({ id: uid('review'), role, decision: transition.decision, user: budget.responsible, createdAt: new Date().toISOString() });
}
