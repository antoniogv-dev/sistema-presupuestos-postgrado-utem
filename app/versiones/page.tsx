"use client";

import { useEffect, useMemo, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { PageHeader } from "@/components/PageHeader";
import { StatusBadge } from "@/components/StatusBadge";
import type { ApiBudgetRecord } from "@/lib/mappers/budget-api";
import { responseBody } from "@/lib/mappers/budget-api";

type VersionRecord = {
  id: string;
  number: number;
  status: string;
  snapshot: unknown;
  changeNote?: string | null;
  createdAt: string;
};

type VersionResponse = {
  id: string;
  cohortName: string;
  program: { code: string; name: string };
  versions: VersionRecord[];
};

type Difference = { path: string; base: string; compared: string };

function displayStatus(status: string) {
  const map: Record<string, string> = {
    BORRADOR: "Borrador",
    EN_REVISION: "En revisión",
    OBSERVADO: "Observado",
    APROBADO: "Aprobado",
    REEMPLAZADO: "Reemplazado",
  };
  return map[status] ?? status;
}

function printable(value: unknown): string {
  if (value == null) return "—";
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return String(value);
  return JSON.stringify(value);
}

function flatten(value: unknown, prefix = ""): Record<string, string> {
  if (Array.isArray(value)) {
    return value.reduce<Record<string, string>>((acc, item, index) => ({ ...acc, ...flatten(item, `${prefix}[${index}]`) }), {});
  }
  if (typeof value === "object" && value !== null) {
    return Object.entries(value).reduce<Record<string, string>>((acc, [key, item]) => {
      const path = prefix ? `${prefix}.${key}` : key;
      return { ...acc, ...flatten(item, path) };
    }, {});
  }
  return { [prefix || "valor"]: printable(value) };
}

function differences(base: unknown, compared: unknown): Difference[] {
  const left = flatten(base);
  const right = flatten(compared);
  const keys = [...new Set([...Object.keys(left), ...Object.keys(right)])].sort((a, b) => a.localeCompare(b, "es-CL"));
  return keys.filter((key) => left[key] !== right[key]).map((key) => ({ path: key, base: left[key] ?? "—", compared: right[key] ?? "—" }));
}

export default function VersionsPage() {
  const [budgets, setBudgets] = useState<ApiBudgetRecord[]>([]);
  const [budgetId, setBudgetId] = useState("");
  const [data, setData] = useState<VersionResponse | null>(null);
  const [baseId, setBaseId] = useState("");
  const [compareId, setCompareId] = useState("");
  const [comparison, setComparison] = useState<Difference[] | null>(null);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void (async () => {
      try {
        const records = await responseBody<ApiBudgetRecord[]>(await fetch("/api/budgets", { cache: "no-store" }));
        setBudgets(records);
        setBudgetId(records[0]?.id ?? "");
      } catch (reason) {
        setMessage(reason instanceof Error ? reason.message : "No fue posible cargar los presupuestos.");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  useEffect(() => {
    if (!budgetId) { setData(null); return; }
    void (async () => {
      try {
        const result = await responseBody<VersionResponse>(await fetch(`/api/budgets/${budgetId}/versions`, { cache: "no-store" }));
        setData(result);
        setBaseId(result.versions[1]?.id ?? result.versions[0]?.id ?? "");
        setCompareId(result.versions[0]?.id ?? "");
        setComparison(null);
        setMessage("");
      } catch (reason) {
        setMessage(reason instanceof Error ? reason.message : "No fue posible cargar las versiones.");
      }
    })();
  }, [budgetId]);

  const versionById = useMemo(() => new Map((data?.versions ?? []).map((version) => [version.id, version])), [data]);

  function compare() {
    const base = versionById.get(baseId);
    const target = versionById.get(compareId);
    if (!base || !target) { setMessage("Seleccione dos versiones válidas."); return; }
    if (base.id === target.id) { setComparison([]); setMessage("Ha seleccionado la misma versión en ambos lados."); return; }
    setComparison(differences(base.snapshot, target.snapshot));
    setMessage("");
  }

  return <AppShell>
    <PageHeader eyebrow="Trazabilidad" title="Versiones, visto bueno y aprobación" description="Seleccione un presupuesto y compare snapshots reales almacenados en D1." />
    {message ? <div className="notice info"><p>{message}</p></div> : null}

    <section className="panel">
      <div className="panel-title"><div><h2>Seleccionar presupuesto</h2><p>La comparación se habilita sobre las versiones registradas de un presupuesto.</p></div></div>
      <label>Presupuesto<select value={budgetId} disabled={loading} onChange={(event) => setBudgetId(event.target.value)}><option value="">Seleccione</option>{budgets.map((budget) => <option key={budget.id} value={budget.id}>{budget.program.code} · {budget.cohortName}</option>)}</select></label>
    </section>

    <section className="panel">
      <div className="panel-title"><div><h2>Comparar versiones</h2><p>{data ? `${data.program.name} · ${data.cohortName}` : "Seleccione un presupuesto para comenzar."}</p></div></div>
      <div className="version-compare-controls">
        <label>Revisión interna base<select value={baseId} disabled={!data?.versions.length} onChange={(event) => setBaseId(event.target.value)}>{data?.versions.map((version) => <option value={version.id} key={version.id}>Revisión R{version.number} · {displayStatus(version.status)}</option>)}</select></label>
        <label>Revisión interna a comparar<select value={compareId} disabled={!data?.versions.length} onChange={(event) => setCompareId(event.target.value)}>{data?.versions.map((version) => <option value={version.id} key={version.id}>Revisión R{version.number} · {displayStatus(version.status)}</option>)}</select></label>
        <button className="button primary" type="button" disabled={!baseId || !compareId || (data?.versions.length ?? 0) < 2} onClick={compare}>Comparar versiones</button>
      </div>
      {(data?.versions.length ?? 0) < 2 ? <div className="notice info"><p>Se requieren al menos dos versiones para generar una comparación.</p></div> : null}
      {comparison ? <div className="table-wrap"><table className="data-table version-diff-table"><thead><tr><th>Campo</th><th>Revisión interna base</th><th>Versión comparada</th></tr></thead><tbody>{comparison.length ? comparison.map((item) => <tr key={item.path}><th>{item.path}</th><td>{item.base}</td><td>{item.compared}</td></tr>) : <tr><td colSpan={3}>No se detectaron diferencias entre las versiones seleccionadas.</td></tr>}</tbody></table></div> : null}
    </section>

    <section className="panel">
      <div className="panel-title"><div><h2>Historial del presupuesto</h2><p>Versiones persistidas con fecha, estado y nota de cambio.</p></div></div>
      <div className="timeline">{data?.versions.length ? data.versions.map((entry) => <article key={entry.id}><div className="timeline-marker">V{entry.number}</div><div className="timeline-content"><div><StatusBadge status={displayStatus(entry.status)} /><time>{new Date(entry.createdAt).toLocaleString("es-CL")}</time></div><h3>{entry.changeNote || "Versión presupuestaria"}</h3><p>Snapshot inmutable de la versión {entry.number}.</p></div></article>) : <p>No existen versiones para mostrar.</p>}</div>
    </section>
  </AppShell>;
}
