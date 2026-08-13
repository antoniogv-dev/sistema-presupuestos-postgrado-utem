"use client";

import { useEffect, useMemo, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { PageHeader } from "@/components/PageHeader";
import { calculateBudget } from "@/lib/calculations/budget-engine";
import { buildConsolidationGroups } from "@/lib/calculations/consolidation";
import type { CohortBudget, InstitutionalParameters } from "@/lib/calculations/types";
import { institutionalParameters as fallbackParameters } from "@/lib/demo-data";
import { downloadAuditCsv, downloadBudgetPdf, downloadBudgetXlsx, downloadConsolidationCsv, downloadConsolidationXlsx } from "@/lib/export/download";
import type { ApiBudgetRecord } from "@/lib/mappers/budget-api";
import { responseBody, toBudget } from "@/lib/mappers/budget-api";

export default function ImportExportPage() {
  const [budgets, setBudgets] = useState<CohortBudget[]>([]);
  const [parameters, setParameters] = useState<InstitutionalParameters>(() => structuredClone(fallbackParameters));
  const [selectedId, setSelectedId] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void (async () => {
      try {
        const [budgetRecords, parameterValues] = await Promise.all([
          responseBody<ApiBudgetRecord[]>(await fetch("/api/budgets", { cache: "no-store" })),
          responseBody<InstitutionalParameters>(await fetch("/api/parameters", { cache: "no-store" })),
        ]);
        const mapped = budgetRecords.map(toBudget);
        setBudgets(mapped);
        setParameters(parameterValues);
        setSelectedId(mapped[0]?.id ?? "");
      } catch (reason) {
        setMessage(reason instanceof Error ? reason.message : "No fue posible cargar la información para exportar.");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const selected = budgets.find((budget) => budget.id === selectedId);
  const result = useMemo(() => selected ? calculateBudget(selected, parameters) : null, [selected, parameters]);
  const institutional = useMemo(() => buildConsolidationGroups(budgets, parameters).find((group) => group.id === "institutional"), [budgets, parameters]);

  function runExport(action: () => void, success: string) {
    try {
      action();
      setMessage(success);
    } catch (reason) {
      setMessage(reason instanceof Error ? reason.message : "No fue posible completar la exportación.");
    }
  }

  return <AppShell>
    <PageHeader eyebrow="Interoperabilidad" title="Importar y exportar" description="Exportaciones operativas desde los presupuestos y consolidados almacenados en D1." />
    {message ? <div className="notice info"><p>{message}</p></div> : null}
    <div className="dashboard-grid">
      <section className="panel">
        <div className="panel-title"><div><h2>Importar presupuesto</h2><p>La importación masiva permanece preparada como una función posterior, con validación antes de guardar.</p></div></div>
        <div className="upload-zone"><strong>Importación controlada</strong><p>Formatos previstos: .xlsx y .csv. La carga se habilitará cuando se defina la plantilla institucional de entrada.</p><button className="button secondary" type="button" disabled>Seleccionar archivo</button></div>
        <div className="notice info"><strong>Control previo</strong><p>La futura importación deberá mostrar diferencias de columnas, tipos y fórmulas antes de persistir información en D1.</p></div>
      </section>

      <section className="panel">
        <div className="panel-title"><div><h2>Exportaciones</h2><p>Seleccione un presupuesto para exportar su flujo individual o auditoría.</p></div></div>
        <label>Presupuesto<select value={selectedId} disabled={loading || !budgets.length} onChange={(event) => setSelectedId(event.target.value)}><option value="">Seleccione</option>{budgets.map((budget) => <option key={budget.id} value={budget.id}>{budget.program.code} · {budget.cohortName} · Versión {budget.programVersionLabel} · R{budget.version}</option>)}</select></label>
        <div className="export-list enabled-exports">
          <button type="button" disabled={!selected || !result} onClick={() => selected && result && runExport(() => downloadBudgetXlsx(selected, result, parameters), "Flujo individual exportado a Excel.")}><span><strong>Flujo individual</strong><small>Excel (.xlsx) con flujo y hoja de parámetros utilizados</small></span><span>Exportar XLSX</span></button>
          <button type="button" disabled={!selected || !result} onClick={() => selected && result && runExport(() => downloadBudgetPdf(selected, result, parameters), "Reporte de viabilidad exportado a PDF.")}><span><strong>Reporte de viabilidad</strong><small>PDF con flujo y anexo de parámetros utilizados</small></span><span>Exportar PDF</span></button>
          <button type="button" disabled={!institutional?.rows.length} onClick={() => institutional && runExport(() => downloadConsolidationXlsx(institutional), "Consolidado institucional exportado a Excel.")}><span><strong>Consolidado institucional</strong><small>Excel (.xlsx) con ingresos, egresos, normalización y flujo neto</small></span><span>Exportar XLSX</span></button>
          <button type="button" disabled={!institutional?.rows.length} onClick={() => institutional && runExport(() => downloadConsolidationCsv(institutional), "Consolidado institucional exportado a CSV.")}><span><strong>Consolidado institucional · datos</strong><small>CSV por año para análisis complementario</small></span><span>Exportar CSV</span></button>
          <button type="button" disabled={!selected} onClick={() => selected && runExport(() => downloadAuditCsv(selected), "Detalle de auditoría exportado a CSV.")}><span><strong>Detalle de auditoría</strong><small>CSV de revisiones y cambios de flujo</small></span><span>Exportar CSV</span></button>
        </div>
      </section>
    </div>
  </AppShell>;
}
