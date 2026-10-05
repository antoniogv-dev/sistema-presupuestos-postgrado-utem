"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { PageHeader } from "@/components/PageHeader";
import type { AccessRole, ProgramType } from "@/lib/calculations/types";
import {
  academicStatusLabels,
  budgetStageLabels,
  priorityLabels,
  trackingSummary,
  type AcademicStatus,
  type BudgetStage,
  type ProgramTrackingRecord,
  type ProgramTrackingSnapshot,
  type TrackingPriority,
} from "@/lib/tracking/program-tracking";
import styles from "./seguimiento.module.css";

const typeLabels: Record<ProgramType, string> = {
  DOCTORADO: "Doctorado",
  MAGISTER_ACADEMICO: "Magíster académico",
  MAGISTER_PROFESIONAL: "Magíster profesional",
  OTRO: "Otro",
};

type Identity = { roles: AccessRole[] };
type Filters = {
  search: string;
  type: "TODOS" | ProgramType;
  academic: "TODOS" | AcademicStatus;
  budget: "TODOS" | BudgetStage;
  priority: "TODAS" | TrackingPriority;
};

const blankFilters: Filters = { search: "", type: "TODOS", academic: "TODOS", budget: "TODOS", priority: "TODAS" };

function responseMessage(value: unknown, fallback: string) {
  if (value && typeof value === "object" && "error" in value && typeof (value as { error?: unknown }).error === "string") {
    return (value as { error: string }).error;
  }
  return fallback;
}

function canEdit(roles: AccessRole[]) {
  return roles.includes("ADMIN") || roles.includes("GESTOR") || roles.includes("VISTO_BUENO") || roles.includes("APROBADOR");
}

function formatDate(value: string) {
  if (!value) return "Sin actualización";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return new Intl.DateTimeFormat("es-CL", { day: "2-digit", month: "short", year: "numeric" }).format(parsed);
}

function csvCell(value: string) {
  return `"${value.replaceAll('"', '""')}"`;
}

function statusTone(stage: BudgetStage) {
  if (stage === "APROBADO" || stage === "LISTO") return styles.success;
  if (stage === "OBSERVADO") return styles.danger;
  if (stage === "REVISION_COMITE" || stage === "EN_ACTUALIZACION") return styles.purple;
  if (stage === "REVISION_VRAF" || stage === "PASA_FIRMA") return styles.warning;
  if (stage === "EN_ELABORACION" || stage === "REVISION_DIRECCION") return styles.info;
  return styles.neutral;
}

function academicTone(status: AcademicStatus) {
  if (status === "RECIBIDO" || status === "CONFORME") return styles.success;
  if (status === "OBSERVADO") return styles.danger;
  if (status === "ENVIADO") return styles.info;
  return styles.neutral;
}

function priorityTone(priority: TrackingPriority) {
  if (priority === "ALTA") return styles.danger;
  if (priority === "MEDIA") return styles.warning;
  return styles.success;
}

export default function ProgramTrackingPage() {
  const [records, setRecords] = useState<ProgramTrackingRecord[]>([]);
  const [identity, setIdentity] = useState<Identity>({ roles: [] });
  const [filters, setFilters] = useState<Filters>(blankFilters);
  const [selectedId, setSelectedId] = useState<string>("");
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<ProgramTrackingSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [trackingResponse, meResponse] = await Promise.all([
        fetch("/api/program-tracking", { cache: "no-store" }),
        fetch("/api/me", { cache: "no-store" }),
      ]);
      const trackingBody = await trackingResponse.json().catch(() => null) as unknown;
      const meBody = await meResponse.json().catch(() => null) as unknown;
      if (!trackingResponse.ok) throw new Error(responseMessage(trackingBody, "No fue posible cargar el seguimiento."));
      setRecords(Array.isArray(trackingBody) ? trackingBody as ProgramTrackingRecord[] : []);
      if (meResponse.ok && meBody && typeof meBody === "object") setIdentity(meBody as Identity);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "No fue posible cargar el seguimiento.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const selected = useMemo(() => records.find((record) => record.programId === selectedId) ?? null, [records, selectedId]);
  const summary = useMemo(() => trackingSummary(records), [records]);

  const filtered = useMemo(() => records.filter((record) => {
    const query = filters.search.trim().toLocaleLowerCase("es-CL");
    const matchesSearch = !query || [record.code, record.name, record.director, record.faculty, record.memoNumber, record.note]
      .some((value) => value.toLocaleLowerCase("es-CL").includes(query));
    return matchesSearch
      && (filters.type === "TODOS" || record.type === filters.type)
      && (filters.academic === "TODOS" || record.academicStatus === filters.academic)
      && (filters.budget === "TODOS" || record.budgetStage === filters.budget)
      && (filters.priority === "TODAS" || record.priority === filters.priority);
  }), [records, filters]);

  function selectRecord(record: ProgramTrackingRecord) {
    setSelectedId(record.programId);
    setDraft({
      academicStatus: record.academicStatus,
      budgetStage: record.budgetStage,
      priority: record.priority,
      note: record.note,
      responsible: record.responsible,
      memoNumber: record.memoNumber,
      approvalDate: record.approvalDate,
      approvalUrl: record.approvalUrl,
    });
    setEditing(false);
    setMessage("");
  }

  async function save() {
    if (!selected || !draft) return;
    setSaving(true);
    setError("");
    setMessage("");
    try {
      const response = await fetch("/api/program-tracking", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ programId: selected.programId, ...draft }),
      });
      const body = await response.json().catch(() => null) as Record<string, unknown> | null;
      if (!response.ok) throw new Error(responseMessage(body, "No fue posible guardar el seguimiento."));
      const updatedAt = typeof body?.updatedAt === "string" ? body.updatedAt : new Date().toISOString();
      const updatedByName = typeof body?.updatedByName === "string" ? body.updatedByName : selected.updatedByName;
      setRecords((current) => current.map((record) => record.programId === selected.programId
        ? { ...record, ...draft, updatedAt, updatedByName }
        : record));
      setEditing(false);
      setMessage("Seguimiento actualizado correctamente.");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "No fue posible guardar el seguimiento.");
    } finally {
      setSaving(false);
    }
  }

  function exportCsv() {
    const header = ["Programa", "Tipo", "Informe académico", "Estado presupuesto", "Prioridad", "Responsable", "Memo", "Fecha aprobación", "Enlace", "Observación", "Última actualización"];
    const rows = filtered.map((record) => [
      `${record.code} · ${record.name}`,
      typeLabels[record.type],
      academicStatusLabels[record.academicStatus],
      budgetStageLabels[record.budgetStage],
      priorityLabels[record.priority],
      record.responsible,
      record.memoNumber,
      record.approvalDate,
      record.approvalUrl,
      record.note,
      record.updatedAt,
    ]);
    const csv = [header, ...rows].map((row) => row.map(csvCell).join(";")).join("\n");
    const blob = new Blob([`\ufeff${csv}`], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `Seguimiento-programas-${new Date().toISOString().slice(0, 10)}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  return <AppShell>
    <PageHeader
      eyebrow="Gestión"
      title="Seguimiento de programas"
      description="Control compacto de informes académicos, presupuestos y aprobaciones institucionales."
      actions={<button className="button secondary" type="button" onClick={exportCsv} disabled={!filtered.length}>Exportar seguimiento</button>}
    />

    {error ? <div className="notice warning"><strong>Atención</strong><p>{error}</p></div> : null}
    {message ? <div className="notice success"><strong>Actualización</strong><p>{message}</p></div> : null}

    <section className={styles.kpis} aria-label="Resumen del seguimiento">
      <article><span className={styles.kpiIcon}>◎</span><div><strong>{summary.total}</strong><small>Programas totales</small></div></article>
      <article><span className={`${styles.kpiIcon} ${styles.iconSuccess}`}>✓</span><div><strong>{summary.approved}</strong><small>Aprobados</small></div></article>
      <article><span className={`${styles.kpiIcon} ${styles.iconInfo}`}>▤</span><div><strong>{summary.vraf}</strong><small>En revisión VRAF</small></div></article>
      <article><span className={`${styles.kpiIcon} ${styles.iconWarning}`}>◷</span><div><strong>{summary.drafting}</strong><small>En elaboración</small></div></article>
      <article><span className={`${styles.kpiIcon} ${styles.iconDanger}`}>!</span><div><strong>{summary.observed}</strong><small>Con observaciones</small></div></article>
    </section>

    <section className={`panel ${styles.filters}`} aria-label="Filtros de seguimiento">
      <label className={styles.searchField}>Buscar programa
        <input value={filters.search} onChange={(event) => setFilters({ ...filters, search: event.target.value })} placeholder="Nombre, código, memo u observación…" />
      </label>
      <label>Tipo de programa
        <select value={filters.type} onChange={(event) => setFilters({ ...filters, type: event.target.value as Filters["type"] })}>
          <option value="TODOS">Todos</option>
          {Object.entries(typeLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select>
      </label>
      <label>Informe académico
        <select value={filters.academic} onChange={(event) => setFilters({ ...filters, academic: event.target.value as Filters["academic"] })}>
          <option value="TODOS">Todos</option>
          {Object.entries(academicStatusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select>
      </label>
      <label>Estado presupuestario
        <select value={filters.budget} onChange={(event) => setFilters({ ...filters, budget: event.target.value as Filters["budget"] })}>
          <option value="TODOS">Todos</option>
          {Object.entries(budgetStageLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select>
      </label>
      <label>Prioridad
        <select value={filters.priority} onChange={(event) => setFilters({ ...filters, priority: event.target.value as Filters["priority"] })}>
          <option value="TODAS">Todas</option>
          {Object.entries(priorityLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select>
      </label>
      <button className="button secondary" type="button" onClick={() => setFilters(blankFilters)}>Limpiar filtros</button>
    </section>

    <div className={`${styles.workspace} ${selected ? styles.withDrawer : ""}`}>
      <section className={`panel ${styles.tablePanel}`}>
        <div className={styles.tableMeta}><strong>{filtered.length}</strong><span>programas visibles</span></div>
        <div className="table-wrap">
          <table className={`data-table ${styles.table}`}>
            <thead><tr><th>Programa</th><th>Tipo</th><th>Informe académico</th><th>Estado presupuesto</th><th>Última actualización</th><th>Prioridad</th><th aria-label="Acciones" /></tr></thead>
            <tbody>
              {loading ? <tr><td colSpan={7}>Cargando seguimiento…</td></tr> : null}
              {!loading && !filtered.length ? <tr><td colSpan={7}>No hay programas que coincidan con los filtros.</td></tr> : null}
              {!loading ? filtered.map((record) => <tr key={record.programId} className={selectedId === record.programId ? styles.selectedRow : ""} onClick={() => selectRecord(record)}>
                <td><strong>{record.name}</strong><small>{record.code}</small></td>
                <td>{typeLabels[record.type]}</td>
                <td><span className={`${styles.badge} ${academicTone(record.academicStatus)}`}>{academicStatusLabels[record.academicStatus]}</span></td>
                <td><span className={`${styles.badge} ${statusTone(record.budgetStage)}`}>{budgetStageLabels[record.budgetStage]}</span></td>
                <td>{formatDate(record.updatedAt)}</td>
                <td><span className={`${styles.badge} ${priorityTone(record.priority)}`}>{priorityLabels[record.priority]}</span></td>
                <td><button className={styles.moreButton} type="button" aria-label={`Abrir ${record.name}`} onClick={(event) => { event.stopPropagation(); selectRecord(record); }}>•••</button></td>
              </tr>) : null}
            </tbody>
          </table>
        </div>
      </section>

      {selected && draft ? <aside className={styles.drawer} aria-label={`Seguimiento de ${selected.name}`}>
        <button className={styles.closeButton} type="button" onClick={() => { setSelectedId(""); setEditing(false); }} aria-label="Cerrar detalle">×</button>
        <div className={styles.drawerHeader}>
          <small>{selected.code}</small>
          <h2>{selected.name}</h2>
          <span className={`${styles.badge} ${statusTone(selected.budgetStage)}`}>{budgetStageLabels[selected.budgetStage]}</span>
        </div>

        {!editing ? <>
          <dl className={styles.compactDetails}>
            <div><dt>Tipo</dt><dd>{typeLabels[selected.type]}</dd></div>
            <div><dt>Cohorte actual</dt><dd>{selected.currentCohort}</dd></div>
            <div><dt>Informe académico</dt><dd><span className={`${styles.badge} ${academicTone(selected.academicStatus)}`}>{academicStatusLabels[selected.academicStatus]}</span></dd></div>
            <div><dt>Estado presupuestario</dt><dd><span className={`${styles.badge} ${statusTone(selected.budgetStage)}`}>{budgetStageLabels[selected.budgetStage]}</span></dd></div>
            <div><dt>Última actualización</dt><dd>{formatDate(selected.updatedAt)}</dd></div>
          </dl>

          {selected.budgetStage === "APROBADO" ? <section className={styles.approvalBox}>
            <div><strong>{selected.memoNumber || "Aprobado · documento pendiente"}</strong>{selected.approvalDate ? <small>{selected.approvalDate}</small> : null}</div>
            {selected.approvalUrl ? <a className="button primary" href={selected.approvalUrl} target="_blank" rel="noreferrer">Ver aprobación</a> : <span className={styles.pendingDocument}>Falta incorporar enlace de Drive</span>}
          </section> : null}

          {selected.note ? <section className={styles.noteBox}><strong>Observación</strong><p>{selected.note}</p></section> : null}
          {selected.responsible ? <p className={styles.responsible}>Responsable: <strong>{selected.responsible}</strong></p> : null}

          {canEdit(identity.roles) ? <button className="button secondary" type="button" onClick={() => setEditing(true)}>Editar seguimiento</button> : null}
        </> : <div className={styles.editForm}>
          <label>Informe académico<select value={draft.academicStatus} onChange={(event) => setDraft({ ...draft, academicStatus: event.target.value as AcademicStatus })}>{Object.entries(academicStatusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
          <label>Estado presupuestario<select value={draft.budgetStage} onChange={(event) => setDraft({ ...draft, budgetStage: event.target.value as BudgetStage })}>{Object.entries(budgetStageLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
          <label>Prioridad<select value={draft.priority} onChange={(event) => setDraft({ ...draft, priority: event.target.value as TrackingPriority })}>{Object.entries(priorityLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
          <label>Responsable<input value={draft.responsible} onChange={(event) => setDraft({ ...draft, responsible: event.target.value })} placeholder="Nombre o unidad" /></label>
          <label>Observación<textarea rows={3} value={draft.note} onChange={(event) => setDraft({ ...draft, note: event.target.value })} placeholder="Próximo paso o antecedente relevante" /></label>

          {draft.budgetStage === "APROBADO" ? <div className={styles.approvalFields}>
            <strong>Antecedentes de aprobación</strong>
            <label>N.º de memo<input value={draft.memoNumber} onChange={(event) => setDraft({ ...draft, memoNumber: event.target.value })} placeholder="257/2026" /></label>
            <label>Fecha de aprobación<input type="date" value={draft.approvalDate} onChange={(event) => setDraft({ ...draft, approvalDate: event.target.value })} /></label>
            <label>Enlace a Google Drive<input type="url" value={draft.approvalUrl} onChange={(event) => setDraft({ ...draft, approvalUrl: event.target.value })} placeholder="https://drive.google.com/…" /></label>
            <small>El archivo permanece en Drive; la plataforma guarda sólo el enlace y la trazabilidad.</small>
          </div> : null}

          <div className={styles.formActions}>
            <button className="button primary" type="button" onClick={() => void save()} disabled={saving}>{saving ? "Guardando…" : "Guardar"}</button>
            <button className="button secondary" type="button" onClick={() => { setEditing(false); selectRecord(selected); }} disabled={saving}>Cancelar</button>
          </div>
        </div>}
      </aside> : null}
    </div>
  </AppShell>;
}
