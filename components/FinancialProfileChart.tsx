import { formatCLP } from "@/lib/calculations/currency";

interface FinancialYearRow { year: number; grossIncome: number; normalizedExpenses: number; netFlow: number }

export function FinancialProfileChart({ rows }: { rows: FinancialYearRow[] }) {
  if (!rows.length) return <div className="chart-empty">Sin información financiera consolidada para graficar.</div>;
  const width = 760;
  const height = 270;
  const padX = 46;
  const padTop = 24;
  const padBottom = 42;
  const plotHeight = height - padTop - padBottom;
  const maxValue = Math.max(1, ...rows.flatMap((row) => [row.grossIncome, row.normalizedExpenses]));
  const groupWidth = (width - padX * 2) / rows.length;
  const barWidth = Math.min(42, groupWidth * 0.28);
  const y = (value: number) => padTop + plotHeight - (Math.max(0, value) / maxValue) * plotHeight;
  const barHeight = (value: number) => (Math.max(0, value) / maxValue) * plotHeight;

  return <div className="financial-visual">
    <div className="chart-legend" aria-hidden="true"><span><i className="legend-income" />Ingresos</span><span><i className="legend-expense" />Egresos normalizados</span></div>
    <svg className="financial-chart" role="img" aria-label="Comparación anual de ingresos y egresos presupuestarios" viewBox={`0 0 ${width} ${height}`}>
      {[0.25, 0.5, 0.75, 1].map((ratio) => <line key={ratio} className="chart-gridline" x1={padX} x2={width-padX} y1={padTop + plotHeight * (1-ratio)} y2={padTop + plotHeight * (1-ratio)} />)}
      {rows.map((row, index) => {
        const center = padX + groupWidth * index + groupWidth / 2;
        const incomeX = center - barWidth - 3;
        const expenseX = center + 3;
        return <g key={row.year}>
          <rect className="chart-bar chart-income" x={incomeX} y={y(row.grossIncome)} width={barWidth} height={barHeight(row.grossIncome)} rx="5"><title>{`${row.year} · Ingresos ${formatCLP(row.grossIncome)}`}</title></rect>
          <rect className="chart-bar chart-expense" x={expenseX} y={y(row.normalizedExpenses)} width={barWidth} height={barHeight(row.normalizedExpenses)} rx="5"><title>{`${row.year} · Egresos ${formatCLP(row.normalizedExpenses)}`}</title></rect>
          <text className="chart-year" x={center} y={height-15} textAnchor="middle">{row.year}</text>
        </g>;
      })}
    </svg>
    <div className="chart-summary" aria-label="Resumen de resultado por año">{rows.map((row) => <span key={row.year}><b>{row.year}</b><strong className={`tabular-nums ${row.netFlow >= 0 ? "positive-text" : "negative-text"}`}>{formatCLP(row.netFlow)}</strong></span>)}</div>
  </div>;
}
