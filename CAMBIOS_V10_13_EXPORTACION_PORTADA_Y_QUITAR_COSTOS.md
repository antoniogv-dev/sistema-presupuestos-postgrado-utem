# Cambios funcionales v10.13

## 1. Acción Quitar directamente en el flujo

Cada costo/gasto manual mostrado con el prefijo `Incluido:` dentro del flujo de caja anual incorpora una columna `Acción` y un botón `Quitar`.

La eliminación modifica el presupuesto en edición; al guardar cambios se persiste en D1 usando el mecanismo existente. Las filas estructurales del flujo y los parámetros anuales editables no se eliminan.

## 2. Portada institucional del PDF

La exportación PDF incorpora como primera página la imagen institucional `public/Portada2026.jpg`, derivada de la portada suministrada para la Escuela de Postgrado.

Sobre el área azul se imprime:

- nombre del programa en gran formato y alineación derecha;
- subtítulo `Versión <versión> · Cohorte <año>-<semestre>S`.

La portada es vertical y las páginas de flujo y parámetros mantienen su formato horizontal.

## 3. Parámetros del PDF depurados

El anexo PDF usa una vista resumida:

- conserva los parámetros principales aunque su valor sea cero cuando ese cero es informativo;
- incorpora los demás parámetros sólo cuando contienen información efectiva;
- elimina filas sin información, como costos anuales en cero, prorrateos desactivados, registros inexistentes y observaciones vacías.

## 4. Excel con parámetros completos

La segunda hoja pasa a llamarse `Parámetros completos` y mantiene la fotografía íntegra de los inputs usados en el cálculo, incluso cuando su valor es cero.

Se incluyen:

- identificación completa del programa y presupuesto;
- parámetros institucionales generales relevantes;
- controles del presupuesto;
- parámetros anuales efectivos por año;
- monto base y monto aplicado de Dirección, Asistencia y Otros honorarios no académicos;
- parámetros semestrales completos;
- descuentos de arancel con estudiantes, vigencia y notas;
- ingresos extraordinarios con fuente y notas;
- costos/gastos manuales con categoría, periodicidad, alcance, descripción y notas.

La hoja de flujo incluye además una indicación visible de que la trazabilidad completa está disponible en la segunda hoja.

## 5. Base de datos

No existe una migración D1 nueva en v10.13. Las fórmulas y el esquema permanecen iguales a v10.12/v10.11.
