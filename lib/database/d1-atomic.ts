import { d1Database } from "@/lib/runtime-env";

/**
 * Identificadores estables para escrituras SQL directas en D1.
 * Las tablas usan TEXT como clave primaria, por lo que UUID es suficiente.
 */
export function d1Id(prefix: string): string {
  return `${prefix}-${crypto.randomUUID()}`;
}

export function d1Json(value: unknown): string {
  return JSON.stringify(value, (_, item) => typeof item === "bigint" ? item.toString() : item);
}

/**
 * Ejecuta un conjunto de sentencias como batch atómico de D1.
 * D1 revierte la secuencia completa cuando una sentencia falla.
 */
export async function runD1Batch(statements: D1PreparedStatement[]): Promise<D1Result[]> {
  if (!statements.length) return [];
  return d1Database().batch(statements);
}
