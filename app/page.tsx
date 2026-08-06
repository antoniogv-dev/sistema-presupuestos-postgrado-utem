import Link from "next/link";
import { AppShell } from "@/components/AppShell";
import { KpiCard } from "@/components/KpiCard";
import { PageHeader } from "@/components/PageHeader";
import { StatusBadge } from "@/components/StatusBadge";
import { calculateBudget } from "@/lib/calculations/budget-engine";
import { formatCLP } from "@/lib/calculations/currency";
import { consolidateBudgets } from "@/lib/calculations/consolidation";
import { demoBudget, demoBudgets, institutionalParameters, programs } from "@/lib/demo-data";

export default function HomePage() {
  const budgets = demoBudgets;
  const result = calculateBudget(demoBudget, institutionalParameters);
  const consolidated = consolidateBudgets(budgets, institutionalParameters);
  const duplicateAvoided = consolidated.reduce((acc, year) => acc + year.duplicateAvoided, 0);

  return (
    <AppShell>
      <PageHeader eyebrow="Panel general" title="Control presupuestario de postgrado" description="Visión ejecutiva de programas, cohortes, viabilidad y costos compartidos." actions={<Link className="button primary" href="/presupuestos">Nuevo presupuesto</Link>} />
      <section className="kpi-grid" aria-label="Indicadores principales">
        <KpiCard label="Programas configurados" value={String(programs.length)} detail="Doctorados, magísteres académicos y profesionales" />
        <KpiCard label="Presupuestos activos" value={String(budgets.length)} detail="Gestión, V°B° y aprobación" />
        <KpiCard label="Resultado cohorte 2027" value={formatCLP(result.finalAccumulatedFlow)} detail={result.viable ? "Viable al cierre del horizonte" : "Requiere ajuste presupuestario"} tone={result.finalAccumulatedFlow >= 0 ? "positive" : "negative"} />
        <KpiCard label="Duplicidad evitada" value={formatCLP(duplicateAvoided)} detail="Costos compartidos normalizados" tone="positive" />
      </section>

      <div className="dashboard-grid">
        <section className="panel span-2">
          <div className="panel-title"><div><h2>Presupuestos recientes</h2><p>Seguimiento de versiones y estado de revisión.</p></div><Link href="/presupuestos">Ver todos</Link></div>
          <div className="table-wrap"><table className="data-table"><thead><tr><th>Programa y cohorte</th><th>Periodo</th><th>Estado</th><th>Versión</th><th className="numeric">Resultado final</th></tr></thead><tbody>{budgets.map((budget) => { const budgetResult = calculateBudget(budget, institutionalParameters); return <tr key={budget.id}><td><strong>{budget.program.code}</strong><small>{budget.cohortName}</small></td><td>{budget.startYear}-{budget.startSemester} · {budget.durationSemesters} sem.</td><td><StatusBadge status={budget.status} /></td><td>v{budget.version}</td><td className={`numeric ${budgetResult.finalAccumulatedFlow >= 0 ? "positive-text" : "negative-text"}`}>{formatCLP(budgetResult.finalAccumulatedFlow)}</td></tr>; })}</tbody></table></div>
        </section>
        <aside className="panel">
          <div className="panel-title"><div><h2>Alertas de gestión</h2><p>Controles que requieren atención.</p></div></div>
          <div className="alert-list">
            <article><span className="alert-dot warning" /><div><strong>Validar gastos compartidos 2028</strong><p>Dos cohortes del MGP coinciden en el periodo.</p></div></article>
            <article><span className="alert-dot info" /><div><strong>Versión en borrador</strong><p>La cohorte 2027 aún no ha sido enviada a revisión.</p></div></article>
            <article><span className="alert-dot success" /><div><strong>Motor financiero consistente</strong><p>No se detecta doble incobrabilidad.</p></div></article>
          </div>
        </aside>
      </div>

      <section className="panel">
        <div className="panel-title"><div><h2>Consolidado por año</h2><p>Ingresos, egresos normalizados y duplicidad evitada.</p></div><Link href="/consolidado">Abrir consolidado</Link></div>
        <div className="table-wrap"><table className="data-table"><thead><tr><th>Año</th><th className="numeric">Ingresos</th><th className="numeric">Egresos brutos</th><th className="numeric">Duplicidad evitada</th><th className="numeric">Flujo normalizado</th></tr></thead><tbody>{consolidated.map((year) => <tr key={year.year}><th>{year.year}</th><td className="numeric">{formatCLP(year.grossIncome)}</td><td className="numeric">{formatCLP(year.grossExpenses)}</td><td className="numeric positive-text">{formatCLP(year.duplicateAvoided)}</td><td className={`numeric ${year.netFlow >= 0 ? "positive-text" : "negative-text"}`}>{formatCLP(year.netFlow)}</td></tr>)}</tbody></table></div>
      </section>
    </AppShell>
  );
}
