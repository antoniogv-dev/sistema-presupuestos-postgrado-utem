"use client";

import { useEffect, useMemo, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { PageHeader } from "@/components/PageHeader";
import { TemplateManager } from "@/features/templates/components/TemplateManager";
import type { AccessRole, InstitutionalParameters, ProgramType, ProgramTypeParameters } from "@/lib/calculations/types";
import { institutionalParameters as fallbackParameters } from "@/lib/demo-data";
import { numberValue, responseBody, type ApiIdentity } from "@/lib/mappers/budget-api";

const scopes: Array<{ type: ProgramType; label: string }> = [
  { type: "DOCTORADO", label: "Doctorado" },
  { type: "MAGISTER_ACADEMICO", label: "Magíster académico" },
  { type: "MAGISTER_PROFESIONAL", label: "Magíster profesional" },
  { type: "OTRO", label: "Otro" },
];

const annualScopedRows: Array<{ code: string; key: keyof Pick<ProgramTypeParameters, "annualDirection" | "annualAssistance" | "referenceOperational" | "softwareLicenses" | "diffusionAdmission" | "congressesInternships" | "thesisGuidancePerGraduatingStudent">; label: string }> = [
  { code: "PROGRAM_DIRECTION", key: "annualDirection", label: "Dirección anual" },
  { code: "PROGRAM_ASSISTANCE", key: "annualAssistance", label: "Asistencia anual" },
  { code: "OPERATING_EXPENSES", key: "referenceOperational", label: "Gastos operacionales" },
  { code: "SOFTWARE_LICENSES", key: "softwareLicenses", label: "Software y licencias" },
  { code: "DIFFUSION_ADMISSION", key: "diffusionAdmission", label: "Difusión y admisión" },
  { code: "CONGRESSES_INTERNSHIPS", key: "congressesInternships", label: "Congresos y pasantías" },
  { code: "THESIS_GUIDANCE", key: "thesisGuidancePerGraduatingStudent", label: "Guía de tesis por estudiante" },
];

type ParameterChange = { code: string; scope: string; year: number | null; amount: number };

function canEdit(roles: AccessRole[]) {
  return roles.includes("ADMIN") || roles.includes("GESTOR");
}

export default function ParametersPage() {
  const [activeType, setActiveType] = useState<ProgramType>("DOCTORADO");
  const [parameters, setParameters] = useState<InstitutionalParameters>(() => structuredClone(fallbackParameters));
  const [identity, setIdentity] = useState<ApiIdentity | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    void (async () => {
      try {
        const [parameterResponse, meResponse] = await Promise.all([
          fetch("/api/parameters", { cache: "no-store" }),
          fetch("/api/me", { cache: "no-store" }),
        ]);
        setParameters(await responseBody<InstitutionalParameters>(parameterResponse));
        setIdentity(await responseBody<ApiIdentity>(meResponse));
      } catch (reason) {
        setError(reason instanceof Error ? reason.message : "No fue posible cargar los parámetros institucionales.");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const years = useMemo(() => {
    const yearSet = new Set<number>();
    Object.keys(parameters.teachingHour).forEach((year) => yearSet.add(Number(year)));
    Object.keys(parameters.annualEnrollmentFee).forEach((year) => yearSet.add(Number(year)));
    Object.keys(parameters.tuitionTemplates[activeType] ?? {}).forEach((year) => yearSet.add(Number(year)));
    return [...yearSet].filter(Number.isFinite).sort((a, b) => a - b);
  }, [parameters, activeType]);

  const editable = canEdit(identity?.roles ?? []);
  const values = parameters.byProgramType[activeType];
  const academic = activeType === "DOCTORADO" || activeType === "MAGISTER_ACADEMICO";

  function updateAnnual(key: "teachingHour" | "maintenanceScholarshipMonthly" | "annualEnrollmentFee", year: number, amount: number) {
    setParameters((current) => ({ ...current, [key]: { ...current[key], [year]: amount } }));
  }

  function updateTuitionTemplate(year: number, amount: number) {
    setParameters((current) => ({
      ...current,
      doctorateTuitionTemplate: activeType === "DOCTORADO"
        ? { ...current.doctorateTuitionTemplate, [year]: amount }
        : current.doctorateTuitionTemplate,
      tuitionTemplates: {
        ...current.tuitionTemplates,
        [activeType]: { ...current.tuitionTemplates[activeType], [year]: amount },
      },
    }));
  }

  function updateScopedAnnual(key: typeof annualScopedRows[number]["key"], year: number, amount: number) {
    setParameters((current) => ({
      ...current,
      byProgramType: {
        ...current.byProgramType,
        [activeType]: {
          ...current.byProgramType[activeType],
          [key]: { ...current.byProgramType[activeType][key], [year]: amount },
        },
      },
    }));
  }

  function updateScopedRate(key: "centralOverheadRate" | "facultyOverheadRate" | "badDebtRate", amount: number) {
    setParameters((current) => ({
      ...current,
      byProgramType: {
        ...current.byProgramType,
        [activeType]: { ...current.byProgramType[activeType], [key]: amount },
      },
    }));
  }

  function buildChanges(): ParameterChange[] {
    const changes: ParameterChange[] = [];
    for (const year of years) {
      changes.push(
        { code: "DIRECT_TEACHING_HOUR", scope: "GENERAL", year, amount: parameters.teachingHour[year] ?? 0 },
        { code: "MAINTENANCE_SCHOLARSHIP", scope: "GENERAL", year, amount: parameters.maintenanceScholarshipMonthly[year] ?? 0 },
        { code: "ANNUAL_ENROLLMENT", scope: "GENERAL", year, amount: parameters.annualEnrollmentFee[year] ?? 0 },
      );
    }
    changes.push(
      { code: "REPLACEMENT_TEACHING_HOUR", scope: "GENERAL", year: null, amount: parameters.replacementHour },
      { code: "ANNUAL_ADJUSTMENT", scope: "GENERAL", year: null, amount: parameters.annualAdjustmentRate },
      { code: "PLANNING_HORIZON", scope: "GENERAL", year: null, amount: parameters.planningHorizonYears },
    );
    for (const scope of scopes) {
      const type = scope.type;
      const scoped = parameters.byProgramType[type];
      const typeYears = [...new Set([
        ...years,
        ...Object.keys(parameters.tuitionTemplates[type] ?? {}).map(Number),
      ])].filter(Number.isFinite).sort((a, b) => a - b);
      for (const year of typeYears) {
        changes.push({ code: "TUITION_TEMPLATE", scope: type, year, amount: parameters.tuitionTemplates[type]?.[year] ?? 0 });
        for (const row of annualScopedRows) {
          changes.push({ code: row.code, scope: type, year, amount: scoped[row.key][year] ?? 0 });
        }
      }
      changes.push(
        { code: "CENTRAL_OVERHEAD", scope: type, year: null, amount: scoped.centralOverheadRate },
        { code: "FACULTY_OVERHEAD", scope: type, year: null, amount: scoped.facultyOverheadRate },
        { code: "BAD_DEBT", scope: type, year: null, amount: scoped.badDebtRate },
      );
    }
    return changes;
  }

  async function save() {
    setSaving(true);
    setMessage("");
    setError("");
    try {
      const response = await fetch("/api/parameters", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ changes: buildChanges() }),
      });
      const body = await responseBody<{ message: string; parameters: InstitutionalParameters }>(response);
      setParameters(body.parameters);
      setMessage(body.message);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "No fue posible guardar los parámetros.");
    } finally {
      setSaving(false);
    }
  }

  return <AppShell>
    <PageHeader
      eyebrow="Configuración institucional"
      title="Parámetros generales por tipo de programa"
      description="Todos los parámetros institucionales quedan editables y persistidos en Cloudflare D1."
      actions={<button className="button primary" type="button" disabled={!editable || saving || loading} onClick={() => void save()}>{saving ? "Guardando…" : "Guardar parámetros"}</button>}
    />

    {error ? <div className="notice warning"><strong>Error</strong><p>{error}</p></div> : null}
    {message ? <div className="notice success"><strong>Parámetros</strong><p>{message}</p></div> : null}
    {!editable && !loading ? <div className="notice info"><strong>Solo lectura</strong><p>Su rol puede consultar los parámetros, pero únicamente Gestión o Administración puede modificarlos.</p></div> : null}

    <TemplateManager />

    <section className="panel">
      <div className="panel-title"><div><h2>Parámetros generales comunes</h2><p>Valores compartidos por todos los tipos de programa.</p></div></div>
      <div className="form-grid parameter-editor-grid">
        <label>Hora docente de reemplazo<input disabled={!editable} type="number" min="0" value={parameters.replacementHour} onChange={(event) => setParameters({ ...parameters, replacementHour: numberValue(event.target.value) })} /></label>
        <label>Reajuste anual (%)<input disabled={!editable} type="number" min="0" step="0.01" value={(parameters.annualAdjustmentRate * 100).toFixed(2)} onChange={(event) => setParameters({ ...parameters, annualAdjustmentRate: numberValue(event.target.value) / 100 })} /></label>
        <label>Horizonte de planificación (años)<input disabled={!editable} type="number" min="1" max="20" value={parameters.planningHorizonYears} onChange={(event) => setParameters({ ...parameters, planningHorizonYears: Math.max(1, Math.round(numberValue(event.target.value))) })} /></label>
      </div>
      <div className="table-wrap"><table className="data-table parameter-edit-table"><thead><tr><th>Parámetro común</th>{years.map((year) => <th className="numeric" key={year}>{year}</th>)}</tr></thead><tbody>
        <EditableAnnualRow name="Hora docente directa" years={years} values={parameters.teachingHour} disabled={!editable} onChange={(year, value) => updateAnnual("teachingHour", year, value)} />
        <EditableAnnualRow name="Matrícula anual" years={years} values={parameters.annualEnrollmentFee} disabled={!editable} onChange={(year, value) => updateAnnual("annualEnrollmentFee", year, value)} />
        <EditableAnnualRow name="Beca mensual de atención económica" years={years} values={parameters.maintenanceScholarshipMonthly} disabled={!editable} onChange={(year, value) => updateAnnual("maintenanceScholarshipMonthly", year, value)} />
      </tbody></table></div>
    </section>

    <section className="panel">
      <div className="panel-title"><div><h2>Parámetros por tipo de programa</h2><p>Seleccione el ámbito que desea modificar.</p></div></div>
      <div className="parameter-tabs" role="tablist" aria-label="Tipo de programa">{scopes.map((scope) => <button className={`button secondary ${activeType === scope.type ? "active" : ""}`} type="button" role="tab" aria-selected={activeType === scope.type} onClick={() => setActiveType(scope.type)} key={scope.type}>{scope.label}</button>)}</div>
      <div className="form-grid parameter-editor-grid">
        <label>Overhead central (%)<input disabled={!editable} type="number" min="0" max="100" step="0.01" value={(values.centralOverheadRate * 100).toFixed(2)} onChange={(event) => updateScopedRate("centralOverheadRate", numberValue(event.target.value) / 100)} /></label>
        <label>Overhead facultad (%)<input disabled={!editable} type="number" min="0" max="100" step="0.01" value={(values.facultyOverheadRate * 100).toFixed(2)} onChange={(event) => updateScopedRate("facultyOverheadRate", numberValue(event.target.value) / 100)} /></label>
        <label>Incobrabilidad (%)<input disabled={!editable} type="number" min="0" max="100" step="0.01" value={(values.badDebtRate * 100).toFixed(2)} onChange={(event) => updateScopedRate("badDebtRate", numberValue(event.target.value) / 100)} /></label>
      </div>
      {academic ? <div className="notice info"><strong>Regla de cálculo</strong><p>Los valores de overhead pueden mantenerse como referencia institucional, pero el motor financiero aplica overhead 0 a doctorados y magísteres académicos.</p></div> : null}
      <div className="table-wrap"><table className="data-table parameter-edit-table"><thead><tr><th>Parámetro</th>{years.map((year) => <th className="numeric" key={year}>{year}</th>)}</tr></thead><tbody>
        <EditableAnnualRow name={`Plantilla de arancel · ${scopes.find((scope) => scope.type === activeType)?.label ?? activeType}`} years={years} values={parameters.tuitionTemplates[activeType]} disabled={!editable} onChange={updateTuitionTemplate} />
        {annualScopedRows.map((row) => <EditableAnnualRow key={row.code} name={row.label} years={years} values={values[row.key]} disabled={!editable} onChange={(year, value) => updateScopedAnnual(row.key, year, value)} />)}
      </tbody></table></div>
    </section>
  </AppShell>;
}

function EditableAnnualRow({ name, years, values, disabled, onChange }: { name: string; years: number[]; values: Record<number, number>; disabled: boolean; onChange: (year: number, value: number) => void }) {
  return <tr><th>{name}</th>{years.map((year) => <td key={year}><input aria-label={`${name} ${year}`} className="numeric-input" type="number" min="0" disabled={disabled} value={values[year] ?? 0} onChange={(event) => onChange(year, numberValue(event.target.value))} /></td>)}</tr>;
}
