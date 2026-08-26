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
    const externalIncome = sum((budget.externalIncome || []).filter((income) => income.year === year).map((income) => safe(income.students) * safe(income.amountPerStudent)));
    const totalIncome = netTuitionIncome + enrollment + externalIncome;
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
    return { year, annualTuition, tuitionFactor, grossTuition, discounts, tuitionScholarships, tuitionAfterBenefits, equivalentEnrollments, roundedEquivalentStudents, badDebt, netTuitionIncome, enrollment, externalIncome, totalIncome, directTeachingCost, replacementTeachingCost, thesisGuidanceCost, academicHonoraria, nonAcademicHonoraria, direction, assistance, operational, software, diffusion, maintenance, congresses, books, travel, perDiem, other, centralOverhead, facultyOverhead, totalExpenses, netFlow, startingCarryover, accumulatedFlow, graduatingStudents, operatingMargin: totalIncome ? netFlow / totalIncome : 0 };
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
'use strict';

function buildFinancialReport(budget, result) {
  const f = result.annualFlows;
  const positive = (key) => f.map((flow) => Number(flow[key] || 0));
  const negative = (key) => f.map((flow) => -Number(flow[key] || 0));
  return {
    title: `${budget.program.name} (inicio ${budget.startYear}-${budget.startSemester}S)`,
    subtitle: `${budget.program.code} · ${budget.cohortName} · Versión ${budget.version} · ${budget.status}`,
    years: result.years,
    generatedAt: new Date().toISOString(),
    rows: [
      { label: 'Matrícula', values: positive('enrollment'), tone: 'income', kind: 'currency' },
      { label: 'Arancel bruto', values: positive('grossTuition'), tone: 'income', kind: 'currency' },
      { label: 'Descuentos', values: negative('discounts'), tone: 'income', kind: 'currency' },
      { label: 'Beca de excelencia académica (arancel)', values: negative('tuitionScholarships'), tone: 'income', kind: 'currency' },
      { label: 'Arancel después de beneficios', values: positive('tuitionAfterBenefits'), tone: 'income', kind: 'currency' },
      { label: 'Incobrables (15%)', values: negative('badDebt'), tone: 'income', kind: 'currency' },
      { label: 'Ingreso neto por arancel', values: positive('netTuitionIncome'), tone: 'income', kind: 'currency' },
      { label: 'Ingresos extraordinarios', values: positive('externalIncome'), tone: 'income', kind: 'currency' },
      { label: 'INGRESOS TOTAL', values: positive('totalIncome'), tone: 'income', bold: true, kind: 'currency' },
      { label: 'Docentes convenio / honorario', values: negative('directTeachingCost'), tone: 'expense', kind: 'currency' },
      { label: 'Docentes hora de reemplazo', values: negative('replacementTeachingCost'), tone: 'expense', kind: 'currency' },
      { label: 'Pago docente tesista / guía de tesis', values: negative('thesisGuidanceCost'), tone: 'expense', kind: 'currency' },
      { label: 'COSTOS ACADÉMICOS', values: negative('academicHonoraria'), tone: 'section', bold: true, kind: 'currency' },
      { label: 'Director programa', values: negative('direction'), tone: 'expense', kind: 'currency' },
      { label: 'Asistente de Dirección', values: negative('assistance'), tone: 'expense', kind: 'currency' },
      { label: 'Honorarios no académicos', values: negative('nonAcademicHonoraria'), tone: 'expense', kind: 'currency' },
      { label: 'HONORARIOS NO ACADÉMICOS', values: f.map((x) => -(x.direction + x.assistance + x.nonAcademicHonoraria)), tone: 'section', bold: true, kind: 'currency' },
      { label: 'LIBROS Y PUBLICACIONES TÉCNICAS', values: negative('books'), tone: 'section', bold: true, kind: 'currency' },
      { label: 'Difusión propia del programa', values: negative('diffusion'), tone: 'expense', kind: 'currency' },
      { label: 'DIFUSIÓN', values: negative('diffusion'), tone: 'section', bold: true, kind: 'currency' },
      { label: 'Pasajes nacionales e internacionales', values: negative('travel'), tone: 'expense', kind: 'currency' },
      { label: 'PASAJES Y FLETES', values: negative('travel'), tone: 'section', bold: true, kind: 'currency' },
      { label: 'Viáticos honorarios', values: negative('perDiem'), tone: 'expense', kind: 'currency' },
      { label: 'VIÁTICOS HONORARIOS NACIONALES', values: negative('perDiem'), tone: 'section', bold: true, kind: 'currency' },
      { label: 'Licencias, APIs y servicios de nube', values: negative('software'), tone: 'expense', kind: 'currency' },
      { label: 'ADQUISICIÓN DE PROGRAMAS, LICENCIAS Y NUBE', values: negative('software'), tone: 'section', bold: true, kind: 'currency' },
      { label: 'Giro para rendir / gastos menores', values: negative('operational'), tone: 'expense', kind: 'currency' },
      { label: 'OTROS SERVICIOS', values: f.map((x) => -(x.operational + x.other)), tone: 'section', bold: true, kind: 'currency' },
      { label: 'Becas por pasantías y manutención', values: f.map((x) => -(x.maintenance + x.congresses)), tone: 'expense', kind: 'currency' },
      { label: 'AYUDAS INTERNAS', values: f.map((x) => -(x.maintenance + x.congresses)), tone: 'section', bold: true, kind: 'currency' },
      { label: 'Overhead Central', values: negative('centralOverhead'), tone: 'expense', kind: 'currency' },
      { label: 'Overhead Facultad', values: negative('facultyOverhead'), tone: 'expense', kind: 'currency' },
      { label: 'RETENCIONES', values: f.map((x) => -(x.centralOverhead + x.facultyOverhead)), tone: 'section', bold: true, kind: 'currency' },
      { label: 'TOTAL COSTOS Y GASTOS DE ADM.', values: negative('totalExpenses'), tone: 'result', bold: true, kind: 'currency' },
      { label: 'FLUJO DE CAJA NETO', values: positive('netFlow'), tone: 'result', bold: true, kind: 'currency' },
      { label: 'Arrastre inicial anual', values: positive('startingCarryover'), tone: 'result', kind: 'currency' },
      { label: 'SALDO FINAL ACUMULADO', values: positive('accumulatedFlow'), tone: 'result', bold: true, kind: 'currency' },
      { label: 'MATRÍCULAS EQUIVALENTES', values: positive('equivalentEnrollments'), tone: 'result', bold: true, kind: 'number' },
      { label: 'ESTUDIANTES EQUIVALENTES APROX.', values: positive('roundedEquivalentStudents'), tone: 'result', bold: true, kind: 'number' },
      { label: 'RENDIMIENTO OPERACIONAL', values: positive('operatingMargin'), tone: 'result', bold: true, kind: 'percent' },
    ],
  };
}

const exportEncoder = new TextEncoder();
const exportCrcTable = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = (c & 1) ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();
function exportCrc32(data) { let crc = 0xffffffff; for (const byte of data) crc = exportCrcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8); return (crc ^ 0xffffffff) >>> 0; }
function exportU16(value) { return new Uint8Array([value & 0xff, (value >>> 8) & 0xff]); }
function exportU32(value) { return new Uint8Array([value & 0xff, (value >>> 8) & 0xff, (value >>> 16) & 0xff, (value >>> 24) & 0xff]); }
function exportConcat(parts) { const size = parts.reduce((total, part) => total + part.length, 0); const output = new Uint8Array(size); let offset = 0; for (const part of parts) { output.set(part, offset); offset += part.length; } return output; }
function exportDosDateTime(date = new Date()) { const year = Math.max(1980, date.getFullYear()); return { time: (date.getHours() << 11) | (date.getMinutes() << 5) | Math.floor(date.getSeconds() / 2), date: ((year - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate() }; }
function exportZip(files) {
  const locals = []; const centrals = []; let offset = 0; const stamp = exportDosDateTime();
  for (const file of files) {
    const name = exportEncoder.encode(file.name); const data = typeof file.data === 'string' ? exportEncoder.encode(file.data) : file.data; const crc = exportCrc32(data);
    const local = exportConcat([exportU32(0x04034b50), exportU16(20), exportU16(0), exportU16(0), exportU16(stamp.time), exportU16(stamp.date), exportU32(crc), exportU32(data.length), exportU32(data.length), exportU16(name.length), exportU16(0), name, data]);
    locals.push(local);
    centrals.push(exportConcat([exportU32(0x02014b50), exportU16(20), exportU16(20), exportU16(0), exportU16(0), exportU16(stamp.time), exportU16(stamp.date), exportU32(crc), exportU32(data.length), exportU32(data.length), exportU16(name.length), exportU16(0), exportU16(0), exportU16(0), exportU16(0), exportU32(0), exportU32(offset), name]));
    offset += local.length;
  }
  const centralData = exportConcat(centrals);
  return exportConcat([...locals, centralData, exportConcat([exportU32(0x06054b50), exportU16(0), exportU16(0), exportU16(files.length), exportU16(files.length), exportU32(centralData.length), exportU32(offset), exportU16(0)])]);
}
function exportXml(value) { return String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;'); }
function exportColumn(index) { let result = ''; let current = index; while (current > 0) { current -= 1; result = String.fromCharCode(65 + (current % 26)) + result; current = Math.floor(current / 26); } return result; }
function exportBaseStyle(row) { if (row.tone === 'income') return row.bold ? 4 : 3; if (row.tone === 'expense') return 5; if (row.tone === 'section') return 6; if (row.tone === 'result') return row.bold ? 8 : 7; return 2; }
function exportNumericStyle(row) { const base = exportBaseStyle(row); const numberStyles = { 3: 12, 4: 13, 5: 14, 6: 15, 7: 16, 8: 17 }; const percentStyles = { 3: 22, 4: 23, 5: 24, 6: 25, 7: 26, 8: 27 }; if (row.kind === 'percent') return percentStyles[base] || 20; if (row.kind === 'number') return numberStyles[base] || 10; return base; }
function exportSheet(report) {
  const lastCol = exportColumn(report.years.length + 1); const rows = [];
  rows.push(`<row r="1" ht="24" customHeight="1"><c r="A1" s="1" t="inlineStr"><is><t>${exportXml(report.title)}</t></is></c></row>`);
  rows.push(`<row r="2" ht="18" customHeight="1"><c r="A2" s="2" t="inlineStr"><is><t>${exportXml(report.subtitle)}</t></is></c></row>`);
  rows.push(`<row r="4" ht="20" customHeight="1"><c r="A4" s="2" t="inlineStr"><is><t>DETALLE</t></is></c>${report.years.map((year, index) => `<c r="${exportColumn(index + 2)}4" s="2" t="n"><v>${year}</v></c>`).join('')}</row>`);
  report.rows.forEach((row, rowIndex) => { const r = rowIndex + 5; rows.push(`<row r="${r}" ht="18" customHeight="1"><c r="A${r}" s="${exportBaseStyle(row)}" t="inlineStr"><is><t>${exportXml(row.label)}</t></is></c>${row.values.map((value, index) => `<c r="${exportColumn(index + 2)}${r}" s="${exportNumericStyle(row)}" t="n"><v>${Number.isFinite(value) ? value : 0}</v></c>`).join('')}</row>`); });
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><dimension ref="A1:${lastCol}${report.rows.length + 4}"/><sheetViews><sheetView workbookViewId="0"><pane ySplit="4" topLeftCell="A5" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews><cols><col min="1" max="1" width="46" customWidth="1"/><col min="2" max="${report.years.length + 1}" width="17" customWidth="1"/></cols><sheetData>${rows.join('')}</sheetData><mergeCells count="2"><mergeCell ref="A1:${lastCol}1"/><mergeCell ref="A2:${lastCol}2"/></mergeCells><pageMargins left="0.25" right="0.25" top="0.35" bottom="0.35" header="0.2" footer="0.2"/><pageSetup orientation="landscape" fitToWidth="1" fitToHeight="1" paperSize="9"/></worksheet>`;
}
const exportStyles = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><numFmts count="3"><numFmt numFmtId="164" formatCode="$ #,##0;($ #,##0);-"/><numFmt numFmtId="165" formatCode="0.0"/><numFmt numFmtId="166" formatCode="0.0%"/></numFmts><fonts count="3"><font><sz val="10"/><name val="Arial"/></font><font><b/><color rgb="FFFFFFFF"/><sz val="10"/><name val="Arial"/></font><font><b/><sz val="10"/><name val="Arial"/></font></fonts><fills count="6"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF1F4E78"/></patternFill></fill><fill><patternFill patternType="solid"><fgColor rgb="FFE2F0D9"/></patternFill></fill><fill><patternFill patternType="solid"><fgColor rgb="FFD9E2F3"/></patternFill></fill><fill><patternFill patternType="solid"><fgColor rgb="FFE7E6E6"/></patternFill></fill></fills><borders count="2"><border><left/><right/><top/><bottom/><diagonal/></border><border><left/><right/><top style="thin"><color rgb="FFB4C6E7"/></top><bottom style="thin"><color rgb="FFB4C6E7"/></bottom><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="29"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyAlignment="1"><alignment horizontal="center"/></xf><xf numFmtId="164" fontId="0" fillId="3" borderId="0" xfId="0" applyNumberFormat="1"/><xf numFmtId="164" fontId="2" fillId="3" borderId="1" xfId="0" applyNumberFormat="1"/><xf numFmtId="164" fontId="0" fillId="4" borderId="0" xfId="0" applyNumberFormat="1"/><xf numFmtId="164" fontId="2" fillId="0" borderId="1" xfId="0" applyNumberFormat="1"/><xf numFmtId="164" fontId="0" fillId="5" borderId="0" xfId="0" applyNumberFormat="1"/><xf numFmtId="164" fontId="2" fillId="5" borderId="1" xfId="0" applyNumberFormat="1"/><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="165" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="165" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="165" fontId="0" fillId="3" borderId="0" xfId="0"/><xf numFmtId="165" fontId="2" fillId="3" borderId="1" xfId="0"/><xf numFmtId="165" fontId="0" fillId="4" borderId="0" xfId="0"/><xf numFmtId="165" fontId="2" fillId="0" borderId="1" xfId="0"/><xf numFmtId="165" fontId="0" fillId="5" borderId="0" xfId="0"/><xf numFmtId="165" fontId="2" fillId="5" borderId="1" xfId="0"/><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="166" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="166" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="166" fontId="0" fillId="3" borderId="0" xfId="0"/><xf numFmtId="166" fontId="2" fillId="3" borderId="1" xfId="0"/><xf numFmtId="166" fontId="0" fillId="4" borderId="0" xfId="0"/><xf numFmtId="166" fontId="2" fillId="0" borderId="1" xfId="0"/><xf numFmtId="166" fontId="0" fillId="5" borderId="0" xfId="0"/><xf numFmtId="166" fontId="2" fillId="5" borderId="1" xfId="0"/><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`;
function createFinancialReportXlsx(report) {
  const now = new Date().toISOString();
  return exportZip([
    { name: '[Content_Types].xml', data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/><Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/><Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/></Types>` },
    { name: '_rels/.rels', data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/><Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/></Relationships>` },
    { name: 'docProps/core.xml', data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><dc:title>${exportXml(report.title)}</dc:title><dc:creator>UTEM · Escuela de Postgrado</dc:creator><dcterms:created xsi:type="dcterms:W3CDTF">${now}</dcterms:created></cp:coreProperties>` },
    { name: 'docProps/app.xml', data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties"><Application>Sistema de Presupuestos de Postgrado UTEM</Application></Properties>` },
    { name: 'xl/workbook.xml', data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Flujo presupuestario" sheetId="1" r:id="rId1"/></sheets></workbook>` },
    { name: 'xl/_rels/workbook.xml.rels', data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>` },
    { name: 'xl/styles.xml', data: exportStyles },
    { name: 'xl/worksheets/sheet1.xml', data: exportSheet(report) },
  ]);
}

const PDF_W = 842, PDF_H = 595, PDF_MARGIN = 24, PDF_TITLE = 28, PDF_SUBTITLE = 18, PDF_HEADER = 18, PDF_ROW = 13;
const PDF_COLORS = { navy: [0.12, 0.31, 0.47], income: [0.89, 0.94, 0.85], expense: [0.85, 0.89, 0.95], result: [0.91, 0.90, 0.90], white: [1, 1, 1], black: [0, 0, 0], border: [0.72, 0.78, 0.86] };
function pdfLatin1(value) { const normalized = value.normalize('NFC'); const out = new Uint8Array(normalized.length); for (let i = 0; i < normalized.length; i += 1) out[i] = normalized.charCodeAt(i) <= 255 ? normalized.charCodeAt(i) : 63; return out; }
function pdfEscape(value) { return value.replaceAll('\\', '\\\\').replaceAll('(', '\\(').replaceAll(')', '\\)'); }
function pdfMoney(value) { if (Math.abs(value) < 0.5) return '-'; const formatted = Math.round(Math.abs(value)).toLocaleString('es-CL'); return value < 0 ? `($ ${formatted})` : `$ ${formatted}`; }
function pdfNumber(value) { return value.toLocaleString('es-CL', { minimumFractionDigits: Number.isInteger(value) ? 0 : 1, maximumFractionDigits: 1 }); }
function pdfDisplay(row, value) { if (row.kind === 'percent') return `${(value * 100).toLocaleString('es-CL', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`; if (row.kind === 'number') return pdfNumber(value); return pdfMoney(value); }
function pdfFill(tone) { if (tone === 'income') return PDF_COLORS.income; if (tone === 'expense') return PDF_COLORS.expense; if (tone === 'result') return PDF_COLORS.result; return PDF_COLORS.white; }
function pdfText(text, x, y, size, bold = false) { return `BT /${bold ? 'F2' : 'F1'} ${size} Tf ${x.toFixed(2)} ${y.toFixed(2)} Td (${pdfEscape(text)}) Tj ET\n`; }
function pdfRight(text, right, y, size, bold = false) { return pdfText(text, right - text.length * size * 0.48, y, size, bold); }
function pdfRect(x, y, width, height, fill, stroke = PDF_COLORS.border) { return `${fill[0]} ${fill[1]} ${fill[2]} rg ${stroke[0]} ${stroke[1]} ${stroke[2]} RG ${x} ${y} ${width} ${height} re B\n`; }
function pdfPage(report, rows, pageNumber, totalPages) {
  const tableWidth = PDF_W - PDF_MARGIN * 2; const labelWidth = Math.min(370, tableWidth * 0.55); const valueWidth = (tableWidth - labelWidth) / report.years.length; let y = PDF_H - PDF_MARGIN - PDF_TITLE; let content = '';
  content += pdfRect(PDF_MARGIN, y, tableWidth, PDF_TITLE, PDF_COLORS.navy, PDF_COLORS.navy); content += `1 1 1 rg\n${pdfText(report.title, PDF_MARGIN + 6, y + 9, 10, true)}`;
  y -= PDF_SUBTITLE; content += pdfRect(PDF_MARGIN, y, tableWidth, PDF_SUBTITLE, PDF_COLORS.white); content += `0 0 0 rg\n${pdfText(`${report.subtitle} · Página ${pageNumber}/${totalPages}`, PDF_MARGIN + 6, y + 5, 7)}`;
  y -= PDF_HEADER; content += pdfRect(PDF_MARGIN, y, labelWidth, PDF_HEADER, PDF_COLORS.navy, PDF_COLORS.navy); content += `1 1 1 rg\n${pdfText('DETALLE', PDF_MARGIN + labelWidth / 2 - 18, y + 5, 8, true)}`;
  report.years.forEach((year, index) => { const x = PDF_MARGIN + labelWidth + valueWidth * index; content += pdfRect(x, y, valueWidth, PDF_HEADER, PDF_COLORS.navy, PDF_COLORS.navy); content += `1 1 1 rg\n${pdfRight(String(year), x + valueWidth - 6, y + 5, 8, true)}`; });
  for (const row of rows) { y -= PDF_ROW; const fill = pdfFill(row.tone); content += pdfRect(PDF_MARGIN, y, labelWidth, PDF_ROW, fill); content += `0 0 0 rg\n${pdfText(row.label, PDF_MARGIN + 4, y + 4, 7, Boolean(row.bold || row.tone === 'section'))}`; row.values.forEach((value, index) => { const x = PDF_MARGIN + labelWidth + valueWidth * index; content += pdfRect(x, y, valueWidth, PDF_ROW, fill); content += `0 0 0 rg\n${pdfRight(pdfDisplay(row, value), x + valueWidth - 4, y + 4, 7, Boolean(row.bold || row.tone === 'section'))}`; }); }
  return content;
}
function buildPdfObjects(objects) { const header = pdfLatin1('%PDF-1.4\n%âãÏÓ\n'); const chunks = [header]; const offsets = [0]; let offset = header.length; objects.forEach((object, index) => { offsets.push(offset); const prefix = pdfLatin1(`${index + 1} 0 obj\n`); const body = typeof object === 'string' ? pdfLatin1(object) : object; const suffix = pdfLatin1('\nendobj\n'); chunks.push(prefix, body, suffix); offset += prefix.length + body.length + suffix.length; }); const xrefOffset = offset; let xref = `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`; for (let i = 1; i <= objects.length; i += 1) xref += `${String(offsets[i]).padStart(10, '0')} 00000 n \n`; xref += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`; chunks.push(pdfLatin1(xref)); return exportConcat(chunks); }
function createFinancialReportPdf(report) {
  const maxRows = Math.max(1, Math.floor((PDF_H - PDF_MARGIN * 2 - PDF_TITLE - PDF_SUBTITLE - PDF_HEADER) / PDF_ROW)); const pages = []; for (let i = 0; i < report.rows.length; i += maxRows) pages.push(report.rows.slice(i, i + maxRows)); const objects = ['<< /Type /Catalog /Pages 2 0 R >>']; const pageIds = pages.map((_, index) => 5 + index * 2); objects.push(`<< /Type /Pages /Count ${pages.length} /Kids [${pageIds.map((id) => `${id} 0 R`).join(' ')}] >>`); objects.push('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>'); objects.push('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>'); pages.forEach((rows, index) => { const pageId = 5 + index * 2; const contentId = pageId + 1; const content = pdfLatin1(pdfPage(report, rows, index + 1, pages.length)); objects.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PDF_W} ${PDF_H}] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${contentId} 0 R >>`); objects.push(exportConcat([pdfLatin1(`<< /Length ${content.length} >>\nstream\n`), content, pdfLatin1('\nendstream')])); }); return buildPdfObjects(objects);
}
function downloadBytes(bytes, type, filename) { const blob = new Blob([bytes], { type }); const url = URL.createObjectURL(blob); const anchor = document.createElement('a'); anchor.href = url; anchor.download = filename; document.body.append(anchor); anchor.click(); anchor.remove(); setTimeout(() => URL.revokeObjectURL(url), 500); }
function exportSlug(value) { return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''); }
function downloadBudgetXlsx(budget, result) { downloadBytes(createFinancialReportXlsx(buildFinancialReport(budget, result)), 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', `${exportSlug(budget.program.code)}-${budget.startYear}-${budget.startSemester}s-v${budget.version}.xlsx`); }
function downloadBudgetPdf(budget, result) { downloadBytes(createFinancialReportPdf(buildFinancialReport(budget, result)), 'application/pdf', `${exportSlug(budget.program.code)}-${budget.startYear}-${budget.startSemester}s-v${budget.version}.pdf`); }
'use strict';

const STORAGE = {
  budgets: 'utem-postgrado-budgets-v5', programs: 'utem-postgrado-programs-v5', templates: 'utem-postgrado-templates-v5',
  role: 'utem-postgrado-role-v5', parameterTab: 'utem-postgrado-parameter-tab-v5',
};
let programs = loadJson(STORAGE.programs, clone(programCatalogSeed));
let templates = loadJson(STORAGE.templates, clone(budgetTemplateSeed));
let budgets = migrateBudgets(loadJson(STORAGE.budgets, seedBudgets(programs)));
let selectedBudgetId = budgets[0]?.id || '';
let role = localStorage.getItem(STORAGE.role) || 'GESTOR';
let activeView = 'dashboard';
let activeParameterType = localStorage.getItem(STORAGE.parameterTab) || 'DOCTORADO';
let activeConsolidation = 'institutional';
let message = '';

function loadJson(key, fallback) { try { const parsed = JSON.parse(localStorage.getItem(key)); return parsed && (!Array.isArray(parsed) || parsed.length) ? parsed : fallback; } catch { return fallback; } }
function migrateBudgets(source) { return source.map((budget) => { const next = clone(budget); next.includeAuthorizedCarryover ??= true; next.normalizeSharedCosts ??= true; next.alertPotentialDuplicates ??= true; next.carryover ??= next.authorizedInitialCarryover ?? 0; next.items = (next.items || next.manualItems || []).map((item) => ({ ...item, costType: item.costType || (item.shared ? 'Compartido con otras cohortes' : 'Único de esta versión'), periodicity: item.periodicity || 'Único', description: item.description || '', note: item.note || '' })); next.externalIncome ||= []; next.discounts ||= []; next.reviewHistory ||= []; syncSemesters(next); return next; }); }
function saveState() { localStorage.setItem(STORAGE.budgets, JSON.stringify(budgets)); localStorage.setItem(STORAGE.programs, JSON.stringify(programs)); localStorage.setItem(STORAGE.templates, JSON.stringify(templates)); localStorage.setItem(STORAGE.role, role); }
function selectedBudget() { return budgets.find((item) => item.id === selectedBudgetId) || budgets[0]; }
function replaceSelected(next) { budgets = budgets.map((item) => item.id === next.id ? next : item); }
function escapeHtml(value) { return String(value ?? '').replace(/[&<>'"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[char]); }
function money(value) { return formatCLP(value); }
function decimal(value) { return Number(value || 0).toLocaleString('es-CL', { maximumFractionDigits: 1 }); }
function typeLabel(type) { return ({ DOCTORADO: 'Doctorado', MAGISTER_ACADEMICO: 'Magíster académico', MAGISTER_PROFESIONAL: 'Magíster profesional', OTRO: 'Otro programa' })[type] || type; }
function kindLabel(kind) { return ({ DESCUENTO: 'Descuento', BECA_ARANCEL: 'Beca de arancel', BECA_MANUTENCION: 'Beca de manutención', COSTO: 'Costo o gasto', INGRESO_EXTRAORDINARIO: 'Ingreso extraordinario' })[kind] || kind; }
function stageLabel(stage) { return ({ GESTION: 'Gestión', VISTO_BUENO: 'V°B°', APROBACION: 'Aprobación', FINALIZADO: 'Finalizado' })[stage] || stage; }
function roleLabel(value) { return ({ GESTOR: 'Gestor', VISTO_BUENO: 'V°B°', APROBADOR: 'Aprobación' })[value] || value; }
function statusClass(status) { return status === 'Aprobado' ? 'approved' : status === 'Observado' ? 'observed' : status === 'En revisión' ? 'review' : ''; }
function editable() { const budget = selectedBudget(); return budget ? canEdit(budget, role) : false; }
function disabled() { return editable() ? '' : 'disabled'; }
function numeric(value) { const parsed = Number(value); return Number.isFinite(parsed) ? parsed : 0; }
function setMessage(value) { message = value; }
function option(value, label, selected) { return `<option value="${escapeHtml(value)}" ${value === selected ? 'selected' : ''}>${escapeHtml(label)}</option>`; }
function yesNo(value) { return `<select data-field="${value.field}" ${disabled()}>${option('true','Sí',String(value.value))}${option('false','No',String(value.value))}</select>`; }
function section(number, title, description, content) { return `<section class="panel budget-section"><div class="section-head"><div><span>${number}</span><div><h2>${title}</h2><p>${description}</p></div></div></div>${content}</section>`; }
function kpi(label, value, detail, tone = '') { return `<article class="kpi ${tone}"><span>${label}</span><strong>${value}</strong><small>${detail}</small></article>`; }
function freshBudget() { const program = clone(programs.find((item) => item.type === 'MAGISTER_PROFESIONAL') || programs[0]); const year = new Date().getFullYear() + 1; return createBudget(uid('budget'), program, year, 1, 10); }
function syncProgramReferences(program) { budgets = budgets.map((budget) => budget.program.id === program.id ? { ...budget, program: clone(program), facultyOverheadRate: academicType(program.type) ? 0 : budget.facultyOverheadRate } : budget); }
function templateForBudget(budget) { return templates.find((item) => item.active && item.programType === budget.program.type); }
function actionLabel(action) { return ({ SUBMIT_VB: 'Enviar a V°B°', VB_APPROVE: 'Otorgar V°B°', VB_OBSERVE: 'Observar y devolver', FINAL_APPROVE: 'Aprobar presupuesto', FINAL_OBSERVE: 'Observar y devolver' })[action] || action; }
function availableActions(budget) { return Object.entries(workflowTransitions).filter(([, transition]) => transition.role === role && transition.from === budget.workflowStage).map(([action]) => action); }

function navigate(view) { activeView = view; document.querySelectorAll('[data-view]').forEach((link) => link.classList.toggle('active', link.dataset.view === view)); render(); document.querySelector('#main')?.focus(); document.body.classList.remove('menu-open'); }

function render() {
  const titles = {
    dashboard: ['Panel general', 'Control presupuestario de postgrado', 'Visión ejecutiva de presupuestos, revisión, viabilidad y costos compartidos.'],
    budgets: ['Presupuestos', 'Formulación y seguimiento de cohortes', 'Ajustes editables, plantillas configurables, ingresos, descuentos y costos.'],
    consolidated: ['Consolidado', 'Consolidación académica y profesional', 'Resultados institucionales, por naturaleza del programa y por programa.'],
    parameters: ['Parámetros y plantillas', 'Configuración institucional editable', 'Valores diferenciados y plantillas actualizables por tipo de programa.'],
    programs: ['Programas', 'Maestro de programas y aranceles', 'Arancel anual propio por programa.'],
    reviews: ['Revisión y aprobación', 'Circuito de control presupuestario', 'Tres niveles funcionales: Gestor, V°B° y Aprobación.'],
  };
  const [eyebrow, title, description] = titles[activeView] || titles.dashboard;
  document.querySelector('#main').innerHTML = `<header class="page-header"><div><p class="eyebrow">${eyebrow}</p><h1>${title}</h1><p>${description}</p></div>${activeView === 'dashboard' ? '<button class="button primary" data-action="new-budget">Nuevo presupuesto</button>' : ''}</header><div id="view-content"></div>`;
  ({ dashboard: renderDashboard, budgets: renderBudgets, consolidated: renderConsolidated, parameters: renderParameters, programs: renderPrograms, reviews: renderReviews })[activeView]?.();
  bindEvents();
}

function budgetListTable() { return `<div class="table-wrap"><table class="data-table"><thead><tr><th>Programa</th><th>Cohorte</th><th>Tipo</th><th>Estado</th><th class="numeric">Saldo final</th><th></th></tr></thead><tbody>${budgets.map((budget) => { const result = calculateBudget(budget); return `<tr class="${budget.id === selectedBudgetId ? 'selected-row' : ''}"><th>${escapeHtml(budget.program.code)}</th><td>${escapeHtml(budget.cohortName)}</td><td>${typeLabel(budget.program.type)}</td><td><span class="badge ${statusClass(budget.status)}">${budget.status}</span></td><td class="numeric">${money(result.finalAccumulatedFlow)}</td><td><button class="link-button" data-action="select-budget" data-id="${budget.id}">Abrir</button></td></tr>`; }).join('')}</tbody></table></div>`; }
function consolidatedTable(rows) { return `<div class="table-wrap"><table class="data-table"><thead><tr><th>Año</th><th class="numeric">Ingresos</th><th class="numeric">Egresos brutos</th><th class="numeric">Normalizados</th><th class="numeric">Duplicidad evitada</th><th class="numeric">Flujo</th></tr></thead><tbody>${rows.map((row) => `<tr><th>${row.year}</th><td class="numeric">${money(row.grossIncome)}</td><td class="numeric">${money(row.grossExpenses)}</td><td class="numeric">${money(row.normalizedExpenses)}</td><td class="numeric positive-text">${money(row.duplicateAvoided)}</td><td class="numeric ${row.netFlow >= 0 ? 'positive-text' : 'negative-text'}">${money(row.netFlow)}</td></tr>`).join('')}</tbody></table></div>`; }

function renderDashboard() {
  const professional = budgets.filter((b) => b.program.type === 'MAGISTER_PROFESIONAL');
  const viable = professional.filter((b) => calculateBudget(b).viable).length;
  const duplicateAlerts = detectPotentialDuplicateCosts(budgets);
  const avoided = consolidateBudgets(budgets).reduce((total, row) => total + row.duplicateAvoided, 0);
  document.querySelector('#view-content').innerHTML = `<section class="kpi-grid">${kpi('Presupuestos registrados', budgets.length, `${budgets.filter((b) => b.workflowStage !== 'FINALIZADO').length} pendientes`)}${kpi('Plantillas activas', templates.filter((t) => t.active).length, 'Editables por tipo de programa')}${kpi('Profesionales viables', `${viable}/${professional.length}`, 'Saldo acumulado final', viable === professional.length ? 'positive' : '')}${kpi('Duplicidad evitada', money(avoided), `${duplicateAlerts.length} alertas potenciales`, 'positive')}</section><section class="panel"><div class="panel-title"><div><h2>Presupuestos</h2><p>Acceso directo a ajustes, plantillas y exportación.</p></div><button class="link-button" data-action="go-budgets">Abrir módulo</button></div>${budgetListTable()}</section><section class="panel"><div class="panel-title"><div><h2>Consolidado institucional</h2><p>Normalización según la opción definida en cada presupuesto.</p></div></div>${consolidatedTable(consolidateBudgets(budgets))}</section>`;
}

function identificationForm(budget, result) { return `<div class="form-grid"><label>Programa<select data-field="programId" ${disabled()}>${programs.map((p) => option(p.id, `${p.code} · ${p.name}`, budget.program.id)).join('')}</select></label><label>Nombre de cohorte<input data-field="cohortName" value="${escapeHtml(budget.cohortName)}" ${disabled()}></label><label>Año de ingreso<input type="number" data-field="startYear" value="${budget.startYear}" ${disabled()}></label><label>Semestre<select data-field="startSemester" ${disabled()}>${option('1','Primer semestre',String(budget.startSemester))}${option('2','Segundo semestre',String(budget.startSemester))}</select></label><label>Duración<select data-field="durationSemesters" ${disabled()}>${[2,3,4,5,6,7,8].map((v) => option(String(v), `${v} semestres`, String(budget.durationSemesters))).join('')}</select></label><label>Estudiantes iniciales<input type="number" min="0" data-field="initialStudents" value="${budget.initialStudents}" ${disabled()}></label><label>Responsable<input data-field="responsible" value="${escapeHtml(budget.responsible)}" ${disabled()}></label><label>Versión<input value="${budget.version}" disabled></label></div><div class="periods"><strong>Periodos:</strong>${result.periods.map((p) => `<span>${p.year}-${p.semester}</span>`).join('')}</div>`; }

function parameterBlock(budget, result) {
  const template = templateForBudget(budget);
  const firstYear = result.years[0];
  return `<div class="tuition-focus"><div><span>Arancel anual propio ${firstYear}</span><strong>${money(tuitionFor(budget, firstYear))}</strong><small>Editable inmediatamente; prevalece sobre la plantilla institucional.</small></div><input class="tuition-input" type="number" min="0" data-action="tuition-value" data-year="${firstYear}" value="${tuitionFor(budget, firstYear)}" ${disabled()}></div>
  <div class="template-apply"><div><strong>${template ? template.name : 'Sin plantilla disponible'}</strong><span>${template ? template.description : 'Configure una plantilla para este tipo de programa.'}</span><small>${budget.appliedTemplateCode ? `Aplicada: ${budget.appliedTemplateCode} v${budget.appliedTemplateVersion}` : 'Aún no aplicada'}</small></div><button class="button secondary" data-action="apply-template" ${!template || !editable() ? 'disabled' : ''}>Usar ${template?.name || 'plantilla'}</button><button class="link-button" data-action="go-parameters">Actualizar plantillas</button></div>
  <div class="settings-grid"><label>Incluir arrastre autorizado${yesNo({ field: 'includeAuthorizedCarryover', value: budget.includeAuthorizedCarryover })}</label><label>Arrastre autorizado<input type="number" data-field="carryover" value="${budget.carryover}" ${disabled()}></label><label>Normalizar costos compartidos${yesNo({ field: 'normalizeSharedCosts', value: budget.normalizeSharedCosts })}</label><label>Alertar posibles duplicidades${yesNo({ field: 'alertPotentialDuplicates', value: budget.alertPotentialDuplicates })}</label><label>Reconocimiento matrícula (%)<input type="number" min="0" max="100" data-field="enrollmentRecognitionRatePercent" value="${budget.enrollmentRecognitionRate * 100}" ${disabled()}></label><label>Overhead facultad (%)<input type="number" min="0" max="100" data-field="facultyOverheadRatePercent" value="${academicType(budget.program.type) ? 0 : budget.facultyOverheadRate * 100}" ${academicType(budget.program.type) || !editable() ? 'disabled' : ''}></label></div>`;
}

function semesterTable(budget) { return `<div class="table-wrap"><table class="data-table editable-table"><thead><tr><th>Periodo</th><th>Activos</th><th>Graduación</th><th>Horas directas</th><th>Reemplazo</th><th>Beca arancel</th><th>Cobertura %</th><th>Beca manut.</th><th>Meses</th></tr></thead><tbody>${budget.semesters.map((s, index) => `<tr><th>${s.year}-${s.semester}</th>${[['activeStudents',s.activeStudents],['graduatingStudents',s.graduatingStudents],['directTeachingHours',s.directTeachingHours],['replacementTeachingHours',s.replacementTeachingHours],['scholarshipStudents',s.scholarshipStudents],['scholarshipCoveragePercent',s.scholarshipCoverage*100],['maintenanceStudents',s.maintenanceStudents],['maintenanceMonths',s.maintenanceMonths]].map(([field,value]) => `<td><input type="number" min="0" data-semester="${index}" data-semester-field="${field}" value="${value}" ${disabled()}></td>`).join('')}</tr>`).join('')}</tbody></table></div>`; }

function discountBlock(budget) { return `<div class="list-toolbar"><p>Los descuentos se asocian a estudiantes y periodos concretos.</p><button class="button secondary" data-action="add-discount" ${disabled()}>Agregar descuento</button></div><div class="editable-list">${budget.discounts.length ? budget.discounts.map((d,index) => `<article class="editable-card"><div class="card-grid"><label>Nombre<input data-discount="${index}" data-discount-field="name" value="${escapeHtml(d.name)}" ${disabled()}></label><label>Porcentaje<input type="number" min="0" max="100" data-discount="${index}" data-discount-field="percentagePercent" value="${d.percentage*100}" ${disabled()}></label><label>Estudiantes<input type="number" min="0" data-discount="${index}" data-discount-field="students" value="${d.students}" ${disabled()}></label><label>Inicio<input data-discount="${index}" data-discount-field="startPeriod" value="${d.startYear}-${d.startSemester}" ${disabled()}></label><label>Término<input data-discount="${index}" data-discount-field="endPeriod" value="${d.endYear}-${d.endSemester}" ${disabled()}></label><label>Observación<input data-discount="${index}" data-discount-field="note" value="${escapeHtml(d.note || '')}" ${disabled()}></label></div><button class="link-button danger-text" data-action="remove-discount" data-index="${index}" ${disabled()}>Eliminar</button>${d.originTemplateItemKey ? '<span class="template-origin">Origen: plantilla</span>' : ''}</article>`).join('') : '<p class="empty-state">No hay descuentos. Puede agregarlos manualmente o aplicar la plantilla profesional.</p>'}</div>`; }

function incomeBlock(budget) { const types = ['Beca ANID','Otra beca externa','Convenio','Aporte institucional','Proyecto','Donación','Ingreso extraordinario','Otro']; return `<div class="list-toolbar"><p>Se reconocen exclusivamente en el año y semestre registrados.</p><button class="button secondary" data-action="add-income" ${disabled()}>Agregar ingreso extraordinario</button></div><div class="editable-list">${budget.externalIncome.length ? budget.externalIncome.map((item,index) => `<article class="editable-card"><div class="card-grid"><label>Tipo<select data-income="${index}" data-income-field="type" ${disabled()}>${types.map((type) => option(type,type,item.type)).join('')}</select></label><label>Descripción<input data-income="${index}" data-income-field="description" value="${escapeHtml(item.description)}" ${disabled()}></label><label>Año<input type="number" data-income="${index}" data-income-field="year" value="${item.year}" ${disabled()}></label><label>Semestre<select data-income="${index}" data-income-field="semester" ${disabled()}>${option('1','1',String(item.semester))}${option('2','2',String(item.semester))}</select></label><label>Estudiantes<input type="number" min="0" data-income="${index}" data-income-field="students" value="${item.students}" ${disabled()}></label><label>Monto por estudiante<input type="number" min="0" data-income="${index}" data-income-field="amountPerStudent" value="${item.amountPerStudent}" ${disabled()}></label><label>Fuente<input data-income="${index}" data-income-field="source" value="${escapeHtml(item.source || '')}" ${disabled()}></label><label>Observación<input data-income="${index}" data-income-field="note" value="${escapeHtml(item.note || '')}" ${disabled()}></label></div><button class="link-button danger-text" data-action="remove-income" data-index="${index}" ${disabled()}>Eliminar</button>${item.originTemplateItemKey ? '<span class="template-origin">Origen: plantilla</span>' : ''}</article>`).join('') : '<p class="empty-state">No hay ingresos extraordinarios registrados.</p>'}</div>`; }

function costBlock(budget) {
  const categories = ['Honorarios académicos','Honorarios no académicos','Dirección','Asistencia','Gastos operacionales','Software','Difusión','Congresos','Pasantías','Becas de manutención','Bienes y servicios','Libros y publicaciones','Pasajes y fletes','Viáticos','Otros'];
  const alerts = budget.alertPotentialDuplicates === false ? [] : detectPotentialDuplicateCosts(budgets, budget.id);
  return `${alerts.length ? `<div class="duplicate-alerts" role="alert"><strong>${alerts.length} posible(s) duplicidad(es)</strong>${alerts.map((a) => `<p>${escapeHtml(a.message)} ${a.allMarkedShared ? 'Se normalizará si la opción permanece activa.' : 'Revise si corresponde marcarlo como compartido.'}</p>`).join('')}</div>` : ''}<div class="list-toolbar"><p>Cada costo se identifica como único de la versión o compartido con otras cohortes.</p><button class="button secondary" data-action="add-cost" ${disabled()}>Agregar gasto o costo</button></div><div class="editable-list">${budget.items.length ? budget.items.map((item,index) => `<article class="editable-card"><div class="card-grid"><label>Nombre<input data-cost="${index}" data-cost-field="name" value="${escapeHtml(item.name)}" ${disabled()}></label><label>Categoría<select data-cost="${index}" data-cost-field="category" ${disabled()}>${categories.map((category) => option(category,category,item.category)).join('')}</select></label><label>Año<input type="number" data-cost="${index}" data-cost-field="year" value="${item.year}" ${disabled()}></label><label>Semestre<select data-cost="${index}" data-cost-field="semester" ${disabled()}>${option('','Anual / no aplica',String(item.semester || ''))}${option('1','1',String(item.semester || ''))}${option('2','2',String(item.semester || ''))}</select></label><label>Monto<input type="number" min="0" data-cost="${index}" data-cost-field="amount" value="${item.amount}" ${disabled()}></label><label>Alcance<select data-cost="${index}" data-cost-field="costType" ${disabled()}>${option('Único de esta versión','Único de esta versión',item.costType)}${option('Compartido con otras cohortes','Compartido con otras cohortes',item.costType)}</select></label><label>Periodicidad<select data-cost="${index}" data-cost-field="periodicity" ${disabled()}>${['Único','Semestral','Anual'].map((v)=>option(v,v,item.periodicity)).join('')}</select></label><label>Descripción<input data-cost="${index}" data-cost-field="description" value="${escapeHtml(item.description || '')}" ${disabled()}></label><label>Observación<input data-cost="${index}" data-cost-field="note" value="${escapeHtml(item.note || '')}" ${disabled()}></label></div><button class="link-button danger-text" data-action="remove-cost" data-index="${index}" ${disabled()}>Eliminar</button>${item.originTemplateItemKey ? '<span class="template-origin">Origen: plantilla</span>' : ''}</article>`).join('') : '<p class="empty-state">No hay costos manuales registrados.</p>'}</div>`;
}

function summaryBlock(result) { const latest = result.annualFlows.at(-1); return `<div class="summary-grid">${kpi('Resultado acumulado final', money(result.finalAccumulatedFlow), result.viable === null ? 'Indicador financiero' : result.viable ? 'Programa viable' : 'Programa no viable', result.finalAccumulatedFlow >= 0 ? 'good' : 'bad')}${kpi('Matrículas equivalentes', decimal(latest?.equivalentEnrollments || 0), `≈ ${latest?.roundedEquivalentStudents || 0} estudiantes`)}${kpi('Guía de tesis', money(sum(result.annualFlows.map((f)=>f.thesisGuidanceCost))), 'Valor guía × estudiantes en graduación')}${kpi('Advertencias', result.warnings.length, result.warnings[0] || 'Sin alertas de consistencia')}</div>`; }
function flowTable(result) { const rows = [
  ['Matrícula','enrollment','income'],['Arancel bruto','grossTuition','income'],['Descuentos','discounts','income-neg'],['Becas internas de arancel','tuitionScholarships','income-neg'],['Arancel después de beneficios','tuitionAfterBenefits','income'],['Incobrables','badDebt','income-neg'],['Ingreso neto por arancel','netTuitionIncome','income'],['Ingresos extraordinarios','externalIncome','income'],['INGRESOS TOTAL','totalIncome','total'],
  ['Honorarios académicos','academicHonoraria','expense'],['Honorarios no académicos','nonAcademicHonoraria','expense'],['Dirección','direction','expense'],['Asistencia','assistance','expense'],['Gastos operacionales','operational','expense'],['Software','software','expense'],['Difusión','diffusion','expense'],['Becas manutención','maintenance','expense'],['Congresos y pasantías','congresses','expense'],['Otros gastos','other','expense'],['Overhead Central','centralOverhead','expense'],['Overhead Facultad','facultyOverhead','expense'],['TOTAL EGRESOS','totalExpenses','total'],['FLUJO DE CAJA NETO','netFlow','result'],['Arrastre inicial anual','startingCarryover','result'],['SALDO FINAL ACUMULADO','accumulatedFlow','result']
]; return `<div class="table-wrap"><table class="data-table report-table"><thead><tr><th>DETALLE</th>${result.years.map((y)=>`<th class="numeric">${y}</th>`).join('')}</tr></thead><tbody>${rows.map(([label,key,tone])=>`<tr class="tone-${tone} ${tone==='total'?'row-bold':''}"><th>${label}</th>${result.annualFlows.map((f)=>`<td class="numeric">${money((tone==='expense'||tone==='income-neg')?-f[key]:f[key])}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`; }
function workflowBlock(budget) { const actions = availableActions(budget); return `<div class="workflow-bar"><div><strong>${stageLabel(budget.workflowStage)}</strong><span>Rol activo: ${roleLabel(role)}</span></div><div>${actions.map((action)=>`<button class="button ${action.includes('OBSERVE')?'secondary':'primary'}" data-action="workflow" data-workflow="${action}">${actionLabel(action)}</button>`).join('') || '<span>No hay acciones disponibles para este rol y etapa.</span>'}</div></div>`; }

function renderBudgets() {
  const budget = selectedBudget();
  if (!budget) { document.querySelector('#view-content').innerHTML = '<section class="panel"><p>No existen presupuestos.</p><button class="button primary" data-action="new-budget">Crear presupuesto</button></section>'; return; }
  const result = calculateBudget(budget);
  document.querySelector('#view-content').innerHTML = `${message ? `<div class="notice success" role="status">${escapeHtml(message)}</div>` : ''}<section class="panel budget-selector"><div class="panel-title"><div><h2>Presupuestos creados</h2><p>Seleccione uno para modificarlo.</p></div><button class="button primary" data-action="new-budget">Nuevo presupuesto</button></div>${budgetListTable()}</section><div class="actionbar"><div><span class="badge ${statusClass(budget.status)}">${budget.status}</span><span>${stageLabel(budget.workflowStage)} · Versión ${budget.version}</span><label class="role-inline">Rol <select data-role>${['GESTOR','VISTO_BUENO','APROBADOR'].map((r)=>option(r,roleLabel(r),role)).join('')}</select></label></div><div><button class="button secondary" data-action="export-xlsx">Exportar XLSX</button><button class="button secondary" data-action="export-pdf">Exportar PDF</button><button class="button secondary danger" data-action="delete-budget">Eliminar</button><button class="button primary" data-action="save">Guardar</button></div></div>${section('1','Identificación','Programa, cohorte, periodo y responsable.',identificationForm(budget,result))}${section('2','Parámetros y plantilla','Arancel inmediato, arrastre, normalización y alertas.',parameterBlock(budget,result))}${section('3','Estudiantes, becas y graduación','Las plantillas académicas completan becas; todos los valores pueden ajustarse.',semesterTable(budget))}${section('4','Descuentos','Agregue, modifique o elimine descuentos incorporables.',discountBlock(budget))}${section('5','Ingresos extraordinarios','Becas externas, convenios, aportes y otros ingresos.',incomeBlock(budget))}${section('6','Costos y gastos','Alcance único o compartido para todos los ítems.',costBlock(budget))}${section('7','Resumen financiero','Matrículas equivalentes, graduación y viabilidad.',summaryBlock(result))}${section('8','Flujo de caja anual','El flujo siempre se presenta al final del presupuesto.',flowTable(result))}${section('9','Revisión y aprobación','Circuito Gestor, V°B° y Aprobación.',workflowBlock(budget))}`;
}

function renderConsolidated() {
  const groups = consolidationGroups(budgets);
  const group = groups.find((g)=>g.id===activeConsolidation) || groups[0];
  const alerts = detectPotentialDuplicateCosts(group.budgets);
  document.querySelector('#view-content').innerHTML = `<section class="panel"><div class="consolidation-tabs">${groups.map((g)=>`<button class="tab-button ${g.id===group.id?'active':''}" data-action="select-consolidation" data-id="${g.id}">${escapeHtml(g.label)}</button>`).join('')}</div></section><section class="kpi-grid">${kpi('Presupuestos',group.budgets.length,group.label)}${kpi('Posibles duplicidades',alerts.length,'Mismo programa, año, categoría y nombre',alerts.length?'':'positive')}${kpi('Duplicidad evitada',money(sum(group.rows.map((r)=>r.duplicateAvoided))),'Normalización activa','positive')}${kpi('Resultado normalizado',money(sum(group.rows.map((r)=>r.netFlow))),'Ingresos menos egresos normalizados')}</section>${alerts.length?`<section class="panel duplicate-alerts"><h2>Alertas de duplicidad</h2>${alerts.map((a)=>`<p><strong>${escapeHtml(a.name)}</strong>: ${escapeHtml(a.cohorts.join(', '))}. ${a.allMarkedShared?'Marcado como compartido.':'Revise el alcance del costo.'}</p>`).join('')}</section>`:''}<section class="panel">${consolidatedTable(group.rows)}</section>`;
}

function templateConfigFields(item, templateIndex, itemIndex) {
  const prefix = `data-template="${templateIndex}" data-template-item="${itemIndex}"`;
  if (item.kind === 'DESCUENTO') return `<label>Porcentaje<input type="number" min="0" max="100" ${prefix} data-config="percentagePercent" value="${safe(item.config.percentage)*100}"></label><label>Estudiantes<input type="number" min="0" ${prefix} data-config="students" value="${safe(item.config.students)}"></label>`;
  if (item.kind === 'BECA_ARANCEL') return `<label>Estudiantes<select ${prefix} data-config="studentMode">${option('TODOS_ACTIVOS','Todos los activos',item.config.studentMode)}${option('CANTIDAD','Cantidad fija',item.config.studentMode)}</select></label><label>Cantidad<input type="number" min="0" ${prefix} data-config="students" value="${safe(item.config.students)}"></label><label>Cobertura %<input type="number" min="0" max="100" ${prefix} data-config="coveragePercent" value="${safe(item.config.coverage)*100}"></label>`;
  if (item.kind === 'BECA_MANUTENCION') return `<label>Estudiantes<select ${prefix} data-config="studentMode">${option('TODOS_ACTIVOS','Todos los activos',item.config.studentMode)}${option('CANTIDAD','Cantidad fija',item.config.studentMode)}</select></label><label>Cantidad<input type="number" min="0" ${prefix} data-config="students" value="${safe(item.config.students)}"></label><label>Meses por semestre<input type="number" min="0" ${prefix} data-config="months" value="${safe(item.config.months)}"></label>`;
  if (item.kind === 'COSTO') return `<label>Categoría<input ${prefix} data-config="category" value="${escapeHtml(item.config.category||'Otros')}"></label><label>Monto<input type="number" min="0" ${prefix} data-config="amount" value="${safe(item.config.amount)}"></label><label>Alcance<select ${prefix} data-config="costType">${option('Único de esta versión','Único',item.config.costType)}${option('Compartido con otras cohortes','Compartido',item.config.costType)}</select></label>`;
  return `<label>Tipo<input ${prefix} data-config="type" value="${escapeHtml(item.config.type||'Ingreso extraordinario')}"></label><label>Estudiantes<input type="number" min="0" ${prefix} data-config="students" value="${safe(item.config.students)}"></label><label>Monto unitario<input type="number" min="0" ${prefix} data-config="amountPerStudent" value="${safe(item.config.amountPerStudent)}"></label>`;
}
function renderParameters() {
  const typeTemplate = templates.find((t)=>t.programType===activeParameterType) || templates[0];
  const templateIndex = templates.indexOf(typeTemplate);
  const p = parameters.byType[activeParameterType] || parameters.byType.OTRO;
  document.querySelector('#view-content').innerHTML = `<section class="panel"><div class="parameter-tabs">${['DOCTORADO','MAGISTER_ACADEMICO','MAGISTER_PROFESIONAL'].map((type)=>`<button class="tab-button ${type===activeParameterType?'active':''}" data-action="parameter-tab" data-type="${type}">${typeLabel(type)}</button>`).join('')}</div></section><section class="panel"><div class="panel-title"><div><h2>Parámetros ${typeLabel(activeParameterType)}</h2><p>${academicType(activeParameterType)?'Sin overhead central ni de facultad.':'Con overhead configurable por presupuesto.'}</p></div></div><div class="parameter-grid">${kpi('Dirección 2027',money(valueForYear(p.annualDirection,2027)),'Parámetro anual')}${kpi('Asistencia 2027',money(valueForYear(p.annualAssistance,2027)),'Parámetro anual')}${kpi('Guía de tesis 2027',money(valueForYear(p.thesisGuidance,2027)),'Por estudiante en graduación')}${kpi('Overhead central',formatPercent(p.centralOverheadRate),'Aplicación por tipo')}</div></section><section class="panel template-manager"><div class="panel-title"><div><h2>${escapeHtml(typeTemplate.name)}</h2><p>Puede agregar, quitar o modificar ítems. Al guardar aumenta la versión.</p></div><button class="button primary" data-action="save-template">Guardar plantilla</button></div><div class="form-grid"><label>Nombre<input data-template="${templateIndex}" data-template-field="name" value="${escapeHtml(typeTemplate.name)}"></label><label>Descripción<input data-template="${templateIndex}" data-template-field="description" value="${escapeHtml(typeTemplate.description||'')}"></label><label>Activa<select data-template="${templateIndex}" data-template-field="active">${option('true','Sí',String(typeTemplate.active))}${option('false','No',String(typeTemplate.active))}</select></label><label>Versión<input value="${typeTemplate.version}" disabled></label></div><div class="list-toolbar"><p>Ítems actuales de la plantilla.</p><button class="button secondary" data-action="add-template-item">Agregar ítem</button></div><div class="editable-list">${typeTemplate.items.map((item,itemIndex)=>`<article class="editable-card"><div class="card-grid"><label>Nombre<input data-template="${templateIndex}" data-template-item="${itemIndex}" data-item-field="name" value="${escapeHtml(item.name)}"></label><label>Tipo<select data-template="${templateIndex}" data-template-item="${itemIndex}" data-item-field="kind">${['DESCUENTO','BECA_ARANCEL','BECA_MANUTENCION','COSTO','INGRESO_EXTRAORDINARIO'].map((kind)=>option(kind,kindLabel(kind),item.kind)).join('')}</select></label><label>Activo<select data-template="${templateIndex}" data-template-item="${itemIndex}" data-item-field="active">${option('true','Sí',String(item.active))}${option('false','No',String(item.active))}</select></label>${templateConfigFields(item,templateIndex,itemIndex)}</div><button class="link-button danger-text" data-action="remove-template-item" data-template="${templateIndex}" data-index="${itemIndex}">Quitar ítem</button></article>`).join('')}</div></section>`;
}

function renderPrograms() { document.querySelector('#view-content').innerHTML = `<section class="panel"><div class="table-wrap"><table class="data-table program-tuition-table"><thead><tr><th>Programa</th><th>Tipo</th>${YEARS.map((y)=>`<th class="numeric">${y}</th>`).join('')}<th></th></tr></thead><tbody>${programs.map((p,index)=>`<tr><th>${p.code}<small>${escapeHtml(p.name)}</small></th><td>${typeLabel(p.type)}</td>${YEARS.map((y)=>`<td><input class="tuition-table-input" type="number" min="0" data-program="${index}" data-year="${y}" value="${valueForYear(p.annualTuition,y)}"></td>`).join('')}<td><button class="link-button" data-action="doctorate-template" data-index="${index}">Usar arancel doctoral</button></td></tr>`).join('')}</tbody></table></div><div class="panel-actions"><button class="button primary" data-action="save-programs">Guardar aranceles</button></div></section>`; }
function renderReviews() { document.querySelector('#view-content').innerHTML = `<section class="access-cards">${[['GESTOR','Formula y ajusta presupuestos.'],['VISTO_BUENO','Revisa y otorga V°B° o formula observaciones.'],['APROBADOR','Aprueba o devuelve el presupuesto.']].map(([r,text])=>`<article><h2>${roleLabel(r)}</h2><p>${text}</p><strong>${budgets.filter((b)=>b.workflowStage===({GESTOR:'GESTION',VISTO_BUENO:'VISTO_BUENO',APROBADOR:'APROBACION'})[r]).length} pendientes</strong></article>`).join('')}</section><section class="panel"><label class="role-card">Simular nivel de acceso<select data-role>${['GESTOR','VISTO_BUENO','APROBADOR'].map((r)=>option(r,roleLabel(r),role)).join('')}</select></label>${budgetListTable()}</section>`; }

function updateBudgetField(field, raw) {
  const budget = selectedBudget(); if (!budget || !editable()) return;
  if (field === 'programId') { const program = programs.find((p)=>p.id===raw); budget.program=clone(program); budget.durationSemesters=program.duration; budget.facultyOverheadRate=academicType(program.type)?0:0.10; budget.appliedTemplateId=null; syncSemesters(budget); }
  else if (field === 'startYear' || field === 'startSemester' || field === 'durationSemesters' || field === 'initialStudents') { budget[field]=numeric(raw); syncSemesters(budget); }
  else if (field === 'enrollmentRecognitionRatePercent') budget.enrollmentRecognitionRate=numeric(raw)/100;
  else if (field === 'facultyOverheadRatePercent') budget.facultyOverheadRate=numeric(raw)/100;
  else if (['includeAuthorizedCarryover','normalizeSharedCosts','alertPotentialDuplicates'].includes(field)) budget[field]=raw==='true';
  else if (field === 'carryover') budget.carryover=numeric(raw);
  else budget[field]=raw;
  replaceSelected(budget); saveState(); render();
}
function updatePeriod(target) { const budget=selectedBudget(); if(!budget||!editable())return; const index=Number(target.dataset.semester); const field=target.dataset.semesterField; let value=numeric(target.value); if(field==='scholarshipCoveragePercent'){field; budget.semesters[index].scholarshipCoverage=value/100;} else budget.semesters[index][field]=value; replaceSelected(budget); saveState(); render(); }
function parsePeriod(raw, fallbackYear, fallbackSemester) { const [year,semester]=String(raw).split('-').map(Number); return {year:year||fallbackYear,semester:semester===2?2:1}; }
function updateCollection(kind, target) { const budget=selectedBudget(); if(!budget||!editable())return; const index=Number(target.dataset[kind]); const field=target.dataset[`${kind}Field`]; const collection=kind==='discount'?'discounts':kind==='income'?'externalIncome':'items'; const item=budget[collection][index]; if(kind==='discount'&&field==='percentagePercent') item.percentage=numeric(target.value)/100; else if(kind==='discount'&&(field==='startPeriod'||field==='endPeriod')) { const parsed=parsePeriod(target.value,budget.startYear,budget.startSemester); const prefix=field==='startPeriod'?'start':'end'; item[`${prefix}Year`]=parsed.year; item[`${prefix}Semester`]=parsed.semester; } else if(['students','year','semester','amountPerStudent','amount'].includes(field)) item[field]=target.value===''?null:numeric(target.value); else item[field]=target.value; replaceSelected(budget); saveState(); render(); }
function updateTemplate(target) { const ti=Number(target.dataset.template); const template=templates[ti]; if(target.dataset.templateField){ const field=target.dataset.templateField; template[field]=field==='active'?target.value==='true':target.value; } else { const ii=Number(target.dataset.templateItem); const item=template.items[ii]; if(target.dataset.itemField){ const field=target.dataset.itemField; item[field]=field==='active'?target.value==='true':target.value; if(field==='kind') item.config=defaultConfig(target.value); } if(target.dataset.config){ const field=target.dataset.config; if(field==='percentagePercent') item.config.percentage=numeric(target.value)/100; else if(field==='coveragePercent') item.config.coverage=numeric(target.value)/100; else if(['students','months','amount','amountPerStudent','year','semester'].includes(field)) item.config[field]=numeric(target.value); else item.config[field]=target.value; } } localStorage.setItem(STORAGE.templates,JSON.stringify(templates)); render(); }
function defaultConfig(kind) { if(kind==='DESCUENTO')return{percentage:0,students:0,periodMode:'TODOS'}; if(kind==='BECA_ARANCEL')return{studentMode:'TODOS_ACTIVOS',students:0,coverage:1,periodMode:'TODOS'}; if(kind==='BECA_MANUTENCION')return{studentMode:'TODOS_ACTIVOS',students:0,months:0,periodMode:'TODOS'}; if(kind==='COSTO')return{category:'Otros',amount:0,costType:'Único de esta versión',periodicity:'Único'}; return{type:'Ingreso extraordinario',students:0,amountPerStudent:0,source:''}; }

function bindEvents() {
  document.querySelectorAll('[data-field]').forEach((el)=>el.addEventListener('change',(e)=>updateBudgetField(e.target.dataset.field,e.target.value)));
  document.querySelectorAll('[data-semester-field]').forEach((el)=>el.addEventListener('change',(e)=>updatePeriod(e.target)));
  ['discount','income','cost'].forEach((kind)=>document.querySelectorAll(`[data-${kind}-field]`).forEach((el)=>el.addEventListener('change',(e)=>updateCollection(kind,e.target))));
  document.querySelectorAll('[data-template-field],[data-item-field],[data-config]').forEach((el)=>el.addEventListener('change',(e)=>updateTemplate(e.target)));
  document.querySelectorAll('[data-action="tuition-value"]').forEach((el)=>el.addEventListener('change',(e)=>handleAction('tuition-value',e.target)));
  document.querySelectorAll('[data-program][data-year]').forEach((el)=>el.addEventListener('change',(e)=>{const p=programs[Number(e.target.dataset.program)];p.annualTuition[Number(e.target.dataset.year)]=numeric(e.target.value);p.tuitionSource='PROPIO';syncProgramReferences(p);saveState();}));
  document.querySelectorAll('[data-role]').forEach((el)=>el.addEventListener('change',(e)=>{role=e.target.value;saveState();render();}));
  document.querySelectorAll('button[data-action],a[data-action]').forEach((button)=>button.addEventListener('click',()=>handleAction(button.dataset.action,button)));
}

function handleAction(action, button) {
  const budget=selectedBudget();
  if(action==='go-budgets')return navigate('budgets'); if(action==='go-consolidated')return navigate('consolidated'); if(action==='go-parameters')return navigate('parameters');
  if(action==='new-budget'){const next=freshBudget();budgets.unshift(next);selectedBudgetId=next.id;saveState();setMessage('Presupuesto creado en borrador.');return navigate('budgets');}
  if(action==='select-budget'){selectedBudgetId=button.dataset.id;setMessage('');return navigate('budgets');}
  if(action==='save'){if(!editable())return alert('El rol o etapa actual no permite modificar.');budget.version+=1;saveState();setMessage('Cambios guardados y nueva versión registrada.');return render();}
  if(action==='delete-budget'){if(!canDelete(budget,role))return alert('El rol o etapa no permite eliminar este presupuesto.');if(confirm(`¿Eliminar ${budget.cohortName}?`)){budgets=budgets.filter((b)=>b.id!==budget.id);selectedBudgetId=budgets[0]?.id||'';saveState();setMessage('Presupuesto eliminado.');render();}return;}
  if(action==='export-xlsx')return downloadBudgetXlsx(budget,calculateBudget(budget)); if(action==='export-pdf')return downloadBudgetPdf(budget,calculateBudget(budget));
  if(action==='tuition-value'&&editable()){budget.program.annualTuition[Number(button.dataset.year)]=numeric(button.value);budget.program.tuitionSource='PROPIO';const master=programs.find((p)=>p.id===budget.program.id);master.annualTuition=clone(budget.program.annualTuition);master.tuitionSource='PROPIO';syncProgramReferences(master);saveState();return render();}
  if(action==='apply-template'&&editable()){const template=templateForBudget(budget);replaceSelected(applyTemplateToBudget(budget,template));saveState();setMessage(`${template.name} aplicada. Los ítems manuales existentes se conservaron.`);return render();}
  if(action==='add-discount'&&editable()){const periods=activePeriods(budget.startYear,budget.startSemester,budget.durationSemesters);budget.discounts.push({id:uid('discount'),name:'Nuevo descuento',percentage:0,students:0,startYear:periods[0].year,startSemester:periods[0].semester,endYear:periods.at(-1).year,endSemester:periods.at(-1).semester,note:''});replaceSelected(budget);saveState();return render();}
  if(action==='remove-discount'&&editable()){budget.discounts.splice(Number(button.dataset.index),1);replaceSelected(budget);saveState();return render();}
  if(action==='add-income'&&editable()){budget.externalIncome.push({id:uid('income'),type:'Ingreso extraordinario',description:'Nuevo ingreso',year:budget.startYear,semester:budget.startSemester,students:1,amountPerStudent:0,source:'',note:''});replaceSelected(budget);saveState();return render();}
  if(action==='remove-income'&&editable()){budget.externalIncome.splice(Number(button.dataset.index),1);replaceSelected(budget);saveState();return render();}
  if(action==='add-cost'&&editable()){budget.items.push({id:uid('cost'),name:'Nuevo costo',description:'',category:'Otros',year:budget.startYear,semester:null,amount:0,costType:'Único de esta versión',periodicity:'Único',note:''});replaceSelected(budget);saveState();return render();}
  if(action==='remove-cost'&&editable()){budget.items.splice(Number(button.dataset.index),1);replaceSelected(budget);saveState();return render();}
  if(action==='workflow'){try{applyWorkflow(budget,role,button.dataset.workflow);saveState();setMessage('Etapa de revisión actualizada.');render();}catch(error){alert(error.message);}return;}
  if(action==='select-consolidation'){activeConsolidation=button.dataset.id;return render();}
  if(action==='parameter-tab'){activeParameterType=button.dataset.type;localStorage.setItem(STORAGE.parameterTab,activeParameterType);return render();}
  if(action==='add-template-item'){const template=templates.find((t)=>t.programType===activeParameterType);template.items.push({id:uid('template-item'),key:uid('item'),kind:'DESCUENTO',name:'Nuevo ítem',active:true,position:template.items.length+1,config:defaultConfig('DESCUENTO')});saveState();return render();}
  if(action==='remove-template-item'){templates[Number(button.dataset.template)].items.splice(Number(button.dataset.index),1);saveState();return render();}
  if(action==='save-template'){const template=templates.find((t)=>t.programType===activeParameterType);template.version+=1;saveState();alert(`Plantilla guardada como versión ${template.version}.`);return render();}
  if(action==='doctorate-template'){const p=programs[Number(button.dataset.index)];p.annualTuition=clone(parameters.doctorateTuitionTemplate);p.tuitionSource='PLANTILLA_DOCTORADO';syncProgramReferences(p);saveState();return render();}
  if(action==='save-programs'){programs.forEach(syncProgramReferences);saveState();alert('Aranceles guardados.');return render();}
}

document.addEventListener('click',(event)=>{const nav=event.target.closest('[data-view]');if(nav){event.preventDefault();navigate(nav.dataset.view);}if(event.target.closest('#menu-open'))document.body.classList.add('menu-open');if(event.target.closest('#menu-close')||event.target.closest('#backdrop'))document.body.classList.remove('menu-open');});
document.querySelectorAll('[data-role-global]').forEach((el)=>el.addEventListener('change',(e)=>{role=e.target.value;saveState();render();}));
render();
