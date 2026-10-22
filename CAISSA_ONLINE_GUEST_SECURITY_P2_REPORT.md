# CAISSA Online — Guest Security P2 Report

**Fecha:** 2026-10-22
**Estado:** `CAISSA_ONLINE_GUEST_SECURITY — LOCAL_CERTIFIED / RELEASE_APPROVAL_PENDING`
**Alcance:** correcciones locales, pruebas y revisión de seguridad; Guests permaneció desactivado y no hubo escrituras remotas.

## Resultado ejecutivo

Los dos hallazgos P2 quedaron corregidos en el código local revisado:

1. El rollout `internal` aplica la allowlist a todos los principals autenticados, incluidos invitados. La configuración pública de ese rollout no anuncia Guest signup.
2. Un invitado ya no puede depender sólo de un subject rotatable para controlar abuso. Cada solicitud Guest válida atraviesa límites compartidos globales, por origen confiable pseudonimizado y por subject; las acciones que pueden aprovisionar identidad añaden una cuota de provisión. Todos esos controles ocurren antes de crear identidad o estado Online durable.

La habilitación pública de Guests sigue prohibida. El alta anónima de Supabase sucede antes de `/api/online`, por lo que CAPTCHA/bot protection, límites de signup, expiración y cleanup de Auth son gates adicionales de release, no sustitutos de esta corrección.

## P2-A — bypass de allowlist internal

**Estado:** corregido localmente.

- Se eliminó la excepción que omitía la allowlist cuando `auth.guest` era verdadero.
- Tanto miembros como invitados reciben `403 ONLINE_INTERNAL_ONLY` si su subject exacto no aparece en `CAISSA_ONLINE_INTERNAL_USERS`.
- La decisión se ejecuta después de autenticar y antes de crear el servicio, consumir cuotas compartidas o escribir estado.
- `rollout=internal` publica `guestPlay=false`, incluso si una variable errónea intentara poner `CAISSA_ONLINE_GUESTS=1`.
- `CAISSA_ONLINE_GUESTS=0` conserva el rechazo de tokens Guest; miembros autorizados conservan el flujo existente.

## P2-B — subjects Guest rotatables

**Estado:** corregido localmente para el API y las escrituras CAISSA.

La ruta Guest exige, en este orden:

1. Autenticación Supabase del JWT anónimo real.
2. Allowlist del rollout, si aplica.
3. Validación del action GET o del envelope POST.
4. Límite local existente.
5. Cuota compartida global `guest-outer`.
6. Cuota compartida `guest-outer` por origen confiable.
7. Para `presence.join`, `queue.join` y `challenge.create`, cuota `guest-provision` por origen.
8. Cuota compartida por subject y tipo de operación.
9. Sólo entonces `ensureGuestIdentity` y las operaciones Online.

El origen se toma únicamente de `x-vercel-forwarded-for` cuando `VERCEL=1`. Se rechazan valores ausentes, arrays, listas separadas por coma, whitespace ambiguo y valores que no sean IP. La IP no se registra ni se guarda en claro: se transforma localmente en `online-source:<sha256>`. Si falta el origen confiable o el limitador compartido, el Guest falla cerrado con `503`; una denegación de cuota produce `429` antes de cualquier escritura CAISSA.

También se corrigieron dos rutas hermanas detectadas durante el análisis: los envelopes inválidos se rechazan antes de crear filas de rate-limit y `game.rematch` comparte el bucket de 20/minuto con `challenge.create`.

## Compatibilidad y comportamiento preservado

- Miembros Clerk siguen usando su autenticación y cuotas existentes.
- Rating, clocks, matchmaking y transacciones de partida no cambiaron.
- Los invitados nunca pueden crear partidas rated.
- Los RPC de mutación y rate-limit siguen limitados al rol de servidor en el SQL del repositorio.
- La configuración pública no expone IP, hashes de origen ni credenciales secretas.
- La separación entre `SUPABASE_SECRET_KEY`, `SUPABASE_PUBLISHABLE_KEY` y JWT de usuario se hereda de la rama de recuperación de credenciales.

## QA ejecutado

| Superficie | Resultado |
|---|---:|
| Tests focalizados de Guest/API/source | 40/40 PASS |
| Suite completa Online Node, revalidación fresca | 97/97 PASS |
| Online Browser — Chromium/Firefox/WebKit, revalidación fresca | 96/96 PASS |
| CAISSA Board Node, evidencia histórica del mismo patch | 26/26 PASS |
| CAISSA Board Browser, evidencia histórica del mismo patch | 19 PASS, 1 skip intencional |
| Quiet Drag, evidencia histórica del mismo patch | PASS; 0 geometry reads durante drag, 0 long tasks |
| Auth + registration sync + Guest + negative access, evidencia histórica | 43/43 PASS |
| Revisión independiente focalizada, evidencia histórica | 54/54 PASS y 0 hallazgos confirmados |
| `npm run lint:online` y `node --check`, revalidación fresca | PASS |
| Supply-chain policy, revalidación fresca | PASS; 490 runtime files y 177 entradas lock revisadas |
| `npm audit --audit-level=high` | 0 vulnerabilidades |
| Public release audit | PASS; 1,811 archivos, 23 rutas y 24 contratos |

No se ejecutó el flujo alojado de dos jugadores, no se creó ningún fixture remoto y no se cambió ninguna variable.

## Scanner y revisión independiente

El Codex Security diff scan fresco `49fa6d15-6df6-48ff-b9d1-6591a21af464` revisó el rango exacto de Guest `d5ed2b2d6ab5f3aafa102e7cc6ef4bc3ad83fb12..9e0d848e8aa8e16a030637196dcfed0cb7e92129` y terminó con cobertura completa y **0 hallazgos**. Cubrió autorización de rollout, origen confiable, jerarquía de cuotas, orden de validación/escritura y regresión de miembros/privacidad. Daybreak no estaba concedido, limitación registrada separadamente.

La cobertura alojada queda parcial por diseño: esta misión no autorizó desplegar ni probar el ingress real. La revisión independiente tampoco encontró una vulnerabilidad residual en el código y confirmó con un harness read-only que denegaciones, respuestas malformadas y excepciones en cada cuota impiden escrituras durables.

## Riesgos residuales y gates obligatorios

- Confirmar en una Preview aislada que Vercel sobrescribe cualquier valor aportado por el cliente para `x-vercel-forwarded-for`, incluidos aliases y proxies permitidos.
- Configurar y probar límites de anonymous signup, bot protection/CAPTCHA y cleanup de identidades Supabase Auth antes de habilitar Guests. Si se usa CAPTCHA, el cliente Guest debe enviar y probar `captchaToken`.
- Definir cleanup de usuarios `online_guest`, perfiles/presence/tickets/challenges/games expirados y filas `caissa_online_rate_limits`, siempre por IDs exactos y con inventario previo.
- Ejecutar prueba de carga/NAT. Un invitado idle consume aproximadamente 26 requests/minuto y uno activo cerca de 52/minuto antes de movimientos. La cuota global se consume antes de una denegación por origen, por lo que tráfico hostil puede reducir capacidad compartida.
- Verificar en el deployment real RLS/grants, separación Staging/Production y ausencia de variables heredadas.

Estos puntos bloquean `CAISSA_ONLINE_GUESTS=1`; no reabren los dos defectos de código P2 ya corregidos.

## Trazabilidad Git

- Base: `origin/main` en `585d070e3226dcd10e0fa6c50355dec554f66977`.
- Rama de credenciales: `fix/online-modern-supabase-keys-20261021`.
- Commit de credenciales: `d5e151cf170896e1b2309990ff0b19a368bd5b51`.
- Rama de seguridad: `fix/online-guest-security-p2-20261021`.
- HEAD de implementación revisado: `9e0d848e8aa8e16a030637196dcfed0cb7e92129`.
- Tree de implementación revisado: `70c7d47252b82bc27d06f4dfef2d320eb0033e0f`.
- Worktree: `.caissa-cloud-gate/online-guest-security-p2-20261021`.

## Rollback y cleanup

Antes de un deploy no existe rollback remoto: los cambios son commits locales aislados. En una futura Preview, rollback significa retirar únicamente esa Preview y sus variables branch-scoped, sin rotar claves ni tocar Production. Si un retest crea fixtures, su cleanup debe revocar sesiones y eliminar sólo los IDs sintéticos inventariados, borrar sólo su estado Staging asociado, volver a medir el baseline y detenerse ante cualquier recurso inesperado.

## Gate humano

Las próximas operaciones remotas requieren autorización nueva: publicar la rama integrada, instalar variables modernas limitadas a esa rama, crear la Preview protegida y ejecutar smoke alojado. La creación de dos identidades sintéticas y el retest de dos jugadores requieren además una autorización separada. Guests debe permanecer OFF.

La rama no se publicó durante este cierre: un push Online crearía una nueva Preview automática, operación expresamente reservada para el gate humano de recuperación de credenciales. El candidato local queda limpio y listo para una publicación coordinada posterior, sin mezclarlo con la PR de Account Control.

## Referencias de release

- [Vercel request headers — `x-vercel-forwarded-for`](https://vercel.com/docs/headers/request-headers#x-vercel-forwarded-for)
- [Supabase anonymous auth — abuse prevention y rate limits](https://supabase.com/docs/guides/auth/auth-anonymous#abuse-prevention-and-rate-limits)
