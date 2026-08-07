"use client";

import { useEffect, useState } from "react";
import type {
  BudgetTemplate,
  BudgetTemplateConfig,
  BudgetTemplateItem,
  CostTemplateConfig,
  DiscountTemplateConfig,
  IncomeTemplateConfig,
  MaintenanceScholarshipTemplateConfig,
  ProgramType,
  TemplateItemKind,
  TuitionScholarshipTemplateConfig,
} from "@/lib/calculations/types";
import { defaultBudgetTemplates } from "@/lib/templates/default-templates";

const STORAGE_KEY = "utem-postgrado-budget-templates-v5";
const KINDS: TemplateItemKind[] = [
  "DESCUENTO",
  "BECA_ARANCEL",
  "BECA_MANUTENCION",
  "COSTO",
  "INGRESO_EXTRAORDINARIO",
];
const TYPES: ProgramType[] = [
  "DOCTORADO",
  "MAGISTER_ACADEMICO",
  "MAGISTER_PROFESIONAL",
];

const typeLabel = (type: ProgramType): string =>
  ({
    DOCTORADO: "Doctorado",
    MAGISTER_ACADEMICO: "Magíster académico",
    MAGISTER_PROFESIONAL: "Magíster profesional",
    OTRO: "Otro",
  })[type];

const kindLabel = (kind: TemplateItemKind): string =>
  ({
    DESCUENTO: "Descuento",
    BECA_ARANCEL: "Beca de excelencia académica (arancel)",
    BECA_MANUTENCION: "Beca de atención económica (manutención)",
    COSTO: "Costo o gasto",
    INGRESO_EXTRAORDINARIO: "Ingreso extraordinario",
  })[kind];

const uid = (prefix: string): string =>
  `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

type ApiTemplateItem = Omit<BudgetTemplateItem, "key"> & {
  key?: string;
  itemKey?: string;
};

type ApiBudgetTemplate = Omit<BudgetTemplate, "description" | "items"> & {
  description?: string | null;
  items: ApiTemplateItem[];
};

function normalizeTemplate(record: ApiBudgetTemplate): BudgetTemplate {
  return {
    ...record,
    description: record.description ?? "",
    items: record.items.map((item) => {
      const { key, itemKey, ...rest } = item;
      return {
        ...rest,
        key: key ?? itemKey ?? uid("item"),
      };
    }),
  };
}

function defaultConfig(kind: TemplateItemKind): BudgetTemplateConfig {
  switch (kind) {
    case "DESCUENTO":
      return {
        percentage: 0,
        students: 0,
        periodMode: "TODOS",
      } satisfies DiscountTemplateConfig;
    case "BECA_ARANCEL":
      return {
        studentMode: "TODOS_ACTIVOS",
        students: 0,
        coverage: 1,
        periodMode: "TODOS",
      } satisfies TuitionScholarshipTemplateConfig;
    case "BECA_MANUTENCION":
      return {
        studentMode: "TODOS_ACTIVOS",
        students: 0,
        months: 0,
        periodMode: "TODOS",
      } satisfies MaintenanceScholarshipTemplateConfig;
    case "COSTO":
      return {
        category: "Otros",
        amount: 0,
        costType: "Único de esta versión",
        periodicity: "Único",
      } satisfies CostTemplateConfig;
    case "INGRESO_EXTRAORDINARIO":
      return {
        type: "Otro",
        students: 1,
        amountPerStudent: 0,
        source: "Plantilla",
      } satisfies IncomeTemplateConfig;
  }
}

function patchConfig(
  config: BudgetTemplateConfig,
  key: string,
  value: unknown,
): BudgetTemplateConfig {
  const next: BudgetTemplateConfig = { ...config };
  (next as unknown as Record<string, unknown>)[key] = value;
  return next;
}

function apiErrorMessage(body: unknown): string {
  if (typeof body !== "object" || body === null || !("error" in body)) {
    return "No fue posible completar la operación.";
  }
  const value = (body as { error?: unknown }).error;
  return typeof value === "string" && value.trim()
    ? value
    : "No fue posible completar la operación.";
}

async function responseBody<T>(response: Response): Promise<T> {
  const body: unknown = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(apiErrorMessage(body));
  return body as T;
}

export function TemplateManager() {
  const [templates, setTemplates] = useState<BudgetTemplate[]>(defaultBudgetTemplates);
  const [activeType, setActiveType] = useState<ProgramType>("DOCTORADO");
  const [message, setMessage] = useState("");

  const template =
    templates.find((item) => item.programType === activeType) ?? templates[0];

  useEffect(() => {
    void fetch("/api/templates", { cache: "no-store" })
      .then((response) => responseBody<ApiBudgetTemplate[]>(response))
      .then((records) => setTemplates(records.map(normalizeTemplate)))
      .catch(() => {
        try {
          const saved = localStorage.getItem(STORAGE_KEY);
          if (saved) setTemplates(JSON.parse(saved) as BudgetTemplate[]);
        } catch {
          // Se conservan las plantillas predeterminadas.
        }
      });
  }, []);

  if (!template) return null;

  const replace = (next: BudgetTemplate) =>
    setTemplates((current) =>
      current.map((item) => (item.id === next.id ? next : item)),
    );

  const updateItem = <K extends keyof BudgetTemplateItem>(
    index: number,
    field: K,
    value: BudgetTemplateItem[K],
  ) => {
    replace({
      ...template,
      items: template.items.map((item, candidate) =>
        candidate === index ? { ...item, [field]: value } : item,
      ),
    });
  };

  const updateConfig = (index: number, key: string, value: unknown) => {
    replace({
      ...template,
      items: template.items.map((item, candidate) =>
        candidate === index
          ? { ...item, config: patchConfig(item.config, key, value) }
          : item,
      ),
    });
  };

  const changeKind = (index: number, kind: TemplateItemKind) => {
    replace({
      ...template,
      items: template.items.map((item, candidate) =>
        candidate === index
          ? {
              ...item,
              kind,
              name: kindLabel(kind),
              config: defaultConfig(kind),
            }
          : item,
      ),
    });
  };

  const addItem = () => {
    const kind: TemplateItemKind = "DESCUENTO";
    replace({
      ...template,
      items: [
        ...template.items,
        {
          id: uid("template-item"),
          key: uid("item"),
          kind,
          name: kindLabel(kind),
          active: true,
          position: template.items.length,
          config: defaultConfig(kind),
        },
      ],
    });
  };

  const removeItem = (index: number) => {
    replace({
      ...template,
      items: template.items.filter((_, candidate) => candidate !== index),
    });
  };

  async function save() {
    const payload = {
      name: template.name,
      description: template.description,
      active: template.active,
      items: template.items.map((item, index) => ({
        ...item,
        position: index,
        config: item.config,
      })),
    };

    try {
      const response = await fetch(`/api/templates/${template.id}`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      const saved = await responseBody<ApiBudgetTemplate>(response);
      replace(normalizeTemplate(saved));
      setMessage("Plantilla actualizada en la base institucional.");
    } catch {
      const next = { ...template, version: template.version + 1 };
      replace(next);
      const updated = templates.map((item) =>
        item.id === next.id ? next : item,
      );
      localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
      setMessage("Plantilla actualizada en modo local.");
    }
  }

  return (
    <section className="panel template-manager">
      <div className="panel-header">
        <div>
          <h2>Plantillas presupuestarias editables</h2>
          <p>
            Los cambios sólo afectan nuevos usos o presupuestos donde se vuelva a
            aplicar la plantilla.
          </p>
        </div>
        <button className="button primary" type="button" onClick={save}>
          Guardar plantilla
        </button>
      </div>

      {message ? <div className="notice success">{message}</div> : null}

      <div className="parameter-tabs">
        {TYPES.map((type) => (
          <button
            key={type}
            type="button"
            className={`tab-button ${activeType === type ? "active" : ""}`}
            onClick={() => setActiveType(type)}
          >
            {typeLabel(type)}
          </button>
        ))}
      </div>

      <div className="form-grid">
        <label>
          Nombre
          <input
            value={template.name}
            onChange={(event) =>
              replace({ ...template, name: event.target.value })
            }
          />
        </label>
        <label className="span-2">
          Descripción
          <input
            value={template.description}
            onChange={(event) =>
              replace({ ...template, description: event.target.value })
            }
          />
        </label>
        <label>
          Estado
          <select
            value={String(template.active)}
            onChange={(event) =>
              replace({ ...template, active: event.target.value === "true" })
            }
          >
            <option value="true">Activa</option>
            <option value="false">Inactiva</option>
          </select>
        </label>
      </div>

      <div className="template-toolbar">
        <span>Versión {template.version}</span>
        <button className="button secondary" type="button" onClick={addItem}>
          Agregar ítem
        </button>
      </div>

      <div className="template-items">
        {template.items.map((item, index) => (
          <article className="template-item-card" key={item.id}>
            <div className="template-item-head">
              <label>
                Nombre
                <input
                  value={item.name}
                  onChange={(event) =>
                    updateItem(index, "name", event.target.value)
                  }
                />
              </label>
              <label>
                Tipo
                <select
                  value={item.kind}
                  onChange={(event) =>
                    changeKind(index, event.target.value as TemplateItemKind)
                  }
                >
                  {KINDS.map((kind) => (
                    <option key={kind} value={kind}>
                      {kindLabel(kind)}
                    </option>
                  ))}
                </select>
              </label>
              <label className="compact-check">
                <input
                  type="checkbox"
                  checked={item.active}
                  onChange={(event) =>
                    updateItem(index, "active", event.target.checked)
                  }
                />
                Activo
              </label>
              <button
                className="text-button danger-text"
                type="button"
                onClick={() => removeItem(index)}
              >
                Quitar
              </button>
            </div>
            <TemplateConfig
              item={item}
              onChange={(key, value) => updateConfig(index, key, value)}
            />
          </article>
        ))}
      </div>
    </section>
  );
}

function TemplateConfig({
  item,
  onChange,
}: {
  item: BudgetTemplateItem;
  onChange: (key: string, value: unknown) => void;
}) {
  const config = item.config as unknown as Record<string, unknown>;

  if (item.kind === "DESCUENTO") {
    return (
      <div className="template-item-config">
        <label>
          Porcentaje (%)
          <input
            type="number"
            min="0"
            max="100"
            value={Number(config.percentage ?? 0) * 100}
            onChange={(event) =>
              onChange("percentage", Number(event.target.value) / 100)
            }
          />
        </label>
        <label>
          Estudiantes
          <input
            type="number"
            min="0"
            value={Number(config.students ?? 0)}
            onChange={(event) =>
              onChange("students", Number(event.target.value))
            }
          />
        </label>
      </div>
    );
  }

  if (item.kind === "BECA_ARANCEL") {
    return (
      <div className="template-item-config">
        <label>
          Estudiantes
          <select
            value={String(config.studentMode ?? "TODOS_ACTIVOS")}
            onChange={(event) => onChange("studentMode", event.target.value)}
          >
            <option value="TODOS_ACTIVOS">Todos los activos</option>
            <option value="CANTIDAD">Cantidad definida</option>
          </select>
        </label>
        <label>
          Cantidad
          <input
            type="number"
            min="0"
            value={Number(config.students ?? 0)}
            onChange={(event) =>
              onChange("students", Number(event.target.value))
            }
          />
        </label>
        <label>
          Cobertura (%)
          <input
            type="number"
            min="0"
            max="100"
            value={Number(config.coverage ?? 1) * 100}
            onChange={(event) =>
              onChange("coverage", Number(event.target.value) / 100)
            }
          />
        </label>
      </div>
    );
  }

  if (item.kind === "BECA_MANUTENCION") {
    return (
      <div className="template-item-config">
        <label>
          Estudiantes
          <select
            value={String(config.studentMode ?? "TODOS_ACTIVOS")}
            onChange={(event) => onChange("studentMode", event.target.value)}
          >
            <option value="TODOS_ACTIVOS">Todos los activos</option>
            <option value="CANTIDAD">Cantidad definida</option>
          </select>
        </label>
        <label>
          Cantidad
          <input
            type="number"
            min="0"
            value={Number(config.students ?? 0)}
            onChange={(event) =>
              onChange("students", Number(event.target.value))
            }
          />
        </label>
        <label>
          Meses por semestre
          <input
            type="number"
            min="0"
            max="12"
            value={Number(config.months ?? 0)}
            onChange={(event) =>
              onChange("months", Number(event.target.value))
            }
          />
        </label>
      </div>
    );
  }

  if (item.kind === "COSTO") {
    return (
      <div className="template-item-config">
        <label>
          Categoría
          <input
            value={String(config.category ?? "Otros")}
            onChange={(event) => onChange("category", event.target.value)}
          />
        </label>
        <label>
          Monto
          <input
            type="number"
            min="0"
            value={Number(config.amount ?? 0)}
            onChange={(event) =>
              onChange("amount", Number(event.target.value))
            }
          />
        </label>
        <label>
          Alcance
          <select
            value={String(config.costType ?? "Único de esta versión")}
            onChange={(event) => onChange("costType", event.target.value)}
          >
            <option>Único de esta versión</option>
            <option>Compartido con otras cohortes</option>
          </select>
        </label>
      </div>
    );
  }

  return (
    <div className="template-item-config">
      <label>
        Tipo
        <input
          value={String(config.type ?? "Otro")}
          onChange={(event) => onChange("type", event.target.value)}
        />
      </label>
      <label>
        Monto unitario
        <input
          type="number"
          min="0"
          value={Number(config.amountPerStudent ?? 0)}
          onChange={(event) =>
            onChange("amountPerStudent", Number(event.target.value))
          }
        />
      </label>
      <label>
        Estudiantes
        <input
          type="number"
          min="0"
          value={Number(config.students ?? 1)}
          onChange={(event) =>
            onChange("students", Number(event.target.value))
          }
        />
      </label>
    </div>
  );
}
