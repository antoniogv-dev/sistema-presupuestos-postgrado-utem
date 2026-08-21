import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { inflateRawSync } from "node:zlib";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const { demoBudget, institutionalParameters } = await import(path.join(root, ".engine-build/lib/demo-data.js"));
const { calculateBudget } = await import(path.join(root, ".engine-build/lib/calculations/budget-engine.js"));
const { createBudgetMemorandumDocx } = await import(path.join(root, ".engine-build/lib/export/memorandum.js"));

function u16(view, offset) { return view.getUint16(offset, true); }
function u32(view, offset) { return view.getUint32(offset, true); }
function unzip(bytes) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let end = -1;
  for (let offset = bytes.length - 22; offset >= Math.max(0, bytes.length - 65557); offset -= 1) {
    if (u32(view, offset) === 0x06054b50) { end = offset; break; }
  }
  assert.ok(end >= 0);
  const count = u16(view, end + 10);
  let central = u32(view, end + 16);
  const files = new Map();
  const decoder = new TextDecoder();
  for (let index = 0; index < count; index += 1) {
    const method = u16(view, central + 10);
    const size = u32(view, central + 20);
    const nameLength = u16(view, central + 28);
    const extra = u16(view, central + 30);
    const comment = u16(view, central + 32);
    const local = u32(view, central + 42);
    const name = decoder.decode(bytes.subarray(central + 46, central + 46 + nameLength));
    const localName = u16(view, local + 26);
    const localExtra = u16(view, local + 28);
    const start = local + 30 + localName + localExtra;
    const compressed = bytes.subarray(start, start + size);
    files.set(name, method === 0 ? new Uint8Array(compressed) : new Uint8Array(inflateRawSync(compressed)));
    central += 46 + nameLength + extra + comment;
  }
  return files;
}

test("v10.31 genera memorándum institucional trazable desde el presupuesto", async () => {
  const budget = structuredClone(demoBudget);
  const result = calculateBudget(budget, institutionalParameters);
  const template = new Uint8Array(readFileSync(path.join(root, "public/templates/memorandum-presupuesto-base-v10-31.docx")));
  const bytes = await createBudgetMemorandumDocx(template, budget, result, institutionalParameters);
  const files = unzip(bytes);
  assert.ok(files.has("word/header1.xml"));
  assert.ok(files.has("word/footer1.xml"));
  const documentXml = new TextDecoder().decode(files.get("word/document.xml"));
  for (const text of [
    "MEMORÁNDUM N.º",
    budget.program.name,
    "Flujo de estudiantes e ingresos",
    "Valores base y reajustes",
    "Costos académicos y docencia",
    "resultado económico",
    "DR. JORGE RODRÍGUEZ BECERRA",
  ]) assert.ok(documentXml.includes(text), `falta ${text}`);
  assert.ok(bytes.length > 20_000);
});
