# CAISSA Online Native v1 — Human Test Runbook

Estado: **PREPARADO, NO EJECUTADO**

## URL y prerrequisitos

La URL histórica es `https://caissa-online-native-v1-validation-26a830.vercel.app/online`, pero no debe usarse para certificar este candidato hasta que el reporte de Preview identifique un deployment y commit coincidentes.

Antes de invitar a los jugadores:

- Preview HTTPS READY y protegida.
- Commit/deployment iguales al candidato autorizado.
- Backend exclusivamente Supabase Staging `aqizagaskicotorfpwfn`.
- Clerk Development y dos cuentas diferentes; no compartir passwords, cookies o tokens.
- Rollout `internal`; Production y rollout público fuera de alcance.
- PC A y PC B con navegador actualizado; registrar navegador, versión y hora.

No son necesarios portproxy, firewall, WSL, Docker ni exposición LAN: ambos equipos usan la Preview HTTPS protegida.

## Orden de escenarios

1. Registered vs Registered: ejecutar T01–T15 y T18–T20.
2. Registered vs Guest: repetir matchmaking, partida, resultado, rating y lifecycle Guest.
3. Guest vs Guest: dos perfiles de navegador completamente separados; confirmar sesiones distintas y unrated.
4. Mobile visual smoke: T17 en móvil o emulación táctil controlada.

## Procedimiento PC A / PC B

1. Abrir la URL exacta en perfiles separados.
2. Superar Deployment Protection con el mecanismo autorizado, sin enviar credenciales por chat.
3. Iniciar sesión directamente en Clerk Development o elegir Guest según el escenario.
4. Confirmar identidad visible antes de iniciar acciones.
5. Elegir el mismo control de tiempo y seguir la fila T01–T20 correspondiente.
6. Anotar resultado real inmediatamente; no marcar PASS por expectativa.
7. Capturar pantalla ante cada fallo e incluir la hora local, browser y Test ID.

## Registro de defectos

Para cada defecto registrar:

- Test ID y escenario.
- Hora con zona horaria.
- PC A/B, navegador y versión.
- Pasos mínimos.
- Resultado esperado y real.
- Screenshot o video sanitizado.
- Request ID/status HTTP si es visible, sin tokens.
- Si hubo WebSocket, indicar estado (`SUBSCRIBED`, timeout, closed) sin JWT.

Clasificación rápida:

- UI: disposición, foco, interacción, texto o tablero local.
- Auth: sesión, retorno, identidad o 401/403.
- Realtime: el servidor acepta el estado pero el rival no recibe señal; confirmar si polling corrige.
- Backend: rechazo/estado canónico, versión, legalidad, reloj, resultado o rating.

## Condiciones de parada

Detener el escenario si aparece cualquiera de estos casos:

- Referencia o credencial de Production.
- Usuario no participante puede leer o actuar sobre una partida.
- Guest modifica rating.
- Doble resultado/rating o corrupción de estado.
- Secreto/token aparece en consola, UI o evidencia.
- El deployment no coincide con el commit autorizado.

No borrar datos manualmente. La limpieza persistente requiere autorización separada.

## Fin de sesión

- Abandonar queue de forma normal.
- Responder/cancelar desafíos de prueba.
- Finalizar o dejar identificadas las partidas creadas.
- Cerrar sesión o terminar la sesión Guest.
- Esperar el TTL normal de presencia y comprobar T20.
- Cerrar perfiles del navegador; no copiar cookies entre equipos.
