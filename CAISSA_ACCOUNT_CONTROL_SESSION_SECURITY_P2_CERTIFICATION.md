# CAISSA Account Control — Session Security P2 Certification

Fecha: 2026-10-21  
Estado: `CAISSA_ACCOUNT_CONTROL_V1 — SESSION_SECURITY_P2_LOCAL_CERTIFIED / HOSTED_APPROVAL_PENDING`

## Alcance y cadena certificada

- Repositorio: `TVLavin-Chess-Game2`.
- Rama aislada: `fix/account-control-session-security-p2-20261021`.
- Base inmutable: `e4a341eef1dcd74fa03af335d8547cd846de4510` (HEAD verificado de PR #93; PR #92 permanece como dependencia anterior).
- Commit de implementación certificado: `fe4f87f52154ab7333b403cca36fae95e9b1af2f`.
- Tree de implementación certificado: `74e950a70ef1f3126b1babd45ed16f8475424ea3`.
- Archivos de implementación: `api/_lib/auth.js`, `api/_lib/account-control.js`.
- Regresiones nuevas: `tests/api-auth-contract.test.js`, `tests/account-control.test.js`.
- No se modificaron migraciones, configuración de Clerk, Supabase, Vercel, GitHub ni datos alojados.

La certificación es local. No demuestra todavía la propagación real de `session.end()` ni el comportamiento de la red/instancia Clerk Development alojada.

## Resultado

P2-A y P2-B quedan cerrados en código y pruebas locales.

1. Los siete endpoints de Account Control consultan el estado actual de la sesión después de verificar el JWT y antes de resolver ownership o tocar datos privados.
2. Sólo continúa una sesión con `id === verifiedJWT.sid`, `userId === verifiedJWT.sub` y `status === 'active'`.
3. JWT malformados o inválidos reciben `401`; fallos de configuración, JWKS o proveedor conservan `503`.
4. El rate limit persistente se ejecuta antes de la consulta remota para evitar convertir Account Control en un amplificador hacia Clerk.
5. El escáner de seguridad del diff concluyó con cobertura completa, cero candidatos y cero hallazgos reportables.

## Causa raíz P2-A

La verificación anterior probaba firma, claims, issuer, authorized party y vigencia temporal del JWT, pero un JWT ya emitido no refleja por sí solo un cambio posterior en el estado de la sesión Clerk. `jti` identifica el token; no constituye una prueba de revocación.

Como `context()` no consultaba Clerk, un JWT aún no expirado podía atravesar Summary, Export, Reset, Deletion y Deletion Status durante la ventana posterior a `session.end()`.

La solución sigue el contrato documentado de [`clerkClient.sessions.getSession()`](https://clerk.com/docs/reference/backend/sessions/get-session) y valida explícitamente el objeto [`Session`](https://clerk.com/docs/reference/backend/types/backend-session).

## Causa raíz P2-B

Había dos rutas hacia el `503` genérico:

- La clasificación exigía `err instanceof TokenVerificationError`. Esa identidad de prototipo no es una frontera estable entre copias/bundles del SDK, aunque `reason` sea una razón auténtica de Clerk.
- `@clerk/backend@2.33.6` puede lanzar un `SyntaxError` sin envolver al decodificar ciertos JWT compactos malformados. Esos errores no tenían una razón allowlisted y caían en `AUTH_SERVICE_UNAVAILABLE`.

Además, `jwk-kid-mismatch` no estaba clasificado como evidencia de token inválido. Con JWKS disponible, un token de otra instancia puede fallar por `kid` antes de alcanzar la comparación de issuer.

La reparación usa las razones estables del SDK sin depender de `instanceof`, incorpora `jwk-kid-mismatch` a los errores de cliente y comprueba localmente la estructura compacta/canónica del JWT sólo cuando el verificador lanza una excepción. Un token estructuralmente válido con fallo genérico sigue siendo `503`; no se convirtió indiscriminadamente cualquier excepción en `401`. El contrato base de [`verifyToken()`](https://clerk.com/docs/reference/backend/verify-token) se conserva.

## Contrato de sesión activa

Orden efectivo para Account Control:

1. Validar modo, ownership enforcement, authority y proyecto Supabase exacto.
2. Aplicar origin/JSON a operaciones con efecto.
3. Verificar criptográficamente el JWT, issuer y authorized parties.
4. Exigir que la authority del JWT coincida con la del entorno.
5. Consumir el rate limit persistente usando un HMAC del `sub` verificado.
6. Obtener `sid` exclusivamente del resultado verificado; nunca del body o de un identificador libre del navegador.
7. Validar la familia del `CLERK_SECRET_KEY` (`sk_test_` para Development, `sk_live_` para Production).
8. Ejecutar una consulta no cacheada `sessions.getSession(sid)` con espera máxima predeterminada de 2500 ms.
9. Exigir respuesta bien formada, ID exacto, usuario exacto y `status === 'active'`.
10. Aplicar `jti`/`fva[0] <= 5` cuando la operación exige reautenticación reciente.
11. Resolver ownership VERIFIED/ACTIVE y continuar con el RPC o stream owner-scoped.

Cada solicitud vuelve a consultar el estado. Prepare y Confirm no comparten una autorización cacheada.

## Clasificación HTTP

| Condición | Resultado |
|---|---|
| Authorization ausente o esquema no Bearer | `401 AUTH_REQUIRED` |
| JWT compacto malformado/no canónico | `401 INVALID_TOKEN` |
| Firma, tiempo, algoritmo, issuer o authorized party inválidos | `401 INVALID_TOKEN` |
| `jwk-kid-mismatch` con verificación fallida | `401 INVALID_TOKEN` |
| `sid` firmado ausente | `401 AUTH_REQUIRED` |
| Sesión inexistente (`400/404/410/422`) | `401 AUTH_REQUIRED` |
| Sesión no activa, ID distinto o `userId !== sub` | `401 AUTH_REQUIRED` |
| Configuración/secret ausente o con familia incorrecta | `503 AUTH_SERVICE_UNAVAILABLE` |
| JWKS ausente, inválido, no disponible o no resoluble | `503 AUTH_SERVICE_UNAVAILABLE` |
| Red, rate limit del proveedor, credencial del proveedor o 5xx | `503 AUTH_SERVICE_UNAVAILABLE` |
| Timeout o respuesta Clerk malformada | `503 AUTH_SERVICE_UNAVAILABLE` |
| Rate limit persistente de CAISSA denegado | `429 RATE_LIMITED`, antes de consultar Clerk |

Las respuestas no incluyen mensajes del SDK, tokens, session IDs, claves ni datos de proveedor. Los diagnósticos del lookup registran sólo evento, nombre de error saneado y status numérico opcional.

## Cobertura por operación

El guard compartido cubre:

- Account Summary.
- Private Export.
- Prepare Reset.
- Confirm Reset.
- Prepare Deletion.
- Confirm Deletion.
- Deletion Status.

Las pruebas demuestran que una sesión terminada detiene las siete rutas antes de ownership, lecturas privadas y efectos. Deletion Status también tiene una prueba positiva con sesión activa y owner scope verificado.

## Controles preservados

- Verificación criptográfica y temporal del JWT.
- Issuer y authorized parties.
- `sid`, `jti` y `fva[0]` firmado.
- Reautenticación máxima de cinco minutos.
- Exact Account Control environment/project gate.
- Identity ownership VERIFIED/ACTIVE.
- FORCE RLS y permisos service-role-only sin cambios SQL.
- CSRF/origin y JSON content type.
- Rate limits persistentes y fail-closed.
- Idempotency key, confirmation hash, expiry y state machine.
- Barreras y cuarentena de eliminación.
- Target owner derivado exclusivamente de la sesión/ownership verificados.

## Impacto en otros endpoints

La consulta remota de sesión se limita a `api/_lib/account-control.js`; no se añadió a Wallet, Library, Checkout, Credits, Online, Puzzles ni al resto de CAISSA.

`api/_lib/auth.js` sí es compartido. Su único cambio observable es la clasificación correcta a `401` de JWT malformados, razones auténticas de token inválido cruzando límites de bundle y `jwk-kid-mismatch`. Las razones de infraestructura continúan en `503`.

Prerequisito de despliegue: Account Control ahora requiere `CLERK_SECRET_KEY` aun cuando la verificación JWT use `CLERK_JWT_KEY`, porque el estado vivo y la eliminación de usuario son operaciones del Backend API.

Coste esperado: una lectura Clerk Sessions API por solicitud Account Control que supere el rate limit de CAISSA. No existe caché de estado `active`.

## QA local

| Área | Comando/evidencia | Resultado |
|---|---|---|
| Instalación reproducible | `npm ci` | PASS; 152 paquetes, 0 vulnerabilidades |
| Account Control | `npm run test:account-control` | PASS 36/36 |
| Identity Organization | `npm run test:identity-organization` | PASS 53/53 |
| Public Identity | `npm run test:public-identity` | PASS 23/23 |
| SEC-005 | `npm run test:sec005` | PASS 90/90 |
| Account Control browsers | Chromium + Firefox + WebKit | PASS 18/18 |
| Public Identity browsers | Chromium + Firefox + WebKit | PASS 12/12 |
| Mobile | 390×844 Account Control y 390/340 px Public Identity en los tres motores | PASS |
| Lint Account Control | `npm run lint:account-control` | PASS |
| Lint Public Identity | `npm run lint:public-identity` | PASS |
| Build genérico | `npm run build --if-present` | N/A: `package.json` no define script `build` |
| Build/audit público | `npm run release:public:audit` | PASS; 1812 archivos, 23 paths, 24 contratos Chess TV |
| Supply-chain | `npm run security:dependencies` | PASS; 482 runtime files, 177 lock entries, `npm audit` 0 vulnerabilidades |
| Diff hygiene | `git diff --check` | PASS |
| Codex Security diff scan | Scan `a0048ab9-7624-4a55-8dfd-07b07d616009` | PASS; cobertura completa, 2/2 fuentes, 0 hallazgos |

El script genérico de build no se declaró PASS: no existe. La auditoría pública del repositorio fue la comprobación de build disponible y sí pasó.

Informe generado del escáner:

`C:\Users\ALEXANDER\.codex\state\plugins\codex-security\scans\account-control-session-security-p2-20261021\e4a341eef1dcd74fa03af335d8547cd846de4510_20261021T205741Z_arorew9j\report.md`

## Revisión independiente

La primera revisión independiente confirmó dos problemas del candidato inicial:

1. El lookup Clerk estaba antes del rate limit persistente y podía amplificar tráfico hacia el proveedor.
2. `jwk-kid-mismatch` seguía en `503`, por lo que un token de otra instancia podía incumplir el contrato de wrong issuer/invalid token.

Ambos se corrigieron antes de la QA final. El diff estabilizado pasó después por Codex Security con cero hallazgos reportables.

## Riesgos residuales

- La validación es point-in-time. Una sesión puede terminar inmediatamente después de comprobar `active`; la operación ya admitida no se cancela de forma atómica.
- `Promise.race` limita la espera de la respuesta, pero `@clerk/backend` no expone un `AbortSignal` en `getSession()` y la solicitud subyacente puede finalizar después.
- La rapidez con que Clerk refleja `session.end()` es una propiedad alojada que todavía debe medirse; no se afirma revocación instantánea hasta completar la certificación hosted.
- El rate limit de CAISSA tiene precedencia. Una solicitud con JWT criptográficamente válido puede recibir `429` sin consultar el estado de sesión cuando ya agotó su bucket; nunca se autoriza la operación.
- La nueva lectura remota añade latencia y dependencia del Backend API a Account Control, no al resto de CAISSA.

## PR de reparación preparada

Título propuesto:

`fix(auth): enforce live Clerk sessions for Account Control`

Base propuesta:

PR #93 / commit `e4a341eef1dcd74fa03af335d8547cd846de4510`.

Body propuesto:

```markdown
## Summary

- require a current active Clerk session for all seven Account Control operations
- bind the live session id/user to the verified JWT sid/sub
- bound the uncached Clerk lookup and fail closed with sanitized 401/503 responses
- classify malformed JWTs and cross-bundle Clerk invalid-token reasons as 401
- preserve provider/JWKS/configuration failures as 503 and rate-limit before the provider lookup

## Validation

- Account Control 36/36
- Identity Organization 53/53
- Public Identity 23/23
- SEC-005 90/90
- Chromium/Firefox/WebKit Account Control 18/18
- Chromium/Firefox/WebKit Public Identity 12/12
- mobile coverage in all three engines
- lint, public release audit, supply-chain and npm audit pass
- Codex Security diff scan: complete coverage, zero findings

## Release gate

Local certification only. No push, merge, deployment, hosted mutation, Clerk Settings change, migration, fixture, reset, or delete was performed. Hosted certification remains approval-gated.
```

No se creó ni actualizó ninguna PR y no se ejecutó `push`.

## Plan de certificación alojada — no ejecutado

Requiere autorización humana separada y debe usar exclusivamente Clerk Development + Supabase Staging:

1. Confirmar commit desplegado, environment/project/authority exactos y baseline Staging.
2. Crear dos identidades sintéticas con inventario previo de IDs exactos.
3. Iniciar sesión legítima A y confirmar JWT firmado con `sid`, `jti`, issuer, authorized party y `fva` reciente.
4. Certificar A/B isolation bidireccional en Summary, Export y Deletion Status sin ejecutar Reset/Delete real.
5. Probar JWT malformado, alterado, firma incorrecta, issuer/party incorrectos y confirmar `401` saneado.
6. Reautenticar A, obtener token fresco y confirmar acceso Account Control válido.
7. Ejecutar `session.end()` en Clerk Development, conservar el JWT anterior y medir tiempo/estado hasta que `getSession()` deje de ser `active`.
8. Repetir los siete endpoints y confirmar rechazo; no afirmar inmediatez si se observa propagación.
9. Probar indisponibilidad/timeout de forma controlada sin cambiar Production y confirmar `503` fail-closed.
10. Revocar sesiones, eliminar únicamente las identidades sintéticas por IDs inventariados y verificar Clerk Development en cero para esos fixtures.
11. Verificar que Supabase Staging regresa exactamente a su baseline y que no quedan operaciones, datos ni sesiones asociadas.
12. Adjuntar status, headers saneados, timestamps, IDs redacted, cleanup y baseline final al informe hosted.

Este plan no fue ejecutado y no se crearon identidades durante esta misión.

## Human gate

El siguiente paso permitido es revisión humana del commit local y de este informe. Permanecen no autorizados: push, merge, despliegue Production/Custom Staging, migración alojada, Clerk Settings, fixtures alojados, cuentas reales, Reset/Delete alojado y limpieza de worktrees.
