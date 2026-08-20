# Cambios v10.26 — Malla curricular, importación y valorización docente

## 1. Malla curricular en Programas

Se incorpora `ProgramCourse` como entidad persistente. Cada asignatura registra semestre, código, nombre, tipo curricular, semanas, secciones, horas de teoría/laboratorio/taller, trabajo directo/autónomo, SCT, requisitos, modalidad docente, factor asincrónico, programas compartidos y porcentaje imputado.

Tipos disponibles:
- Obligatoria.
- Electiva.
- Especialización.
- Competencia genérica.

Las asignaturas obligatorias y competencias genéricas usan una sección. Electivos/especializaciones admiten varias.

## 2. Importación curricular

El editor acepta `.xlsx`, `.xlsm` y `.csv` y reconoce encabezados equivalentes a los usados por curriculistas: Nivel (semestre), Código, Nombre asignatura, Duración en semanas, Teoría, Laboratorio, Taller, Horas trabajo directo, Horas trabajo autónomo, SCT-Chile y Requisitos.

Los códigos de nivel 11/12/13 se interpretan como semestre 1, 21/22 como semestre 2, etc. También se reconocen competencias genéricas como HUMMX/FITMX cuando no vienen asociadas a un nivel regular.

La importación es editable: se puede agregar, quitar o modificar cualquier asignatura después de cargarla.

## 3. Docencia y factor asincrónico

La carga docente se deriva por curso:

`horas = semanas × secciones × horas semanales directas`.

En una asignatura asincrónica se aplica el factor particular antes de valorizar. Ejemplo:

`4 h/semana × 18 semanas × 50 % = 36 h equivalentes`.

Con tarifa base de `$30.000`, el costo es `36 × $30.000 = $1.080.000`, equivalente a `$15.000` por cada hora bruta de la asignatura.

## 4. Asignaturas compartidas

Una asignatura puede seleccionar otros programas y definir `allocationRate`. La malla conserva las horas brutas y genera una regla de economía de escala para imputar sólo la proporción definida. Esto evita aplicar el descuento dos veces.

## 5. Competencias genéricas

Se almacenan, editan e incorporan al XLSX curricular, pero no generan carga ni costo docente en el flujo financiero.

## 6. Presupuestos

Los presupuestos nuevos utilizan automáticamente la malla existente del programa. Para un presupuesto ya creado se incorpora `Aplicar malla curricular`, que sincroniza horas docentes y reglas de asignaturas compartidas con la malla vigente.

## 7. Excel institucional mejorado

`public/templates/presupuesto-profesional-formula-base.xlsx` corresponde byte por byte al Excel mejorado de Ingeniería del Territorio proporcionado como referencia.

La hoja `Costo Directo de Docencia` se alimenta con las asignaturas reales, su semestre, semanas, secciones y condición asincrónica/compartida. Las competencias genéricas se muestran en su bloque correspondiente sin generar costo.

## 8. Migración

`0010_program_curriculum.sql` crea la tabla y restricciones. No modifica presupuestos históricos.
