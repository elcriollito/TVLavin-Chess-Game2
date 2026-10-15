# CAISSA Public Identity — certificación de paridad Unicode

## Contrato canónico v1

La frontera Node es la autoridad de aceptación completa:

- presentación normalizada a NFC;
- clave de unicidad: NFKC y minúsculas Unicode;
- 3–24 grafemas, medidos con `Intl.Segmenter`;
- máximo defensivo de 40 puntos de código;
- espacios internos colapsados y bordes recortados;
- letras y marcas de una escritura coherente, números y puntuación limitada;
- controles, bidi, el conjunto Unicode `Default_Ignorable_Code_Point`, markup y separadores inválidos rechazados;
- puntuación repetida, alias reservados y el namespace `Player-XXXXXXXXXXXXXXXX` rechazados.

Si `Intl.Segmenter` no existe, la escritura falla cerrada. No se degrada silenciosamente a conteo de UTF-16 o puntos de código.

PostgreSQL 17 no pretende contar grafemas. Valida el payload producido por la frontera confiable: `policy_version=1`, display NFC, clave exactamente igual a NFKC+`lower()` del display, límites defensivos, par display/key y unicidad parcial. El API vuelve a ejecutar la política antes de invocar los RPC.

## Matriz certificada

| Caso | Cliente/Node | API | PostgreSQL |
|---|---|---|---|
| NFC y NFD equivalentes | acepta/canonicaliza | revalida | misma clave; conflicto único |
| Compatibilidad NFKC | canonicaliza clave | revalida | exige clave derivada exacta |
| Mayúsculas/minúsculas | misma clave cuando `lower()` coincide | revalida | unicidad |
| Acentos/combining marks | 3–24 grafemas reales | revalida | NFC y límite defensivo |
| 2 grafemas | rechaza | rechaza | no es vía autorizada |
| 3 grafemas | acepta si cumple el resto | acepta | persiste |
| 24 grafemas | acepta si cumple el resto | acepta | persiste |
| 25 grafemas | rechaza | rechaza | no es vía autorizada |
| Bidi/control/zero-width | rechaza | rechaza | no es vía autorizada |
| U+034F, U+FE0F, U+3164 y U+E0100 | rechaza | rechaza | rechaza independientemente |
| Escrituras mixtas | rechaza | rechaza | no es vía autorizada |
| Reservado/puntuación repetida | rechaza | rechaza | no es vía autorizada |
| Clave forjada | no se genera | no se invoca | rechaza |
| Dos altas concurrentes | una disponible | una escritura ganadora | una fila; un `23505` |
| Dos updates del mismo owner | `expectedVersion` | control optimista | una versión gana |
| Spoofing de propietario | no es parte del contrato | body rechazado | owner derivado del subject |

## Límites explícitos

NFKC+minúsculas no es full Unicode case folding y no se presenta como tal. Tampoco se implementa un skeleton completo UTS #39 de confusables. El riesgo residual se reduce mediante escritura única, rechazo completo de default-ignorables y rechazo de mezcla de escrituras; ampliar a case folding completo exigiría una nueva versión de política, migración de claves y revisión de colisiones. Rechazar default-ignorables excluye deliberadamente CJK IVS y selectores de variación de este contrato v1; se conservan diacríticos combinantes ordinarios.

Resultado: `UNICODE_PARITY_CERTIFIED` para el contrato v1 probado. La equivalencia alojada debe verificarse en Staging antes de publicar.
