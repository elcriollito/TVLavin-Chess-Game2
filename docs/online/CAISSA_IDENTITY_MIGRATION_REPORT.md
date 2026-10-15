# CAISSA Public Identity — informe de migración

## Unidad

- Migración: `supabase/migrations/20261014035549_caissa_public_identity_v1.sql`.
- Rollback: `supabase/rollback/20261014035549_caissa_public_identity_v1.rollback.sql`.
- Todavía no aplicada remotamente.

## Objetos y permisos

- esquema privado `caissa_identity_private`;
- tabla `public.caissa_public_identities`, PK/FK a `public.users(id)`;
- índice único parcial de `nickname_key` y unicidad de `fallback_alias`;
- checks de par nickname/key, versión y alias;
- columna `caissa_online_games.identity_policy_version` con valores 0/1;
- triggers de preparación de identidad y snapshot de nombres al crear partida;
- RPC públicas server-only: `get_or_create`, `check_nickname`, `update`, `resolve_many`;
- helpers privados de normalización, validación, alias y snapshot;
- predicado privado de participación para Realtime sin SELECT directo de partidas;
- Broadcast de base de datos reducido a `gameId`, `version` y `eventType`.

RLS está activa con cero políticas. `PUBLIC`, `anon` y `authenticated` no tienen acceso de tabla ni EXECUTE. `service_role` solo tiene SELECT directo y EXECUTE de los RPC públicos necesarios; INSERT/UPDATE directos quedan revocados. Todas las funciones privilegiadas fijan `search_path=''` y califican objetos.

En Online, `authenticated` pierde el `SELECT` de `caissa_online_games`. Solo recibe `USAGE` del esquema privado y `EXECUTE` del predicado booleano utilizado por la policy de `realtime.messages`; no obtiene acceso a filas ni a las demás funciones privadas.

## Certificación PostgreSQL 17.11

- bind: `127.0.0.1:55439`;
- locale provider del cluster: ICU `und`;
- RLS: activa; policies: 0;
- `anon_select=false`;
- `authenticated_update=false`;
- `service_table_update=false`;
- actualización mediante RPC service-only: PASS;
- carrera de nickname: códigos 0/1, una ganadora;
- carrera del mismo owner: códigos 0/1, control optimista;
- clave NFKC/lower forjada: rechazada;
- U+034F, U+FE0F, U+3164 y U+E0100: rechazados en Node y PostgreSQL;
- SELECT directo de partida como `authenticated`: rechazado;
- topic propio/ajeno: autorizado/rechazado por el predicado privado;
- payload del trigger: solo `gameId`, `version` y `eventType`;
- tablas Online preservadas: 11;
- rollback: PASS;
- reaplicación: PASS.

## Rollback

El rollback elimina trigger/columna/marcador y objetos Identity creados por esta unidad y restaura el contrato Online anterior: SELECT participante de la fila completa y `broadcast_changes()`. No revierte partidas, ratings, economía, historia Online ni sanea datos. Esa reversión exacta reabre la superficie de datos históricos, por lo que solo debe considerarse con Online apagado. Al existir nicknames reales, eliminar la tabla sería además pérdida de datos; en un entorno alojado requiere backup y decisión humana. La recuperación preferida ante fallo de aplicación es desactivar el código/rollout y preservar datos, no ejecutar SQL destructivo automáticamente.

No se incluyeron bridge, hardening mixto ni entradas diagnósticas de Staging.

Gate: `PUBLIC_IDENTITY_MIGRATION_LOCAL_RECERTIFIED`.
