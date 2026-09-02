import test from "node:test";
import assert from "node:assert/strict";
import { demoBudget, institutionalParameters } from "../../.engine-build/lib/demo-data.js";
import { consolidateBudgets } from "../../.engine-build/lib/calculations/consolidation.js";

function cohort(id, withSharedItem, periodicity = "Único") {
  const budget = structuredClone(demoBudget);
  budget.id = id;
  budget.program = { ...budget.program, id: "programa-consolidado-v1201" };
  budget.normalizeSharedCosts = true;
  budget.manualItems = withSharedItem ? [{
    id: `shared-${id}`,
    name: "Licencia institucional compartida",
    description: "Costo compartido para prueba de normalización",
    category: "Software y licencias",
    year: budget.startYear,
    amount: 1_000_000,
    costType: "Compartido con otras cohortes",
    periodicity,
  }] : [];
  return budget;
}

test("v12.0.1: un costo manual compartido se normaliza una sola vez", () => {
  const base = consolidateBudgets([cohort("a", false), cohort("b", false)], institutionalParameters);
  const shared = consolidateBudgets([cohort("a", true), cohort("b", true)], institutionalParameters);
  const base2027 = base.find((row) => row.year === 2027);
  const shared2027 = shared.find((row) => row.year === 2027);
  assert.ok(base2027 && shared2027);
  assert.equal(shared2027.grossExpenses - base2027.grossExpenses, 2_000_000);
  assert.equal(shared2027.duplicateAvoided - base2027.duplicateAvoided, 1_000_000);
  assert.equal(shared2027.normalizedExpenses - base2027.normalizedExpenses, 1_000_000);
});

test("v12.0.1: la normalización manual respeta la periodicidad anual efectiva", () => {
  const base = consolidateBudgets([cohort("a", false), cohort("b", false)], institutionalParameters);
  const shared = consolidateBudgets([cohort("a", true, "Anual"), cohort("b", true, "Anual")], institutionalParameters);
  for (const year of shared.map((row) => row.year)) {
    const before = base.find((row) => row.year === year);
    const after = shared.find((row) => row.year === year);
    assert.ok(before && after);
    assert.equal(after.grossExpenses - before.grossExpenses, 2_000_000);
    assert.equal(after.duplicateAvoided - before.duplicateAvoided, 1_000_000);
    assert.equal(after.normalizedExpenses - before.normalizedExpenses, 1_000_000);
  }
});
