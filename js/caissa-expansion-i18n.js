(function initCaissaExpansionI18n(global) {
    'use strict';

    const catalogs = Object.freeze({
        en: Object.freeze({
            'polyglot.metaTitle': 'Free PGN to Polyglot BIN Converter | CAISSA Chess',
            'polyglot.metaDescription': 'Create a Polyglot BIN opening book from PGN files free in your browser. Private on-device conversion, progress, cancellation and no account required.',
            'polyglot.banner': 'Private by design: your PGN is processed on this device and is not uploaded to CAISSA.',
            'polyglot.intro': 'Create a standard Polyglot BIN opening book from PGN games without uploading the file. A dedicated browser worker streams and validates the main line, reports progress, and generates the book locally.',
            'polyglot.downloadTitle': 'Need more capacity?',
            'polyglot.portableNote': 'The existing Windows portable build handles conversion offline. Its updated large-file certification is pending; keep backups and validate output before production use.',
            'polyglot.allDownloads': 'View CAISSA Downloads', 'polyglot.serviceTitle': 'Online PGN → BIN Converter',
            'polyglot.serviceNote': 'Choose a .pgn file up to the tested 25 MiB browser limit. Conversion runs locally with a bounded memory budget. Comments and NAGs are ignored; the main line is used and recursive variations are excluded.',
            'polyglot.cancel': 'Cancel', 'polyglot.step1': 'Choose a .pgn file no larger than the tested 25 MiB online limit.',
            'polyglot.step3': 'Select Generate opening book. The browser streams the file to a local worker and validates each main line.',
            'polyglot.log.ready': '[ready] Waiting for a local PGN file...', 'polyglot.log.start': '[start] Preparing private on-device conversion...',
            'polyglot.log.tooLarge': '[error] PGN exceeds the tested 25 MiB online limit',
            'polyglot.log.local': '[info] Conversion runs in this browser; the PGN is not uploaded.',
            'polyglot.log.canceled': '[canceled] Conversion canceled; no output file was created.',
            'polyglot.log.skipped': '[warning] Skipped games: {count}', 'polyglot.log.complete': '[ok] Local BIN build complete',
            'polyglot.progress.percent': '{percent}% processed locally',
            'polyglot.progress.stats': '{games} games parsed · {skipped} skipped · {moves} moves · {records} unique records',
            'polyglot.outputSummary': 'Output: {size} · Entries: {entries} · Games parsed: {games} · Skipped: {skipped}',
            'polyglot.error.memory': 'The selected limits produced too many unique records for the browser memory budget. Reduce maximum plies or use a smaller PGN.',
            'downloads.metaTitle': 'Free Chess Tools & Portable Software | CAISSA Chess',
            'downloads.metaDescription': 'Explore free CAISSA chess tools, including the private browser PGN-to-Polyglot converter and the existing Windows portable book creator, with clear release status.',
            'downloads.home': 'Home', 'downloads.breadcrumb': 'Downloads', 'downloads.eyebrow': 'CAISSA SOFTWARE LIBRARY',
            'downloads.title': 'Chess tools, clearly released.',
            'downloads.intro': 'Open the free browser converter, download the existing Windows portable book creator, and follow future CAISSA applications without confusing plans with releases.',
            'downloads.trustAria': 'Release policy', 'downloads.trustTitle': 'Release status you can verify',
            'downloads.trustCopy': 'Checksums and security reports appear only after the exact artifact is certified.',
            'downloads.availableKicker': 'AVAILABLE NOW', 'downloads.availableTitle': 'Use a CAISSA tool',
            'downloads.availableCopy': 'No account, activation, or subscription is required for these tools.',
            'downloads.statusAvailable': 'Available', 'downloads.statusPending': 'Certification pending',
            'downloads.onlineName': 'CAISSA Polyglot Online',
            'downloads.onlineCopy': 'Stream a PGN into a dedicated browser worker and create a standard Polyglot BIN book locally, with progress and cancellation.',
            'downloads.onlinePrivacy': 'PGN stays on your device', 'downloads.onlineLimit': 'Tested online limit: 25 MiB',
            'downloads.onlineFormat': 'Canonical 16-byte Polyglot records', 'downloads.openOnline': 'Open online converter',
            'downloads.readGuide': 'Read the guide', 'downloads.portableName': 'CAISSA Book Creator Portable',
            'downloads.portableCopy': 'The existing offline PGN-to-Polyglot builder. Version 0.2.0 remains available while source, large-file capacity, licensing and security evidence are re-certified.',
            'downloads.version': 'Version', 'downloads.fileSize': 'File size', 'downloads.checksumPending': 'Pending certification',
            'downloads.security': 'Security', 'downloads.securityPending': 'Defender scan: no detections; executables unsigned; certification pending',
            'downloads.portableCaution': 'Existing public build; updated certification is not yet a PASS. Windows may show a SmartScreen warning for an unsigned application.',
            'downloads.downloadPortable': 'Download existing v0.2.0', 'downloads.useOnline': 'Use the online tool',
            'downloads.roadmapKicker': 'ROADMAP', 'downloads.roadmapTitle': 'Future CAISSA applications',
            'downloads.roadmapCopy': 'These products are planned. No download or release date is being advertised.',
            'downloads.statusFuture': 'Future application', 'downloads.scannerName': 'CAISSA Chess Scanner',
            'downloads.scannerCopy': 'A future desktop workflow for turning board images into reviewable chess positions.',
            'downloads.readerName': 'CAISSA PGN Reader', 'downloads.readerCopy': 'A future portable reading and study application for local PGN collections.',
            'downloads.notReleased': 'Not released · no download available', 'downloads.faqTitle': 'Download and verification questions',
            'downloads.faqFreeQ': 'Are CAISSA downloads free?',
            'downloads.faqFreeA': 'The tools listed as available here are free to use. This page does not include payments, subscriptions or activation requirements.',
            'downloads.faqHashQ': 'How was the portable checksum obtained?',
            'downloads.faqHashA': 'The SHA-256 shown above was independently computed from the exact 244,203,091-byte public v0.2.0 ZIP. It is also pinned in the candidate downloads catalog.',
            'downloads.faqPrivateQ': 'Does the online converter upload my PGN?',
            'downloads.faqPrivateA': 'No. Normal conversion streams the file to a dedicated worker in your browser and does not call the legacy server build endpoint.'
        }),
        es: Object.freeze({
            'polyglot.metaTitle': 'Conversor gratuito de PGN a Polyglot BIN | CAISSA Chess',
            'polyglot.metaDescription': 'Convierte partidas PGN en un libro Polyglot BIN estándar localmente en tu navegador, con progreso, cancelación y sin subir archivos.',
            'polyglot.banner': 'Privado por diseño: tu PGN se procesa en este dispositivo y no se sube a CAISSA.',
            'polyglot.intro': 'Crea un libro Polyglot BIN estándar a partir de partidas PGN sin subir el archivo. Un worker dedicado procesa y valida la línea principal, muestra el progreso y genera el libro localmente.',
            'polyglot.downloadTitle': '¿Necesitas más capacidad?', 'polyglot.portableNote': 'La versión portátil existente para Windows convierte archivos sin conexión. Su certificación actualizada para archivos grandes está pendiente.',
            'polyglot.allDownloads': 'Ver descargas de CAISSA', 'polyglot.serviceTitle': 'Conversor en línea PGN → BIN',
            'polyglot.serviceNote': 'Elige un archivo .pgn de hasta el límite probado de 25 MiB. La conversión se realiza localmente con memoria limitada. Se ignoran comentarios y NAG; se usa la línea principal.',
            'polyglot.cancel': 'Cancelar', 'polyglot.step1': 'Elige un archivo .pgn que no supere el límite probado de 25 MiB.',
            'polyglot.step3': 'Selecciona Generar libro de aperturas. El navegador envía el archivo por bloques a un worker local y valida cada línea principal.',
            'polyglot.log.ready': '[listo] Esperando un archivo PGN local...', 'polyglot.log.start': '[inicio] Preparando la conversión privada en este dispositivo...',
            'polyglot.log.tooLarge': '[error] El PGN supera el límite probado de 25 MiB',
            'polyglot.log.local': '[info] La conversión se realiza en este navegador; el PGN no se sube.',
            'polyglot.log.canceled': '[cancelado] Conversión cancelada; no se creó ningún archivo.',
            'polyglot.log.skipped': '[aviso] Partidas omitidas: {count}', 'polyglot.log.complete': '[correcto] Generación local del BIN terminada',
            'polyglot.progress.percent': '{percent}% procesado localmente',
            'polyglot.progress.stats': '{games} partidas procesadas · {skipped} omitidas · {moves} jugadas · {records} registros únicos',
            'polyglot.outputSummary': 'Resultado: {size} · Entradas: {entries} · Partidas: {games} · Omitidas: {skipped}',
            'polyglot.error.memory': 'Los límites producen demasiados registros para la memoria del navegador. Reduce las medias jugadas máximas o usa un PGN menor.',
            'downloads.metaTitle': 'Herramientas de ajedrez gratis y software portátil | CAISSA Chess',
            'downloads.metaDescription': 'Explora herramientas gratuitas de CAISSA, incluido el conversor privado de PGN a Polyglot y el creador portátil existente para Windows.',
            'downloads.home': 'Inicio', 'downloads.breadcrumb': 'Descargas', 'downloads.eyebrow': 'BIBLIOTECA DE SOFTWARE CAISSA',
            'downloads.title': 'Herramientas de ajedrez, con lanzamientos claros.',
            'downloads.intro': 'Abre el conversor gratuito, descarga el creador portátil existente para Windows y conoce futuras aplicaciones sin confundir planes con lanzamientos.',
            'downloads.trustAria': 'Política de lanzamientos', 'downloads.trustTitle': 'Estado de lanzamiento verificable',
            'downloads.trustCopy': 'Las sumas y los informes de seguridad aparecen solo después de certificar el artefacto exacto.',
            'downloads.availableKicker': 'DISPONIBLE AHORA', 'downloads.availableTitle': 'Usa una herramienta CAISSA',
            'downloads.availableCopy': 'Estas herramientas no requieren cuenta, activación ni suscripción.',
            'downloads.statusAvailable': 'Disponible', 'downloads.statusPending': 'Certificación pendiente',
            'downloads.onlineName': 'CAISSA Polyglot Online',
            'downloads.onlineCopy': 'Procesa un PGN en un worker del navegador y crea localmente un libro Polyglot BIN estándar, con progreso y cancelación.',
            'downloads.onlinePrivacy': 'El PGN permanece en tu dispositivo', 'downloads.onlineLimit': 'Límite probado: 25 MiB',
            'downloads.onlineFormat': 'Registros Polyglot canónicos de 16 bytes', 'downloads.openOnline': 'Abrir conversor en línea',
            'downloads.readGuide': 'Leer la guía', 'downloads.portableName': 'CAISSA Book Creator Portable',
            'downloads.portableCopy': 'El creador PGN-a-Polyglot sin conexión. La versión 0.2.0 sigue disponible mientras se recertifican código, capacidad, licencias y seguridad.',
            'downloads.version': 'Versión', 'downloads.fileSize': 'Tamaño', 'downloads.checksumPending': 'Certificación pendiente',
            'downloads.security': 'Seguridad', 'downloads.securityPending': 'Defender: sin detecciones; ejecutables sin firma; certificación pendiente',
            'downloads.portableCaution': 'Compilación pública existente; la certificación actualizada aún no es un APROBADO. Windows puede mostrar una advertencia de SmartScreen.',
            'downloads.downloadPortable': 'Descargar v0.2.0 existente', 'downloads.useOnline': 'Usar la herramienta en línea',
            'downloads.roadmapKicker': 'HOJA DE RUTA', 'downloads.roadmapTitle': 'Futuras aplicaciones CAISSA',
            'downloads.roadmapCopy': 'Estos productos están planificados. No se anuncia ninguna descarga ni fecha.',
            'downloads.statusFuture': 'Aplicación futura', 'downloads.scannerName': 'CAISSA Chess Scanner',
            'downloads.scannerCopy': 'Un futuro flujo de escritorio para convertir imágenes de tableros en posiciones revisables.',
            'downloads.readerName': 'CAISSA PGN Reader', 'downloads.readerCopy': 'Una futura aplicación portátil para estudiar colecciones PGN locales.',
            'downloads.notReleased': 'No publicado · sin descarga', 'downloads.faqTitle': 'Preguntas sobre descargas y verificación',
            'downloads.faqFreeQ': '¿Las descargas de CAISSA son gratuitas?',
            'downloads.faqFreeA': 'Las herramientas indicadas como disponibles son gratuitas. Esta página no incluye pagos, suscripciones ni activación.',
            'downloads.faqHashQ': '¿Cómo se obtuvo la suma de comprobación?',
            'downloads.faqHashA': 'El SHA-256 mostrado se calculó independientemente desde el ZIP público v0.2.0 exacto de 244.203.091 bytes y está fijado en el catálogo candidato.',
            'downloads.faqPrivateQ': '¿El conversor en línea sube mi PGN?',
            'downloads.faqPrivateA': 'No. La conversión normal usa un worker del navegador y no llama al endpoint antiguo del servidor.'
        }),
        pt: Object.freeze({
            'polyglot.metaTitle': 'Conversor gratuito de PGN para Polyglot BIN | CAISSA Chess',
            'polyglot.metaDescription': 'Converta partidas PGN em um livro Polyglot BIN padrão localmente no navegador, com progresso, cancelamento e sem envio.',
            'polyglot.banner': 'Privado por definição: seu PGN é processado neste dispositivo e não é enviado à CAISSA.',
            'polyglot.intro': 'Crie um livro Polyglot BIN padrão a partir de partidas PGN sem enviar o arquivo. Um worker dedicado processa e valida a linha principal, informa o progresso e gera o livro localmente.',
            'polyglot.downloadTitle': 'Precisa de mais capacidade?', 'polyglot.portableNote': 'A versão portátil existente para Windows faz a conversão offline. A certificação atualizada para arquivos grandes está pendente.',
            'polyglot.allDownloads': 'Ver downloads da CAISSA', 'polyglot.serviceTitle': 'Conversor on-line PGN → BIN',
            'polyglot.serviceNote': 'Escolha um arquivo .pgn de até o limite testado de 25 MiB. A conversão é local, com memória limitada. Comentários e NAGs são ignorados; a linha principal é usada.',
            'polyglot.cancel': 'Cancelar', 'polyglot.step1': 'Escolha um arquivo .pgn de até o limite on-line testado de 25 MiB.',
            'polyglot.step3': 'Selecione Gerar livro de aberturas. O navegador envia o arquivo em blocos para um worker local e valida cada linha principal.',
            'polyglot.log.ready': '[pronto] Aguardando um arquivo PGN local...', 'polyglot.log.start': '[início] Preparando a conversão privada neste dispositivo...',
            'polyglot.log.tooLarge': '[erro] O PGN excede o limite testado de 25 MiB',
            'polyglot.log.local': '[info] A conversão ocorre neste navegador; o PGN não é enviado.',
            'polyglot.log.canceled': '[cancelado] Conversão cancelada; nenhum arquivo foi criado.',
            'polyglot.log.skipped': '[aviso] Partidas ignoradas: {count}', 'polyglot.log.complete': '[ok] Geração local do BIN concluída',
            'polyglot.progress.percent': '{percent}% processado localmente',
            'polyglot.progress.stats': '{games} partidas processadas · {skipped} ignoradas · {moves} lances · {records} registros únicos',
            'polyglot.outputSummary': 'Saída: {size} · Entradas: {entries} · Partidas: {games} · Ignoradas: {skipped}',
            'polyglot.error.memory': 'Os limites produziram registros demais para a memória do navegador. Reduza os meios-lances máximos ou use um PGN menor.',
            'downloads.metaTitle': 'Ferramentas de xadrez gratuitas e software portátil | CAISSA Chess',
            'downloads.metaDescription': 'Explore ferramentas gratuitas da CAISSA, incluindo o conversor privado de PGN para Polyglot e o criador portátil para Windows.',
            'downloads.home': 'Início', 'downloads.breadcrumb': 'Downloads', 'downloads.eyebrow': 'BIBLIOTECA DE SOFTWARE CAISSA',
            'downloads.title': 'Ferramentas de xadrez, com lançamentos claros.',
            'downloads.intro': 'Abra o conversor gratuito, baixe o criador portátil existente para Windows e acompanhe futuros aplicativos sem confundir planos com lançamentos.',
            'downloads.trustAria': 'Política de lançamentos', 'downloads.trustTitle': 'Status de lançamento verificável',
            'downloads.trustCopy': 'Somas e relatórios de segurança aparecem somente depois da certificação do artefato exato.',
            'downloads.availableKicker': 'DISPONÍVEL AGORA', 'downloads.availableTitle': 'Use uma ferramenta CAISSA',
            'downloads.availableCopy': 'Estas ferramentas não exigem conta, ativação ou assinatura.',
            'downloads.statusAvailable': 'Disponível', 'downloads.statusPending': 'Certificação pendente',
            'downloads.onlineName': 'CAISSA Polyglot Online',
            'downloads.onlineCopy': 'Processe um PGN em um worker do navegador e crie localmente um livro Polyglot BIN padrão, com progresso e cancelamento.',
            'downloads.onlinePrivacy': 'O PGN permanece no seu dispositivo', 'downloads.onlineLimit': 'Limite testado: 25 MiB',
            'downloads.onlineFormat': 'Registros Polyglot canônicos de 16 bytes', 'downloads.openOnline': 'Abrir conversor on-line',
            'downloads.readGuide': 'Ler o guia', 'downloads.portableName': 'CAISSA Book Creator Portable',
            'downloads.portableCopy': 'O criador PGN-para-Polyglot offline. A versão 0.2.0 continua disponível enquanto código, capacidade, licenças e segurança são recertificados.',
            'downloads.version': 'Versão', 'downloads.fileSize': 'Tamanho', 'downloads.checksumPending': 'Certificação pendente',
            'downloads.security': 'Segurança', 'downloads.securityPending': 'Defender: nenhuma detecção; executáveis sem assinatura; certificação pendente',
            'downloads.portableCaution': 'Compilação pública existente; a certificação atualizada ainda não está APROVADA. O Windows pode exibir um aviso do SmartScreen.',
            'downloads.downloadPortable': 'Baixar v0.2.0 existente', 'downloads.useOnline': 'Usar a ferramenta on-line',
            'downloads.roadmapKicker': 'PLANO', 'downloads.roadmapTitle': 'Futuros aplicativos CAISSA',
            'downloads.roadmapCopy': 'Estes produtos estão planejados. Nenhum download ou data está sendo anunciado.',
            'downloads.statusFuture': 'Aplicativo futuro', 'downloads.scannerName': 'CAISSA Chess Scanner',
            'downloads.scannerCopy': 'Um futuro fluxo de desktop para converter imagens de tabuleiros em posições revisáveis.',
            'downloads.readerName': 'CAISSA PGN Reader', 'downloads.readerCopy': 'Um futuro aplicativo portátil para estudar coleções PGN locais.',
            'downloads.notReleased': 'Não lançado · sem download', 'downloads.faqTitle': 'Perguntas sobre downloads e verificação',
            'downloads.faqFreeQ': 'Os downloads da CAISSA são gratuitos?',
            'downloads.faqFreeA': 'As ferramentas indicadas como disponíveis são gratuitas. Esta página não inclui pagamentos, assinaturas ou ativação.',
            'downloads.faqHashQ': 'Como a soma de verificação foi obtida?',
            'downloads.faqHashA': 'O SHA-256 exibido foi calculado independentemente a partir do ZIP público v0.2.0 exato de 244.203.091 bytes e está fixado no catálogo candidato.',
            'downloads.faqPrivateQ': 'O conversor on-line envia meu PGN?',
            'downloads.faqPrivateA': 'Não. A conversão normal usa um worker do navegador e não chama o endpoint antigo do servidor.'
        })
    });

    function locale() {
        const value = global.CaissaI18n?.getLocale?.() || document.documentElement.lang || 'en';
        return catalogs[value] ? value : 'en';
    }

    function t(key, fallback = '', variables = {}) {
        const template = catalogs[locale()]?.[key] ?? catalogs.en[key] ?? fallback;
        return String(template).replace(/\{(\w+)\}/g, (match, name) =>
            Object.prototype.hasOwnProperty.call(variables, name) ? String(variables[name]) : match
        );
    }

    function apply(root = document) {
        root.querySelectorAll('[data-caissa-i18n]').forEach(node => {
            const key = node.getAttribute('data-caissa-i18n');
            if (catalogs[locale()]?.[key] !== undefined || catalogs.en[key] !== undefined) node.textContent = t(key, node.textContent);
        });
        root.querySelectorAll('[data-caissa-i18n-aria-label]').forEach(node => {
            const key = node.getAttribute('data-caissa-i18n-aria-label');
            if (catalogs[locale()]?.[key] !== undefined || catalogs.en[key] !== undefined) node.setAttribute('aria-label', t(key, node.getAttribute('aria-label') || ''));
        });
    }

    global.CaissaExpansionI18n = Object.freeze({ apply, catalogs, t });
})(window);
