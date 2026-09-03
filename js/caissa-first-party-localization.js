(function installCaissaFirstPartyLocalization(global) {
    'use strict';

    const i18n = global.CaissaI18n;
    if (!i18n || !global.document) return;

    const contractId = 'CaissaFirstPartyLocalization@1.0.0';
    const namespaces = /^(?:common|play|bots|coach|pgn)\./;
    const keyByEnglish = new Map(Object.entries(i18n.catalogs.en)
        .filter(([key, value]) => namespaces.test(key) && typeof value === 'string')
        .map(([key, value]) => [value, key]));
    const textBindings = new WeakMap();
    const attributeBindings = new WeakMap();
    let applying = false;

    function activeRoots() {
        const path = global.location?.pathname || '';
        if (path === '/pgn-replayer' || global.document.body?.classList.contains('pgn-replayer-page')) {
            return [global.document.querySelector('[data-pgn-app]')].filter(Boolean);
        }
        if (path === '/play' || path.startsWith('/play/')) {
            return [
                global.document.querySelector('[data-caissa-simplified-shell]'),
                ...global.document.querySelectorAll('[data-caissa-play-share], [data-caissa-play-dialog]')
            ].filter(Boolean);
        }
        return [];
    }

    function excludedText(node) {
        const parent = node.parentElement;
        if (!parent) return true;
        const pgnIdentity = parent.closest('[data-pgn-title], [data-pgn-subtitle], [data-pgn-white], [data-pgn-black]');
        if (pgnIdentity && !global.document.querySelector('[data-pgn-empty]:not([hidden])')) return true;
        return !!parent.closest([
            '[data-pgn-notation]', '[data-pgn-games]', '[data-pgn-game-info]',
            '.caissa-bots-panel__bot-name', '.caissa-bots-panel__selected-copy strong',
            '[data-active-game-moves]', '[data-active-game-opening]'
        ].join(','));
    }

    function translatedToken(value) {
        const key = keyByEnglish.get(value);
        return key ? i18n.t(key, value) : value;
    }

    function translatedDate(value) {
        return String(value).replace(/\b(January|February|March|April|May|June|July|August|September|October|November|December)\b/g,
            month => i18n.t(`date.${month.toLowerCase()}`, month));
    }

    function dynamicText(value) {
        if (i18n.getLocale() !== 'es') return value;
        let match = value.match(/^(\d+) Elo target$/);
        if (match) return i18n.t('bots.targetTemplate', value, { elo: match[1] });
        match = value.match(/^(\d+) Elo target · Coming soon$/);
        if (match) return i18n.t('bots.targetSoonTemplate', value, { elo: match[1] });
        match = value.match(/^(.+) · (\d+) Elo target$/);
        if (match) return i18n.t('bots.categoryTargetTemplate', value,
            { category: translatedToken(match[1]), elo: match[2] });
        match = value.match(/^(\d+) Elo · (.+)$/);
        if (match) return `${match[1]} Elo · ${translatedToken(match[2])}`;
        match = value.match(/^(\d+\+\d+) · (Bullet|Blitz|Rapid) · (White|Random|Black)$/);
        if (match) return `${match[1]} · ${translatedToken(match[2])} · ${translatedToken(match[3])}`;
        match = value.match(/^· (Bullet|Blitz|Rapid)$/);
        if (match) return `· ${translatedToken(match[1])}`;
        match = value.match(/^(White|Random|Black) selected\.$/);
        if (match) return match[1] === 'Random' ? 'Aleatorio seleccionado.'
            : `${translatedToken(match[1])} seleccionadas.`;
        match = value.match(/^Game started against (.+)\.$/);
        if (match) return i18n.t('bots.startedTemplate', value, { name: match[1] });
        match = value.match(/^Preparing (.+)…$/);
        if (match) return i18n.t('bots.preparingTemplate', value, { name: match[1] });
        match = value.match(/^(.+) is coming soon\.$/);
        if (match) return i18n.t('bots.soonTemplate', value, { name: match[1] });
        match = value.match(/^(\d+) player game collections · enrichment source updated (.+) · stored by CAISSA$/);
        if (match) return i18n.t('pgn.playerSummaryTemplate', value, { count: match[1], date: translatedDate(match[2]) });
        match = value.match(/^(\d+) free archives · (.+)$/);
        if (match) return i18n.t('pgn.freeArchivesTemplate', value, { count: match[1], date: translatedDate(match[2]) });
        match = value.match(/^(\d+) Candidates, World Cup, and Interzonal archives · (.+)$/);
        if (match) return i18n.t('pgn.qualifierSummaryTemplate', value, { count: match[1], date: translatedDate(match[2]) });
        match = value.match(/^(\d+) featured collections · full historical expansion follows this phase$/);
        if (match) return i18n.t('pgn.tournamentSummaryTemplate', value, { count: match[1] });
        match = value.match(/^(\d+) free opening collections · paged in groups of 100 games · source updated (.+)$/);
        if (match) return i18n.t('pgn.openingSummaryTemplate', value, { count: match[1], date: translatedDate(match[2]) });
        match = value.match(/^([\d,]+) (games?|classic game|historic game) · (Free tournament collection|Free engine collection|Free collection|Free sample collection|Premium master archive)$/);
        if (match) {
            const kindKeys = { game: 'game', games: 'games', 'classic game': 'classic', 'historic game': 'historic' };
            const collections = {
                'Free tournament collection': 'tournament', 'Free engine collection': 'engine',
                'Free collection': 'free', 'Free sample collection': 'sample', 'Premium master archive': 'premium'
            };
            return i18n.t('pgn.collectionDetailsTemplate', value,
                { count: match[1], kind: i18n.t(`pgn.kind.${kindKeys[match[2]]}`),
                    collection: i18n.t(`pgn.collection.${collections[match[3]]}`) });
        }
        match = value.match(/^Result (.+)$/);
        if (match) return `Resultado ${match[1]}`;
        match = value.match(/^Move (\d+)(\.?|…)(.*)$/);
        if (match) return `Jugada ${match[1]}${match[2]}${match[3]}`;
        return value;
    }

    function translateTextNode(node) {
        if (excludedText(node)) return;
        const current = node.nodeValue || '';
        const trimmed = current.trim();
        if (!trimmed) return;
        let binding = textBindings.get(node);
        if (!binding) {
            const key = keyByEnglish.get(trimmed) || '';
            const translated = dynamicText(trimmed);
            if (!key && translated === trimmed) return;
            binding = { key, english: trimmed };
            textBindings.set(node, binding);
        } else if (current.trim() !== i18n.t(binding.key, binding.english)
            && current.trim() !== dynamicText(binding.english)) {
            const key = keyByEnglish.get(trimmed) || '';
            const translated = dynamicText(trimmed);
            if (!key && translated === trimmed) return;
            binding = { key, english: trimmed };
            textBindings.set(node, binding);
        }
        const output = binding.key ? i18n.t(binding.key, binding.english) : dynamicText(binding.english);
        const leading = current.match(/^\s*/)?.[0] || '';
        const trailing = current.match(/\s*$/)?.[0] || '';
        const next = `${leading}${output}${trailing}`;
        if (current !== next) node.nodeValue = next;
    }

    function translateAttributes(element) {
        if (!(element instanceof global.Element)) return;
        const attributes = ['aria-label', 'title', 'placeholder'];
        let bindings = attributeBindings.get(element);
        if (!bindings) { bindings = new Map(); attributeBindings.set(element, bindings); }
        attributes.forEach(name => {
            const current = element.getAttribute(name);
            if (!current) return;
            let binding = bindings.get(name);
            const rendered = binding && (binding.key ? i18n.t(binding.key, binding.english) : dynamicText(binding.english));
            if (!binding || current !== rendered) {
                const key = keyByEnglish.get(current) || '';
                const translated = dynamicText(current);
                if (!key && translated === current) return;
                binding = { key, english: current };
                bindings.set(name, binding);
            }
            const output = binding.key ? i18n.t(binding.key, binding.english) : dynamicText(binding.english);
            if (current !== output) element.setAttribute(name, output);
        });
    }

    function apply(root) {
        if (!root || applying) return;
        applying = true;
        try {
            if (root.nodeType === Node.TEXT_NODE) translateTextNode(root);
            if (root.nodeType === Node.ELEMENT_NODE) translateAttributes(root);
            const walker = global.document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT);
            let node = walker.currentNode;
            while (node) {
                if (node.nodeType === Node.TEXT_NODE) translateTextNode(node);
                else translateAttributes(node);
                node = walker.nextNode();
            }
        } finally { applying = false; }
    }

    function applyAll() { activeRoots().forEach(apply); }
    let scheduled = false;
    const observer = new MutationObserver(() => {
        if (applying || scheduled) return;
        scheduled = true;
        global.setTimeout(() => { scheduled = false; applyAll(); }, 0);
    });
    i18n.subscribe(applyAll);
    global.document.addEventListener('DOMContentLoaded', applyAll, { once: true });
    applyAll();
    observer.observe(global.document.documentElement, {
        subtree: true, childList: true, characterData: true, attributes: true,
        attributeFilter: ['aria-label', 'title', 'placeholder']
    });

    global.CaissaFirstPartyLocalization = Object.freeze({ contractId, apply: applyAll });
})(typeof window !== 'undefined' ? window : globalThis);
