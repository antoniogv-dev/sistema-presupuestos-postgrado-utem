# Hotfix v12.1.2 — source audit compatible con fórmula dinámica

Reemplazar únicamente:

- `scripts/source-audit.mjs`

Motivo: el hotfix multianual cambió `breakEvenExcelFormula()` para aceptar columnas y filas dinámicas, pero `source-audit.mjs` todavía buscaba literales de la firma anterior.

La auditoría actualizada sigue verificando explícitamente:

- `export function breakEvenExcelFormula`;
- firma dinámica `yearColumnsOrLastColumn: string[] | string`;
- `LET(costosFijos`;
- aporte de arancel con `SUMPRODUCT`;
- aporte de matrícula con `SUM(Parámetros!...5)-SUM(Parámetros!...8)`;
- razón estudiantes / matrículas equivalentes;
- etiqueta `matrículas equivalentes`;
- redondeo `ROUNDUP` para estudiantes enteros.

Validación local realizada sobre v12.1.2 + hotfix multianual:

`Auditoría de código correcta, con 2 advertencia(s).`

Las dos advertencias corresponden únicamente a `CLOUDFLARE_ACCESS_TEAM_DOMAIN` y `CLOUDFLARE_ACCESS_AUD` y no bloquean el build.

No modificar `package.json`, Prisma, D1 ni `wrangler.jsonc` por este hotfix.
