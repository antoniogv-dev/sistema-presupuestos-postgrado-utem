# Verificación v10.9

Versión: `1.0.19-d1-web` / release `v10.9`.

## Verificaciones ejecutadas

- Compilación independiente del motor financiero mediante `tsc -p tsconfig.engine.json`: correcta.
- `preflight`: correcto con 5 migraciones.
- `source:audit`: correcto; sólo advertencias esperadas por placeholders del `wrangler.jsonc` de distribución.
- Migraciones `0001` a `0005` aplicadas secuencialmente sobre SQLite limpio: correctas.
- Backfill v10.9 probado con arancel 2027 positivo y 2028 almacenado en cero: 2028 hereda correctamente el arancel válido anterior.
- Prueba del motor: arancel particular distinto por 2027 y 2028 se respeta en cada flujo anual.
- Prueba del motor: `Alimentos y bebidas` se incorpora a `totalExpenses`.
- Reporte financiero: no contiene filas `Descuentos matrícula` ni `Matrícula neta`; sí contiene `Alimentos y bebidas`.

## Validación final en Cloudflare

El build productivo debe ejecutar la instalación completa de dependencias, Prisma, TypeScript, ESLint, Vitest y OpenNext. Tras el deploy comprobar `/api/version` y un presupuesto real de dos o más años.
