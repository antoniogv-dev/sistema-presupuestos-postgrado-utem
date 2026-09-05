import type { BudgetItem } from "../calculations/types";

export type CostCategory = BudgetItem["category"];

function normalizeText(value: unknown): string {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/**
 * Canonización vigente de categorías de costo.
 *
 * A diferencia de la migración histórica v10.11, Honorarios académicos se conserva como
 * categoría académica: no debe degradarse a Otros costos y gastos.
 */
export function canonicalCostCategory(value: unknown): CostCategory {
  const category = String(value ?? "Otros costos y gastos") as CostCategory;
  const aliases: Partial<Record<string, CostCategory>> = {
    "Honorarios académicos": "Honorarios académicos",
    "Honorarios no académicos": "Otros honorarios no académicos",
    "Asistencia": "Asistencia de dirección",
    "Gastos operacionales": "Gastos operacionales / Bienes y servicios",
    "Bienes y servicios": "Gastos operacionales / Bienes y servicios",
    "Software": "Software y licencias",
    "Congresos": "Congresos y pasantías",
    "Pasantías": "Congresos y pasantías",
    "Otros": "Otros costos y gastos",
  };
  return aliases[category] ?? category;
}

/**
 * Recupera registros legacy que fueron migrados a "Otros costos y gastos" aunque su nombre
 * describe inequívocamente una labor académica. Esto permite corregir datos históricos sin
 * reescribir D1 ni reclasificar gastos genéricos por error.
 */
export function looksLikeAcademicHonorarium(item: Pick<BudgetItem, "name" | "description">): boolean {
  const key = normalizeText(`${item.name} ${item.description}`);
  if (!key) return false;
  const academicPatterns = [
    /\bdocente\b/,
    /\bprofesor(?:a)?\b/,
    /\bacademic[oa]\b/,
    /\brelator(?:a)?\b/,
    /\bdocencia\b/,
    /\btesista\b/,
    /\bguia de tesis\b/,
    /\brevisor(?:a)? de tesis\b/,
    /\bevaluador(?:a)? academic[oa]\b/,
    /\bcomision de tesis\b/,
  ];
  return academicPatterns.some((pattern) => pattern.test(key));
}

export function effectiveCostCategory(item: Pick<BudgetItem, "category" | "name" | "description">): CostCategory {
  const category = canonicalCostCategory(item.category);
  if (category === "Honorarios académicos") return category;
  if (category === "Otros costos y gastos" && looksLikeAcademicHonorarium(item)) return "Honorarios académicos";
  return category;
}

export function costBelongsToCategories(
  item: Pick<BudgetItem, "category" | "name" | "description">,
  categories: readonly CostCategory[],
): boolean {
  return categories.includes(effectiveCostCategory(item));
}
