(function initCaissaExpansionI18n(global) {
    'use strict';

    const catalogs = Object.freeze({
        en: Object.freeze({
            'polyglot.metaTitle': 'Free PGN to Polyglot BIN Converter | CAISSA Chess',
            'polyglot.metaDescription': 'Create a Polyglot BIN opening book from PGN files free in your browser. Private on-device conversion, progress, cancellation and no account required.',
            'polyglot.banner': 'Private by design: your PGN is processed on this device and is not uploaded to CAISSA.',
            'polyglot.intro': 'Create a standard Polyglot BIN opening book from PGN games without uploading the file. A dedicated browser worker streams and validates the main line, reports progress, and generates the book locally.',
            'polyglot.downloadTitle': 'Need more capacity?',
            'polyglot.portableNote': 'CAISSA Book Creator v0.3.1 is completing source, license, signing and final artifact certification. No portable download is offered yet.',
            'polyglot.downloadPortable': 'View portable release status',
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
            'downloads.metaDescription': 'Explore the private browser PGN-to-Polyglot converter and follow the certification status of CAISSA desktop applications.',
            'downloads.home': 'Home', 'downloads.breadcrumb': 'Downloads', 'downloads.eyebrow': 'CAISSA SOFTWARE LIBRARY',
            'downloads.title': 'Chess tools, clearly released.',
            'downloads.intro': 'Open the free browser converter and follow the certification status of CAISSA desktop applications without confusing plans with releases.',
            'downloads.trustAria': 'Release policy', 'downloads.trustTitle': 'Release status you can verify',
            'downloads.trustCopy': 'Checksums and security reports appear only after the exact artifact is certified.',
            'downloads.availableKicker': 'AVAILABLE NOW', 'downloads.availableTitle': 'Use a CAISSA tool',
            'downloads.availableCopy': 'No account, activation, or subscription is required for these tools.',
            'downloads.statusAvailable': 'Available', 'downloads.statusPending': 'Coming soon',
            'downloads.onlineName': 'CAISSA Polyglot Online',
            'downloads.onlineCopy': 'Stream a PGN into a dedicated browser worker and create a standard Polyglot BIN book locally, with progress and cancellation.',
            'downloads.onlinePrivacy': 'PGN stays on your device', 'downloads.onlineLimit': 'Tested online limit: 25 MiB',
            'downloads.onlineFormat': 'Canonical 16-byte Polyglot records', 'downloads.openOnline': 'Open online converter',
            'downloads.readGuide': 'Read the guide', 'downloads.portableName': 'CAISSA Book Creator Portable',
            'downloads.portableCopy': 'Version 0.3.1 is completing source, license, signing and final artifact certification. No portable download is offered until every mandatory release gate passes.',
            'downloads.version': 'Version', 'downloads.fileSize': 'File size', 'downloads.checksumPending': 'Pending certification',
            'downloads.security': 'Security', 'downloads.securityPending': 'Final source, license, signing and packaged-artifact certification pending',
            'downloads.portableCaution': 'Coming soon. Historical builds are not promoted as the new release, and no unverified artifact is linked here.',
            'downloads.downloadPortable': 'View portable release status', 'downloads.useOnline': 'Use the online tool',
            'downloads.roadmapKicker': 'ROADMAP', 'downloads.roadmapTitle': 'Future CAISSA applications',
            'downloads.roadmapCopy': 'These products are planned. No download or release date is being advertised.',
            'downloads.statusFuture': 'Future application', 'downloads.scannerName': 'CAISSA Chess Scanner',
            'downloads.scannerCopy': 'A future desktop workflow for turning board images into reviewable chess positions.',
            'downloads.readerName': 'CAISSA PGN Reader', 'downloads.readerCopy': 'A future portable reading and study application for local PGN collections.',
            'downloads.notReleased': 'Not released · no download available', 'downloads.faqTitle': 'Download and verification questions',
            'downloads.faqFreeQ': 'Are CAISSA downloads free?',
            'downloads.faqFreeA': 'The tools listed as available here are free to use. This page does not include payments, subscriptions or activation requirements.',
            'downloads.faqHashQ': 'When will portable checksums be published?',
            'downloads.faqHashA': 'Exact ZIP, executable and source-package hashes will appear only after the final v0.3.1 artifacts pass license, signing, integrity and security certification.',
            'downloads.faqPrivateQ': 'Does the online converter upload my PGN?',
            'downloads.faqPrivateA': 'No. Normal conversion streams the file to a dedicated worker in your browser and does not call the legacy server build endpoint.'
        }),
        es: Object.freeze({
            'polyglot.metaTitle': 'Conversor gratuito de PGN a Polyglot BIN | CAISSA Chess',
            'polyglot.metaDescription': 'Convierte partidas PGN en un libro Polyglot BIN estándar localmente en tu navegador, con progreso, cancelación y sin subir archivos.',
            'polyglot.banner': 'Privado por diseño: tu PGN se procesa en este dispositivo y no se sube a CAISSA.',
            'polyglot.intro': 'Crea un libro Polyglot BIN estándar a partir de partidas PGN sin subir el archivo. Un worker dedicado procesa y valida la línea principal, muestra el progreso y genera el libro localmente.',
            'polyglot.downloadTitle': '¿Necesitas más capacidad?', 'polyglot.portableNote': 'CAISSA Book Creator v0.3.1 está completando la certificación de código, licencia, firma y artefactos finales. Aún no se ofrece una descarga portátil.',
            'polyglot.downloadPortable': 'Ver estado de la versión portátil',
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
            'downloads.metaDescription': 'Explora el conversor privado de PGN a Polyglot y sigue el estado de certificación de las aplicaciones de escritorio de CAISSA.',
            'downloads.home': 'Inicio', 'downloads.breadcrumb': 'Descargas', 'downloads.eyebrow': 'BIBLIOTECA DE SOFTWARE CAISSA',
            'downloads.title': 'Herramientas de ajedrez, con lanzamientos claros.',
            'downloads.intro': 'Abre el conversor gratuito y sigue el estado de certificación de las aplicaciones de escritorio de CAISSA sin confundir planes con lanzamientos.',
            'downloads.trustAria': 'Política de lanzamientos', 'downloads.trustTitle': 'Estado de lanzamiento verificable',
            'downloads.trustCopy': 'Las sumas y los informes de seguridad aparecen solo después de certificar el artefacto exacto.',
            'downloads.availableKicker': 'DISPONIBLE AHORA', 'downloads.availableTitle': 'Usa una herramienta CAISSA',
            'downloads.availableCopy': 'Estas herramientas no requieren cuenta, activación ni suscripción.',
            'downloads.statusAvailable': 'Disponible', 'downloads.statusPending': 'Próximamente',
            'downloads.onlineName': 'CAISSA Polyglot Online',
            'downloads.onlineCopy': 'Procesa un PGN en un worker del navegador y crea localmente un libro Polyglot BIN estándar, con progreso y cancelación.',
            'downloads.onlinePrivacy': 'El PGN permanece en tu dispositivo', 'downloads.onlineLimit': 'Límite probado: 25 MiB',
            'downloads.onlineFormat': 'Registros Polyglot canónicos de 16 bytes', 'downloads.openOnline': 'Abrir conversor en línea',
            'downloads.readGuide': 'Leer la guía', 'downloads.portableName': 'CAISSA Book Creator Portable',
            'downloads.portableCopy': 'La versión 0.3.1 está completando la certificación de código, licencia, firma y artefactos finales. No se ofrece una descarga hasta superar todos los requisitos.',
            'downloads.version': 'Versión', 'downloads.fileSize': 'Tamaño', 'downloads.checksumPending': 'Certificación pendiente',
            'downloads.security': 'Seguridad', 'downloads.securityPending': 'Pendiente la certificación final de código, licencia, firma y artefactos empaquetados',
            'downloads.portableCaution': 'Próximamente. No se promocionan compilaciones históricas como la nueva versión ni se enlazan artefactos sin verificar.',
            'downloads.downloadPortable': 'Ver estado de la versión portátil', 'downloads.useOnline': 'Usar la herramienta en línea',
            'downloads.roadmapKicker': 'HOJA DE RUTA', 'downloads.roadmapTitle': 'Futuras aplicaciones CAISSA',
            'downloads.roadmapCopy': 'Estos productos están planificados. No se anuncia ninguna descarga ni fecha.',
            'downloads.statusFuture': 'Aplicación futura', 'downloads.scannerName': 'CAISSA Chess Scanner',
            'downloads.scannerCopy': 'Un futuro flujo de escritorio para convertir imágenes de tableros en posiciones revisables.',
            'downloads.readerName': 'CAISSA PGN Reader', 'downloads.readerCopy': 'Una futura aplicación portátil para estudiar colecciones PGN locales.',
            'downloads.notReleased': 'No publicado · sin descarga', 'downloads.faqTitle': 'Preguntas sobre descargas y verificación',
            'downloads.faqFreeQ': '¿Las descargas de CAISSA son gratuitas?',
            'downloads.faqFreeA': 'Las herramientas indicadas como disponibles son gratuitas. Esta página no incluye pagos, suscripciones ni activación.',
            'downloads.faqHashQ': '¿Cuándo se publicarán las sumas de comprobación?',
            'downloads.faqHashA': 'Los hashes exactos del ZIP, ejecutable y paquete de código aparecerán solo cuando los artefactos finales v0.3.1 superen la certificación de licencia, firma, integridad y seguridad.',
            'downloads.faqPrivateQ': '¿El conversor en línea sube mi PGN?',
            'downloads.faqPrivateA': 'No. La conversión normal usa un worker del navegador y no llama al endpoint antiguo del servidor.'
        }),
        pt: Object.freeze({
            'polyglot.metaTitle': 'Conversor gratuito de PGN para Polyglot BIN | CAISSA Chess',
            'polyglot.metaDescription': 'Converta partidas PGN em um livro Polyglot BIN padrão localmente no navegador, com progresso, cancelamento e sem envio.',
            'polyglot.banner': 'Privado por definição: seu PGN é processado neste dispositivo e não é enviado à CAISSA.',
            'polyglot.intro': 'Crie um livro Polyglot BIN padrão a partir de partidas PGN sem enviar o arquivo. Um worker dedicado processa e valida a linha principal, informa o progresso e gera o livro localmente.',
            'polyglot.downloadTitle': 'Precisa de mais capacidade?', 'polyglot.portableNote': 'O CAISSA Book Creator v0.3.1 está concluindo a certificação de código, licença, assinatura e artefatos finais. Ainda não há download portátil.',
            'polyglot.downloadPortable': 'Ver status da versão portátil',
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
            'downloads.metaDescription': 'Explore o conversor privado de PGN para Polyglot e acompanhe a certificação dos aplicativos de desktop da CAISSA.',
            'downloads.home': 'Início', 'downloads.breadcrumb': 'Downloads', 'downloads.eyebrow': 'BIBLIOTECA DE SOFTWARE CAISSA',
            'downloads.title': 'Ferramentas de xadrez, com lançamentos claros.',
            'downloads.intro': 'Abra o conversor gratuito e acompanhe a certificação dos aplicativos de desktop da CAISSA sem confundir planos com lançamentos.',
            'downloads.trustAria': 'Política de lançamentos', 'downloads.trustTitle': 'Status de lançamento verificável',
            'downloads.trustCopy': 'Somas e relatórios de segurança aparecem somente depois da certificação do artefato exato.',
            'downloads.availableKicker': 'DISPONÍVEL AGORA', 'downloads.availableTitle': 'Use uma ferramenta CAISSA',
            'downloads.availableCopy': 'Estas ferramentas não exigem conta, ativação ou assinatura.',
            'downloads.statusAvailable': 'Disponível', 'downloads.statusPending': 'Em breve',
            'downloads.onlineName': 'CAISSA Polyglot Online',
            'downloads.onlineCopy': 'Processe um PGN em um worker do navegador e crie localmente um livro Polyglot BIN padrão, com progresso e cancelamento.',
            'downloads.onlinePrivacy': 'O PGN permanece no seu dispositivo', 'downloads.onlineLimit': 'Limite testado: 25 MiB',
            'downloads.onlineFormat': 'Registros Polyglot canônicos de 16 bytes', 'downloads.openOnline': 'Abrir conversor on-line',
            'downloads.readGuide': 'Ler o guia', 'downloads.portableName': 'CAISSA Book Creator Portable',
            'downloads.portableCopy': 'A versão 0.3.1 está concluindo a certificação de código, licença, assinatura e artefatos finais. Nenhum download será oferecido antes de todos os requisitos.',
            'downloads.version': 'Versão', 'downloads.fileSize': 'Tamanho', 'downloads.checksumPending': 'Certificação pendente',
            'downloads.security': 'Segurança', 'downloads.securityPending': 'Pendente a certificação final de código, licença, assinatura e artefatos empacotados',
            'downloads.portableCaution': 'Em breve. Builds históricos não são promovidos como a nova versão e nenhum artefato não verificado é vinculado.',
            'downloads.downloadPortable': 'Ver status da versão portátil', 'downloads.useOnline': 'Usar a ferramenta on-line',
            'downloads.roadmapKicker': 'PLANO', 'downloads.roadmapTitle': 'Futuros aplicativos CAISSA',
            'downloads.roadmapCopy': 'Estes produtos estão planejados. Nenhum download ou data está sendo anunciado.',
            'downloads.statusFuture': 'Aplicativo futuro', 'downloads.scannerName': 'CAISSA Chess Scanner',
            'downloads.scannerCopy': 'Um futuro fluxo de desktop para converter imagens de tabuleiros em posições revisáveis.',
            'downloads.readerName': 'CAISSA PGN Reader', 'downloads.readerCopy': 'Um futuro aplicativo portátil para estudar coleções PGN locais.',
            'downloads.notReleased': 'Não lançado · sem download', 'downloads.faqTitle': 'Perguntas sobre downloads e verificação',
            'downloads.faqFreeQ': 'Os downloads da CAISSA são gratuitos?',
            'downloads.faqFreeA': 'As ferramentas indicadas como disponíveis são gratuitas. Esta página não inclui pagamentos, assinaturas ou ativação.',
            'downloads.faqHashQ': 'Quando as somas de verificação serão publicadas?',
            'downloads.faqHashA': 'Os hashes exatos do ZIP, executável e pacote de código aparecerão somente após os artefatos finais v0.3.1 passarem pela certificação de licença, assinatura, integridade e segurança.',
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
