# CAISSA Online — Staging Credential Recovery Report

**Fecha:** 2026-10-22  
**Estado:** `CAISSA_ONLINE — STAGING_KEY_RECOVERY_READY / HOSTED_APPROVAL_PENDING`  
**Alcance:** diagnóstico y compatibilidad local; no se desplegó ni se modificó configuración remota.

## Resultado

El `503` de la certificación alojada quedó explicado y corregido en código local. La petición inicial a `/api/user/sync` intentó crear/sincronizar el usuario mediante `POST /rest/v1/users`; Supabase Staging respondió `401` con `sb_error_code=UNAUTHORIZED_DISABLED_LEGACY_KEY`. La Preview de la ejecución tenía un JWT `service_role` legacy ya deshabilitado en `SUPABASE_SERVICE_ROLE_KEY`; la API transformó el fallo del almacén en `503`.

Staging está saludable y ya dispone de credenciales modernas. La lectura del inventario confirmó una clave `sb_publishable_…` activa y la `anon` legacy deshabilitada. El Dashboard, sin revelar ni copiar valores, mostró una clave secreta moderna predeterminada y otra secreta dedicada al relay EAE-015A. La clave dedicada al relay no debe reutilizarse para Online. La utilidad real de la clave predeterminada se certificará únicamente cuando una autorización posterior permita instalarla como variable de rama y crear una nueva Preview aislada.

## Contrato corregido

| Componente | Variable / credencial | Regla |
|---|---|---|
| Backend Supabase | `SUPABASE_SECRET_KEY` | Prefiere `sb_secret_…`; sólo server-side, sin sesión persistente. |
| Compatibilidad backend | `SUPABASE_SERVICE_ROLE_KEY` | Acepta únicamente un JWT legacy cuyo rol embebido sea `service_role`; no corrige una clave deshabilitada. |
| Navegador / Realtime | `SUPABASE_PUBLISHABLE_KEY` | Acepta `sb_publishable_…`; nunca expone una clave secreta. |
| Usuario Realtime | JWT real de sesión | `supabase-js` lo aporta mediante `accessToken` y `realtime.setAuth()`. |
| Broadcast REST | clave server-side en `apikey` | No envía una clave opaca moderna como `Authorization: Bearer`, porque no es un JWT. |

La selección de credenciales se centralizó en `api/_lib/supabase.js`. Una clave pública colocada en el slot secreto falla antes de cualquier petición privilegiada; una clave secreta colocada en el slot público no aparece en `/api/online?action=config`. El emisor batch `POST /realtime/v1/api/broadcast` usa sólo `apikey`, conforme al contrato actual de Supabase.

## Cambios locales

- `api/_lib/supabase.js`: soporte explícito para claves modernas, validación de clase y cliente backend sin persistencia de sesión.
- `api/_lib/online-realtime-broadcast.js`: adopta la clave moderna y elimina el Bearer incorrecto.
- `api/_lib/online-guest-auth.js` y `api/online.js`: comparten la resolución segura de URL/clave publicable.
- `docs/online/CAISSA_PREVIEW_CONFIGURATION_PLAN.md`: documenta variables modernas y separación browser/backend.
- Pruebas nuevas para claves modernas, compatibilidad legacy válida, clases equivocadas, no exposición y headers Broadcast.

## Verificación local

La revalidación fresca terminó con **90/90 PASS** en Online Node y **96/96 PASS** en Chromium, Firefox y WebKit. `npm run lint:online`, `npm run security:dependencies`, `npm run release:public:audit` y `git diff --check` también pasaron; el audit de dependencias reportó 0 vulnerabilidades.

El Codex Security diff scan `7fd409fe-e6bb-4db7-a96a-04d2bc6b6041` cubrió el rango `585d070e3226dcd10e0fa6c50355dec554f66977..d5e151cf170896e1b2309990ff0b19a368bd5b51` y terminó con cobertura completa y **0 hallazgos**. Daybreak no estaba concedido, limitación registrada separadamente.

No se realizó una llamada real con la clave secreta moderna, no se instaló ningún valor en Vercel, no se rotó ni reactivó una clave, y no se ejecutó el flujo de dos jugadores.

## Estado de datos y recursos

La reconciliación read-only de Supabase Staging del 22 de octubre volvió a coincidir exactamente con el baseline: users 13, public identities 9, bindings 8, profiles 9, presence 8/0 live, tickets 21/0 live, challenges 28/0 live, games 32/0 active/32 completed, events 260, ratings 10, rating sum 15,000, rating games sum 10, product entitlements 3, y filas de identity migration, Account Control, audit y credit events en 0. Los seis conteos de fixtures de la ejecución siguen en cero.

Clerk Development devolvió cero coincidencias tanto para los dos user IDs exactos como para sus dos external IDs. Las variables Vercel de la rama de certificación siguen en cero. Production, Account Control, Supabase y Clerk no fueron modificados.

## Trazabilidad Git

- Base `origin/main`: `585d070e3226dcd10e0fa6c50355dec554f66977`.
- Rama: `fix/online-modern-supabase-keys-20261021`.
- Commit de implementación: `d5e151cf170896e1b2309990ff0b19a368bd5b51`.
- Árbol de implementación: `3d272860d5995e6f966d8858f70c11238da98ff6`.
- HEAD documental previo al cierre: `d5ed2b2d6ab5f3aafa102e7cc6ef4bc3ad83fb12`.
- Worktree: `.caissa-cloud-gate/online-key-recovery-20261021`.

La rama no se publicó: el propio gate de Online prohíbe crear una nueva Preview antes de la autorización humana para instalar variables branch-scoped. El plan mantiene `CAISSA_ONLINE_GUESTS=0`; habilitar Guests requiere un gate independiente posterior.

## Operaciones remotas pendientes de aprobación

En una nueva rama/Preview aislada, y sólo tras autorización humana:

1. Crear variables Preview limitadas a la nueva rama: `SUPABASE_URL` de Staging, `SUPABASE_SECRET_KEY` con la clave secreta moderna predeterminada de Staging y `SUPABASE_PUBLISHABLE_KEY` con la clave publicable moderna activa.
2. No instalar `SUPABASE_SERVICE_ROLE_KEY` ni `SUPABASE_ANON_KEY` legacy en esa rama; no reutilizar la secreta EAE-015A.
3. Inventariar nombres, target y rama sin mostrar valores; verificar ausencia de credenciales Production.
4. Crear una nueva Preview protegida desde el commit integrado que también contenga las correcciones P2.
5. Ejecutar primero smoke read-only y detenerse ante cualquier `401`, `403` o `5xx`; el retest de dos jugadores necesita autorización separada.

Rollback: retirar exclusivamente las variables de la nueva rama y descartar su Preview. No rotar claves, no tocar variables compartidas y no modificar Production.
