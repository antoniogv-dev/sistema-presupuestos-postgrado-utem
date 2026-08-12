"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { PageHeader } from "@/components/PageHeader";
import { StatusBadge } from "@/components/StatusBadge";
import { formatCLP } from "@/lib/calculations/currency";
import type { AccessRole, InstitutionalParameters, ProgramType, TuitionSource } from "@/lib/calculations/types";
import type { ApiIdentity, ApiProgram } from "@/lib/mappers/budget-api";
import { numberValue, responseBody, tuitionSourceFromRecord } from "@/lib/mappers/budget-api";
import { tuitionSourceForTemplate, tuitionSourceLabel } from "@/lib/programs/tuition-source";

const typeLabels: Record<ProgramType, string> = {
  DOCTORADO: "Doctorado",
  MAGISTER_ACADEMICO: "Magíster académico",
  MAGISTER_PROFESIONAL: "Magíster profesional",
  OTRO: "Otro",
};

const statusLabels = {
  ACTIVO: "Activo",
  INACTIVO: "Inactivo",
  EN_DISENO: "En diseño",
} as const;

type ProgramStatus = keyof typeof statusLabels;

type ProgramForm = {
  id?: string;
  code: string;
  name: string;
  type: ProgramType;
  faculty: string;
  director: string;
  officialDurationSemesters: number;
  status: ProgramStatus;
  costCenter: string;
  versionLabel: string;
  tuitionSource: TuitionSource;
  annualTuition: Record<number, number>;
};

type Filters = { search: string; type: "TODOS" | ProgramType; status: "TODOS" | ProgramStatus };

const blankFilters: Filters = { search: "", type: "TODOS", status: "ACTIVO" };

function emptyForm(years: number[]): ProgramForm {
  return {
    code: "",
    name: "",
    type: "DOCTORADO",
    faculty: "",
    director: "",
    officialDurationSemesters: 8,
    status: "ACTIVO",
    costCenter: "",
    versionLabel: "1",
    tuitionSource: "PLANTILLA_DOCTORADO",
    annualTuition: Object.fromEntries(years.map((year) => [year, 0])),
  };
}

function sourceFromApi(record: ApiProgram): TuitionSource {
  const values = record.annualTuitions ?? [];
  if (!values.length) return tuitionSourceForTemplate(record.type);
  if (values.some((item) => item.source === "PROPIO")) return "PROPIO";
  return tuitionSourceFromRecord(
    String(values[0]?.source ?? "PLANTILLA_DOCTORADO"),
    values[0]?.templateType,
  );
}

function formFromRecord(record: ApiProgram, years: number[]): ProgramForm {
  const annual = Object.fromEntries(years.map((year) => [year, 0]));
  for (const value of record.annualTuitions ?? []) annual[value.year] = numberValue(value.amount);
  return {
    id: record.id,
    code: record.code,
    name: record.name,
    type: record.type,
    faculty: record.faculty,
    director: record.director,
    officialDurationSemesters: record.officialDurationSemesters,
    status: record.status,
    costCenter: record.costCenter ?? "",
    versionLabel: record.versionLabel ?? "1",
    tuitionSource: sourceFromApi(record),
    annualTuition: annual,
  };
}

function canCreate(roles: AccessRole[]) {
  return roles.includes("ADMIN") || roles.includes("GESTOR") || roles.includes("CREADOR");
}

function canModify(roles: AccessRole[]) {
  return roles.includes("ADMIN") || roles.includes("GESTOR");
}

export default function ProgramsPage() {
  const [records, setRecords] = useState<ApiProgram[]>([]);
  const [parameters, setParameters] = useState<InstitutionalParameters | null>(null);
  const [identity, setIdentity] = useState<ApiIdentity | null>(null);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [draftFilters, setDraftFilters] = useState<Filters>(blankFilters);
  const [filters, setFilters] = useState<Filters>(blankFilters);
  const [showEditor, setShowEditor] = useState(false);
  const [form, setForm] = useState<ProgramForm>(() => emptyForm([2026, 2027, 2028, 2029, 2030]));

  const years = useMemo(() => {
    if (!parameters) return [2026, 2027, 2028, 2029, 2030];
    const set = new Set<number>();
    for (const table of Object.values(parameters.tuitionTemplates)) {
      Object.keys(table).forEach((year) => set.add(Number(year)));
    }
    Object.keys(parameters.annualEnrollmentFee).forEach((year) => set.add(Number(year)));
    return [...set].filter(Number.isFinite).sort((a, b) => a - b);
  }, [parameters]);

  async function load() {
    setLoading(true);
    setError("");
    try {
      const [programsResponse, parametersResponse, meResponse] = await Promise.all([
        fetch("/api/programs?includeInactive=1", { cache: "no-store" }),
        fetch("/api/parameters", { cache: "no-store" }),
        fetch("/api/me", { cache: "no-store" }),
      ]);
      const [programs, parameterValues, me] = await Promise.all([
        responseBody<ApiProgram[]>(programsResponse),
        responseBody<InstitutionalParameters>(parametersResponse),
        responseBody<ApiIdentity>(meResponse),
      ]);
      setRecords(programs);
      setParameters(parameterValues);
      setIdentity(me);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "No fue posible cargar los programas.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, []);

  useEffect(() => {
    if (!showEditor || form.id) return;
    setForm((current) => ({ ...emptyForm(years), type: current.type }));
  }, [years, showEditor, form.id]);

  const filtered = useMemo(() => records.filter((program) => {
    const search = filters.search.trim().toLocaleLowerCase("es-CL");
    const matchesSearch = !search || [program.code, program.name, program.director, program.faculty]
      .some((value) => value.toLocaleLowerCase("es-CL").includes(search));
    const matchesType = filters.type === "TODOS" || program.type === filters.type;
    const matchesStatus = filters.status === "TODOS" || program.status === filters.status;
    return matchesSearch && matchesType && matchesStatus;
  }), [records, filters]);

  function startCreate() {
    setMessage("");
    setError("");
    setForm(emptyForm(years));
    setShowEditor(true);
  }

  function startEdit(record: ApiProgram) {
    setMessage("");
    setError("");
    setForm(formFromRecord(record, years));
    setShowEditor(true);
  }

  function changeType(type: ProgramType) {
    setForm((current) => ({
      ...current,
      type,
      tuitionSource: current.tuitionSource === "PROPIO" ? "PROPIO" : tuitionSourceForTemplate(type),
    }));
  }

  function applyTuitionTemplate() {
    if (!parameters || form.tuitionSource === "PROPIO") return;
    const templateType: ProgramType = form.tuitionSource === "PLANTILLA_MAGISTER_ACADEMICO"
      ? "MAGISTER_ACADEMICO"
      : form.tuitionSource === "PLANTILLA_MAGISTER_PROFESIONAL"
        ? "MAGISTER_PROFESIONAL"
        : "DOCTORADO";
    const template = parameters.tuitionTemplates[templateType] ?? {};
    setForm((current) => ({
      ...current,
      annualTuition: Object.fromEntries(years.map((year) => [year, template[year] ?? current.annualTuition[year] ?? 0])),
    }));
    setMessage(`${tuitionSourceLabel(form.tuitionSource)} aplicada a los años disponibles.`);
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    setMessage("");
    setError("");
    try {
      const tuitionValues = years.map((year) => ({
        year,
        amount: Math.round(form.annualTuition[year] ?? 0),
        source: form.tuitionSource,
      }));
      const payload = {
        code: form.code,
        name: form.name,
        type: form.type,
        faculty: form.faculty,
        director: form.director,
        officialDurationSemesters: form.officialDurationSemesters,
        status: form.status,
        costCenter: form.costCenter || null,
        versionLabel: form.versionLabel.trim() || "1",
        annualTuitions: tuitionValues,
      };
      const programResponse = await fetch(form.id ? `/api/programs/${form.id}` : "/api/programs", {
        method: form.id ? "PUT" : "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      await responseBody<ApiProgram>(programResponse);
      await load();
      setShowEditor(false);
      setMessage(form.id ? "Programa modificado correctamente." : "Programa agregado correctamente.");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "No fue posible guardar el programa.");
    }
  }

  const roles = identity?.roles ?? [];

  return <AppShell>
    <PageHeader
      eyebrow="Maestro institucional"
      title="Programas de postgrado"
      description="Catálogo de programas, responsables, duración, centros de costo y aranceles por programa."
      actions={<button className="button primary" type="button" disabled={!canCreate(roles)} onClick={startCreate}>Agregar programa</button>}
    />

    {error ? <div className="notice warning"><strong>Error</strong><p>{error}</p></div> : null}
    {message ? <div className="notice success"><strong>Actualización</strong><p>{message}</p></div> : null}

    {showEditor ? <section className="panel program-editor">
      <div className="panel-title"><div><h2>{form.id ? "Modificar programa" : "Agregar programa"}</h2><p>Complete la ficha y defina la fuente del arancel anual.</p></div><button className="button secondary" type="button" onClick={() => setShowEditor(false)}>Cerrar</button></div>
      <form onSubmit={save}>
        <div className="form-grid program-form-grid">
          <label>Código<input required maxLength={30} value={form.code} onChange={(event) => setForm({ ...form, code: event.target.value.toUpperCase() })} /></label>
          <label className="span-2">Nombre<input required value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} /></label>
          <label>Tipo<select value={form.type} onChange={(event) => changeType(event.target.value as ProgramType)}>{Object.entries(typeLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
          <label>Facultad<input required value={form.faculty} onChange={(event) => setForm({ ...form, faculty: event.target.value })} /></label>
          <label>Director/a<input required value={form.director} onChange={(event) => setForm({ ...form, director: event.target.value })} /></label>
          <label>Duración (semestres)<input type="number" min="1" max="16" value={form.officialDurationSemesters} onChange={(event) => setForm({ ...form, officialDurationSemesters: numberValue(event.target.value) })} /></label>
          <label>Centro de costo<input value={form.costCenter} onChange={(event) => setForm({ ...form, costCenter: event.target.value })} /></label>
          <label>Versión del programa / plan<input required value={form.versionLabel} onChange={(event) => setForm({ ...form, versionLabel: event.target.value })} /></label>
          <label>Estado<select value={form.status} onChange={(event) => setForm({ ...form, status: event.target.value as ProgramStatus })}>{Object.entries(statusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
        </div>

        <div className="tuition-editor">
          <div className="panel-title"><div><h3>Arancel anual</h3><p>Puede registrar valores propios o utilizar cualquiera de las tres plantillas institucionales.</p></div></div>
          <div className="tuition-toolbar">
            <label>Fuente del arancel<select value={form.tuitionSource} onChange={(event) => setForm({ ...form, tuitionSource: event.target.value as TuitionSource })}>
              <option value="PROPIO">Arancel propio del programa</option>
              <option value="PLANTILLA_DOCTORADO">Plantilla Doctoral</option>
              <option value="PLANTILLA_MAGISTER_ACADEMICO">Plantilla Magíster Académico</option>
              <option value="PLANTILLA_MAGISTER_PROFESIONAL">Plantilla Magíster Profesional</option>
            </select></label>
            <button type="button" className="button secondary" disabled={form.tuitionSource === "PROPIO" || !parameters} onClick={applyTuitionTemplate}>Aplicar plantilla</button>
          </div>
          <div className="table-wrap"><table className="data-table"><thead><tr><th>Concepto</th>{years.map((year) => <th className="numeric" key={year}>{year}</th>)}</tr></thead><tbody><tr><th>Arancel</th>{years.map((year) => <td key={year}><input aria-label={`Arancel ${year}`} className="numeric-input" type="number" min="0" value={form.annualTuition[year] ?? 0} onChange={(event) => setForm({ ...form, annualTuition: { ...form.annualTuition, [year]: numberValue(event.target.value) } })} /></td>)}</tr></tbody></table></div>
        </div>

        <div className="form-actions-row"><button className="button primary" type="submit">{form.id ? "Guardar modificaciones" : "Agregar programa"}</button><button className="button secondary" type="button" onClick={() => setShowEditor(false)}>Cancelar</button></div>
      </form>
    </section> : null}

    <section className="panel">
      <div className="panel-title"><div><h2>Buscar y filtrar</h2><p>Defina los criterios y pulse “Aplicar filtros”.</p></div></div>
      <div className="filter-bar program-filter-bar">
        <label>Buscar programa<input type="search" placeholder="Código, nombre, director o facultad" value={draftFilters.search} onChange={(event) => setDraftFilters({ ...draftFilters, search: event.target.value })} /></label>
        <label>Tipo<select value={draftFilters.type} onChange={(event) => setDraftFilters({ ...draftFilters, type: event.target.value as Filters["type"] })}><option value="TODOS">Todos</option>{Object.entries(typeLabels).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label>
        <label>Estado<select value={draftFilters.status} onChange={(event) => setDraftFilters({ ...draftFilters, status: event.target.value as Filters["status"] })}><option value="TODOS">Todos</option>{Object.entries(statusLabels).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label>
        <div className="filter-actions"><button className="button primary" type="button" onClick={() => setFilters(draftFilters)}>Aplicar filtros</button><button className="button secondary" type="button" onClick={() => { setDraftFilters(blankFilters); setFilters(blankFilters); }}>Limpiar</button></div>
      </div>
    </section>

    <section className="panel">
      <div className="panel-title"><div><h2>Programas</h2><p>{loading ? "Cargando…" : `${filtered.length} de ${records.length} programas visibles.`}</p></div></div>
      <div className="table-wrap"><table className="data-table"><thead><tr><th>Código</th><th>Programa</th><th>Versión</th><th>Tipo</th><th>Facultad</th><th>Director</th><th>Duración</th><th className="numeric">Arancel 2027</th><th>Fuente</th><th>Estado</th><th>Acción</th></tr></thead><tbody>
        {!loading && filtered.length ? filtered.map((program) => {
          const tuition2027 = program.annualTuitions?.find((item) => item.year === 2027);
          const source = tuition2027
            ? tuitionSourceFromRecord(String(tuition2027.source), tuition2027.templateType)
            : sourceFromApi(program);
          return <tr key={program.id}>
            <th>{program.code}</th>
            <td><strong>{program.name}</strong><small>{program.costCenter ? `Centro de costo ${program.costCenter}` : "Sin centro de costo registrado"}</small></td>
            <td>{program.versionLabel ?? "1"}</td>
            <td>{typeLabels[program.type]}</td><td>{program.faculty}</td><td>{program.director}</td><td>{program.officialDurationSemesters} semestres</td>
            <td className="numeric">{formatCLP(numberValue(tuition2027?.amount))}</td><td>{tuitionSourceLabel(source)}</td><td><StatusBadge status={statusLabels[program.status]} /></td>
            <td><button className="text-button" type="button" disabled={!canModify(roles)} onClick={() => startEdit(program)}>Modificar programa</button></td>
          </tr>;
        }) : <tr><td colSpan={11}>{loading ? "Cargando programas…" : "No hay programas que coincidan con los filtros."}</td></tr>}
      </tbody></table></div>
    </section>
  </AppShell>;
}
