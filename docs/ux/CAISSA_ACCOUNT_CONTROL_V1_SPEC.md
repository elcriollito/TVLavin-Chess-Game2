# CAISSA Account Control v1.0 — Data, Privacy & Self-Service Deletion

**Fecha:** 2026-10-18
**Estado:** DESIGN / SAFETY SPEC — AÚN NO IMPLEMENTADO
**Track:** My Account · Data & Privacy
**Base:** `js/identity/public-identity-dialog.js`, `api/user/public-identity.js`, Clerk Production y Supabase Production.
**Precondición:** [Límites de identidad](../security/CAISSA_IDENTITY_ENVIRONMENT_BOUNDARIES.md).

## 1. Qué verá el jugador

Dentro de **My Account → Account & identity**, añadir una sección claramente separada: **Data & Privacy**.

1. **Download my data · Descargar mis datos.** Exportar sus datos personales de CAISSA (identidad pública, entrenamiento, biblioteca, informes y metadatos que correspondan), de manera privada y temporal. Nunca exportar datos de terceros.
2. **Reset my chess progress · Reiniciar mi progreso.** Empezar de cero **solo en métricas seleccionadas de entrenamiento**; no modifica el subject Clerk, UUID, correo, nickname, recursos económicos, créditos, suscripciones, entitlements ni actividad histórica cuya conservación sea necesaria.
3. **Delete my CAISSA account · Eliminar mi cuenta.** Solicitar borrado del perfil y la identidad de autenticación **Clerk Production**, revocación de sesiones, baja del nickname y tratamiento de los datos propios según retención/obligaciones correspondientes.

La sección inicial es informativa y debe mostrar controles **solo cuando el backend esté operativo**; prohibido publicar botones decorativos que simulen borrados. Mantener el estilo negro de CAISSA, navegación por teclado, lector de pantalla, móvil y diálogos con foco correcto.

> **Separación obligatoria:** `Reset progress` NO equivale a `Delete account`. La primera conserva login y prestaciones; la segunda elimina la cuenta de la aplicación y puede requerir pasos de cancelación de pagos.

## 2. Flujo UX de eliminación

1. Usuario inicia sesión normal en **Clerk Production** y abre Data & Privacy.
2. CAISSA muestra un **resumen de impacto calculado en servidor**: progreso y biblioteca afectados, recursos comprados/entitlements, límites legales de retención y cualquier excepción de propiedad.
3. Ofrecer **Download my data** antes de continuar.
4. Exigir **reautenticación reciente** mediante mecanismo seguro del proveedor; el backend comprueba freshness y subject, no solo un click ni un email escrito.
5. Exigir segunda pantalla con consecuencias y confirmación explícita (ejemplo: escribir `DELETE`; nunca como sustituto de reautenticación).
6. Backend crea solicitud de borrado **idempotente, limitada a un usuario, con una única confirmación consumible**. Mostrar estado `PENDING`, `PROCESSING`, `COMPLETED` o `REVIEW_REQUIRED`.
7. Cuando esté completado: revocar sesiones, eliminar identidad en Clerk Production, borrar/anonimizar los datos autorizados, y redirigir a una pantalla de confirmación sin exponer datos personales.

**No prometer eliminación inmediata de copias de seguridad u obligaciones económicas** que tienen una política de retención distinta. Informar plazos y alcance real de la eliminación.

## 3. Invariantes de autorización — P0

- El usuario **solo puede solicitar operaciones sobre su subject Clerk Production verificado** y el UUID de Supabase vinculado de manera inequívoca.
- Prohibido aceptar `user_id`, `clerk_id`, subject o email elegidos por el cliente como objetivo de borrado. Resolver siempre del JWT autenticado.
- La sesión debe ser Production, fresca, sin ambigüedad y sin conflicto de bindings.
- **Conflicto histórico de propiedad cruzada:** si un subject Production apunta al UUID histórico de **otra** identidad, bloquear **EXPORT, RESET y DELETE de ese UUID** con `OWNERSHIP_REVIEW_REQUIRED`. No seguir un binding cruzado aunque Supabase lo marque `ACTIVE`.
- No usar email, nickname ni alias como prueba de propiedad.
- El rechazo de ownership no cancela el derecho a solicitar baja: ofrecer una vía manual de revisión y seguimiento de borrado **de la propia identidad** sin destruir datos de otra persona.
- Nunca borrar cuentas Clerk Development desde la acción de un usuario Production.
- Los usuarios históricos no migrados no se deben borrar como efecto colateral de una solicitud ajena.
- Rechazar tokens viejos/sesiones revocadas; invalidar sesiones y bloquear escrituras para sujetos con borrado pendiente.
- CSRF, rate limit, idempotency key y auditoría sanitizada en operaciones de efecto.

## 4. Backend propuesto (a implementar tras revisión)

**Rutas candidatas, no existentes ni autorizadas todavía:**
- `GET /api/account/privacy/summary` → elegibilidad y resumen, sin información de terceros.
- `POST /api/account/privacy/export` → genera exportación privada, temporal, autenticada y de un solo sujeto. Evitar archivos públicos.
- `POST /api/account/progress-reset/prepare`, `.../confirm` → confirmación doble, transacción limitada a progreso y auditoría.
- `POST /api/account/deletion/prepare`, `.../confirm` → solicitan y ejecutan borrado por etapas.
- `GET /api/account/deletion/status` → seguimiento autenticado o referencia de solicitud sin filtración de PII.

Implementar esquema en área protegida con RLS/grants mínimos, `deletion_requests` y ledger técnico auditado, usando un estado de operación independiente de las filas que se eliminarán. Antes de adoptar nombres o DDL concretos, auditar el esquema PostgreSQL completo y los RPC existentes.

**El borrado entre Clerk y Supabase no es una transacción SQL única.** Diseñar un flujo de etapas idempotente:
`REQUESTED → REAUTH_VERIFIED → LOCKED → DATA_ERASURE → AUTH_DELETION → COMPLETED`
con `FAILED_REVIEW`/reintento controlado y ledger independiente.

Una marca de bloqueo anterior a la eliminación debe impedir que `/api/user/sync` o endpoints paralelos vuelvan a crear el perfil con tokens viejos. La falta de disponibilidad de Clerk no debe reactivar una cuenta ya borrada en Supabase. Las operaciones asíncronas deben detectar duplicados y terminar sin destrucciones cruzadas.

## 5. Inventario de datos y política de manejo

El esquema de Supabase Production tenía 35 claves foráneas directas a `public.users` al revisar el 18-10-2026:
**24 CASCADE, 4 RESTRICT, 4 SET NULL, 3 NO ACTION**. Este grafo puede cambiar y debe auditarse recursivamente antes de toda operación real.

| Clase | Ejemplos | Manejo esperado |
|---|---|---|
| Entrenamiento | `puzzle_training_progress`, `puzzle_training_attempts` | Reset selectivo o eliminación propia, sin tocar cuentas de terceros |
| Identidad pública | `caissa_public_identities` | Revocar nickname con la cuenta, liberar disponibilidad según política |
| Colecciones y análisis | `library_*`, `insight_*`, `mentor_operation_results` | Exportar/borrar según titularidad y retención |
| Scanner | `scanner_beta_scans`, fallos y feedback | FKs RESTRICT; manejar propiedad y posible pseudonimización explícita antes del borrado |
| Ajedrez Online | perfiles, ratings, partidas, torneos | Desvincular/anonymizar autor según integridad del historial; no borrar partidas de otros |
| Economía | `credit_events`, `credit_reservations`, `user_entitlements`, `stripe_events` | Comprobar compras, billing/subscriptions, conservar solo evidencia exigida y cancelar futuras prestaciones/cargos apropiadamente |
| Seguridad y auditoría | bindings, challenges, rate limits, audit events | Retención mínima legal/técnica, pseudonimizada; no borrar evidencia de fraude/incidentes ajenos |

No omitir pruebas de prestaciones de pago, cobros o suscripciones actuales o futuras, aunque un snapshot concreto tenga cero eventos de facturación.

El esquema y los datos personales pueden abarcar registros fuera de `public.users`; exportación y erasure no se limitan a `DELETE FROM public.users`.

En v1.0, mientras la integración no conserve un ledger autoritativo por ID de
suscripción, toda cuenta con `stripe_customer_id` permanece en revisión manual
para el borrado. Este límite fail-closed también puede incluir clientes que sólo
compraron créditos: antes de borrar se debe conciliar el cliente en Stripe,
confirmar que no existe ningún cobro recurrente presente o futuro y retirar el
vínculo de forma controlada. Nunca se sustituye esa verificación por poner
`is_premium=false`.

## 6. Reinscripción futura con el mismo correo

Si se completó la baja:
- El usuario puede **registrarse otra vez solo cuando Access mode = Open y `/signup` esté funcional**; durante Invite-only sigue restringido.
- Clerk crea una **identidad nueva**; CAISSA crea **UUID nuevo** con rating, estadísticas y preferencias nuevas.
- **No** reactivar bindings antiguos por coincidencia de email, nickname o sesión Development.
- Nickname anterior puede requerir período de liberación/cuarentena según el contrato de identidad pública.
- Los datos anteriores no se restauran automáticamente.
- Las cuentas con borrado `PROCESSING` no pueden reinscribirse en ese estado sin controles adicionales.

## 7. QA / release gates

### QA sintético inicial (Staging)
- [ ] Cuenta propia completa export/reset/delete.
- [ ] Cuenta A intenta apuntar a `user_id`/subject de B → 403 y 0 escrituras.
- [ ] Production JWT vs Development JWT → emisor incorrecto rechazado.
- [ ] Dos sesiones válidas de identidades diferentes → denegar cruce.
- [ ] Binding histórico ambiguo → REVIEW_REQUIRED sin exportación ni destrucción de UUID ajeno.
- [ ] Reautenticación caducada, CSRF, doble click, replay, concurrencia → fallar cerrado.
- [ ] Revocación de sesiones y prueba de que `/api/user/sync` no recrea cuenta.
- [ ] Fallo Clerk tras limpieza Supabase → estado duradero reintentable y usuario bloqueado.
- [ ] Créditos y entitlements NO cambian en Reset progress.
- [ ] Billing activo requiere política; nunca dejar cargos automáticos sin control.
- [ ] Exportación privada con expiración, sin enlaces públicos ni terceros.
- [ ] Chrome, Edge, Firefox, WebKit y responsive; UI accesible y clara.
- [ ] Eliminación y reinscripción del mismo correo en instancia de prueba → **nuevo** Clerk subject / UUID.

### Gates de publicación
1. Documentación de política de borrado, retención y propiedad aprobada.
2. Regresión del conflicto de propiedad cruzada con dataset exclusivamente sintético certificado.
3. Snapshot/backup verificable, pruebas de restauración y planes de rollback/auditoría.
4. Scanner/CI, review de seguridad independiente, Preview aislada y smoke.
5. **Autorización separada** para cualquier cambio o borrado real en Production.

**Estado actual:** diseño solamente. No se han creado endpoints, tablas, botones, jobs ni eliminaciones. Mantener Clerk Production Invite-only y PR #76 de pausa hasta el gate correspondiente.

**Referencias:** [Clerk deleteUser](https://clerk.com/docs/reference/backend/user/delete-user), [Clerk revokeSession](https://clerk.com/docs/reference/backend/sessions/revoke-session), [Supabase RLS](https://supabase.com/docs/guides/database/postgres/row-level-security), [Supabase Storage ownership](https://supabase.com/docs/guides/storage/security/ownership).
