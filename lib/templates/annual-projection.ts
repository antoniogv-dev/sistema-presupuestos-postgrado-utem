import type { AnnualParameterTemplateConfig } from "../calculations/types";

const finite = (value: unknown, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const nonNegative = (value: unknown) => Math.max(0, finite(value));

export function projectedAnnualValue(baseYear: number, baseValue: number, annualAdjustmentRate: number, year: number): number {
  const safeBaseYear = Math.trunc(finite(baseYear));
  const safeBaseValue = nonNegative(baseValue);
  const rate = Math.max(-0.99, finite(annualAdjustmentRate));
  if (!safeBaseYear || year < safeBaseYear) return 0;
  return Math.max(0, Math.round(safeBaseValue * Math.pow(1 + rate, year - safeBaseYear)));
}

export function projectAnnualValues(
  years: number[],
  baseYear: number,
  baseValue: number,
  annualAdjustmentRate: number,
  currentValues: Record<number, number> = {},
): Record<number, number> {
  const next: Record<number, number> = { ...currentValues };
  for (const year of years) {
    if (year < baseYear) continue;
    next[year] = projectedAnnualValue(baseYear, baseValue, annualAdjustmentRate, year);
  }
  return next;
}

export function resolveAnnualTemplateValue(config: AnnualParameterTemplateConfig, year: number): number {
  const entries = Object.entries(config.values ?? {})
    .map(([key, value]) => [Number(key), nonNegative(value)] as const)
    .filter(([key]) => Number.isFinite(key))
    .sort((a, b) => a[0] - b[0]);
  const exact = entries.find(([key]) => key === year);
  if (exact && exact[1] > 0) return exact[1];

  const configuredBaseYear = Math.trunc(finite(config.baseYear, entries[0]?.[0] ?? 0));
  const valueAtBaseYear = entries.find(([key]) => key === configuredBaseYear)?.[1] ?? 0;
  const configuredBaseValue = nonNegative(config.baseValue ?? valueAtBaseYear);
  if (configuredBaseYear > 0 && configuredBaseValue > 0 && year >= configuredBaseYear) {
    return projectedAnnualValue(configuredBaseYear, configuredBaseValue, config.annualAdjustmentRate, year);
  }

  if (!entries.length) return 0;
  const prior = [...entries].reverse().find(([key, value]) => key < year && value > 0);
  const firstPositive = entries.find(([, value]) => value > 0);
  const base = prior ?? firstPositive;
  if (!base) return 0;
  return projectedAnnualValue(base[0], base[1], config.annualAdjustmentRate, year);
}
