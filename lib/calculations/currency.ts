export const clpFormatter = new Intl.NumberFormat("es-CL", {
  style: "currency",
  currency: "CLP",
  maximumFractionDigits: 0,
});

export function formatCLP(value: number): string {
  return clpFormatter.format(Math.round(value)).replace("CLP", "$ ").replace(/\s+/g, " ").trim();
}

export function formatPercent(value: number): string {
  return new Intl.NumberFormat("es-CL", { style: "percent", maximumFractionDigits: 1 }).format(value);
}
