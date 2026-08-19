# Cambios v10.23 — aislamiento e identidad de presupuestos

- Programa inmutable en presupuestos existentes.
- Selector superior simplificado a Programa + Presupuesto/cohorte.
- Lectura exacta del presupuesto seleccionado desde D1.
- Código y nombre institucional completo visibles en presupuesto activo e Identificación.
- Auditoría de integridad del presupuesto con bloqueo de acciones ante errores de identidad.
- Validación servidor de cohorte/programa y plantilla/programa.
- Plantillas específicas filtradas por programa.
- Importación sin asignación automática al primer programa.
- Correo y workflow bloqueados si existen cambios sin guardar.
- Script permanente `integrity:audit` incluido en `quality:cloudflare`.
- Sin migración D1 nueva.
