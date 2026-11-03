# CAISSA CLEAN START — Recordatorio obligatorio: reabrir el registro público

**ID del gate:** `CAISSA-CS-REOPEN-001`  
**Creado:** 18 de octubre de 2026  
**Estado:** 🔒 **PENDIENTE — NO EJECUTAR TODAVÍA**  
**Responsable del gate:** propietario de CAISSA + equipo de ingeniería/release

> **NO OLVIDAR:** Cuando CAISSA Clean Start esté realmente terminado y certificado, devolver **Clerk Production → Access mode** de **Invite-only** a **Open**, restaurar el registro propio de CAISSA y retirar el aviso temporal de mantenimiento. Estas acciones deben coordinarse: cambiar Clerk a Open por sí solo NO reabre la página `/signup`.

## 1. Por qué existe este recordatorio

El **18 de octubre de 2026**, el propietario confirmó en el Dashboard de Clerk que la instancia **CAISSA Chess → Production** tiene **Access mode = Invite-only**.

La restricción se estableció de forma **temporal** para impedir nuevas inscripciones durante el proyecto **CAISSA Clean Start**. Se había observado una solicitud externa de acceso a una **Preview interna de Vercel**; una Preview protegida no debe funcionar como puerta de registro público.

También se publicó el hotfix **PR #76** (`6c27fefc0de3fd91732eecc9999e10d1eeda67d0`):

- `/signup` muestra una pausa informativa en español e inglés en vez del componente SignUp de Clerk.
- Home y Sign In muestran el aviso; Home oculta invitaciones a registrarse.
- El componente Sign In impide las transferencias automáticas a Sign Up mientras dure la pausa.
- **Se conserva Sign In para miembros existentes** y las herramientas gratuitas.
- **NO se han borrado las cuentas históricas por esa publicación**.

El reinicio de datos y la PR #75 **no quedan autorizados ni completados por este documento**. No confundir esta pausa con la ejecución del borrado de cuentas.

## 2. Configuración que debe revertirse al terminar

| Superficie | Estado temporal documentado | Estado final deseado, solo después del gate |
|---|---|---|
| **Clerk Dashboard → CAISSA Chess → Production → Configure → User & authentication → Access mode** | **Invite-only** | **Open** |
| `https://www.caissa-chess.org/signup` | Página temporal de registro suspendido | Registro normal con Clerk Production y verificación de correo |
| Home / Sign In | Avisos temporales y enlaces de registro ocultos | Quitar aviso y restaurar los accesos a registro |
| Backend CAISSA | Modo de transición/identidades históricas según release vigente | Clean Start operativo sin exigir recuperación SEC-005 a usuarios nuevos |
| Vercel Previews internas | **SSO protegido** | **Mantener SSO; no abrir las Previews al público** |

**Precaución:** Restablecer **Open** en Clerk no reemplaza restaurar y certificar el frontend. No activar `Open` mientras el sistema de registro de CAISSA todavía esté bloqueado o dirigido a una configuración incompatible.

## 3. Checklist — requisitos antes de reabrir

- [ ] El plan **Clean Start** y la situación de las cuentas anteriores se han resuelto de forma aprobada y documentada; no hay borrados incompletos.
- [ ] Los respaldos requeridos y, cuando corresponda, la **restauración de prueba** están certificados.
- [ ] Se han resuelto hallazgos de seguridad y dependencias pendientes de la PR #75 o del release que la sustituya.
- [ ] En **Staging**, el flujo completo `Sign Up → email code → elegir nickname público → Supabase sync → logout/login → progreso persistente` pasó con identidades sintéticas.
- [ ] Las variables de **Clerk Production** y Supabase Production apuntan al proyecto correcto, sin utilizar credenciales de Development.
- [ ] Las sesiones antiguas y el acceso a datos históricos están en un estado coherente y aprobado.
- [ ] La nueva versión de `/signup` se ha desplegado y responde correctamente; el aviso temporal de PR #76 se ha eliminado mediante un cambio **revisado** (no revertir a ciegas otros cambios posteriores).
- [ ] Home ofrece nuevamente una acción visible de registro y Sign In mantiene su propio acceso.
- [ ] La política OAuth y la opción de transferencia de Sign In se han revisado explícitamente; **no reactivar transferencias sin QA**.
- [ ] Vercel Production está `READY` con SHA exacto y el dominio público apunta a ese deployment; las Previews conservan SSO.
- [ ] El propietario autoriza expresamente el **gate de reapertura**.

## 4. Pasos manuales de reversión en Clerk — CUANDO SE CUMPLAN LOS REQUISITOS

1. Abrir [Clerk Dashboard](https://dashboard.clerk.com/).
2. Seleccionar **CAISSA Chess → Production** (NO Development).
3. Ir a **Configure → User & authentication → Access mode**.
4. Confirmar que el estado actual es **Invite-only**.
5. Elegir **Open** («Sign-ups are enabled and all users can join your application»).
6. Guardar/aplicar, si el Dashboard lo solicita.
7. **Volver a abrir esa pantalla** y confirmar visualmente que aparece **Open**.
8. Registrar fecha, aprobador y evidencia de la nueva configuración **sin mostrar credenciales**.

**No cambiar** la protección SSO de las Previews, las API keys de Supabase, las contraseñas de base de datos ni el rollout de CAISSA Online para esta operación.

## 5. Postflight obligatorio después de cambiar a Open

- [ ] Abrir `https://www.caissa-chess.org/signup` desde un navegador limpio **sin sesión Vercel**: muestra el formulario real, no la página de mantenimiento.
- [ ] Crear **una cuenta de prueba permitida** en Clerk **Production** mediante verificación real por email, sin bypass de Vercel.
- [ ] Confirmar que Supabase Production crea **un solo UUID nuevo** y una identidad pública asociada.
- [ ] Elegir un nickname único; comprobar disponibilidad y persistencia después de cerrar sesión y volver a entrar.
- [ ] Confirmar que Puzzles guarda y recupera un progreso nuevo bajo esa cuenta.
- [ ] Confirmar que no aparece ningún `IDENTITY_RESOLUTION_REQUIRED`, SEC-005 ni recuperación histórica para el usuario nuevo.
- [ ] Confirmar que Home y Sign In ya no anuncian el bloqueo y que las herramientas gratuitas siguen funcionando.
- [ ] Validar navegador de escritorio y móvil; registrar SHA, deployment y resultados QA.

### Si algo falla

**Volver inmediatamente a `Invite-only`**, preservar logs y evidencias sanitizadas, y restaurar el aviso temporal de CAISSA de forma controlada si corresponde. No borrar o modificar cuentas para «hacer pasar» el test. No declarar la reapertura exitosa hasta completar el postflight.

## 6. Criterio de cierre de este recordatorio

Marcar este documento y la tarea vinculada como completados **solo si**:

1. Clerk **Production** vuelve a **Open**.
2. El registro real de CAISSA está operativo desde internet **sin Vercel SSO**.
3. Nickname, Supabase y progreso funcionan para el nuevo usuario.
4. Se retiraron los avisos de mantenimiento y los enlaces de registro están restaurados.
5. Los datos previos y el resultado de Clean Start quedan auditados, y las Previews internas siguen protegidas.

**Resultado de cierre:** `CAISSA_CLEAN_START — REGISTRATION_REOPENED_CERTIFIED`

**Mientras este gate esté pendiente:** mantener **Invite-only**, la página de pausa temporal y el aviso público. **No conceder acceso a Vercel Preview a visitantes que intenten registrarse.**