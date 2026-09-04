# Despliegue XLSX institucional v13.0.3

Fecha: 2026-09-04

Este cambio documenta el despliegue de la corrección que mantiene el formato XLSX institucional para Magísteres Profesionales, incluido el modelo de arancel total del programa (`PROGRAM_TOTAL`).

La corrección conserva la plantilla institucional, la extensión multianual, la matrícula parametrizable, el prorrateo de staff y la lógica de punto de equilibrio alineada con la viabilidad financiera.

Este archivo no modifica el motor financiero ni la base D1; su incorporación fuerza un nuevo evento de integración desde `main` para que Cloudflare procese el commit más reciente.
