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
  items: RawTemplateItem[];
}

/**
 * Mantiene una forma de respuesta única para GET, POST y PUT.
 * La base usa itemKey; la interfaz pública usa key.
 */
export function templateApiShape(record: RawBudgetTemplate) {
  return {
    id: record.id,
    code: record.code,
    name: record.name,
    programType: record.programType,
    description: record.description ?? "",
    version: record.version,
    active: record.active,
    items: record.items.map(({ itemKey, ...item }) => ({
      ...item,
      key: itemKey,
    })),
  };
}
