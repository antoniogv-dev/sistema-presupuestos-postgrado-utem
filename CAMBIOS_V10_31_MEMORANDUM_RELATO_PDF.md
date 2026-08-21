# v10.31 — Memorándum institucional y análisis económico-financiero

Versión de aplicación: `1.0.41-d1-web`  
Versión funcional: `v10.31`

## 1. Nuevo memorándum presupuestario

Se incorpora el botón **Generar memorándum** en la formulación de cada cohorte y en el módulo **Importar y exportar**.

El documento se genera en formato DOCX a partir de la plantilla institucional entregada por la Escuela de Postgrado y conserva:

- encabezado institucional;
- numeración `MEMORÁNDUM N.º XXX/año`;
- destinatario, remitente, referencia y fecha;
- relato de flujo de estudiantes e ingresos;
- valores base y reajustes;
- costos académicos y docencia;
- prorrateos, staff y overhead;
- becas/ayudas y costos de operación cuando existen;
- resultado financiero del horizonte;
- cierre formal y firma de Dirección de Escuela de Postgrado.

El contenido económico se construye exclusivamente con el presupuesto activo y sus parámetros.

## 2. PDF: nuevo relato económico-financiero

Se conserva la portada institucional y el flujo anual. El relato se reemplaza por una estructura descriptiva, sin recomendaciones ni juicios administrativos:

1. Antecedentes de la cohorte.
2. Ingresos de la cohorte.
3. Costos del programa.
4. Resultado económico.
5. Comparación con cohortes anteriores.
6. Evolución de los principales indicadores.
7. Variaciones entre cohortes.

Se expresan valores totales y por estudiante cuando existe una base de estudiantes válida.

## 3. Historia comparable

La serie histórica se construye únicamente con:

- cohortes anteriores del mismo programa;
- estado `Aprobado`;
- una sola revisión por cohorte, priorizando la versión/revisión más reciente;
- hasta cuatro cohortes anteriores más la cohorte actual.

La tabla histórica incluye matriculados, ingresos netos, ingreso por alumno, costos totales, costo por alumno, resultado económico, margen y becas/descuentos.

Si D1 no contiene cohortes anteriores aprobadas comparables, el PDF lo informa y no inventa una serie histórica.

## 4. Parámetros del PDF más acotados

El anexo PDF deja de repetir parámetros semestrales, punto de equilibrio, costos manuales e ingresos extraordinarios. Conserva sólo:

- identificación esencial;
- arancel y matrícula;
- valores hora relevantes;
- tesis cuando corresponde;
- incobrabilidad;
- Dirección y Asistencia;
- otros honorarios no académicos cuando tienen valor;
- overhead;
- beca de manutención cuando corresponde;
- descuentos de arancel efectivamente registrados.

El XLSX mantiene la trazabilidad completa y no se reduce.

## 5. Nombres de archivos

Todas las descargas pasan por una normalización previa que decodifica nombres URL y elimina secuencias como `%20`. Los PDF y exportaciones generales utilizan nombres legibles con espacios.

## 6. Base de datos

No se incorpora una migración D1 nueva. Se mantienen las 10 migraciones existentes.
