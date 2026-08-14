"use client";

import { useEffect, useMemo, useState } from "react";
import type {
  AccessRole,
  AnnualParameterTemplateConfig,
  AnnualTemplateParameter,
  BudgetTemplate,
  BudgetTemplateConfig,
  BudgetTemplateItem,
  CostTemplateConfig,
  DeliveryModality,
  DiscountTemplateConfig,
  IncomeTemplateConfig,
  InstitutionalParameters,
  MaintenanceScholarshipTemplateConfig,
  Program,
  ProgramType,
  SharedCourseTemplatePreset,
  TeachingMode,
  TemplateItemKind,
  TuitionScholarshipTemplateConfig,
} from "@/lib/calculations/types";
import type { ApiIdentity, ApiProgram } from "@/lib/mappers/budget-api";
import { responseBody, toProgram } from "@/lib/mappers/budget-api";
import { defaultBudgetTemplates } from "@/lib/templates/default-templates";

const COST_CATEGORIES = [
  "Otros honorarios no académicos", "Dirección", "Asistencia de dirección",
  "Gastos operacionales / Bienes y servicios", "Software y licencias", "Difusión",
  "Congresos y pasantías", "Becas de manutención", "Becas y ayudas", "Equipamiento",
  "Libros y publicaciones", "Pasajes y fletes", "Viáticos", "Alimentos y bebidas", "Otros costos y gastos",
] as const;
const TYPES: ProgramType[] = ["DOCTORADO", "MAGISTER_ACADEMICO", "MAGISTER_PROFESIONAL"];
const KINDS: TemplateItemKind[] = ["PARAMETRO_ANUAL", "DESCUENTO", "BECA_ARANCEL", "BECA_MANUTENCION", "COSTO", "INGRESO_EXTRAORDINARIO"];
const ANNUAL_PARAMETERS: AnnualTemplateParameter[] = ["ARANCEL", "MATRICULA", "BECA_MANUTENCION", "DOCENCIA_PRESENCIAL", "DOCENCIA_SINCRONICA", "DOCENCIA_ASINCRONICA", "GUIA_TESIS", "DIRECCION", "ASISTENCIA", "OTROS_HONORARIOS_NO_ACADEMICOS"];
const INCOME_TYPES = ["Beca ANID", "Otra beca externa", "Convenio", "Aporte institucional", "Proyecto", "Donación", "Ingreso extraordinario", "Otro"] as const;

const typeLabel = (type: ProgramType) => ({ DOCTORADO: "Doctorado", MAGISTER_ACADEMICO: "Magíster académico", MAGISTER_PROFESIONAL: "Magíster profesional", OTRO: "Otro" })[type];
const modalityLabel = (value: DeliveryModality) => ({ PRESENCIAL: "Presencial", SEMIPRESENCIAL: "Semipresencial", E_LEARNING: "E-learning" })[value];
const teachingLabel = (value: TeachingMode) => ({ PRESENCIAL: "Presencial", SINCRONICA: "Sincrónica", ASINCRONICA: "Asincrónica" })[value];
const annualLabel: Record<AnnualTemplateParameter, string> = {
  ARANCEL: "Arancel", MATRICULA: "Matrícula", BECA_MANUTENCION: "Beca de manutención mensual",
  DOCENCIA_PRESENCIAL: "Valor hora docencia presencial", DOCENCIA_SINCRONICA: "Valor hora docencia sincrónica",
  DOCENCIA_ASINCRONICA: "Valor hora docencia asincrónica", GUIA_TESIS: "Guía de tesis",
  DIRECCION: "Dirección", ASISTENCIA: "Asistencia de dirección", OTROS_HONORARIOS_NO_ACADEMICOS: "Otros honorarios no académicos",
};
const kindLabel = (kind: TemplateItemKind) => ({ PARAMETRO_ANUAL: "Parámetro anual", DESCUENTO: "Descuento", BECA_ARANCEL: "Beca de arancel", BECA_MANUTENCION: "Beca de manutención", COSTO: "Costo o gasto", INGRESO_EXTRAORDINARIO: "Ingreso extraordinario" })[kind];
const uid = (prefix: string) => `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const canEdit = (roles: AccessRole[]) => roles.includes("ADMIN") || roles.includes("GESTOR");

function defaultConfig(kind: TemplateItemKind, years: number[]): BudgetTemplateConfig {
  if (kind === "PARAMETRO_ANUAL") return { parameter: "ARANCEL", values: Object.fromEntries(years.map((year) => [year, 0])), annualAdjustmentRate: 0 } satisfies AnnualParameterTemplateConfig;
  if (kind === "DESCUENTO") return { percentage: 0, students: 0, periodMode: "TODOS" } satisfies DiscountTemplateConfig;
  if (kind === "BECA_ARANCEL") return { studentMode: "TODOS_ACTIVOS", students: 0, coverage: 1, periodMode: "TODOS" } satisfies TuitionScholarshipTemplateConfig;
  if (kind === "BECA_MANUTENCION") return { studentMode: "TODOS_ACTIVOS", students: 0, months: 0, periodMode: "TODOS" } satisfies MaintenanceScholarshipTemplateConfig;
  if (kind === "COSTO") return { category: "Otros costos y gastos", amount: 0, costType: "Único de esta versión", periodicity: "Único" } satisfies CostTemplateConfig;
  return { type: "Otro", students: 1, amountPerStudent: 0, source: "Plantilla" } satisfies IncomeTemplateConfig;
}

function normalizeTemplate(record: BudgetTemplate): BudgetTemplate {
  return { ...record, description: record.description ?? "", settings: record.settings ?? {}, items: (record.items ?? []).map((item) => ({ ...item, key: item.key || uid("item") })) };
}

function annualReferenceValues(parameter: AnnualTemplateParameter, programType: ProgramType, parameters: InstitutionalParameters | null, years: number[]): Record<number, number> {
  if (!parameters) return Object.fromEntries(years.map((year) => [year, 0]));
  const scoped = parameters.byProgramType[programType];
  const source: Record<number, number> = parameter === "ARANCEL" ? parameters.tuitionTemplates[programType]
    : parameter === "MATRICULA" ? parameters.annualEnrollmentFee
    : parameter === "BECA_MANUTENCION" ? parameters.maintenanceScholarshipMonthly
    : parameter === "DOCENCIA_PRESENCIAL" || parameter === "DOCENCIA_SINCRONICA" || parameter === "DOCENCIA_ASINCRONICA" ? parameters.teachingHour
    : parameter === "GUIA_TESIS" ? scoped.thesisGuidancePerGraduatingStudent
    : parameter === "DIRECCION" ? scoped.annualDirection
    : parameter === "ASISTENCIA" ? scoped.annualAssistance
    : {};
  return Object.fromEntries(years.map((year) => [year, Number(source[year] ?? 0)]));
}

function defaultAnnualParametersFor(type: ProgramType, modality: DeliveryModality): AnnualTemplateParameter[] {
  const teaching: AnnualTemplateParameter[] = type === "MAGISTER_PROFESIONAL" && modality !== "PRESENCIAL"
    ? ["DOCENCIA_SINCRONICA", "DOCENCIA_ASINCRONICA"]
    : ["DOCENCIA_PRESENCIAL"];
  return ["ARANCEL", "MATRICULA", "BECA_MANUTENCION", ...teaching, "GUIA_TESIS", "DIRECCION", "ASISTENCIA", "OTROS_HONORARIOS_NO_ACADEMICOS"];
}

function defaultTemplateRows(type: ProgramType, modality: DeliveryModality, parameters: InstitutionalParameters | null, years: number[]): BudgetTemplateItem[] {
  const adjustment = parameters?.annualAdjustmentRate ?? 0;
  return defaultAnnualParametersFor(type, modality).map((parameter, position) => ({
    id: uid("template-item"),
    key: uid(`param-${parameter.toLowerCase()}`),
    kind: "PARAMETRO_ANUAL" as const,
    name: annualLabel[parameter],
    active: true,
    position,
    config: { parameter, values: annualReferenceValues(parameter, type, parameters, years), annualAdjustmentRate: adjustment } satisfies AnnualParameterTemplateConfig,
  }));
}

export function TemplateManager() {
  const [templates, setTemplates] = useState<BudgetTemplate[]>(defaultBudgetTemplates);
  const [programs, setPrograms] = useState<Program[]>([]);
  const [parameters, setParameters] = useState<InstitutionalParameters | null>(null);
  const [identity, setIdentity] = useState<ApiIdentity | null>(null);
  const [activeType, setActiveType] = useState<ProgramType>("MAGISTER_PROFESIONAL");
  const [selectedId, setSelectedId] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const years = useMemo(() => {
    const candidates = parameters ? Object.keys(parameters.annualEnrollmentFee).map(Number).filter(Number.isFinite).sort() : [];
    const first = candidates[0] ?? new Date().getFullYear();
    const horizon = Math.max(4, parameters?.planningHorizonYears ?? 4);
    return Array.from({ length: horizon }, (_, index) => first + index);
  }, [parameters]);
  const typeTemplates = templates.filter((item) => item.programType === activeType);
  const template = templates.find((item) => item.id === selectedId) ?? typeTemplates[0] ?? null;
  const editable = canEdit(identity?.roles ?? []);

  async function load(preferred?: string) {
    try {
      const [records, programRecords, parameterValues, me] = await Promise.all([
        responseBody<BudgetTemplate[]>(await fetch("/api/templates?includeInactive=1", { cache: "no-store" })),
        responseBody<ApiProgram[]>(await fetch("/api/programs?includeInactive=1", { cache: "no-store" })),
        responseBody<InstitutionalParameters>(await fetch("/api/parameters", { cache: "no-store" })),
        responseBody<ApiIdentity>(await fetch("/api/me", { cache: "no-store" })),
      ]);
      const normalized = records.map(normalizeTemplate);
      setTemplates(normalized.length ? normalized : defaultBudgetTemplates);
      setPrograms(programRecords.map(toProgram)); setParameters(parameterValues); setIdentity(me);
      const selected = preferred && normalized.some((item) => item.id === preferred) ? preferred : normalized.find((item) => item.programType === activeType)?.id ?? normalized[0]?.id ?? "";
      setSelectedId(selected); setError("");
    } catch (reason) { setError(reason instanceof Error ? reason.message : "No fue posible cargar las plantillas."); }
  }
  useEffect(() => { void load(); }, []);
  useEffect(() => { const first = typeTemplates[0]; if (first && !typeTemplates.some((item) => item.id === selectedId)) setSelectedId(first.id); }, [activeType, templates]);

  function replace(next: BudgetTemplate) { setTemplates((current) => current.map((item) => item.id === next.id ? next : item)); }
  function updateItem(index: number, patch: Partial<BudgetTemplateItem>) { if (!template) return; replace({ ...template, items: template.items.map((item, i) => i === index ? { ...item, ...patch } : item) }); }
  function updateConfig(index: number, patch: Record<string, unknown>) { if (!template) return; const current = template.items[index]; updateItem(index, { config: { ...(current.config as Record<string, unknown>), ...patch } as BudgetTemplateConfig }); }

  function changeTemplateModality(modality: DeliveryModality) {
    if (!template) return;
    const teachingParameters = new Set<AnnualTemplateParameter>(["DOCENCIA_PRESENCIAL", "DOCENCIA_SINCRONICA", "DOCENCIA_ASINCRONICA"]);
    const retained = template.items.filter((item) => item.kind !== "PARAMETRO_ANUAL" || !teachingParameters.has((item.config as AnnualParameterTemplateConfig).parameter));
    const requiredTeaching = defaultAnnualParametersFor(activeType, modality).filter((parameter) => teachingParameters.has(parameter));
    const adjustment = parameters?.annualAdjustmentRate ?? 0;
    const added = requiredTeaching.map((parameter, offset) => ({
      id: uid("template-item"), key: uid(`param-${parameter.toLowerCase()}`), kind: "PARAMETRO_ANUAL" as const, name: annualLabel[parameter], active: true,
      position: retained.length + offset,
      config: { parameter, values: annualReferenceValues(parameter, activeType, parameters, years), annualAdjustmentRate: adjustment } satisfies AnnualParameterTemplateConfig,
    }));
    replace({ ...template, settings: { ...(template.settings ?? {}), modality }, items: [...retained, ...added].map((item, position) => ({ ...item, position })) });
  }

  async function createTemplate(clone = false) {
    if (!editable) return;
    const source = clone && template ? template : null;
    const modality: DeliveryModality = activeType === "MAGISTER_PROFESIONAL" ? (source?.settings?.modality ?? "PRESENCIAL") : "PRESENCIAL";
    const payload = {
      code: `${activeType}_${Date.now()}`,
      name: source ? `${source.name} (copia)` : `Nueva plantilla ${typeLabel(activeType)}`,
      programType: activeType,
      description: source?.description ?? "",
      active: true,
      programId: source?.programId ?? null,
      settings: structuredClone(source?.settings ?? { modality }),
      items: source
        ? source.items.map((item, position) => ({ ...item, id: undefined, key: uid("item"), position }))
        : defaultTemplateRows(activeType, modality, parameters, years).map((item, position) => ({ ...item, id: undefined, position })),
    };
    try {
      const created = await responseBody<BudgetTemplate>(await fetch("/api/templates", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) }));
      await load(created.id); setMessage(clone ? "Plantilla clonada. Puede modificarla y guardarla." : "Plantilla creada.");
    } catch (reason) { setError(reason instanceof Error ? reason.message : "No fue posible crear la plantilla."); }
  }

  async function save() {
    if (!template || !editable) return;
    try {
      const payload = { name: template.name, description: template.description, active: template.active, programId: template.programId ?? null, settings: template.settings ?? {}, items: template.items.map((item, position) => ({ ...item, position })) };
      const saved = await responseBody<BudgetTemplate>(await fetch(`/api/templates/${template.id}`, { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) }));
      replace(normalizeTemplate(saved)); setMessage(`Plantilla guardada como versión ${saved.version}.`); setError("");
    } catch (reason) { setError(reason instanceof Error ? reason.message : "No fue posible guardar la plantilla."); }
  }

  if (!template) return <section className="panel"><p>No hay plantillas disponibles.</p><button className="button primary" onClick={() => void createTemplate(false)}>Crear plantilla</button></section>;

  return <section className="panel template-manager">
    <div className="panel-header"><div><h2>Plantillas presupuestarias</h2><p>Edite, clone y parametrice ajustes anuales, modalidades docentes y economías de escala.</p></div><div className="workspace-actions"><button className="button secondary" disabled={!editable} onClick={() => void createTemplate(false)}>Nueva plantilla</button><button className="button secondary" disabled={!editable} onClick={() => void createTemplate(true)}>Clonar plantilla</button><button className="button primary" disabled={!editable} onClick={() => void save()}>Guardar plantilla</button></div></div>
    {error ? <div className="notice warning">{error}</div> : null}{message ? <div className="notice success">{message}</div> : null}
    <div className="parameter-tabs">{TYPES.map((type) => <button key={type} className={`tab-button ${activeType === type ? "active" : ""}`} onClick={() => setActiveType(type)}>{typeLabel(type)}</button>)}</div>
    <div className="form-grid cols-4">
      <label>Plantilla<select value={template.id} onChange={(e) => setSelectedId(e.target.value)}>{typeTemplates.map((item) => <option key={item.id} value={item.id}>{item.name} · v{item.version}{item.active ? "" : " · inactiva"}</option>)}</select></label>
      <label>Nombre<input disabled={!editable} value={template.name} onChange={(e) => replace({ ...template, name: e.target.value })} /></label>
      <label>Programa específico<select disabled={!editable} value={template.programId ?? ""} onChange={(e) => replace({ ...template, programId: e.target.value || undefined })}><option value="">Todos los programas del tipo</option>{programs.filter((p) => p.type === activeType).map((p) => <option key={p.id} value={p.id}>{p.code} · {p.name}</option>)}</select></label>
      <label>Estado<select disabled={!editable} value={template.active ? "1" : "0"} onChange={(e) => replace({ ...template, active: e.target.value === "1" })}><option value="1">Activa</option><option value="0">Inactiva</option></select></label>
      <label className="span-2">Descripción<input disabled={!editable} value={template.description} onChange={(e) => replace({ ...template, description: e.target.value })} /></label>
      {activeType === "MAGISTER_PROFESIONAL" ? <label>Modalidad<select disabled={!editable} value={template.settings?.modality ?? "PRESENCIAL"} onChange={(e) => changeTemplateModality(e.target.value as DeliveryModality)}>{(["PRESENCIAL","SEMIPRESENCIAL","E_LEARNING"] as DeliveryModality[]).map((m) => <option key={m} value={m}>{modalityLabel(m)}</option>)}</select></label> : null}
    </div>

    <div className="subpanel"><div className="panel-header"><div><h3>Parámetros y reglas de la plantilla</h3><p>Cada parámetro anual puede tener un factor de actualización manual que se propaga a todos los años.</p></div><button className="button secondary" disabled={!editable} onClick={() => { const kind: TemplateItemKind = "PARAMETRO_ANUAL"; replace({ ...template, items: [...template.items, { id: uid("template-item"), key: uid("item"), kind, name: kindLabel(kind), active: true, position: template.items.length, config: defaultConfig(kind, years) }] }); }}>Agregar fila</button></div>
      <div className="template-items">{template.items.map((item, index) => <div key={item.key} className="template-item-card">
        <div className="template-item-main"><label>Tipo<select disabled={!editable} value={item.kind} onChange={(e) => { const kind = e.target.value as TemplateItemKind; updateItem(index, { kind, name: kindLabel(kind), config: defaultConfig(kind, years) }); }}>{KINDS.map((kind) => <option key={kind} value={kind}>{kindLabel(kind)}</option>)}</select></label><label>Nombre<input disabled={!editable} value={item.name} onChange={(e) => updateItem(index, { name: e.target.value })} /></label><label>Activa<select disabled={!editable} value={item.active ? "1":"0"} onChange={(e) => updateItem(index, { active: e.target.value === "1" })}><option value="1">Sí</option><option value="0">No</option></select></label><button className="text-button danger-text" disabled={!editable} onClick={() => replace({ ...template, items: template.items.filter((_, i) => i !== index) })}>Quitar</button></div>
        <ItemConfig item={item} years={years} programType={activeType} parameters={parameters} disabled={!editable} onChange={(patch) => updateConfig(index, patch)} />
      </div>)}</div>
    </div>

    <SharedCoursesEditor template={template} programs={programs} disabled={!editable} onChange={(sharedCourses) => replace({ ...template, settings: { ...(template.settings ?? {}), sharedCourses } })} />
  </section>;
}

function ItemConfig({ item, years, programType, parameters, disabled, onChange }: { item: BudgetTemplateItem; years: number[]; programType: ProgramType; parameters: InstitutionalParameters | null; disabled: boolean; onChange: (patch: Record<string, unknown>) => void }) {
  const config = item.config as Record<string, unknown>;
  if (item.kind === "PARAMETRO_ANUAL") {
    const parameter = String(config.parameter ?? "ARANCEL") as AnnualTemplateParameter;
    const values = (config.values && typeof config.values === "object" ? config.values : {}) as Record<number, number>;
    const rate = Number(config.annualAdjustmentRate ?? 0);
    const applyRate = () => {
      const baseYear = years.find((year) => Number(values[year]) > 0) ?? years[0]; const base = Number(values[baseYear] ?? 0);
      const next = { ...values }; years.forEach((year) => { if (year >= baseYear) next[year] = Math.round(base * Math.pow(1 + rate, year - baseYear)); }); onChange({ values: next });
    };
    const loadReference = () => onChange({ values: annualReferenceValues(parameter, programType, parameters, years), annualAdjustmentRate: rate || parameters?.annualAdjustmentRate || 0 });
    return <div className="template-annual-row"><label>Parámetro<select disabled={disabled} value={parameter} onChange={(e) => { const nextParameter = e.target.value as AnnualTemplateParameter; onChange({ parameter: nextParameter, values: annualReferenceValues(nextParameter, programType, parameters, years) }); }}>{ANNUAL_PARAMETERS.map((p) => <option key={p} value={p}>{annualLabel[p]}</option>)}</select></label>{years.map((year) => <label key={year}>{year}<input disabled={disabled} type="number" min="0" value={Number(values[year] ?? 0)} onChange={(e) => onChange({ values: { ...values, [year]: Number(e.target.value) } })} /></label>)}<label>Ajuste anual (%)<input disabled={disabled} type="number" step="0.1" value={(rate * 100).toFixed(1)} onChange={(e) => onChange({ annualAdjustmentRate: Number(e.target.value) / 100 })} /></label><div className="field-action"><button className="button secondary" disabled={disabled || !parameters} onClick={loadReference}>Cargar referencia institucional</button><button className="button secondary" disabled={disabled} onClick={applyRate}>Aplicar ajuste a todos los años</button></div></div>;
  }
  if (item.kind === "DESCUENTO") return <div className="template-item-config"><label>Descuento (%)<input disabled={disabled} type="number" min="0" max="100" value={Number(config.percentage ?? 0) * 100} onChange={(e) => onChange({ percentage: Number(e.target.value) / 100 })} /></label><label>Estudiantes<input disabled={disabled} type="number" min="0" value={Number(config.students ?? 0)} onChange={(e) => onChange({ students: Number(e.target.value) })} /></label></div>;
  if (item.kind === "BECA_ARANCEL") return <div className="template-item-config"><label>Cantidad<input disabled={disabled} type="number" min="0" value={Number(config.students ?? 0)} onChange={(e) => onChange({ students: Number(e.target.value), studentMode: "CANTIDAD" })} /></label><label>Cobertura (%)<input disabled={disabled} type="number" min="0" max="100" value={Number(config.coverage ?? 1) * 100} onChange={(e) => onChange({ coverage: Number(e.target.value) / 100 })} /></label></div>;
  if (item.kind === "BECA_MANUTENCION") return <div className="template-item-config"><label>Cantidad<input disabled={disabled} type="number" min="0" value={Number(config.students ?? 0)} onChange={(e) => onChange({ students: Number(e.target.value), studentMode: "CANTIDAD" })} /></label><label>Meses<input disabled={disabled} type="number" min="0" value={Number(config.months ?? 0)} onChange={(e) => onChange({ months: Number(e.target.value) })} /></label></div>;
  if (item.kind === "COSTO") return <div className="template-item-config"><label>Categoría<select disabled={disabled} value={String(config.category ?? "Otros costos y gastos")} onChange={(e) => onChange({ category: e.target.value })}>{COST_CATEGORIES.map((c) => <option key={c}>{c}</option>)}</select></label><label>Monto<input disabled={disabled} type="number" min="0" value={Number(config.amount ?? 0)} onChange={(e) => onChange({ amount: Number(e.target.value) })} /></label><label>Periodicidad<select disabled={disabled} value={String(config.periodicity ?? "Único")} onChange={(e) => onChange({ periodicity: e.target.value })}><option>Único</option><option>Semestral</option><option>Anual</option></select></label></div>;
  return <div className="template-item-config"><label>Tipo<select disabled={disabled} value={String(config.type ?? "Otro")} onChange={(e) => onChange({ type: e.target.value })}>{INCOME_TYPES.map((t) => <option key={t}>{t}</option>)}</select></label><label>Monto unitario<input disabled={disabled} type="number" min="0" value={Number(config.amountPerStudent ?? 0)} onChange={(e) => onChange({ amountPerStudent: Number(e.target.value) })} /></label><label>Estudiantes<input disabled={disabled} type="number" min="0" value={Number(config.students ?? 1)} onChange={(e) => onChange({ students: Number(e.target.value) })} /></label></div>;
}

function SharedCoursesEditor({ template, programs, disabled, onChange }: { template: BudgetTemplate; programs: Program[]; disabled: boolean; onChange: (items: SharedCourseTemplatePreset[]) => void }) {
  const items = template.settings?.sharedCourses ?? [];
  const eligible = programs.filter((p) => p.status === "Activo");
  const patch = (index: number, value: Partial<SharedCourseTemplatePreset>) => onChange(items.map((item, i) => i === index ? { ...item, ...value } : item));
  return <div className="subpanel"><div className="panel-header"><div><h3>Economías de escala y asignaturas compartidas</h3><p>Defina asignaturas que pueden compartirse entre dos o más programas, incluso de distinto tipo, y el porcentaje de costo imputable al presupuesto que use esta plantilla.</p></div><button className="button secondary" disabled={disabled} onClick={() => onChange([...items, { id: uid("shared-course"), courseName: "Asignatura compartida", semesterOffset: 1, teachingMode: template.settings?.modality === "PRESENCIAL" ? "PRESENCIAL" : "SINCRONICA", hours: 0, participantProgramIds: [], allocationRate: 0.5 }])}>Agregar asignatura compartida</button></div>
    {items.map((item, index) => <div className="shared-course-card" key={item.id}><div className="form-grid cols-4"><label>Asignatura<input disabled={disabled} value={item.courseName} onChange={(e) => patch(index, { courseName: e.target.value })} /></label><label>Semestre relativo<input disabled={disabled} type="number" min="1" max="8" value={item.semesterOffset} onChange={(e) => patch(index, { semesterOffset: Number(e.target.value) })} /></label><label>Modalidad docente<select disabled={disabled} value={item.teachingMode} onChange={(e) => patch(index, { teachingMode: e.target.value as TeachingMode })}>{(["PRESENCIAL","SINCRONICA","ASINCRONICA"] as TeachingMode[]).map((m) => <option key={m} value={m}>{teachingLabel(m)}</option>)}</select></label><label>Horas<input disabled={disabled} type="number" min="0" value={item.hours} onChange={(e) => patch(index, { hours: Number(e.target.value) })} /></label><label className="span-2">Programas participantes<select multiple disabled={disabled} value={item.participantProgramIds} onChange={(e) => patch(index, { participantProgramIds: Array.from((e.currentTarget as HTMLSelectElement).selectedOptions, (option) => option.value) })}>{eligible.map((p) => <option key={p.id} value={p.id}>{p.code} · {p.name}</option>)}</select></label><label>Porcentaje imputado (%)<input disabled={disabled} type="number" min="0" max="100" value={(item.allocationRate * 100).toFixed(1)} onChange={(e) => patch(index, { allocationRate: Number(e.target.value) / 100 })} /></label><div className="field-action"><button className="button secondary" disabled={disabled || item.participantProgramIds.length < 2} onClick={() => patch(index, { allocationRate: 1 / item.participantProgramIds.length })}>Distribuir 100 % entre programas</button><button className="text-button danger-text" disabled={disabled} onClick={() => onChange(items.filter((_, i) => i !== index))}>Quitar</button></div></div></div>)}
  </div>;
}
