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
    settings: record.settings && typeof record.settings === "object" ? record.settings : {},
    items: record.items.map(({ itemKey, ...item }) => ({ ...item, key: itemKey })),
  };
}
