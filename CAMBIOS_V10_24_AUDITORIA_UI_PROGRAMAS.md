# Cambios v10.24 — programas vivos, selección segura y compactación UI

- El selector superior de Presupuestos muestra todos los programas activos disponibles en `/api/programs`, incluso si todavía no tienen cohortes presupuestarias.
- Al seleccionar un programa sin presupuestos, la pantalla deja de mostrar el presupuesto anterior y ofrece crear la primera cohorte del programa seleccionado.
- El selector de presupuesto se limita siempre al programa seleccionado.
- Se agrega “Actualizar listas” para refrescar Programas y Presupuestos desde D1 sin depender de recargar el navegador.
- Se conserva la inmutabilidad del `programId` de presupuestos existentes.
- Se compacta la interfaz general: sidebar, topbar, paneles, formularios, tablas y botones.
- Paleta institucional ampliada con negro `#000000`, mostaza `#FFB344` y beige `#FFF8E5`, manteniendo el azul UTEM como color principal.
- No se agregan migraciones D1.
