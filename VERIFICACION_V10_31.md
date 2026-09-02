# Verificación técnica v10.31

## Pruebas funcionales

- Compilación estricta del motor TypeScript (`tsc -p tsconfig.engine.json`): OK.
- Pruebas standalone completas: 29/29 OK.
- Generación estructural de memorándum DOCX: OK.
- Relato económico-financiero con cohorte anterior aprobada: OK.
- Anexo PDF sin parámetros semestrales ni punto de equilibrio: OK.
- Normalización de nombres `%20` y caracteres URL: OK.
- XLSX institucional v10.30 y sus pruebas de regresión: OK.
- Auditoría transversal de identidad/aislamiento: 12/12 OK.
- `preflight`: OK con configuración temporal de prueba.
- `source:audit`: OK con configuración temporal de prueba.

## Verificación visual DOCX

Se generaron y renderizaron memorándums de prueba para:

- Magíster Profesional de 2 años;
- Doctorado de 4 años.

Ambos conservaron encabezado y pie institucional, metadatos, cuerpo, viñetas, cierre y firma sin solapamientos, recortes ni páginas residuales.

## Verificación visual PDF

Se generó un PDF de cinco páginas y se revisaron todas las páginas renderizadas:

1. portada institucional;
2. flujo presupuestario;
3. relato económico-financiero;
4. tabla de evolución histórica;
5. parámetros principales.

No se observaron cortes, solapamientos ni problemas de legibilidad.

## Alcance de la historia

La comparación histórica utiliza exclusivamente presupuestos `Aprobado` del mismo programa que anteceden a la cohorte actual. No se utilizan borradores, observados o revisiones intermedias como base histórica.

## Cloudflare

El build productivo seguirá ejecutando `typecheck`, `lint`, Vitest, pruebas standalone y OpenNext. La versión esperada después del despliegue es `v10.31 / 1.0.41-d1-web`.
