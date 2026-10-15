# CAISSA Public Identity — privacidad histórica

## Riesgo y política

Los nombres legacy tienen procedencia pública desconocida. No se importan como nicknames ni se consideran consentimiento. La protección se aplica antes de entregar datos al consumidor, no mediante CSS y no mediante una reescritura remota.

## Proyección segura

- Un snapshot v0 se resuelve solo por `user_id`/Clerk subject hacia una identidad canónica.
- Nunca se correlaciona por coincidencia de nombre o email.
- Si no hay relación inequívoca, se usa un alias estable no identificable.
- Guests válidos conservan su alias temporal; valores Guest inseguros se sustituyen.
- Un snapshot v1 seguro permanece congelado aunque el nickname actual cambie.
- `profiles`, Players, challenges, recent/history games y metadata derivada se canonicalizan antes de la respuesta.
- En PGN solo se reemplazan los tags `White` y `Black`; movetext, resultado y los demás headers permanecen iguales.
- El Analyze handoff consume el PGN ya saneado.

## Pruebas sintéticas

Los fixtures contienen nombres multicomponente, emails, nicknames voluntarios, Guest, usuarios sin nickname, partidas v0/v1 y filas no correlacionables. Las pruebas comprueban ausencia de PII en JSON/PGN y preservación del movetext y resultado. El resolver procesa listas grandes en lotes 100/100/5 para 205 sujetos.

## Límites y riesgos residuales

- No se inspeccionaron ni modificaron datos reales.
- La proyección protege las rutas Online revisadas; futuros consumidores deberán reutilizarla o aplicar el mismo contrato.
- Una caché externa previa al cambio tendría que invalidarse durante el gate alojado.
- La recuperación de Staging depende de un backup demostrablemente restaurable; el rollback SQL no equivale a backup.

Gate: `HISTORICAL_PRIVACY_OUTPUT_CERTIFIED` local.
