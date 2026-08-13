# Verificación v10.16

- `test:engine`: correcto; compila motor financiero, plantillas y exportadores con TypeScript strict.
- `test:standalone`: 12/12 pruebas aprobadas.
- `source:audit`: correcto con configuración de prueba equivalente a Cloudflare; agrega marcadores obligatorios v10.16.
- Sintaxis TypeScript/TSX verificada en los archivos modificados mediante TypeScript 5.8.3.
- XLSX real generado e inspeccionado: contiene los cinco subtotales cuando existen Equipamiento y Becas/ayudas.
- Validación condicional: al no existir Equipamiento o Becas/ayudas, esos dos subtotales se omiten del reporte financiero.
- PDF de prueba renderizado en A4 vertical: subtotales visibles y sin superposiciones.
- No se requieren cambios de esquema ni migración D1.
