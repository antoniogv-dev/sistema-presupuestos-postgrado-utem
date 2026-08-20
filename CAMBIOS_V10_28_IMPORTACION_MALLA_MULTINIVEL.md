# v10.28 · Importación de malla multinivel y aplicación visible

## Corrección principal
La importación de mallas curriculares reconoce encabezados de una, dos o tres filas. Esto cubre el formato habitual de curriculistas, donde `Horas pedagógicas semanales` ocupa una fila superior y `Teoría`, `Laboratorio`, `Taller`, `Horas trabajo directo` y `Horas trabajo autónomo` aparecen debajo.

En v10.26/v10.27 ese diseño podía registrar correctamente las asignaturas y dejar sus horas en cero. Desde v10.28 se combinan los encabezados por columna antes de identificar los campos.

## Compatibilidad
Si una asignatura histórica tiene `directWeeklyHours = 0` pero conserva Teoría/Laboratorio/Taller, la carga directa se reconstruye automáticamente desde esos componentes.

Si todos esos campos históricos quedaron en cero, no existe información suficiente para inventar las horas: se muestra una advertencia y la malla debe reimportarse una vez con v10.28 y guardarse nuevamente.

## Trazabilidad en Presupuestos
La sección Carga académica incorpora `Asignaturas vinculadas a esta formulación`, mostrando periodo, código, asignatura, tipo, modalidad, semanas, secciones, horas semanales, horas aplicadas y condición compartida/genérica.

Las competencias genéricas se muestran, pero permanecen sin costo. Las asignaturas asincrónicas muestran su factor y horas equivalentes.

## Base de datos
No hay migración D1 nueva. Se mantiene `0010_program_curriculum.sql`.
