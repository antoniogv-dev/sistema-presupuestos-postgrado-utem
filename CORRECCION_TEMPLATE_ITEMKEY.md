# Corrección del tipo `itemKey` en TemplateManager

El API de plantillas puede entregar el identificador funcional del ítem como `key` (respuesta normalizada) o como `itemKey` (respuesta directa de Prisma).

Se incorporaron tipos de transporte separados (`ApiTemplateItem` y `ApiBudgetTemplate`) y una función `normalizeTemplate` que convierte ambas variantes al modelo interno `BudgetTemplateItem`, cuyo campo obligatorio es `key`.

Esta corrección evita el error de TypeScript:

```text
Property 'itemKey' does not exist on type 'BudgetTemplateItem'.
```

No requiere modificar D1 ni volver a ejecutar migraciones.
