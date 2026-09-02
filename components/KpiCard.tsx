export function KpiCard({ label, value, detail, tone = "neutral", trend }: { label: string; value: string; detail: string; tone?: "neutral" | "positive" | "negative" | "warning"; trend?: string }) {
  return (
    <article className={`kpi-card group transition-all duration-150 ease-enterprise ${tone}`}>
      <div className="kpi-card-head">
        <span className="text-xs font-medium uppercase tracking-wider">{label}</span>
        {trend ? <small className="kpi-trend tabular-nums">{trend}</small> : null}
      </div>
      <strong className="tabular-nums tracking-tight font-semibold">{value}</strong>
      <small>{detail}</small>
      <span className="kpi-accent-line" aria-hidden="true" />
    </article>
  );
}
