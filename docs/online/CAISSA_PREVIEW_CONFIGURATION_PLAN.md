# CAISSA Public Identity — plan de Preview segura

Este plan no fue ejecutado. No contiene valores secretos.

## Destino propuesto

- Proyecto Vercel primario: `tv-lavin-chess-game2` / `prj_SU3FQKbxjztMccLO5TYBSpU6XvDf`.
- Rama: `fix/caissa-public-player-identity`.
- Target: Preview, nunca Production.
- Supabase: Staging `aqizagaskicotorfpwfn`.
- Clerk: instancia Development.
- Deployment Protection: activa.
- Segundo proyecto Git/Vercel conocido: `caissa-chess` / `prj_UhbgAvWRgEdqDRrWy9lth7gtwzee`; debe quedar intacto salvo autorización separada.

## Variables requeridas en Preview

- `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` o `CLERK_PUBLISHABLE_KEY`: Development.
- `CLERK_SECRET_KEY` o `CLERK_JWT_KEY`: Development, server-only.
- `CAISSA_CLERK_AUTHORIZED_PARTIES`: únicamente hosts de Preview autorizados.
- `CAISSA_BROWSER_ORIGINS`: únicamente orígenes de Preview autorizados.
- `SUPABASE_URL` o `NEXT_PUBLIC_SUPABASE_URL`: ref Staging exacta.
- `SUPABASE_SECRET_KEY`: clave moderna `sb_secret_…` de Staging, server-only. `SUPABASE_SERVICE_ROLE_KEY` queda sólo como compatibilidad legacy para un JWT `service_role` todavía habilitado.
- `SUPABASE_PUBLISHABLE_KEY`: clave moderna `sb_publishable_…` de Staging. El navegador combina esta API key pública con el JWT real de la sesión del usuario; ninguna clave secreta puede entrar en la configuración pública.
- `CAISSA_ONLINE_ROLLOUT=internal`.
- `CAISSA_ONLINE_INTERNAL_USERS`: solo IDs sintéticos Development autorizados.
- `CAISSA_ONLINE_GUESTS=1`.
- `CAISSA_ONLINE_RATED=0` durante el gate.
- `CAISSA_ONLINE_TOURNAMENTS=0`.
- `CAISSA_ONLINE_SPECTATORS=0`.
- `CAISSA_ONLINE_MULTIBOARD=0`.

## Debe estar ausente

Cualquier ref/key de Production, Clerk Production, `CAISSA_ONLINE_ROLLOUT=production`, identidades humanas, service roles ajenos, credenciales de Stripe, datos exportados, cookies y storage state versionados.

## Pre-push y post-deployment

1. Confirmar HEAD, digest del candidato y diff permitido.
2. Inventariar variables por nombre, target y rama sin mostrar valores.
3. Verificar la identidad efectiva del project ref mediante config pública y una comprobación server-side sanitizada.
4. Verificar issuer/JWKS Development, authorized parties, SSO y protección.
5. Detenerse si la integración Git crea un destino con herencia no certificada.
6. Tras deploy, comprobar deployment `READY`, SHA exacto, target Preview, SSO, rollout internal y capacidades desactivadas.
7. Ejecutar primero smoke read-only; las escrituras sintéticas necesitan autorización propia.

Rollback de Preview: volver el alias autorizado al deployment anterior o retirar la Preview; no tocar Production ni hacer rollback SQL automático.

Antes de habilitar `CAISSA_ONLINE_GUESTS=1`, Supabase Auth debe tener límites de alta anónima y protección anti-bot/CAPTCHA verificados, y debe existir limpieza operativa de identidades y estado guest vencidos. El modo `internal` no anuncia alta guest pública: cualquier prueba interna de un invitado exige que su UUID ya esté explícitamente en `CAISSA_ONLINE_INTERNAL_USERS`. El API requiere el origen derivado por Vercel y aplica cuotas compartidas globales, por origen pseudonimizado y por sujeto antes de crear estado durable.

Gate: `PREVIEW_CONFIGURATION_PLAN_READY`.
