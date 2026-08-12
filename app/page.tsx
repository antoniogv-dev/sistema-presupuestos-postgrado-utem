"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { KpiCard } from "@/components/KpiCard";
import { PageHeader } from "@/components/PageHeader";
import { StatusBadge } from "@/components/StatusBadge";
import { calculateBudget } from "@/lib/calculations/budget-engine";
import { buildConsolidationGroups, detectPotentialDuplicateCosts } from "@/lib/calculations/consolidation";
import { formatCLP } from "@/lib/calculations/currency";
import type { CohortBudget, InstitutionalParameters } from "@/lib/calculations/types";
import { institutionalParameters as fallbackParameters } from "@/lib/demo-data";
import type { ApiBudgetRecord, ApiProgram } from "@/lib/mappers/budget-api";
import { responseBody, toBudget } from "@/lib/mappers/budget-api";

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
    () => buildConsolidationGroups(budgets, parameters).find((group) => group.id === "institutional"),
    [budgets, parameters],
  );
  const duplicateAlerts = useMemo(() => detectPotentialDuplicateCosts(budgets), [budgets]);
  const duplicateAvoided = institutional?.rows.reduce((acc, row) => acc + row.duplicateAvoided, 0) ?? 0;
  const recent = budgets.slice(0, 6);
  const activePrograms = programs.filter((program) => program.status === "ACTIVO").length;
  const reviewPending = budgets.filter((budget) => budget.workflowStage !== "FINALIZADO").length;
  const finalResult = institutional?.rows.at(-1)?.netFlow ?? 0;

  return <AppShell>
    <PageHeader
      eyebrow="Panel general"
      title="Control presupuestario de postgrado"
      description="Visión ejecutiva construida desde programas y presupuestos reales almacenados en Cloudflare D1."
      actions={<Link className="button primary" href="/presupuestos">Nuevo presupuesto</Link>}
    />

    {message ? <div className="notice warning"><strong>Panel</strong><p>{message}</p></div> : null}

    <section className="kpi-grid" aria-label="Indicadores principales">
      <KpiCard label="Programas activos" value={loading ? "…" : String(activePrograms)} detail={`${programs.length} programas registrados`} />
      <KpiCard label="Presupuestos activos" value={loading ? "…" : String(reviewPending)} detail={`${budgets.length} presupuestos vigentes en D1`} />
      <KpiCard label="Flujo consolidado último año" value={loading ? "…" : formatCLP(finalResult)} detail={institutional?.rows.at(-1) ? `Año ${institutional.rows.at(-1)?.year}` : "Sin flujo disponible"} tone={finalResult >= 0 ? "positive" : "negative"} />
      <KpiCard label="Duplicidad evitada" value={loading ? "…" : formatCLP(duplicateAvoided)} detail="Costos compartidos normalizados" tone="positive" />
    </section>

    <div className="dashboard-grid">
      <section className="panel span-2">
        <div className="panel-title"><div><h2>Presupuestos recientes</h2><p>Seguimiento de las versiones persistidas en D1.</p></div><Link href="/presupuestos">Ver todos</Link></div>
        <div className="table-wrap"><table className="data-table"><thead><tr><th>Programa y cohorte</th><th>Periodo</th><th>Estado</th><th>Versión</th><th className="numeric">Resultado final</th></tr></thead><tbody>
          {recent.length ? recent.map((budget) => {
            const result = calculateBudget(budget, parameters);
            return <tr key={budget.id}><td><strong>{budget.program.code}</strong><small>{budget.cohortName}</small></td><td>{budget.startYear}-{budget.startSemester} · {budget.durationSemesters} sem.</td><td><StatusBadge status={budget.status} /></td><td>Versión {budget.programVersionLabel}<small>Revisión R{budget.version}</small></td><td className={`numeric ${result.finalAccumulatedFlow >= 0 ? "positive-text" : "negative-text"}`}>{formatCLP(result.finalAccumulatedFlow)}</td></tr>;
          }) : <tr><td colSpan={5}>{loading ? "Cargando presupuestos…" : "No existen presupuestos registrados."}</td></tr>}
        </tbody></table></div>
      </section>

      <aside className="panel">
        <div className="panel-title"><div><h2>Alertas de gestión</h2><p>Controles derivados de la información vigente.</p></div></div>
        <div className="alert-list">
          {duplicateAlerts.length ? <article><span className="alert-dot warning" /><div><strong>{duplicateAlerts.length} posible(s) duplicidad(es)</strong><p>Revise los costos coincidentes antes del cierre.</p></div></article> : <article><span className="alert-dot success" /><div><strong>Sin duplicidades evidentes</strong><p>No se detectaron coincidencias por programa, año, categoría y nombre.</p></div></article>}
          {reviewPending ? <article><span className="alert-dot info" /><div><strong>{reviewPending} presupuesto(s) en proceso</strong><p>Existen versiones pendientes de finalizar su circuito de revisión.</p></div></article> : <article><span className="alert-dot success" /><div><strong>Flujo de revisión al día</strong><p>No hay presupuestos pendientes en las etapas activas.</p></div></article>}
        </div>
      </aside>
    </div>

    <section className="panel">
      <div className="panel-title"><div><h2>Consolidado por año</h2><p>Ingresos, egresos normalizados y duplicidad evitada.</p></div><Link href="/consolidado">Abrir consolidado</Link></div>
      <div className="table-wrap"><table className="data-table"><thead><tr><th>Año</th><th className="numeric">Ingresos</th><th className="numeric">Egresos brutos</th><th className="numeric">Duplicidad evitada</th><th className="numeric">Flujo normalizado</th></tr></thead><tbody>
        {institutional?.rows.length ? institutional.rows.map((row) => <tr key={row.year}><th>{row.year}</th><td className="numeric">{formatCLP(row.grossIncome)}</td><td className="numeric">{formatCLP(row.grossExpenses)}</td><td className="numeric positive-text">{formatCLP(row.duplicateAvoided)}</td><td className={`numeric ${row.netFlow >= 0 ? "positive-text" : "negative-text"}`}>{formatCLP(row.netFlow)}</td></tr>) : <tr><td colSpan={5}>{loading ? "Cargando consolidado…" : "No existen datos consolidados."}</td></tr>}
      </tbody></table></div>
    </section>
  </AppShell>;
}
