"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { KpiCard } from "@/components/KpiCard";
import { PageHeader } from "@/components/PageHeader";
import { StatusBadge } from "@/components/StatusBadge";
import { FinancialProfileChart } from "@/components/FinancialProfileChart";
import { calculateBudget } from "@/lib/calculations/budget-engine";
import { buildConsolidationGroups, detectPotentialDuplicateCosts } from "@/lib/calculations/consolidation";
import { formatCLP } from "@/lib/calculations/currency";
import type { CohortBudget, InstitutionalParameters } from "@/lib/calculations/types";
import { institutionalParameters as fallbackParameters } from "@/lib/demo-data";
import type { ApiBudgetRecord, ApiProgram } from "@/lib/mappers/budget-api";
import { responseBody, toBudget } from "@/lib/mappers/budget-api";

function percentage(value: number, total: number) {
  return total > 0 ? Math.round((value / total) * 100) : 0;
}

export default function HomePage() {
  const [budgets, setBudgets] = useState<CohortBudget[]>([]);
  const [programs, setPrograms] = useState<ApiProgram[]>([]);
  const [parameters, setParameters] = useState<InstitutionalParameters>(() => structuredClone(fallbackParameters));
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");

  useEffect(() => {
    void (async () => {
      try {
        const [budgetRecords, programRecords, parameterValues] = await Promise.all([
          responseBody<ApiBudgetRecord[]>(await fetch("/api/budgets", { cache: "no-store" })),
          responseBody<ApiProgram[]>(await fetch("/api/programs?includeInactive=1", { cache: "no-store" })),
          responseBody<InstitutionalParameters>(await fetch("/api/parameters", { cache: "no-store" })),
        ]);
        setBudgets(budgetRecords.map(toBudget));
        setPrograms(programRecords);
        setParameters(parameterValues);
      } catch (reason) {
        setMessage(reason instanceof Error ? reason.message : "No fue posible cargar el panel institucional.");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const institutional = useMemo(
    () => buildConsolidationGroups(budgets, parameters).find((group) => group.id === "institutional-active"),
    [budgets, parameters],
  );
  const duplicateAlerts = useMemo(() => detectPotentialDuplicateCosts(budgets), [budgets]);
  const duplicateAvoided = institutional?.rows.reduce((acc, row) => acc + row.duplicateAvoided, 0) ?? 0;
  const recent = budgets.slice(0, 6);
  const activePrograms = programs.filter((program) => program.status === "ACTIVO").length;
  const activeBudgets = budgets.filter((budget) => ["En revisión", "Observado", "Aprobado"].includes(budget.status));
  const reviewPending = activeBudgets.filter((budget) => budget.workflowStage !== "FINALIZADO").length;
  const lastRow = institutional?.rows.at(-1);
  const finalResult = lastRow?.netFlow ?? 0;
  const statusCounts = {
    approved: budgets.filter((budget) => budget.status === "Aprobado").length,
    review: budgets.filter((budget) => budget.status === "En revisión").length,
    observed: budgets.filter((budget) => budget.status === "Observado").length,
    draft: budgets.filter((budget) => budget.status === "Borrador").length,
  };
  const totalStatus = Math.max(1, budgets.length);
  const approvedEnd = percentage(statusCounts.approved, totalStatus);
  const reviewEnd = approvedEnd + percentage(statusCounts.review, totalStatus);
  const observedEnd = reviewEnd + percentage(statusCounts.observed, totalStatus);
  const donutStyle = budgets.length ? {
    background: `conic-gradient(#2563EB 0 ${approvedEnd}%, #10B981 ${approvedEnd}% ${reviewEnd}%, #F59E0B ${reviewEnd}% ${observedEnd}%, #CBD5E1 ${observedEnd}% 100%)`,
  } : { background: "#E2E8F0" };

  return <AppShell>
    <PageHeader
      eyebrow="Panel general"
      title="Control presupuestario de postgrado"
      description="Visión ejecutiva de programas, cohortes, resultados y alertas financieras institucionales."
      actions={<Link className="button primary" href="/presupuestos"><span aria-hidden="true">＋</span> Nuevo presupuesto</Link>}
    />

    {message ? <div className="notice warning"><strong>Panel</strong><p>{message}</p></div> : null}

    <section className="kpi-grid kpi-grid-five" aria-label="Indicadores principales">
      <KpiCard label="Programas activos" value={loading ? "…" : String(activePrograms)} detail={`${programs.length} programas registrados`} />
      <KpiCard label="Presupuestos activos" value={loading ? "…" : String(activeBudgets.length)} detail={`${reviewPending} en proceso de revisión`} />
      <KpiCard label="Ingresos consolidados" value={loading ? "…" : formatCLP(lastRow?.grossIncome ?? 0)} detail={lastRow ? `Año ${lastRow.year}` : "Sin información disponible"} tone="positive" />
      <KpiCard label="Egresos normalizados" value={loading ? "…" : formatCLP(lastRow?.normalizedExpenses ?? 0)} detail={`${formatCLP(duplicateAvoided)} de duplicidad evitada`} tone="warning" />
      <KpiCard label="Flujo consolidado" value={loading ? "…" : formatCLP(finalResult)} detail={lastRow ? `Resultado del año ${lastRow.year}` : "Sin flujo disponible"} tone={finalResult >= 0 ? "positive" : "negative"} />
    </section>

    <div className="executive-analytics-grid">
      <section className="panel financial-engine-panel analytics-main">
        <div className="panel-title"><div><span className="panel-kicker">ANÁLISIS FINANCIERO</span><h2>Ingresos y egresos institucionales</h2><p>Comparación anual de presupuestos activos. Los borradores no se incorporan al consolidado.</p></div><Link href="/consolidado">Ver consolidado</Link></div>
        <FinancialProfileChart rows={institutional?.rows ?? []} />
      </section>

      <aside className="panel status-overview-panel">
        <div className="panel-title"><div><span className="panel-kicker">PORTAFOLIO</span><h2>Estado de presupuestos</h2><p>Distribución de las cohortes registradas.</p></div><Link href="/versiones">Gestionar</Link></div>
        <div className="status-donut-layout">
          <div className="status-donut" style={donutStyle} aria-label={`${budgets.length} presupuestos registrados`}><div><strong className="tabular-nums">{loading ? "…" : budgets.length}</strong><span>Total</span></div></div>
          <div className="status-legend">
            <div><i className="dot-approved"/><span>Aprobados</span><strong className="tabular-nums">{statusCounts.approved}</strong></div>
            <div><i className="dot-review"/><span>En revisión</span><strong className="tabular-nums">{statusCounts.review}</strong></div>
            <div><i className="dot-observed"/><span>Observados</span><strong className="tabular-nums">{statusCounts.observed}</strong></div>
            <div><i className="dot-draft"/><span>Borradores</span><strong className="tabular-nums">{statusCounts.draft}</strong></div>
          </div>
        </div>
        <div className="portfolio-progress"><div><span>Aprobación del portafolio</span><strong className="tabular-nums">{percentage(statusCounts.approved, totalStatus)}%</strong></div><span className="progress-track"><i style={{ width: `${percentage(statusCounts.approved, totalStatus)}%` }} /></span></div>
      </aside>
    </div>

    <div className="dashboard-grid premium-dashboard-grid">
      <section className="panel span-2 recent-budget-panel">
        <div className="panel-title"><div><span className="panel-kicker">ACTIVIDAD</span><h2>Presupuestos recientes</h2><p>Seguimiento de las últimas cohortes persistidas en Cloudflare D1.</p></div><Link href="/presupuestos">Ver todos</Link></div>
        <div className="table-wrap"><table className="data-table"><thead><tr><th>Programa y cohorte</th><th>Periodo</th><th>Estado</th><th>Versión</th><th className="numeric">Resultado final</th></tr></thead><tbody>
          {recent.length ? recent.map((budget) => {
            const result = calculateBudget(budget, parameters);
            return <tr key={budget.id}><td><strong>{budget.program.code}</strong><small>{budget.cohortName}</small></td><td>{budget.startYear}-{budget.startSemester} · {budget.durationSemesters} sem.</td><td><StatusBadge status={budget.status} /></td><td>Versión {budget.programVersionLabel}<small>Revisión R{budget.version}</small></td><td className={`numeric ${result.finalAccumulatedFlow >= 0 ? "positive-text" : "negative-text"}`}>{formatCLP(result.finalAccumulatedFlow)}</td></tr>;
          }) : <tr><td colSpan={5}>{loading ? "Cargando presupuestos…" : "No existen presupuestos registrados."}</td></tr>}
        </tbody></table></div>
      </section>

      <aside className="panel management-card">
        <div className="panel-title"><div><span className="panel-kicker">CONTROL</span><h2>Alertas de gestión</h2><p>Situaciones que requieren atención.</p></div></div>
        <div className="alert-list premium-alert-list">
          {duplicateAlerts.length ? <article><span className="alert-symbol warning">!</span><div><strong>{duplicateAlerts.length} posible(s) duplicidad(es)</strong><p>Revise costos coincidentes antes del cierre.</p></div></article> : <article><span className="alert-symbol success">✓</span><div><strong>Sin duplicidades evidentes</strong><p>Los costos compartidos no presentan alertas.</p></div></article>}
          {reviewPending ? <article><span className="alert-symbol info">↗</span><div><strong>{reviewPending} presupuesto(s) en proceso</strong><p>Existen versiones pendientes de finalizar su circuito.</p></div></article> : <article><span className="alert-symbol success">✓</span><div><strong>Flujo de revisión al día</strong><p>No hay presupuestos pendientes en etapas activas.</p></div></article>}
          <article><span className="alert-symbol neutral">$</span><div><strong>{formatCLP(duplicateAvoided)} normalizados</strong><p>Duplicidad evitada en el consolidado activo.</p></div></article>
        </div>
      </aside>
    </div>

    <section className="panel annual-consolidation-panel">
      <div className="panel-title"><div><span className="panel-kicker">DETALLE</span><h2>Consolidado por año</h2><p>Ingresos, egresos normalizados, duplicidad evitada y resultado financiero.</p></div><Link href="/consolidado">Abrir análisis completo</Link></div>
      <div className="table-wrap"><table className="data-table"><thead><tr><th>Año</th><th className="numeric">Ingresos</th><th className="numeric">Egresos brutos</th><th className="numeric">Duplicidad evitada</th><th className="numeric">Flujo normalizado</th></tr></thead><tbody>
        {institutional?.rows.length ? institutional.rows.map((row) => <tr key={row.year}><th>{row.year}</th><td className="numeric">{formatCLP(row.grossIncome)}</td><td className="numeric">{formatCLP(row.grossExpenses)}</td><td className="numeric positive-text">{formatCLP(row.duplicateAvoided)}</td><td className={`numeric ${row.netFlow >= 0 ? "positive-text" : "negative-text"}`}>{formatCLP(row.netFlow)}</td></tr>) : <tr><td colSpan={5}>{loading ? "Cargando consolidado…" : "No existen datos consolidados."}</td></tr>}
      </tbody></table></div>
    </section>
  </AppShell>;
}
