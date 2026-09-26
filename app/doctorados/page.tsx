"use client";

import { useEffect, useMemo, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { KpiCard } from "@/components/KpiCard";
import { PageHeader } from "@/components/PageHeader";
import { formatCLP } from "@/lib/calculations/currency";
import {
  buildDoctoralRegimeProjection,
  summarizeDoctoralPortfolioYear,
  type DoctoralViewMode,
} from "@/lib/calculations/doctoral-projection";
import type { CohortBudget, InstitutionalParameters, Program } from "@/lib/calculations/types";
import { institutionalParameters as fallbackParameters } from "@/lib/demo-data";
import type { ApiBudgetRecord, ApiProgram } from "@/lib/mappers/budget-api";
import { responseBody, toBudget, toProgram } from "@/lib/mappers/budget-api";

const modeLabels: Array<{ value: DoctoralViewMode; label: string; description: string }> = [
  { value: "ANNUAL", label: "Presupuesto anual", description: "Cohortes efectivamente activas en el año seleccionado." },
  { value: "CONSOLIDATED", label: "Consolidado", description: "Una sola lectura financiera del programa, sumando sus cohortes activas." },
  { value: "REGIME", label: "Proyección en régimen", description: "Simula Año 1 + Año 2 + Año 3 + Año 4 simultáneos con parámetros del año seleccionado." },
];

export default function DoctoratesPage() {
  const [budgets, setBudgets] = useState<CohortBudget[]>([]);
  const [programs, setPrograms] = useState<Program[]>([]);
  const [parameters, setParameters] = useState<InstitutionalParameters>(() => structuredClone(fallbackParameters));
  const [year, setYear] = useState(2027);
  const [programId, setProgramId] = useState("");
  const [mode, setMode] = useState<DoctoralViewMode>("ANNUAL");
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");

  useEffect(() => {
    void (async () => {
      try {
        const [budgetRecords, programRecords, parameterValues] = await Promise.all([
          responseBody<ApiBudgetRecord[]>(await fetch("/api/budgets", { cache: "no-store" })),
          responseBody<ApiProgram[]>(await fetch("/api/programs", { cache: "no-store" })),
          responseBody<InstitutionalParameters>(await fetch("/api/parameters", { cache: "no-store" })),
        ]);
        const mappedPrograms = programRecords.map(toProgram).filter((program) => program.type === "DOCTORADO" && program.status !== "Inactivo");
        const mappedBudgets = budgetRecords.map(toBudget);
        setPrograms(mappedPrograms);
        setBudgets(mappedBudgets);
        setParameters(parameterValues);
        setProgramId((current) => current || mappedPrograms[0]?.id || "");
      } catch (reason) {
        setMessage(reason instanceof Error ? reason.message : "No fue posible cargar el módulo doctoral.");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const availableYears = useMemo(() => {
    const parameterYears = Object.keys(parameters.teachingHour).map(Number).filter(Number.isFinite);
    const budgetYears = budgets.flatMap((budget) => budget.semesters.map((semester) => semester.year));
    const years = [...new Set([...parameterYears, ...budgetYears, 2027])].sort((a, b) => a - b);
    return years.length ? years : [2027];
  }, [budgets, parameters]);

  const portfolio = useMemo(
    () => summarizeDoctoralPortfolioYear(programs, budgets, parameters, year),
    [programs, budgets, parameters, year],
  );
  const selected = portfolio.find((item) => item.program.id === programId) ?? portfolio[0];
  const regime = useMemo(
    () => selected ? buildDoctoralRegimeProjection(selected.program, budgets, parameters, year) : null,
    [selected, budgets, parameters, year],
  );

  const portfolioExpenses = portfolio.reduce((acc, item) => acc + item.totalExpenses, 0);
  const portfolioStudents = portfolio.reduce((acc, item) => acc + item.totalStudents, 0);
  const portfolioCohorts = portfolio.reduce((acc, item) => acc + item.cohorts.length, 0);
  const currentMode = modeLabels.find((item) => item.value === mode) ?? modeLabels[0];

  return <AppShell>
    <PageHeader
      eyebrow="Planificación doctoral"
      title="Presupuesto y proyección de doctorados"
      description="Una sola base de cálculo para visualizar cohortes, consolidado anual y programa en régimen, sin incorporar ejecución presupuestaria."
    />
    {message ? <div className="notice warning"><p>{message}</p></div> : null}

    <section className="panel">
      <div className="panel-title"><div><h2>Escenario</h2><p>{currentMode.description}</p></div></div>
      <div className="form-grid">
        <label>Año presupuestario
          <select value={year} onChange={(event) => setYear(Number(event.target.value))}>
            {availableYears.map((item) => <option value={item} key={item}>{item}</option>)}
          </select>
        </label>
        <label>Programa doctoral
          <select value={selected?.program.id ?? ""} onChange={(event) => setProgramId(event.target.value)}>
            {programs.map((program) => <option value={program.id} key={program.id}>{program.code} · {program.name}</option>)}
          </select>
        </label>
      </div>
      <div className="consolidation-tabs" role="tablist" aria-label="Vista doctoral">
        {modeLabels.map((item) => <button
          key={item.value}
          className="button secondary"
          type="button"
          role="tab"
          aria-selected={mode === item.value}
          onClick={() => setMode(item.value)}
        >{item.label}</button>)}
      </div>
    </section>

    <section className="kpi-grid">
      <KpiCard label="Doctorados" value={String(portfolio.length)} detail={`Programas activos · ${year}`} />
      <KpiCard label="Cohortes activas" value={String(portfolioCohorts)} detail="Formulaciones que conviven en el año" />
      <KpiCard label="Estudiantes" value={String(portfolioStudents)} detail="Máximo activo informado por cohorte en el año" />
      <KpiCard label="Egresos proyectados" value={formatCLP(portfolioExpenses)} detail="Suma de las formulaciones doctorales del año" />
    </section>

    {mode === "ANNUAL" && selected ? <section className="panel">
      <div className="panel-title"><div><h2>{selected.program.code} · cohortes activas {year}</h2><p>Cada cohorte conserva su formulación individual y utiliza los parámetros económicos vigentes del año.</p></div></div>
      <div className="table-wrap"><table className="data-table">
        <thead><tr><th>Cohorte</th><th>Año académico</th><th className="numeric">Estudiantes</th><th className="numeric">Docencia</th><th className="numeric">Dirección</th><th className="numeric">Manutención</th><th className="numeric">Congresos/Pasantías</th><th className="numeric">Total egresos</th></tr></thead>
        <tbody>{selected.cohorts.length ? selected.cohorts.map((row) => <tr key={row.budgetId}>
          <th>{row.cohortYear}</th>
          <td>Año {row.academicYear}</td>
          <td className="numeric">{row.students}</td>
          <td className="numeric">{formatCLP(row.flow.directTeachingCost + row.flow.synchronousTeachingCost + row.flow.asynchronousTeachingCost)}</td>
          <td className="numeric">{formatCLP(row.flow.direction)}</td>
          <td className="numeric">{formatCLP(row.flow.maintenanceScholarships)}</td>
          <td className="numeric">{formatCLP(row.flow.congressesInternships)}</td>
          <td className="numeric"><strong>{formatCLP(row.flow.totalExpenses)}</strong></td>
        </tr>) : <tr><td colSpan={8}>{loading ? "Cargando…" : "No existen cohortes activas para este programa y año."}</td></tr>}</tbody>
      </table></div>
    </section> : null}

    {mode === "CONSOLIDATED" && selected ? <>
      <section className="kpi-grid">
        <KpiCard label="Cohortes del programa" value={String(selected.cohorts.length)} detail={selected.cohorts.map((item) => String(item.cohortYear)).join(" · ") || "Sin cohortes"} />
        <KpiCard label="Estudiantes consolidados" value={String(selected.totalStudents)} detail={`${selected.directTeachingHours.toLocaleString("es-CL")} horas docentes planificadas`} />
        <KpiCard label="Dirección anual" value={formatCLP(selected.direction)} detail="Suma efectiva de los prorrateos de cohorte" />
        <KpiCard label="Total programa" value={formatCLP(selected.totalExpenses)} detail={`Consolidado ${selected.program.code} ${year}`} />
      </section>
      <section className="panel">
        <div className="panel-title"><div><h2>{selected.program.code} · consolidado {year}</h2><p>Presenta el programa como una sola unidad de gestión, manteniendo trazabilidad hacia cada cohorte.</p></div></div>
        <div className="table-wrap"><table className="data-table"><thead><tr><th>Concepto</th><th className="numeric">Consolidado</th></tr></thead><tbody>
          <tr><th>Docencia directa/sincrónica/asincrónica</th><td className="numeric">{formatCLP(selected.directTeachingCost)}</td></tr>
          <tr><th>Honorarios académicos</th><td className="numeric">{formatCLP(selected.academicHonoraria)}</td></tr>
          <tr><th>Dirección</th><td className="numeric">{formatCLP(selected.direction)}</td></tr>
          <tr><th>Asistencia de dirección</th><td className="numeric">{formatCLP(selected.assistance)}</td></tr>
          <tr><th>Becas de manutención</th><td className="numeric">{formatCLP(selected.maintenanceScholarships)}</td></tr>
          <tr><th>Congresos y pasantías</th><td className="numeric">{formatCLP(selected.congressesInternships)}</td></tr>
          <tr><th>Libros y publicaciones</th><td className="numeric">{formatCLP(selected.booksPublications)}</td></tr>
          <tr><th>Pasajes y fletes</th><td className="numeric">{formatCLP(selected.travelFreight)}</td></tr>
          <tr><th>Total egresos</th><td className="numeric"><strong>{formatCLP(selected.totalExpenses)}</strong></td></tr>
        </tbody></table></div>
      </section>
    </> : null}

    {mode === "REGIME" && selected ? <section className="panel">
      <div className="panel-title"><div><h2>{selected.program.code} · proyección en régimen {year}</h2><p>Simulación con cuatro cohortes simultáneas. Dirección, asistencia y gastos comunes se distribuyen entre cuatro; Congresos y Pasantías se habilita sólo para Año 3 y Año 4.</p></div></div>
      {regime ? <>
        <div className="kpi-grid">
          <KpiCard label="Años simultáneos" value={String(regime.stages.length)} detail="Año 1 + Año 2 + Año 3 + Año 4" />
          <KpiCard label="Estudiantes de régimen" value={String(regime.totalStudents)} detail="Perfil del presupuesto doctoral de referencia" />
          <KpiCard label="Dirección anual" value={formatCLP(regime.direction)} detail="Monto anual consolidado del programa" />
          <KpiCard label="Costo anual de régimen" value={formatCLP(regime.totalExpenses)} detail={`Parámetros económicos ${year}`} />
        </div>
        <div className="table-wrap"><table className="data-table">
          <thead><tr><th>Etapa</th><th>Cohorte equivalente</th><th className="numeric">Estudiantes</th><th className="numeric">Docencia</th><th className="numeric">Dirección</th><th className="numeric">Manutención</th><th className="numeric">Congresos/Pasantías</th><th className="numeric">Total egresos</th></tr></thead>
          <tbody>{regime.stages.map((stage) => <tr key={stage.academicYear}>
            <th>Año {stage.academicYear}</th>
            <td>{stage.syntheticCohortYear}</td>
            <td className="numeric">{stage.students}</td>
            <td className="numeric">{formatCLP(stage.flow.directTeachingCost + stage.flow.synchronousTeachingCost + stage.flow.asynchronousTeachingCost)}</td>
            <td className="numeric">{formatCLP(stage.flow.direction)}</td>
            <td className="numeric">{formatCLP(stage.flow.maintenanceScholarships)}</td>
            <td className="numeric">{stage.eligibleForCongressesInternships ? formatCLP(stage.flow.congressesInternships) : "—"}</td>
            <td className="numeric"><strong>{formatCLP(stage.flow.totalExpenses)}</strong></td>
          </tr>)}</tbody>
        </table></div>
      </> : <div className="notice warning"><p>Este programa aún no tiene una formulación doctoral completa de ocho semestres que pueda utilizarse como patrón de régimen.</p></div>}
    </section> : null}

    <section className="panel">
      <div className="panel-title"><div><h2>Resumen de los cinco doctorados</h2><p>Permite controlar, en una sola vista, cuántas formulaciones deben prepararse para el año presupuestario.</p></div></div>
      <div className="table-wrap"><table className="data-table">
        <thead><tr><th>Programa</th><th className="numeric">Cohortes</th><th className="numeric">Estudiantes</th><th className="numeric">Dirección</th><th className="numeric">Manutención</th><th className="numeric">Congresos/Pasantías</th><th className="numeric">Total egresos</th></tr></thead>
        <tbody>{portfolio.map((item) => <tr key={item.program.id}>
          <th>{item.program.code}</th><td className="numeric">{item.cohorts.length}</td><td className="numeric">{item.totalStudents}</td>
          <td className="numeric">{formatCLP(item.direction)}</td><td className="numeric">{formatCLP(item.maintenanceScholarships)}</td>
          <td className="numeric">{formatCLP(item.congressesInternships)}</td><td className="numeric"><strong>{formatCLP(item.totalExpenses)}</strong></td>
        </tr>)}</tbody>
      </table></div>
    </section>
  </AppShell>;
}
