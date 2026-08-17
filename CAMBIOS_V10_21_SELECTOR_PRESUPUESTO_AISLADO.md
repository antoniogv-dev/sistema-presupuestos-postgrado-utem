# Cambios funcionales v10.21

## Selector de presupuesto
Antes, el `<select>` superior cambiaba inmediatamente `selectedId`. En v10.21 la selección se divide en:

- `candidateBudgetId`: presupuesto elegido en el filtro, todavía no aplicado.
- `selectedId`: presupuesto efectivamente activo.
- `draftBudget`: copia editable e independiente del presupuesto activo.

El formulario sólo cambia después de pulsar **Aplicar filtro**.

## Aislamiento de edición
Los cambios del formulario se realizan exclusivamente sobre `draftBudget`. La lista `budgets`, que representa los registros cargados desde D1, no se modifica al escribir en un campo. Por tanto, navegar por la lista no arrastra cambios locales hacia otras cohortes.

## Cambios sin guardar
Toda edición marca el presupuesto como modificado. Si se intenta cargar otro presupuesto, se solicita confirmación antes de descartar cambios. También se activa el aviso del navegador al abandonar la página.

## Seguridad de contexto
El bloque superior informa permanentemente cuál es el presupuesto activo, incluyendo código de programa, cohorte, versión y revisión interna.
