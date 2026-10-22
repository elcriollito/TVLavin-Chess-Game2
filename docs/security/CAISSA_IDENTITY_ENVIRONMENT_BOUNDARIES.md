# CAISSA Identity Organization — Production, Development y acceso interno

**Fecha:** 2026-10-18  
**Estado:** SPEC / NO DESPLEGADO  
**Track:** CAISSA Identity Organization  
**Alcance:** diagnóstico, segregación, controles de acceso e inventario; **sin eliminación ni migración de cuentas**.

## 1. Regla canónica

**Clerk Production, Clerk Development, Supabase Production, Supabase Staging y Vercel son autoridades con responsabilidades diferentes.** Una cuenta que aparece en `Users` de Clerk no es miembro de la organización Clerk ni del equipo Vercel y no obtiene permisos administrativos.

| Superficie | Propósito | Quién debe autenticarse | Restricción |
|---|---|---|---|
| Clerk **Production** | Inicio de sesión de jugadores de CAISSA pública | Personas registradas en CAISSA | Actualmente **Invite-only**; no cambiar hasta el gate de reapertura |
| Clerk **Development** | Pruebas y legado histórico | Solo desarrollo/pruebas y usuarios históricos pendientes de clasificación | Nunca asumir que todas sus cuentas son fixtures ni trasladarlas automáticamente |
| Supabase **Production** `jczauvkfkweuvdpurpem` | Datos activos e históricos del sitio | Backend del sitio, bajo JWT y autorización propia | No ejecutar resets ni operaciones destructivas fuera de gate |
| Supabase **Staging** `aqizagaskicotorfpwfn` | Pruebas e integración aislada | Sujetos sintéticos / cuentas aprobadas de prueba | No usar las credenciales de Production |
| Vercel Production | Hosting de `www.caissa-chess.org` | Público en dominio real | No concede permisos de administración |
| Vercel **Preview** | Ingeniería, QA y experimentos | Equipo autorizado expresamente por Vercel SSO | Mantener SSO; **jamás** pedir a jugadores que entren a Vercel |

Los nombres de usuario, correos, aliases y nicknames no conceden acceso administrativo. Los roles Clerk Dashboard, Vercel y Supabase son independientes de las identidades de jugador.

## 2. Incidente y estado histórico

Conservar como caso de regresión un conflicto de propiedad cruzada documentado en un expediente interno entre una sesión Clerk Production y **otro** perfil histórico Clerk Development. El usuario autenticado en Production **no adquiere propiedad** sobre un UUID histórico por el mero hecho de tener dos sesiones auténticas.

Un baseline read-only restringido fue certificado el 18-10-2026. Los conteos y la correspondencia entre sujetos constan únicamente en el expediente interno de seguridad, no en esta especificación pública. Son diagnósticos fechados, no invariantes que deban sobrescribirse.

No borrar ni transferir automáticamente las cuentas de Development: allí hay identidades históricas auténticas además de usuarios sintéticos. No inferir el carácter sintético únicamente por correo, display name o antigüedad.

## 3. Clasificación de identidades (inventario restringido)

Mantener un inventario **solo de uso interno**, nunca con correos o subjects completos en GitHub público, con estados:
- `PRODUCTION_CURRENT`: cuenta Clerk Production válida, activa o restringida.
- `LEGACY_DEVELOPMENT`: identidad histórica verificada, pendiente de política de legado.
- `TEST_FIXTURE`: sujeto sintético demostrado y de entorno de pruebas.
- `REVIEW_REQUIRED`: sin atribución concluyente; no habilitar acciones destructivas.
- `QUARANTINED`: binding o línea de propiedad con conflicto documentado.
- `DELETED_REDACTED`: eliminación completada y auditada sin PII innecesaria.

La columna `environment` indica autoridad de identidad, no nivel de acceso. Nunca emparejar usuarios por email o nickname.

## 4. Contratos técnicos

1. El sitio público solo acepta JWT con **issuer/audience/authorized parties de Clerk Production** válidos.
2. Las APIs resuelven exactamente el subject autenticado y su `user_id` perteneciente. En caso de choque con binding histórico, **fail-closed**.
3. Staging y Previews de pruebas solo pueden escribir en Supabase Staging, salvo autorización explícita y aislada.
4. Las cuentas Development no entran automáticamente en Production; no se envían códigos de verificación a una instancia incorrecta.
5. Los accesos a Preview protegida no se tramitan como altas de jugador; la solicitud externa de Vercel no da acceso a Clerk ni a CAISSA.
6. La provisión de nuevas cuentas debe impedir reusar UUID históricos, créditos, entitlements o intentos por coincidencia de correo.
7. El sistema de baja nunca debe eliminar **ninguna identidad** diferente al subject Production autenticado y previamente autorizado.
8. Toda credencial y token de servicio permanece en backend; no incluirlos en frontend, repositorio, capturas ni logs.

## 5. Matriz de pruebas

- [ ] Production rechaza JWT Development; Development rechaza JWT Production.
- [ ] Dos cuentas con igual email en distintas instancias nunca se unen automáticamente.
- [ ] Usuario normal no puede acceder al Dashboard de Vercel/Clerk por ser jugador.
- [ ] Preview protegida muestra Vercel SSO y no invita automáticamente a clientes externos.
- [ ] Usuario Clerk Production sin perfil propio no obtiene por defecto un UUID legacy.
- [ ] El binding incorrecto histórico queda en cuarentena antes de exportar, resetear o borrar.
- [ ] Nuevos perfiles comienzan con métricas y recursos propios, no heredados.
- [ ] Registros y errores no revelan subjects, emails ni tokens.

## 6. Release gate y rollback

**NO cambiar todavía:**
- Clerk Production **Invite-only**.
- La pausa de registro publicada mediante **PR #76**.
- Supabase Production, el rollout Online, ni el dataset legacy.
- El acceso Vercel SSO en Previews.

La reapertura del registro está documentada en [PR #77](https://github.com/elcriollito/TVLavin-Chess-Game2/pull/77) y [issue #78](https://github.com/elcriollito/TVLavin-Chess-Game2/issues/78). No es consecuencia automática de implementar Account Control.

**Gate para pasar a código:** aprobar explícitamente la matriz de ownership y el tratamiento del caso histórico antes de habilitar exportación, reset o borrado reales.

**Referencias:** [Clerk: Instances/Environments](https://clerk.com/docs/guides/development/managing-environments), [Clerk: Access mode](https://clerk.com/docs/guides/secure/restricting-access).
