# v10.29 · Consolidación semestral de horas desde la malla

## Corrección principal
La malla ya calculaba correctamente las horas por asignatura, pero en cohortes presenciales las asignaturas importadas sin modalidad explícita podían permanecer clasificadas como `SINCRONICA` y no alimentar la bolsa visible `Horas docentes presenciales`.

Desde v10.29:
- una asignatura `ASINCRONICA` conserva siempre su bolsa asincrónica y su factor;
- en una cohorte `PRESENCIAL`, toda asignatura no asincrónica se consolida como `Horas docentes presenciales`;
- en cohortes `SEMIPRESENCIAL` o `E_LEARNING`, las asignaturas `SINCRONICA` y `ASINCRONICA` permanecen separadas;
- competencias genéricas continúan excluidas del costo;
- secciones multiplican las horas de la asignatura antes de consolidar.

## Ejemplo validado
- 2027-1S: 5 asignaturas × 4 h/sem × 18 semanas = 360 h presenciales.
- 2027-2S: 5 asignaturas × 4 h/sem × 18 semanas = 360 h presenciales.
- 2028-1S: 72 h + electivo de 2 secciones (144 h) + taller de 8 h/sem (144 h) = 360 h presenciales.

La tabla de malla muestra ahora además la `Bolsa de carga` que recibirá cada asignatura.
