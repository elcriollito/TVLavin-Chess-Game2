# CAISSA Online Native v1 — Security Review

Estado: **PASS para revisión local; verificación alojada pendiente**
Scan sellado: `04affbb8-f5ab-4187-ae30-9581d5e78870`
Snapshot original: `codex-security-snapshot/v1:sha256:acd7f83189c952e29bb8c2058b246e1be1f445758221993278f58f6001cb736c`

## Resultado independiente

- BLOCKER: 0
- HIGH: 0
- MEDIUM: 0
- LOW: 0
- INFORMATIONAL: límites operativos indicados abajo.
- Cobertura: completa para el diff local y contratos de soporte revisados.

El snapshot de seguridad se abrió antes de añadir tres assertions responsive al test browser. Los tres archivos runtime no cambiaron después del snapshot; el delta posterior fue exclusivamente de pruebas y fue revisado por el responsable principal y ejecutado en Chromium, Firefox y WebKit.

## Auth y Guest

- El frontend no concede autoridad por sí mismo; `api/online.js` verifica identidad y enlaza el actor a la operación.
- Guest se valida contra issuer esperado, audience/role `authenticated`, UUID de sujeto y claim `is_anonymous=true`.
- Queue, challenge y rematch fuerzan `rated=false` para Guest en servidor.
- La identidad Guest no se trata como cuenta Clerk permanente.
- Logout/cambio de identidad cierra canales y descarta estado/tokens obsoletos en el cliente.
- Ninguna clave `service_role`, secreto Clerk o credencial se incorpora al navegador o al diff.

Esto es importante porque Supabase documenta que los usuarios anónimos utilizan el rol PostgreSQL `authenticated`; la distinción debe apoyarse en `is_anonymous`, no solo en el rol: https://supabase.com/docs/guides/auth/auth-anonymous

## RLS, RPC y autoridad

La revisión estática confirmó:

- Las mutaciones pasan por RPC server-side y la base conserva autoridad sobre turno, legalidad, versión, relojes, resultado y rating.
- Los clientes no pueden seleccionar arbitrariamente al actor efectivo.
- Las lecturas de partidas privadas permanecen limitadas a participantes.
- RPC privilegiadas no quedan concedidas al navegador.
- expectedVersion, idempotencia de resultados/rating y estados terminales están cubiertos por la suite local existente.
- Este diff no modifica migraciones, grants, políticas o funciones SQL.

## Realtime

- Canales privados, token esperado antes de `subscribe`, deduplicación por versión, resync serializado y cleanup están preservados.
- Los broadcasts sirven como señal; el estado canónico se recupera del backend.
- La documentación de Supabase exige RLS en `realtime.messages` y `config.private=true` para canales privados: https://supabase.com/docs/guides/realtime/authorization
- El Broadcast REST y sus requisitos están documentados por Supabase: https://supabase.com/docs/guides/realtime/broadcast

## Capabilities y presentación

- Daily Games, Watch Games, Open Games y Tournaments no ejecutan capacidades inexistentes.
- `Coming Soon` y estados disabled son límites de producto, no controles de seguridad.
- El botón móvil corregido no intercepta el tablero en scroll.

## Límites y comprobaciones futuras

No se inspeccionó configuración remota. Antes de un smoke alojado hay que comprobar expresamente:

- Vercel Deployment Protection y commit/deployment exactos.
- `CAISSA_ONLINE_ROLLOUT=internal` y capacidades futuras desactivadas.
- Proyecto Supabase `aqizagaskicotorfpwfn`, migraciones aplicadas, RLS de `realtime.messages` y rechazo de canal público.
- Integración Clerk Development/JWKS; nunca Production.
- Un tercero autenticado y un anónimo sin identidad válida no pueden entrar a un canal privado.

La guía de diagnóstico de Realtime también advierte que topic privado, políticas RLS y el flag private deben coincidir: https://supabase.com/docs/guides/troubleshooting/realtime-messages-not-arriving

## Changelog consultado

El changelog oficial vigente fue revisado el 2026-10-13. Entradas relevantes: endurecimiento del schema Realtime (2026-07-14), futura retirada de ciphers TLS 1.2 CBC (2026-10-12) y retirada de soporte Node 20 en librerías JS (2026-06-30). Este candidato usa Node 24 local y no cambia TLS ni schema Realtime: https://supabase.com/changelog
