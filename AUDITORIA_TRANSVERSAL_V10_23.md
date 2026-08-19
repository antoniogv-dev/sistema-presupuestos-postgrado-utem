# Auditoría transversal de plataforma — v10.23

## Objetivo

Revisar transversalmente el Sistema de Presupuestos de Postgrado UTEM para impedir que la selección o edición de una cohorte mezcle identidad, parámetros, plantillas o workflow de otro programa.

## Hallazgo raíz reproducido

La pantalla podía quedar en un estado como:

- selector superior: presupuesto MDTIS;
- presupuesto activo: programa MGIB;
- cohorte: `MDTIS 2027-1S`;
- versión del plan: tomada del programa reasignado.

La causa era estructural: dentro de `Identificación` existía un selector que permitía reasignar `budget.program` y luego `Guardar cambios` enviaba `programId` al `PUT /api/budgets/[budgetId]`. La API aceptaba esa modificación. Así, una cohorte creada para un programa podía convertirse en otra sin reconstruir de forma inequívoca toda su identidad.

## Hallazgos corregidos

1. **Programa editable dentro de un presupuesto existente — crítico.** Eliminado. El programa es ahora parte inmutable de la identidad de la cohorte.
2. **API permitía actualizar `programId` — crítico.** El servidor rechaza una reasignación con `PROGRAM_IMMUTABLE` y ya no genera `UPDATE programId`.
3. **Selector candidato y presupuesto activo podían divergir — crítico UX/datos.** Se eliminó `candidateBudgetId` y el botón `Aplicar filtro`. El cambio de presupuesto vuelve a leer el registro exacto por ID desde D1.
4. **Plantillas específicas se filtraban sólo por tipo — alto.** Ahora se exige `programType` y, cuando existe, `programId` coincidente.
5. **El motor de plantillas aceptaba llamadas cruzadas — alto.** `applyBudgetTemplate` rechaza una plantilla que no corresponda al programa.
6. **Las APIs de plantillas no comprobaban tipo del programa específico — alto.** Crear/modificar una plantilla específica valida el programa asociado.
7. **Importación podía caer silenciosamente en `programs[0]` — crítico.** Si el archivo no identifica el programa, se exige selección manual explícita.
8. **La importación enviaba nuevamente `programId` al actualizar el borrador recién creado — alto.** Eliminado; el programa se fija sólo al crear.
9. **Cohorte rotulada con código de otro programa no se detectaba — alto.** Se agrega auditoría cliente/servidor; si `MDTIS ...` está vinculado a MGIB, Guardar queda bloqueado.
10. **Workflow/correo podía ejecutarse con cambios locales sin guardar — alto.** Ahora exige versión persistida y sin errores de identidad.
11. **Plantilla seleccionada podía quedar arrastrada al cambiar de presupuesto — medio.** Al cargar un presupuesto se reinicia la selección de plantilla con la plantilla realmente aplicada a ese presupuesto.
12. **El formulario se hidrataba desde la lista general y no desde el endpoint individual — medio.** El presupuesto activo se vuelve a consultar mediante `/api/budgets/[budgetId]` antes de editar.

## Diseño resultante

La cabecera de formulación queda conceptualmente así:

`Programa` → `Presupuesto / cohorte` → página completa sincronizada.

El programa dentro de `Identificación` se presenta como dato de identidad de sólo lectura:

`MGIB · Magíster en Gestión de la Información y Bibliotecología`

Para formular otro programa se cambia el selector superior o se crea una nueva cohorte. Ya no se transforma un presupuesto existente en otro programa.

## Presupuestos que ya quedaron inconsistentes

La v10.23 no reasigna automáticamente registros históricos, porque decidir que una cohorte `MDTIS 2027-1S` debe transformarse a MGIB —o viceversa— sin confirmación podría empeorar la información.

Al abrir un registro con conflicto, la pantalla muestra **Auditoría de integridad del presupuesto** y bloquea Guardar, correo y workflow. Si el programa actual es el correcto, puede usar el nombre de cohorte sugerido. Si el programa asociado en D1 es incorrecto, debe crearse/clonarse la cohorte bajo el programa correcto y revisar sus parámetros antes de eliminar lógicamente el registro erróneo.

## Auditoría permanente

Se incorpora `npm run integrity:audit` al pipeline `quality:cloudflare`. El script ejecuta 12 controles estáticos sobre:

- presupuesto/formulario;
- API de presupuestos;
- APIs de plantillas;
- importación;
- consolidación;
- versiones;
- avisos/workflow;
- validación de identidad.

El build falla si reaparece una ruta que permita reasignar programa o mezclar una plantilla específica con otro programa.
