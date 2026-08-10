"use client";

import { useEffect, useMemo, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { KpiCard } from "@/components/KpiCard";
import { PageHeader } from "@/components/PageHeader";
import { buildConsolidationGroups, detectPotentialDuplicateCosts } from "@/lib/calculations/consolidation";
import { formatCLP } from "@/lib/calculations/currency";
import type { CohortBudget, InstitutionalParameters } from "@/lib/calculations/types";
import { institutionalParameters as fallbackParameters } from "@/lib/demo-data";
import { downloadConsolidationXlsx } from "@/lib/export/download";
import type { ApiBudgetRecord } from "@/lib/mappers/budget-api";
import { responseBody, toBudget } from "@/lib/mappers/budget-api";

export default function ConsolidatedPage() {
  const [budgets, setBudgets] = useState<CohortBudget[]>([]);
  const [parameters, setParameters] = useState<InstitutionalParameters>(() => structuredClone(fallbackParameters));
  const [groupId, setGroupId] = useState("institutional");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void (async () => {
      try {
        const [budgetRecords, parameterValues] = await Promise.all([
          responseBody<ApiBudgetRecord[]>(await fetch("/api/budgets", { cache: "no-store" })),
          responseBody<InstitutionalParameters>(await fetch("/api/parameters", { cache: "no-store" })),
        ]);
        setBudgets(budgetRecords.map(toBudget));
        setParameters(parameterValues);
      } catch (reason) {
        setMessage(reason instanceof Error ? reason.message : "No fue posible cargar el consolidado institucional.");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const groups = useMemo(() => buildConsolidationGroups(budgets, parameters), [budgets, parameters]);
  const group = groups.find((candidate) => candidate.id === groupId) ?? groups.find((candidate) => candidate.id === "institutional") ?? groups[0];
  const principal = groups.filter((candidate) => candidate.kind !== "PROGRAM");
  const programs = groups.filter((candidate) => candidate.kind === "PROGRAM");

  const selectedBudgets = useMemo(() => {
    if (!group) return [];
    if (group.kind === "PROGRAM") return budgets.filter((budget) => `program-${budget.program.id}` === group.id);
    if (group.kind === "ACADEMIC") return budgets.filter((budget) => budget.program.type === "DOCTORADO" || budget.program.type === "MAGISTER_ACADEMICO");
    if (group.kind === "PROFESSIONAL") return budgets.filter((budget) => budget.program.type === "MAGISTER_PROFESIONAL");
    return budgets;
  }, [budgets, group]);

  if (!group) {
    return <AppShell><PageHeader eyebrow="Consolidación" title="Consolidado institucional" description="No existen presupuestos para consolidar." />{message ? <div className="notice warning"><p>{message}</p></div> : null}<section className="panel"><p>{loading ? "Cargando…" : "Aún no existen presupuestos persistidos en D1."}</p></section></AppShell>;
  }

  const income = group.rows.reduce((acc, row) => acc + row.grossIncome, 0);
  const normalizedExpenses = group.rows.reduce((acc, row) => acc + row.normalizedExpenses, 0);
  const avoided = group.rows.reduce((acc, row) => acc + row.duplicateAvoided, 0);
  const duplicateAlerts = detectPotentialDuplicateCosts(selectedBudgets);

  function exportConsolidated() {
    try {
      downloadConsolidationXlsx(group);
      setMessage(`Se generó el consolidado “${group.label}” en formato Excel.`);
    } catch (reason) {
      setMessage(reason instanceof Error ? reason.message : "No fue posible exportar el consolidado.");
    }
  }

  return <AppShell>
    <PageHeader eyebrow="Consolidación" title={group.label} description="Consolidado real de los presupuestos almacenados en D1, con normalización de costos compartidos." actions={<button className="button secondary" type="button" disabled={!group.rows.length} onClick={exportConsolidated}>Exportar consolidado</button>} />
    {message ? <div className="notice info"><p>{message}</p></div> : null}
    <section className="panel"><div className="panel-title"><div><h2>Vista de consolidación</h2><p>Seleccione una agrupación institucional o un programa específico.</p></div></div><div className="consolidation-tabs" role="tablist" aria-label="Consolidados institucionales">{principal.map((item) => <button className="button secondary" role="tab" type="button" aria-selected={group.id === item.id} onClick={() => setGroupId(item.id)} key={item.id}>{item.label}</button>)}</div><label>Consolidado por programa<select value={group.kind === "PROGRAM" ? group.id : ""} onChange={(event) => event.target.value && setGroupId(event.target.value)}><option value="">Seleccione un programa</option>{programs.map((item) => <option value={item.id} key={item.id}>{item.label}</option>)}</select></label></section>
    <section className="kpi-grid"><KpiCard label="Presupuestos incluidos" value={String(group.budgetCount)} detail={group.label} /><KpiCard label="Ingresos consolidados" value={formatCLP(income)} detail="Total del horizonte visible" /><KpiCard label="Duplicidad evitada" value={formatCLP(avoided)} detail="Costos compartidos normalizados" tone="positive" /><KpiCard label="Resultado neto" value={formatCLP(income-normalizedExpenses)} detail="Flujo consolidado" tone={income-normalizedExpenses >= 0 ? "positive" : "negative"} /></section>
    {duplicateAlerts.length > 0 && <section className="panel duplicate-alerts" aria-labelledby="duplicate-alert-title"><div className="panel-title"><div><h2 id="duplicate-alert-title">Posibles duplicidades</h2><p>Coincidencias por programa, año, categoría y nombre del costo.</p></div></div>{duplicateAlerts.map((alert) => <article key={alert.key}><strong>{alert.name} · {alert.year}</strong><p>{alert.message} {alert.allMarkedShared ? "Está marcado como compartido y será normalizado cuando corresponda." : "Revise si debe marcarse como compartido."}</p></article>)}</section>}
    <section className="panel"><div className="table-wrap"><table className="data-table"><thead><tr><th>Año</th><th className="numeric">Ingresos</th><th className="numeric">Egresos brutos</th><th className="numeric">Egresos normalizados</th><th className="numeric">Duplicidad evitada</th><th className="numeric">Flujo neto</th></tr></thead><tbody>{group.rows.length ? group.rows.map((row) => <tr key={row.year}><th>{row.year}</th><td className="numeric">{formatCLP(row.grossIncome)}</td><td className="numeric">{formatCLP(row.grossExpenses)}</td><td className="numeric">{formatCLP(row.normalizedExpenses)}</td><td className="numeric positive-text">{formatCLP(row.duplicateAvoided)}</td><td className={`numeric ${row.netFlow >= 0 ? "positive-text" : "negative-text"}`}>{formatCLP(row.netFlow)}</td></tr>) : <tr><td colSpan={6}>{loading ? "Cargando…" : "No existen presupuestos en esta agrupación."}</td></tr>}</tbody></table></div></section>
    <section className="panel"><div className="panel-title"><div><h2>Regla aplicada</h2><p>No duplicidad de costos compartidos por programa.</p></div></div><div className="explanation-grid"><div><strong>Clave de normalización</strong><p>Programa + año + tipo de costo compartido.</p></div><div><strong>Programas académicos</strong><p>Doctorados y magísteres académicos, ambos sin overhead en el cálculo.</p></div><div><strong>Programas profesionales</strong><p>Magísteres profesionales con evaluación de viabilidad.</p></div></div></section>
  </AppShell>;
}
