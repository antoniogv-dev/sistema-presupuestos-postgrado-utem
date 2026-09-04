"use client";

import { useEffect, useMemo, useState } from "react";
import { calculateBudget, hydrateAnnualOverrides } from "@/lib/calculations/budget-engine";
import { formatCLP } from "@/lib/calculations/currency";
import { adaptiveCashflowReconciliation, adaptiveCashflowValues, buildAdaptiveCashflowColumns, type CashflowViewMode } from "@/lib/finance/cashflow-view";
import type { CohortBudget, InstitutionalParameters } from "@/lib/calculations/types";
import type { ApiBudgetRecord } from "@/lib/mappers/budget-api";
import { responseBody, toBudget } from "@/lib/mappers/budget-api";

const V13_RELEASE = "v13.0.0";

type FlowField = Parameters<typeof adaptiveCashflowValues>[1];

type FlowRow = {
  label: string;
  field: FlowField;
  sign?: -1 | 1;
  total?: boolean;
  show?: (budget: CohortBudget) => boolean;
};

const incomeRows: FlowRow[] = [
  { label: "Matrícula bruta", field: "grossEnrollmentFee" },
  { label: "Descuentos matrícula", field: "enrollmentDiscounts", sign: -1 },
  { label: "Matrícula reconocida (ingreso del programa)", field: "recognizedEnrollmentFee" },
  { label: "Arancel bruto", field: "grossTuition" },
  { label: "Descuentos arancel", field: "discounts", sign: -1 },
  { label: "Beca interna de arancel", field: "internalTuitionScholarships", sign: -1, show: (budget) => budget.scholarshipsEnabled },
  { label: "Incobrabilidad", field: "badDebt", sign: -1 },
  { label: "Ingresos externos", field: "externalIncome" },
  { label: "Financiamiento institucional", field: "institutionalFinancing" },
  { label: "Otros ingresos", field: "otherIncome" },
  { label: "INGRESOS TOTAL", field: "totalIncome", total: true },
];

const costRows: FlowRow[] = [
  { label: "Docencia presencial/directa", field: "directTeachingCost", sign: -1 },
  { label: "Docencia sincrónica", field: "synchronousTeachingCost", sign: -1 },
  { label: "Docencia asincrónica", field: "asynchronousTeachingCost", sign: -1 },
  { label: "Ahorro por asignaturas compartidas", field: "sharedCourseSavings" },
  { label: "Horas docentes de reemplazo", field: "replacementTeachingCost", sign: -1 },
  { label: "Guía de tesis", field: "thesisGuidanceCost", sign: -1 },
  { label: "HONORARIOS ACADÉMICOS", field: "academicHonoraria", sign: -1, total: true },
  { label: "Dirección", field: "direction", sign: -1 },
  { label: "Asistencia de dirección", field: "assistance", sign: -1 },
  { label: "Otros honorarios no académicos", field: "otherNonAcademicHonoraria", sign: -1 },
  { label: "HONORARIOS NO ACADÉMICOS", field: "nonAcademicHonoraria", sign: -1, total: true },
  { label: "Gastos operacionales / bienes y servicios", field: "operational", sign: -1 },
  { label: "Software y licencias", field: "software", sign: -1 },
  { label: "Difusión", field: "diffusion", sign: -1 },
  { label: "Congresos y pasantías", field: "congressesInternships", sign: -1 },
  { label: "Libros y publicaciones", field: "booksPublications", sign: -1 },
  { label: "Pasajes y fletes", field: "travelFreight", sign: -1 },
  { label: "Viáticos", field: "perDiem", sign: -1 },
  { label: "Alimentos y bebidas", field: "foodBeverages", sign: -1 },
  { label: "Otros costos y gastos", field: "otherCosts", sign: -1 },
  { label: "Equipamiento", field: "equipment", sign: -1 },
  { label: "Becas de manutención", field: "maintenanceScholarships", sign: -1, show: (budget) => budget.scholarshipsEnabled },
  { label: "BECAS Y AYUDAS", field: "scholarshipsAndAid", sign: -1, total: true, show: (budget) => budget.scholarshipsEnabled },
  { label: "OTROS GASTOS", field: "otherExpenses", sign: -1, total: true },
  { label: "Base de overhead", field: "overheadBase" },
  { label: "Overhead central", field: "centralOverhead", sign: -1 },
  { label: "Overhead facultad", field: "facultyOverhead", sign: -1 },
  { label: "TOTAL COSTOS Y GASTOS", field: "totalExpenses", sign: -1, total: true },
  { label: "FLUJO NETO", field: "netFlow", total: true },
  { label: "Arrastre inicial", field: "startingCarryover" },
  { label: "SALDO FINAL ACUMULADO", field: "accumulatedFlow", total: true },
];

function enrollmentModeLabel(budget: CohortBudget): string {
  if (budget.enrollmentBillingMode === "SEMESTER") return "Matrícula semestral";
  if (budget.enrollmentBillingMode === "SINGLE_SPECIAL") return "Matrícula total / única";
  return "Matrícula anual";
}

function currentBudgetId(): string {
  if (typeof window === "undefined") return "";
  return new URLSearchParams(window.location.search).get("budget") ?? "";
}

function formatDifference(value: number): string {
  if (Math.abs(value) < 0.01) return "$0";
  return formatCLP(value);
}

export function AdaptiveCashflowPanel() {
  const [mode, setMode] = useState<CashflowViewMode>("SEMESTER");
  const [budget, setBudget] = useState<CohortBudget | null>(null);
  const [parameters, setParameters] = useState<InstitutionalParameters | null>(null);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const originalReplaceState = window.history.replaceState.bind(window.history);
    const originalPushState = window.history.pushState.bind(window.history);
    const notify = () => window.dispatchEvent(new Event("utem-budget-urlchange"));
    window.history.replaceState = ((...args: Parameters<History["replaceState"]>) => {
      originalReplaceState(...args);
      notify();
    }) as History["replaceState"];
    window.history.pushState = ((...args: Parameters<History["pushState"]>) => {
      originalPushState(...args);
      notify();
    }) as History["pushState"];
    window.addEventListener("popstate", notify);
    return () => {
      window.history.replaceState = originalReplaceState;
      window.history.pushState = originalPushState;
      window.removeEventListener("popstate", notify);
    };
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    let cancelled = false;

    const load = async () => {
      const budgetId = currentBudgetId();
      if (!budgetId) {
        if (!cancelled) {
          setBudget(null);
          setParameters(null);
          setLoading(false);
          setMessage("Seleccione o cree un presupuesto para activar la vista adaptable.");
        }
        return;
      }
      setLoading(true);
      try {
        const [record, parameterValues] = await Promise.all([
          responseBody<ApiBudgetRecord>(await fetch(`/api/budgets/${budgetId}`, { cache: "no-store" })),
          responseBody<InstitutionalParameters>(await fetch("/api/parameters", { cache: "no-store" })),
        ]);
        if (cancelled) return;
        setParameters(parameterValues);
        setBudget(hydrateAnnualOverrides(toBudget(record), parameterValues));
        setMessage("");
      } catch (reason) {
        if (!cancelled) setMessage(reason instanceof Error ? reason.message : "No fue posible cargar el flujo adaptable.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void load();
    window.addEventListener("utem-budget-urlchange", load);
    return () => {
      cancelled = true;
      window.removeEventListener("utem-budget-urlchange", load);
    };
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const updateDirtyState = () => setHasUnsavedChanges(Boolean(document.querySelector(".dirty-badge")));
    updateDirtyState();
    const observer = new MutationObserver(updateDirtyState);
    observer.observe(document.body, { childList: true, subtree: true, characterData: true, attributes: true });
    return () => observer.disconnect();
  }, []);

  const result = useMemo(() => budget && parameters ? calculateBudget(budget, parameters) : null, [budget, parameters]);
  const columns = useMemo(() => result ? buildAdaptiveCashflowColumns(result, mode) : [], [result, mode]);
  const reconciliation = useMemo(() => result ? adaptiveCashflowReconciliation(result) : null, [result]);
  const modeRows = budget ? [...incomeRows, ...costRows].filter((row) => !row.show || row.show(budget)) : [];

  if (!budget || !result) {
    return <section className="panel" id="flujo-adaptable-v13">
      <div className="section-heading"><div><span className="section-number">V13</span><h2>Flujo adaptable</h2><p>Semestral · Anual · Ciclo completo.</p></div></div>
      <div className="notice info"><p>{loading ? "Cargando presupuesto activo…" : message}</p></div>
    </section>;
  }

  const semesterIncomeDiff = reconciliation ? reconciliation.semesterIncome - reconciliation.annualIncome : 0;
  const semesterExpenseDiff = reconciliation ? reconciliation.semesterExpenses - reconciliation.annualExpenses : 0;
  const semesterNetDiff = reconciliation ? reconciliation.semesterNet - reconciliation.annualNet : 0;
  const reconciled = Math.abs(semesterIncomeDiff) < 0.01 && Math.abs(semesterExpenseDiff) < 0.01 && Math.abs(semesterNetDiff) < 0.01;

  return <section className="panel" id="flujo-adaptable-v13">
    <div className="section-heading">
      <div><span className="section-number">V13</span><h2>Flujo adaptable</h2><p>Una sola fuente de verdad con conversión instantánea Semestral / Anual / Ciclo.</p></div>
      <div className="section-action-group" role="group" aria-label="Vista del presupuesto">
        <button className={`button ${mode === "SEMESTER" ? "primary" : "secondary"}`} type="button" onClick={() => setMode("SEMESTER")}>Semestral</button>
        <button className={`button ${mode === "ANNUAL" ? "primary" : "secondary"}`} type="button" onClick={() => setMode("ANNUAL")}>Anual</button>
        <button className={`button ${mode === "CYCLE" ? "primary" : "secondary"}`} type="button" onClick={() => setMode("CYCLE")}>Ciclo</button>
      </div>
    </div>

    <div className="summary-grid">
      <div><span>Versión</span><strong>{V13_RELEASE}</strong></div>
      <div><span>Duración</span><strong>{budget.durationSemesters} semestres</strong></div>
      <div><span>Modalidad matrícula</span><strong>{enrollmentModeLabel(budget)}</strong></div>
      <div><span>Saldo final</span><strong>{formatCLP(result.finalAccumulatedFlow)}</strong></div>
    </div>

    {hasUnsavedChanges ? <div className="notice warning"><strong>Hay cambios locales sin guardar</strong><p>La vista adaptable utiliza la última versión persistida en D1. Guarde el presupuesto y se actualizará automáticamente.</p></div> : null}
    {message ? <div className="notice warning"><p>{message}</p></div> : null}
    <div className={`notice ${reconciled ? "success" : "warning"}`}>
      <strong>{reconciled ? "Conciliación correcta" : "Revisar conciliación"}</strong>
      <p>Semestral = Anual = Ciclo en el resultado acumulado. Diferencias: ingresos {formatDifference(semesterIncomeDiff)} · egresos {formatDifference(semesterExpenseDiff)} · flujo neto {formatDifference(semesterNetDiff)}.</p>
    </div>
    {mode === "SEMESTER" ? <div className="notice info"><p>Los ingresos de arancel y matrícula provienen del ledger semestral real. Los parámetros que hoy existen únicamente a nivel anual —por ejemplo parte del staff y ciertos gastos— se distribuyen proporcionalmente entre los semestres activos sólo para esta vista; su monto anual original no se modifica.</p></div> : null}

    <div className="table-wrap financial-flow">
      <table className="data-table financial-table">
        <thead><tr><th>Concepto</th>{columns.map((column) => <th className="numeric" key={column.key}>{column.label}</th>)}</tr></thead>
        <tbody>{modeRows.map((row) => {
          const values = adaptiveCashflowValues(columns, row.field).map((value) => value * (row.sign ?? 1));
          return <tr key={`${row.field}-${row.label}`} className={row.total ? "total-row" : undefined}>
            <th>{row.label}</th>
            {values.map((value, index) => <td className="numeric" key={`${row.field}-${columns[index]?.key ?? index}`}>{formatCLP(value)}</td>)}
          </tr>;
        })}</tbody>
      </table>
    </div>
  </section>;
}
