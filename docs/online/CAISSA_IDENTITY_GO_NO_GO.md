# CAISSA Public Identity — Go/No-Go local

## Veredicto

`PUBLIC_IDENTITY_LOCAL_RECERTIFIED`

Significa:

- los bloqueos remediables localmente están corregidos;
- Unicode v1, privacidad histórica, Guest, routing y migración/rollback están certificados con datos sintéticos;
- las suites afectadas y el cross-browser pasaron;
- dos hallazgos de la revisión de seguridad del candidato anterior fueron corregidos localmente y tienen regresiones dirigidas;
- existe un plan branch-scoped y una solicitud precisa para el siguiente gate.

No significa:

- que Staging esté modificado;
- que la migración haya sido probada en Supabase alojado;
- que Clerk Development o una Preview hayan sido configurados;
- que PR #71 esté actualizada;
- que exista autorización para commit, push, deploy, Production o rollout.

## Condiciones antes de Staging

1. Generación y verificación del nuevo sello reproducible.
2. Autorización explícita para el nuevo SHA-256 de la migración; el hash previamente autorizado ya no es válido.
3. Aplicación y certificación branch-scoped de Vercel/Clerk/Supabase sin herencia de Production.

## Riesgos residuales aceptados solo para revisión

- NFKC+lower no es case folding completo ni skeleton UTS #39.
- Consumidores futuros deben usar la proyección histórica central; los roles de navegador ya no reciben SELECT directo de la fila completa.
- El rollback exacto restaura el contrato anterior y reabre esa lectura; solo es admisible con Online apagado y autorización separada.
- Dos fallos de suites amplias pertenecen al baseline/entorno y están documentados, no ocultos.

La decisión de release sigue siendo `NO-GO` hasta completar Staging y una revisión independiente de sus resultados.
