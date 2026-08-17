interface RawTemplateItem {
  id: string;
  itemKey: string;
  kind: string;
  name: string;
  active: boolean;
  position: number;
  config: unknown;
}

interface RawBudgetTemplate {
  id: string;
  code: string;
  name: string;
  programType: string;
  description: string | null;
  version: number;
  active: boolean;
  programId?: string | null;
  settings?: unknown;
  items: RawTemplateItem[];
}

function jsonObject(value: unknown): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value)) return value as Record<string, unknown>;
  if (typeof value === "string" && value.trim()) {
    try {
      const parsed = JSON.parse(value) as unknown;
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) return parsed as Record<string, unknown>;
    } catch {
      // Una plantilla histórica con JSON inválido se entrega como objeto vacío para que
      // la interfaz pueda corregirla y volver a guardarla en vez de quedar bloqueada.
    }
  }
  return {};
}

export function templateApiShape(record: RawBudgetTemplate) {
  return {
    id: record.id,
    code: record.code,
    name: record.name,
    programType: record.programType,
    description: record.description ?? "",
    version: record.version,
    active: record.active,
    programId: record.programId ?? undefined,
    settings: jsonObject(record.settings),
    items: record.items.map(({ itemKey, config, ...item }) => ({ ...item, key: itemKey, config: jsonObject(config) })),
  };
}
