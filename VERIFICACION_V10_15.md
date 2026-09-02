# Verificación v10.15

- Compilación TypeScript independiente de `xlsx.ts`, `pdf.ts`, `report-model.ts` y motor financiero: correcta.
- XLSX real generado con presupuesto demo: 7 hojas.
- Primera hoja `Presupuesto completo`: contiene flujo y 134 parámetros completos en el caso de prueba.
- Verificación con `artifact_tool`: `Valor hora docencia directa` aparece en `Presupuesto completo` y `Parámetros completos`; sin errores de fórmula detectados.
- PDF real generado: 4 páginas en el caso de prueba.
- Renderizado visual: portada, flujo y parámetros en vertical.
- PDF preflight: 4 páginas, no cifrado, abrible y no escaneado.
- `preflight`: correcto con configuración de prueba.
- `source:audit`: correcto; exige marcadores v10.15.
- Sin migración D1 nueva.
