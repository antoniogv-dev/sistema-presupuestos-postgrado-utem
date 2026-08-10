# Manual básico de usuario

## 1. Ingreso

La versión productiva se abre mediante el dominio protegido por Cloudflare Access. El sistema identifica el correo institucional y aplica los permisos registrados en Cloudflare D1.

## 2. Programas

En **Programas** puede:

- crear y modificar programas;
- definir tipo de programa;
- registrar facultad, dirección y centro de costo;
- configurar arancel anual propio;
- utilizar la referencia de arancel doctoral cuando corresponda.

## 3. Plantillas

En **Parámetros y plantillas** puede mantener:

- Plantilla Doctoral;
- Plantilla Magíster Académico;
- Plantilla Magíster Profesional.

Cada plantilla permite agregar, modificar, activar, desactivar o eliminar ítems. Las plantillas académicas incorporan inicialmente beca de excelencia académica y beca de atención económica. La plantilla profesional incorpora descuentos configurables.

## 4. Crear un presupuesto

1. Ingrese a **Presupuestos**.
2. Seleccione **Nuevo presupuesto**.
3. Elija programa y cohorte.
4. Configure inicio, duración, estudiantes y arancel.
5. Aplique una plantilla si corresponde.
6. Complete parámetros semestrales.
7. Registre estudiantes activos y en graduación.
8. Agregue descuentos y becas.
9. Agregue ingresos extraordinarios.
10. Agregue gastos y costos.
11. Defina cada costo como único o compartido.
12. Active o desactive normalización, alertas y arrastre.
13. Revise el flujo anual y guarde.

## 5. Modificar y eliminar

El Gestor puede modificar presupuestos en etapa de gestión. Los borradores pueden eliminarse mediante eliminación lógica. Los registros quedan disponibles para auditoría.

Una versión aprobada no se edita directamente; debe generarse una nueva versión.

## 6. Costos compartidos

- **Único de esta versión:** se reconoce íntegramente en la cohorte.
- **Compartido con otras cohortes:** puede normalizarse una sola vez por programa, año y categoría.

La alerta de duplicidad informa coincidencias potenciales antes de consolidar.

## 7. Arrastre

El monto autorizado se registra en los parámetros del presupuesto. El interruptor **Incluir arrastre autorizado** permite incluirlo o excluirlo temporalmente del cálculo sin borrar el antecedente.

## 8. Consolidados

El módulo **Consolidado** permite revisar:

- consolidado institucional;
- programas académicos;
- programas profesionales;
- resultados por programa;
- costos compartidos normalizados;
- duplicidades evitadas.

## 9. Revisión y aprobación

1. El Gestor envía a V°B°.
2. V°B° visa u observa.
3. Si visa, pasa a Aprobación.
4. Aprobación aprueba u observa.
5. Las observaciones devuelven el presupuesto a gestión.

## 10. Exportaciones

Desde el presupuesto puede exportar:

- XLSX con estructura financiera institucional;
- PDF con encabezados, ingresos, egresos, flujo y resultado;
- información identificada por programa, cohorte, versión y estado.

## 11. Demostración autónoma

Abra `demo/index.html` para probar la aplicación sin instalar dependencias. Los cambios se almacenan únicamente en el navegador y no reemplazan Cloudflare D1 en producción.

## Funciones v10

### Programas
- Use **Agregar programa** para crear una ficha real en D1.
- Use **Modificar programa** en la fila correspondiente para actualizarla.
- Defina criterios de búsqueda, tipo o estado y pulse **Aplicar filtros**; **Limpiar** restaura la vista inicial.
- El arancel puede ser propio o provenir de la plantilla Doctoral, Magíster Académico o Magíster Profesional.

### Parámetros generales
Los usuarios Gestor o Administrador pueden modificar los valores visibles y pulsar **Guardar parámetros**. Los demás roles consultan los mismos valores en modo lectura.

### Versiones
Seleccione un presupuesto, una **Versión base**, una **Versión a comparar** y pulse **Comparar versiones** para obtener las diferencias de los snapshots guardados.

### Administración
El rol Administrador puede crear y modificar usuarios, establecer una contraseña, habilitar/deshabilitar cuentas y asignar: Administrador, Creador, Lector, Gestor, V°B° y Aprobador.

### Exportaciones
Desde **Importar y exportar** puede descargar XLSX y PDF del presupuesto seleccionado, XLSX/CSV del consolidado institucional y CSV de auditoría. El consolidado también ofrece **Exportar consolidado** directamente desde su pantalla.

### Presupuestos
La sección de estudiantes quedó separada de la carga académica. Las **Horas docentes directas** y **Horas docentes de reemplazo** se editan en tablas independientes, seguidas de una sección específica de **Becas**.
