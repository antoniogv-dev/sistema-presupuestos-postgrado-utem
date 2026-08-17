# Verificación técnica v10.21

Versión: **1.0.31-d1-web / v10.21**

Controles previstos:

1. Seleccionar otro presupuesto en el desplegable no cambia el formulario.
2. Pulsar **Aplicar filtro** cambia `selectedId`, recarga desde D1 y actualiza toda la página.
3. Editar un campo modifica únicamente `draftBudget`; la colección `budgets` permanece intacta.
4. Cambiar de presupuesto con cambios sin guardar exige confirmación.
5. **Recargar activo** descarta el borrador local y vuelve a leer desde D1.
6. Guardar envía exclusivamente el ID del presupuesto activo a `/api/budgets/:id`.
7. El selector muestra estado, programa, cohorte, versión y revisión para evitar confusión entre presupuestos similares.
8. No hay cambios de esquema ni migración D1 nueva.
