(function installPlayShareDialog(root) {
    'use strict';

    const SCHEMA_VERSION = '1.0.0';
    const TABS = Object.freeze(['pgn', 'image', 'gif', 'embed']);
    const PIECE = /^[prnbqkPRNBQK]$/;
    const DEFAULT_ORIGIN = 'https://www.caissa-chess.org';
    const freeze = value => {
        if (value && typeof value === 'object' && !Object.isFrozen(value)) {
            Object.values(value).forEach(freeze); Object.freeze(value);
        }
        return value;
    };
    const node = (tag, className = '', attributes = {}) => {
        const item = root.document.createElement(tag); item.className = className;
        Object.entries(attributes).forEach(([key, value]) => item.setAttribute(key, value));
        return item;
    };
    const clean = (value, limit = 100000) => typeof value === 'string' ? value.slice(0, limit) : '';
    const safeOrigin = value => {
        try {
            const url = new URL(value || DEFAULT_ORIGIN);
            return /^https?:$/.test(url.protocol) ? url.origin : DEFAULT_ORIGIN;
        } catch (_) { return DEFAULT_ORIGIN; }
    };
    function buildEmbedCode(fen, origin = DEFAULT_ORIGIN) {
        const position = clean(fen, 180).trim();
        if (!position) return '';
        const src = `${safeOrigin(origin)}/analyze?fen=${encodeURIComponent(position)}&embed=1`;
        return `<iframe src="${src}" title="CAISSA Chess position" width="720" height="720" loading="lazy"></iframe>`;
    }
    const escapeHeader = value => clean(String(value || ''), 160)
        .replaceAll('\\', '\\\\').replaceAll('"', '\\"');
    function buildSharePgn(input = {}) {
        const source = clean(input.pgn).trim();
        if (/^\s*\[[A-Za-z][A-Za-z0-9_]*\s+"/m.test(source)) return source;
        const mode = clean(input.mode, 24).trim();
        const event = mode === 'coach' ? 'CAISSA Play Coach'
            : mode === 'bots' ? 'CAISSA Play Bots' : 'CAISSA Play Game';
        const playerColor = input.playerColor === 'black' ? 'black' : 'white';
        const opponent = clean(input.opponent, 80).trim() || (mode === 'coach' ? 'Caissa Coach'
            : mode === 'bots' ? 'CAISSA Bot' : 'CAISSA Engine');
        const result = ['1-0', '0-1', '1/2-1/2'].includes(input.result) ? input.result : '*';
        const date = /^\d{4}\.\d{2}\.\d{2}$/.test(input.date || '') ? input.date : '????.??.??';
        const headers = [
            ['Event', event], ['Site', 'CAISSA Chess'], ['Date', date], ['Round', '?'],
            ['White', playerColor === 'white' ? 'Player' : opponent],
            ['Black', playerColor === 'black' ? 'Player' : opponent], ['Result', result]
        ];
        const opening = clean(input.opening, 120).trim();
        if (opening) headers.push(['Opening', opening]);
        let body = source;
        if (body && !/(?:^|\s)(?:1-0|0-1|1\/2-1\/2|\*)\s*$/.test(body)) body = `${body} ${result}`;
        else if (!body) body = result;
        return `${headers.map(([name, value]) => `[${name} "${escapeHeader(value)}"]`).join('\n')}\n\n${body}`;
    }
    function parseFenPieces(fen, orientation = 'white') {
        const placement = clean(fen, 180).trim().split(/\s+/)[0] || '';
        const ranks = placement.split('/');
        if (ranks.length !== 8) return freeze([]);
        const pieces = [];
        for (let rankIndex = 0; rankIndex < 8; rankIndex += 1) {
            let fileIndex = 0;
            for (const token of ranks[rankIndex]) {
                if (/^[1-8]$/.test(token)) { fileIndex += Number(token); continue; }
                if (!PIECE.test(token) || fileIndex > 7) return freeze([]);
                const white = token === token.toUpperCase();
                pieces.push({
                    code: `${white ? 'w' : 'b'}${token.toUpperCase()}`,
                    column: orientation === 'black' ? 7 - fileIndex : fileIndex,
                    row: orientation === 'black' ? 7 - rankIndex : rankIndex
                });
                fileIndex += 1;
            }
            if (fileIndex !== 8) return freeze([]);
        }
        return freeze(pieces);
    }
    function normalizeData(input = {}) {
        const orientation = input.orientation === 'black' ? 'black' : 'white';
        return freeze({
            pgn: buildSharePgn(input), fen: clean(input.fen, 180).trim(), orientation,
            opening: clean(input.opening, 120).trim(), mode: clean(input.mode, 24).trim()
        });
    }

    class ShareDialog {
        #dialog = null; #data = normalizeData(); #canvas = null; #listeners = []; #renderId = 0;

        mount(options = {}) {
            if (this.#dialog) return freeze({ ok: true, reasonCode: 'ALREADY_MOUNTED' });
            const host = options.host;
            if (!host?.appendChild) return freeze({ ok: false, reasonCode: 'INVALID_HOST' });
            const dialog = this.#dialog = node('dialog', 'caissa-play-share', {
                'aria-labelledby': 'caissa-play-share-title', 'data-caissa-play-share': ''
            });
            const header = node('header', 'caissa-play-share__header');
            const title = node('h2', '', { id: 'caissa-play-share-title' }); title.textContent = 'Share game';
            const close = node('button', 'caissa-play-share__close', {
                type: 'button', 'data-share-action': 'close', 'aria-label': 'Close share window'
            }); close.innerHTML = '<i class="fas fa-times" aria-hidden="true"></i>';
            header.append(title, close);

            const tabs = node('div', 'caissa-play-share__tabs', { role: 'tablist', 'aria-label': 'Share formats' });
            const panels = node('div', 'caissa-play-share__panels');
            for (const [id, label] of [['pgn', 'PGN'], ['image', 'Image'], ['gif', 'GIF'], ['embed', 'Embed']]) {
                const tab = node('button', 'caissa-play-share__tab', {
                    type: 'button', role: 'tab', 'data-share-tab': id,
                    id: `caissa-share-tab-${id}`, 'aria-controls': `caissa-share-panel-${id}`,
                    'aria-selected': String(id === 'pgn')
                });
                tab.textContent = label; tabs.appendChild(tab);
                const panel = node('section', 'caissa-play-share__panel', {
                    role: 'tabpanel', 'data-share-panel': id, id: `caissa-share-panel-${id}`,
                    'aria-labelledby': `caissa-share-tab-${id}`
                });
                panel.hidden = id !== 'pgn'; panels.appendChild(panel);
            }
            this.#buildPgnPanel(panels.querySelector('[data-share-panel="pgn"]'));
            this.#buildImagePanel(panels.querySelector('[data-share-panel="image"]'));
            this.#buildComingSoonPanel(panels.querySelector('[data-share-panel="gif"]'));
            this.#buildEmbedPanel(panels.querySelector('[data-share-panel="embed"]'));
            dialog.append(header, tabs, panels); host.appendChild(dialog);
            this.#listen(dialog, 'click', event => this.#handleClick(event));
            this.#listen(dialog, 'close', () => { this.#renderId += 1; });
            return freeze({ ok: true, reasonCode: 'MOUNTED' });
        }
        #field(labelText, control, action, actionLabel) {
            const field = node('div', 'caissa-play-share__field');
            const label = node('label', 'caissa-play-share__label'); label.textContent = labelText;
            const row = node('div', 'caissa-play-share__field-row');
            const copy = node('button', 'caissa-play-share__copy', {
                type: 'button', 'data-share-action': action, 'aria-label': actionLabel, title: actionLabel
            }); copy.innerHTML = '<i class="fas fa-copy" aria-hidden="true"></i>';
            row.append(control, copy); field.append(label, row); return field;
        }
        #buildPgnPanel(panel) {
            const fen = node('input', 'caissa-play-share__input', {
                readonly: '', 'data-share-fen': '', 'aria-label': 'FEN position'
            });
            const pgn = node('textarea', 'caissa-play-share__textarea', {
                readonly: '', 'data-share-pgn': '', rows: '11', 'aria-label': 'PGN game'
            });
            const download = node('button', 'caissa-play-share__primary', {
                type: 'button', 'data-share-action': 'download-pgn'
            }); download.innerHTML = '<i class="fas fa-download" aria-hidden="true"></i><span>Download PGN</span>';
            panel.append(this.#field('FEN', fen, 'copy-fen', 'Copy FEN'),
                this.#field('PGN', pgn, 'copy-pgn', 'Copy PGN'), download);
        }
        #buildImagePanel(panel) {
            const copy = node('p', 'caissa-play-share__note');
            copy.textContent = 'A branded image of the current position, ready to post or save.';
            this.#canvas = node('canvas', 'caissa-play-share__canvas', {
                width: '760', height: '850', 'aria-label': 'Preview of the current chess position'
            });
            const status = node('p', 'caissa-play-share__note', { 'data-share-image-status': '', role: 'status' });
            const download = node('button', 'caissa-play-share__primary', {
                type: 'button', 'data-share-action': 'download-image'
            }); download.innerHTML = '<i class="fas fa-image" aria-hidden="true"></i><span>Download image</span>';
            panel.append(copy, this.#canvas, status, download);
        }
        #buildComingSoonPanel(panel) {
            const title = node('h3', ''); title.textContent = 'Animated game sharing';
            const copy = node('p', 'caissa-play-share__note');
            copy.textContent = 'GIF export is being prepared. PGN and Image are available now.';
            panel.append(title, copy);
        }
        #buildEmbedPanel(panel) {
            const copy = node('p', 'caissa-play-share__note');
            copy.textContent = 'Embed the current position with a CAISSA analysis board.';
            const code = node('textarea', 'caissa-play-share__textarea caissa-play-share__textarea--embed', {
                readonly: '', 'data-share-embed': '', rows: '6', 'aria-label': 'Embed code'
            });
            panel.append(copy, this.#field('Embed code', code, 'copy-embed', 'Copy embed code'));
        }
        open(input = {}) {
            if (!this.#dialog) return freeze({ ok: false, reasonCode: 'NOT_MOUNTED' });
            this.#data = normalizeData(input);
            if (!this.#data.fen || !this.#data.pgn) return freeze({ ok: false, reasonCode: 'GAME_UNAVAILABLE' });
            this.#dialog.querySelector('[data-share-fen]').value = this.#data.fen;
            this.#dialog.querySelector('[data-share-pgn]').value = this.#data.pgn;
            this.#dialog.querySelector('[data-share-embed]').value = buildEmbedCode(this.#data.fen,
                root.location?.origin || DEFAULT_ORIGIN);
            this.#activateTab('pgn');
            if (typeof this.#dialog.showModal === 'function') this.#dialog.showModal();
            else this.#dialog.setAttribute('open', '');
            this.#renderImage();
            return freeze({ ok: true, reasonCode: 'OPENED' });
        }
        close() {
            if (!this.#dialog) return false;
            if (typeof this.#dialog.close === 'function') this.#dialog.close();
            else this.#dialog.removeAttribute('open');
            return true;
        }
        #activateTab(tabId) {
            if (!TABS.includes(tabId) || !this.#dialog) return false;
            this.#dialog.querySelectorAll('[data-share-tab]').forEach(tab => {
                const active = tab.dataset.shareTab === tabId;
                tab.setAttribute('aria-selected', String(active)); tab.tabIndex = active ? 0 : -1;
            });
            this.#dialog.querySelectorAll('[data-share-panel]').forEach(panel => {
                panel.hidden = panel.dataset.sharePanel !== tabId;
            });
            if (tabId === 'image') this.#renderImage();
            return true;
        }
        async #copy(value, label) {
            if (!value || typeof root.navigator?.clipboard?.writeText !== 'function') return false;
            try {
                await root.navigator.clipboard.writeText(value);
                root.showNotification?.(`${label} copied.`); return true;
            } catch (_) { root.showErrorNotification?.(`Could not copy ${label}.`); return false; }
        }
        #download(content, type, extension) {
            if (!content || !root.Blob || !root.URL?.createObjectURL) return false;
            const url = root.URL.createObjectURL(new root.Blob([content], { type }));
            const link = node('a'); link.href = url; link.download = `caissa-game-${Date.now()}.${extension}`;
            link.click(); root.URL.revokeObjectURL(url); return true;
        }
        async #handleClick(event) {
            const tab = event.target?.closest?.('[data-share-tab]')?.dataset?.shareTab;
            if (tab) { this.#activateTab(tab); return; }
            const action = event.target?.closest?.('[data-share-action]')?.dataset?.shareAction;
            if (!action) return;
            if (action === 'close') this.close();
            else if (action === 'copy-fen') this.#copy(this.#data.fen, 'FEN');
            else if (action === 'copy-pgn') this.#copy(this.#data.pgn, 'PGN');
            else if (action === 'copy-embed') this.#copy(buildEmbedCode(this.#data.fen,
                root.location?.origin || DEFAULT_ORIGIN), 'Embed code');
            else if (action === 'download-pgn') this.#download(this.#data.pgn, 'application/x-chess-pgn', 'pgn');
            else if (action === 'download-image') this.#downloadImage();
        }
        #loadPiece(code) {
            return new Promise(resolve => {
                if (typeof root.Image !== 'function') { resolve(null); return; }
                const image = new root.Image();
                image.onload = () => resolve(image); image.onerror = () => resolve(null);
                image.src = `/img/chesspieces/wikipedia/${code}.png`;
            });
        }
        async #renderImage() {
            if (!this.#canvas || !this.#data.fen) return false;
            const renderId = ++this.#renderId;
            const status = this.#dialog?.querySelector('[data-share-image-status]');
            if (status) status.textContent = 'Preparing image…';
            const context = this.#canvas.getContext?.('2d');
            if (!context) { if (status) status.textContent = 'Image preview is unavailable.'; return false; }
            const pieces = parseFenPieces(this.#data.fen, this.#data.orientation);
            const size = 720; const offset = 20; const square = size / 8;
            context.fillStyle = '#101721'; context.fillRect(0, 0, 760, 850);
            for (let row = 0; row < 8; row += 1) for (let column = 0; column < 8; column += 1) {
                context.fillStyle = (row + column) % 2 === 0 ? '#ead9b8' : '#ad8d6c';
                context.fillRect(offset + column * square, offset + row * square, square, square);
            }
            const images = await Promise.all(pieces.map(piece => this.#loadPiece(piece.code)));
            if (renderId !== this.#renderId) return false;
            pieces.forEach((piece, index) => {
                const image = images[index]; if (!image) return;
                context.drawImage(image, offset + piece.column * square + 5,
                    offset + piece.row * square + 5, square - 10, square - 10);
            });
            context.fillStyle = '#f5cd69'; context.font = '700 29px Arial, sans-serif';
            context.fillText('CAISSA CHESS', 24, 786);
            context.fillStyle = '#d8dee8'; context.font = '20px Arial, sans-serif';
            const subtitle = this.#data.opening || 'Current game position';
            context.fillText(subtitle.slice(0, 58), 24, 821);
            context.textAlign = 'right'; context.fillStyle = '#9eabb9'; context.font = '17px Arial, sans-serif';
            context.fillText('caissa-chess.org', 736, 815); context.textAlign = 'left';
            if (status) status.textContent = 'Image ready.';
            return true;
        }
        async #downloadImage() {
            await this.#renderImage();
            if (!this.#canvas?.toBlob) return false;
            this.#canvas.toBlob(blob => {
                if (!blob || !root.URL?.createObjectURL) return;
                const url = root.URL.createObjectURL(blob); const link = node('a');
                link.href = url; link.download = `caissa-position-${Date.now()}.png`; link.click();
                root.URL.revokeObjectURL(url);
            }, 'image/png');
            return true;
        }
        dispose() {
            this.#listeners.splice(0).forEach(({ target, type, handler }) => target.removeEventListener(type, handler));
            this.#dialog?.remove(); this.#dialog = null; this.#canvas = null; this.#renderId += 1; return true;
        }
        #listen(target, type, handler) {
            target.addEventListener(type, handler); this.#listeners.push({ target, type, handler });
        }
    }

    root.CaissaPlayShareDialog = freeze({
        schemaVersion: SCHEMA_VERSION, tabs: TABS, buildEmbedCode, buildSharePgn, parseFenPieces, normalizeData,
        create: () => new ShareDialog()
    });
})(typeof window !== 'undefined' ? window : globalThis);
