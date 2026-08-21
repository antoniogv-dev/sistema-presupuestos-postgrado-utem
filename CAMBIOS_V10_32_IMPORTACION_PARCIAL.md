# v10.32 — Importación parcial y recuperación de presupuestos incompletos

Versión de aplicación: `1.0.42-d1-web`  
Versión funcional: `v10.32`

## Problema corregido

La vista de importación podía reconocer múltiples variables del archivo —por ejemplo aranceles y overhead— pero, cuando no encontraba año de inicio, estudiantes iniciales o programa, la experiencia inducía a tratar la revisión como un error bloqueante. Además, si el `POST` inicial creaba el Borrador y la carga posterior del detalle fallaba, la interfaz podía mostrar un error general pese a que el presupuesto ya existía.

## Cambios

- Inferencia del año de inicio desde el primer año anual reconocido, además de cohorte, nombre de archivo y semestres.
- Inferencia del semestre desde cohorte, nombre del archivo o primer periodo semestral reconocido.
- Registro separado de datos inferidos automáticamente y advertencias.
- Nueva función `pendingImportedBudgetFields()` para identificar campos efectivamente pendientes.
- Importación no bloqueante: año, semestre, duración y estudiantes faltantes pueden completarse después en el Borrador.
- Uso provisional de 0 estudiantes, duración oficial del programa y 1S cuando no existe otra referencia.
- Canonización de la cohorte respecto del programa seleccionado para evitar mezclas de identidad.
- Normalización de montos CLP a enteros antes de persistirlos en D1.
- Si una anualidad no tiene un arancel positivo disponible, no se envía un override inválido a la API; el Borrador puede conservarse para completar ese dato posteriormente.
- Persistencia de la lista de pendientes en `notes`.
- Advertencia visible dentro de `Presupuestos` mientras esos pendientes sigan registrados.
- Recuperación defensiva: si falla la carga completa del detalle después de crear el Borrador, se conserva el presupuesto y se intenta guardar la estructura mínima segura.

## Base de datos

No hay nuevas migraciones D1.
