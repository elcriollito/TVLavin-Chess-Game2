# CAISSA Public Player Identity — certificación local

Fecha: 2026-10-14  
Base: `b6ccd5d0bd0bd85bd1fd8829366443450937045e`  
Rama: `fix/caissa-public-player-identity`

Este documento sustituye la certificación preliminar. El detalle verificable está repartido entre los informes `CAISSA_PUBLIC_IDENTITY_*`, `CAISSA_UNICODE_PARITY_CERTIFICATION.md`, `CAISSA_PR71_P2_REMEDIATION.md` y `CAISSA_PREVIEW_CONFIGURATION_PLAN.md` del mismo directorio.

El candidato separa identidad interna, nickname público, nombre completo privado, email privado y alias Guest. El propietario se deriva del JWT verificado; el navegador no elige la identidad autorizada. Los RPC de identidad son `SECURITY DEFINER`, fijan `search_path = ''`, solo son ejecutables por `service_role` y la tabla no concede escritura directa. RLS está activa con cero políticas para navegador.

La política v1 usa NFC para presentación y NFKC más minúsculas Unicode para la clave. `Intl.Segmenter` es obligatorio en la frontera Node que decide la aceptación; PostgreSQL 17 verifica versión, display normalizado, rechazo completo de `Default_Ignorable_Code_Point`, clave derivada y unicidad. No se afirma equivalencia con case folding completo ni con UTS #39.

La salida Online histórica se proyecta antes de entregarse: solo una relación inequívoca por ID puede resolver una identidad canónica; los demás valores antiguos se sustituyen por alias estables no identificables. Los headers White/Black del PGN se sanean sin alterar movetext, resultado ni metadatos ajedrecísticos restantes.

Guest se provisiona únicamente en comandos de escritura expresos que lo necesitan. Las consultas de estado no crean ni actualizan identidad; una identidad Guest existente se comprueba con lectura. Guest continúa siempre `rated=false` en servidor.

La migración y su rollback pasaron aplicación, rollback y reaplicación en PostgreSQL 17.11 local con datos sintéticos. La revisión Codex Security del candidato anterior cubrió 17 archivos de runtime y detectó dos hallazgos: bypass mediante Unicode default-ignorable y exposición de filas completas por SELECT/Realtime. Este candidato los remedia y añade regresiones dirigidas. La revisión independiente posterior detectó además el caso U+FEFF antes de `trim`; fue corregido para rechazar el input crudo y la recertificación local volvió a pasar. Staging no ha recibido escrituras de esta migración y Production permanece intacta.

El rollback restaura deliberadamente el contrato Online anterior, incluido SELECT participante y `broadcast_changes()`. Por tanto no es un mecanismo de contención seguro con Online activo: solo puede considerarse con rollout apagado y autorización humana. La recuperación preferida preserva datos y revierte código/configuración.

Estado: `PUBLIC_IDENTITY_LOCAL_RECERTIFIED`, pendiente del nuevo sello y de autorización explícita para aplicar en Staging el artefacto cuyo hash difiere del aprobado originalmente.
