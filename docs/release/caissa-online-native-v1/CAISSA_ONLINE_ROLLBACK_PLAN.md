# CAISSA Online Native v1 — Preview Rollback Plan

Estado: **PROCEDIMIENTO PREPARADO; NO EJECUTADO**

## Alcance

Este plan cubre únicamente una futura Preview Vercel. No revierte datos, sesiones, partidas, ratings, migraciones o configuración de Supabase/Clerk.

## Baseline a capturar antes de publicar

Registrar, sin secretos:

- Proyecto Vercel y rama.
- Deployment actualmente servido por el alias de validación.
- Commit asociado.
- Estado READY y Deployment Protection.
- Variables efectivas por nombre/entorno, sin valores sensibles.
- Project ref de backend esperado: `aqizagaskicotorfpwfn`.
- Deployment previo READY elegible como fallback.

Referencia histórica, aún no reconfirmada: deployment `dpl_7fkd9oam8dcdeSFftNuXN1iTbbox`, commit `932e630d3f0ea111232b7b47eac98670183e4452`.

## Activadores

- Build no READY o assets/rutas rotos.
- Deployment no corresponde al commit autorizado.
- Preview apunta a Production o usa Clerk Production.
- Deployment Protection o rollout internal ausentes.
- Fallo BLOCKER/HIGH de auth, aislamiento, integridad o Realtime.
- Guest rated, doble resultado/rating o tercero accede a partida privada.

## Procedimiento futuro autorizado

1. Detener pruebas y conservar request IDs/evidencia sanitizada.
2. Mantener o devolver el rollout a `internal`/`off` según la autorización; nunca activar público.
3. Identificar deployment defectuoso y fallback READY por ID y commit.
4. Reasignar solo el alias de Preview o promover el fallback mediante el mecanismo Vercel autorizado.
5. Confirmar que el alias sirve el deployment/commit anterior y conserva Deployment Protection.
6. Ejecutar smoke de solo lectura: carga `/online`, assets, config y flujo de acceso sin crear datos.
7. Si hubo escrituras Staging, preservarlas y evaluar por separado. No ejecutar SQL destructivo ni borrar historial.
8. Documentar causa, alcance y estado final.

## Condiciones de parada

Detener el rollback si el fallback apunta a otro backend, exige secretos no disponibles, requiere tocar Production, o no se puede establecer la identidad exacta de deployment/commit. Solicitar autorización concreta para cualquier cambio adicional.

## Recuperación de backend

Un rollback frontend no deshace migraciones ni registros. Este candidato local no incluye cambios SQL; por tanto, el plan no propone rollback de base. Cualquier reparación o limpieza Staging necesita un procedimiento y autorización separados.
