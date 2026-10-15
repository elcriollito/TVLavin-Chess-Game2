# CAISSA Online Native v1 — Preview Deployment Report

Estado: **NOT EXECUTED — APPROVAL_REQUIRED**

## Candidato local

- Rama: `fix/caissa-online-workspace-geometry`
- Base/HEAD sin commit nuevo: `932e630d3f0ea111232b7b47eac98670183e4452`
- Digest del working-tree de código/pruebas: `b28b50de76a424f593e32f80eeb3f32a11e18cb67f9395862f3ade72132a3f87`

## Referencia histórica, no certificada para este candidato

- URL reportada: `https://caissa-online-native-v1-validation-26a830.vercel.app/online`
- Deployment reportado: `dpl_7fkd9oam8dcdeSFftNuXN1iTbbox`
- Commit reportado: `932e630d3f0ea111232b7b47eac98670183e4452`
- Backend esperado: Supabase Staging `aqizagaskicotorfpwfn`
- Clerk esperado: Development
- Rollout esperado: `internal`

La URL puede servir el baseline anterior y no contiene necesariamente el working tree actual. No se consultó Vercel, Supabase ni Clerk en este gate.

## Verificaciones requeridas después de autorización

1. Crear commit exacto y push normal de la rama aprobada.
2. Crear/actualizar PR sin merge.
3. Confirmar que el build Preview usa el commit exacto y termina READY.
4. Confirmar Deployment Protection, Supabase Staging y Clerk Development sin imprimir secretos.
5. Confirmar `CAISSA_ONLINE_ROLLOUT=internal`, Guest solo en Staging y Tournament/Spectators/Open Games reales desactivados.
6. Ejecutar primero smoke sin efectos persistentes.
7. Solicitar Gate B antes de crear sesiones anónimas, presencia, queue, partidas o movimientos.

## Resultado

No hay deployment, URL ni smoke nuevos que puedan atribuirse al digest local. Esta omisión es deliberada y conforme al STOP GATE A.
