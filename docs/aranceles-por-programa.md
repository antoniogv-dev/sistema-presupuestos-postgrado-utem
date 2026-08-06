# Aranceles personalizados por programa

## Regla aplicada

1. Cada programa puede registrar un arancel anual propio.
2. El motor financiero usa primero `ProgramAnnualTuition`.
3. Si no existe un valor propio, utiliza la plantilla institucional de doctorado.
4. Descuentos, becas internas de arancel, incobrabilidad, matrículas equivalentes y, cuando corresponda, overhead utilizan el mismo arancel resuelto.
5. El valor se registra por año para que reajustes futuros no alteren presupuestos históricos.

## Modelo de datos

- `ProgramAnnualTuition.programId`: programa propietario.
- `year`: año de vigencia.
- `amount`: monto anual en pesos chilenos.
- `source`: `PROPIO` o `PLANTILLA_DOCTORADO`.
- Restricción única: programa + año.

## API

- `GET /api/programs/{programId}/tuition`
- `PUT /api/programs/{programId}/tuition`

Ejemplo:

```json
{
  "values": [
    { "year": 2027, "amount": 4567500, "source": "PROPIO" },
    { "year": 2028, "amount": 4795875, "source": "PROPIO" }
  ]
}
```

La escritura requiere nivel `GESTOR`. El nivel se obtiene desde Cloudflare D1 a partir del correo contenido en un JWT válido de Cloudflare Access, o desde un usuario interno identificado mediante `INTERNAL_API_KEY` y `x-user-id`. No se acepta `x-access-role` enviado por el navegador.
