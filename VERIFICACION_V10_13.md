# Verificación técnica v10.13

Versión: `1.0.23-d1-web`  
Release: `v10.13`

## Resultado de las verificaciones

- Compilación independiente del motor financiero con TypeScript: correcta.
- Pruebas autónomas del motor: 12/12 aprobadas.
- `preflight`: correcto con configuración local de prueba y 7 migraciones D1 detectadas.
- `source:audit`: correcto. Las advertencias locales corresponden exclusivamente a valores placeholder de Cloudflare usados para la verificación y no forman parte del paquete de actualización.
- No se agrega una migración D1 nueva en v10.13.

## Exportación XLSX

Se generó y abrió una exportación XLSX real de prueba.

- Hoja `Flujo presupuestario`: presente.
- Hoja `Parámetros completos`: presente.
- La hoja `Parámetros completos` contiene 138 filas en el caso de prueba y registra identificación, parámetros institucionales, controles, valores anuales, estudiantes, carga académica, descuentos, becas, ingresos extraordinarios, staff y costos manuales.
- Se inspeccionó el rango principal con `artifact_tool` y no se detectaron errores de fórmula (`#REF!`, `#DIV/0!`, `#VALUE!`, `#NAME?`, `#N/A`).
- Se renderizó visualmente la hoja de parámetros para verificar legibilidad y formato.

## Exportación PDF

Se generó una exportación PDF real de prueba de 5 páginas.

- Página 1: portada institucional basada en `Portada2026`, con nombre del programa en gran formato y alineación derecha, más subtítulo de versión y cohorte.
- Página 2: flujo presupuestario.
- Páginas siguientes: anexo de parámetros principales con información efectiva; se omiten datos accesorios vacíos o sin contenido relevante.
- El PDF fue preflight y renderizado nuevamente a imágenes. Resultado: 5 páginas, archivo abrible, sin cifrado y sin errores visuales detectados en las páginas revisadas.

## Costos en el flujo de caja

Los costos manuales integrados al flujo muestran una acción `Quitar` en su propia fila de trazabilidad. La acción elimina el registro de `manualItems`, por lo que deja de participar del cálculo y del flujo cuando el presupuesto se guarda nuevamente. Las filas estructurales del modelo financiero no incluyen acción de eliminación.

## Validación final en Cloudflare

En este entorno no se completó un `npm install` integral dentro del tiempo disponible, por lo que no se ejecutó aquí el build completo Next.js + OpenNext. El pipeline de Cloudflare debe realizar la validación integral final mediante `npm run build:cloudflare`.
