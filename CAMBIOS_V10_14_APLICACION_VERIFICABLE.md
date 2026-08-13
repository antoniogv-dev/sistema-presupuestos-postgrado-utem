# Cambios v10.14

## Flujo de caja

- Los costos manuales se presentan como filas propias `Costo: nombre` bajo su categoría.
- Cada fila muestra categoría, periodicidad y alcance.
- Cada costo tiene un botón visible `Quitar` en la columna Acción.
- `Quitar` solicita confirmación antes de retirar el costo.
- La eliminación modifica `manualItems`; el usuario debe usar `Guardar cambios` para persistirla en D1.
- Se agrega `Agregar costo al flujo` directamente en el encabezado del flujo anual.

## PDF

- Portada basada en la imagen institucional proporcionada por la Escuela de Postgrado.
- Nombre del programa en formato grande, zona media de la portada y alineación derecha.
- Versión y cohorte se muestran en dos líneas separadas.
- El anexo PDF incluye sólo parámetros principales y valores con información efectiva.
- Descuentos, ingresos extraordinarios y costos sólo aparecen si existen registros reales.

## XLSX

El Excel individual contiene seis hojas:

1. `Flujo presupuestario`.
2. `Parámetros completos`: todos los inputs utilizados, incluidos ceros y registros detallados.
3. `Parámetros anuales`.
4. `Parámetros semestrales`.
5. `Descuentos`.
6. `Costos e ingresos`.

Las hojas auxiliares son vistas de revisión; la fuente de trazabilidad completa sigue siendo `Parámetros completos`.

## Control de despliegue

- Versión: `1.0.24-d1-web`.
- Release: `v10.14`.
- `source:audit` valida las hojas del Excel, la portada y la acción de quitar costos.
- No existe migración D1 nueva.
