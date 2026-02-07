/**
 * CAISSA Opening Book Manager
 *
 * Import, store, and query opening books from:
 * - Polyglot .bin files (binary format with Zobrist keys)
 * - PGN files (parsed into position frequency maps)
 *
 * Storage: IndexedDB for persistent book data
 * Integration: Shows book moves in the Opening panel
 */

const OpeningBookManager = {

    // State
    books: [],           // { id, name, type, entryCount, importedAt }
    activeBookId: null,
    activeBookData: null, // In-memory data for active book
    isImporting: false,

    // Cloud book
    cloudBookEnabled: false,
    cloudBookUrl: 'https://caissa-game-fetcher.elcriollito.workers.dev/api/book',
    cloudBookName: 'Cerebellum',
    cloudFetchAbort: null,   // AbortController for canceling requests
    cloudDebounceTimer: null,

    // IndexedDB
    db: null,
    DB_NAME: 'caissa_opening_books',
    DB_VERSION: 1,

    // DOM elements
    elements: {},

    // ===== INITIALIZATION =====
    async init() {
        console.log('[OpeningBook] Initializing...');
        await this.initDB();
        await this.loadBookList();
        this.cacheElements();
        this.bindEvents();
        this.renderBookSelector();
        console.log(`[OpeningBook] Ready. ${this.books.length} book(s) available.`);
    },

    // ===== INDEXEDDB =====
    async initDB() {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(this.DB_NAME, this.DB_VERSION);

            request.onupgradeneeded = (event) => {
                const db = event.target.result;

                // Store book metadata
                if (!db.objectStoreNames.contains('books')) {
                    const bookStore = db.createObjectStore('books', { keyPath: 'id' });
                    bookStore.createIndex('name', 'name', { unique: false });
                }

                // Store book data (position -> moves map)
                if (!db.objectStoreNames.contains('bookdata')) {
                    db.createObjectStore('bookdata', { keyPath: 'bookId' });
                }
            };

            request.onsuccess = (event) => {
                this.db = event.target.result;
                resolve();
            };

            request.onerror = (event) => {
                console.error('[OpeningBook] IndexedDB error:', event.target.error);
                reject(event.target.error);
            };
        });
    },

    async loadBookList() {
        if (!this.db) return;

        return new Promise((resolve) => {
            const tx = this.db.transaction('books', 'readonly');
            const store = tx.objectStore('books');
            const request = store.getAll();

            request.onsuccess = () => {
                this.books = request.result || [];
                resolve();
            };

            request.onerror = () => {
                this.books = [];
                resolve();
            };
        });
    },

    async saveBook(bookMeta, bookData) {
        if (!this.db) return;

        return new Promise((resolve, reject) => {
            const tx = this.db.transaction(['books', 'bookdata'], 'readwrite');

            tx.objectStore('books').put(bookMeta);
            tx.objectStore('bookdata').put({ bookId: bookMeta.id, data: bookData });

            tx.oncomplete = () => resolve();
            tx.onerror = () => reject(tx.error);
        });
    },

    async loadBookData(bookId) {
        if (!this.db) return null;

        return new Promise((resolve) => {
            const tx = this.db.transaction('bookdata', 'readonly');
            const request = tx.objectStore('bookdata').get(bookId);

            request.onsuccess = () => {
                resolve(request.result ? request.result.data : null);
            };

            request.onerror = () => resolve(null);
        });
    },

    async deleteBook(bookId) {
        if (!this.db) return;

        return new Promise((resolve, reject) => {
            const tx = this.db.transaction(['books', 'bookdata'], 'readwrite');

            tx.objectStore('books').delete(bookId);
            tx.objectStore('bookdata').delete(bookId);

            tx.oncomplete = () => {
                this.books = this.books.filter(b => b.id !== bookId);
                if (this.activeBookId === bookId) {
                    this.activeBookId = null;
                    this.activeBookData = null;
                }
                resolve();
            };

            tx.onerror = () => reject(tx.error);
        });
    },

    // ===== DOM =====
    cacheElements() {
        this.elements = {
            bookSelector: document.getElementById('openingBookSelector'),
            importBtn: document.getElementById('openingBookImportBtn'),
            deleteBtn: document.getElementById('openingBookDeleteBtn'),
            fileInput: document.getElementById('openingBookFileInput'),
            movesTable: document.getElementById('openingBookMoves'),
            progressBar: document.getElementById('openingBookProgress'),
            progressText: document.getElementById('openingBookProgressText'),
            statusLabel: document.getElementById('openingBookStatus')
        };
    },

    bindEvents() {
        this.elements.importBtn?.addEventListener('click', () => {
            this.elements.fileInput?.click();
        });

        this.elements.fileInput?.addEventListener('change', (e) => {
            const file = e.target.files?.[0];
            if (file) this.importFile(file);
            e.target.value = ''; // Reset for re-import
        });

        this.elements.bookSelector?.addEventListener('change', (e) => {
            this.selectBook(e.target.value);
        });

        this.elements.deleteBtn?.addEventListener('click', () => {
            if (this.activeBookId) {
                this.deleteActiveBook();
            }
        });
    },

    // ===== FILE IMPORT =====
    async importFile(file) {
        if (this.isImporting) {
            console.warn('[OpeningBook] Import already in progress');
            return;
        }

        const ext = file.name.split('.').pop().toLowerCase();
        const sizeWarning = file.size > 50 * 1024 * 1024; // 50MB

        if (sizeWarning) {
            if (!confirm(`This file is ${(file.size / 1024 / 1024).toFixed(1)}MB. Large files may take a while to import. Continue?`)) {
                return;
            }
        }

        this.isImporting = true;
        this.showProgress(0, `Importing ${file.name}...`);

        try {
            let bookData;
            let entryCount;

            if (ext === 'bin') {
                const result = await this.importPolyglotBin(file);
                bookData = result.data;
                entryCount = result.entryCount;
            } else if (ext === 'pgn') {
                const result = await this.importPgn(file);
                bookData = result.data;
                entryCount = result.entryCount;
            } else {
                throw new Error(`Unsupported format: .${ext}\nSupported: .bin (Polyglot), .pgn`);
            }

            // Create book metadata
            const bookMeta = {
                id: `book_${Date.now()}`,
                name: file.name.replace(/\.[^/.]+$/, ''),
                type: ext,
                entryCount,
                fileSize: file.size,
                importedAt: new Date().toISOString()
            };

            // Save to IndexedDB
            await this.saveBook(bookMeta, bookData);
            this.books.push(bookMeta);

            // Activate the newly imported book
            this.renderBookSelector();
            await this.selectBook(bookMeta.id);

            this.hideProgress();
            this.setStatus(`Imported: ${bookMeta.name} (${entryCount} positions)`);
            console.log(`[OpeningBook] Imported ${bookMeta.name}: ${entryCount} positions`);

        } catch (error) {
            console.error('[OpeningBook] Import failed:', error);
            this.hideProgress();
            this.setStatus(`Import failed: ${error.message}`);
            alert(`Import failed:\n${error.message}`);
        } finally {
            this.isImporting = false;
        }
    },

    // ===== POLYGLOT .BIN IMPORT =====
    async importPolyglotBin(file) {
        const buffer = await file.arrayBuffer();
        const numEntries = buffer.byteLength / 16;

        if (buffer.byteLength % 16 !== 0) {
            throw new Error('Invalid Polyglot file: size is not a multiple of 16 bytes');
        }

        this.showProgress(10, `Parsing ${numEntries} entries...`);

        const view = new DataView(buffer);
        // Build a map: hex(key) -> [{move, weight}]
        const positionMap = {};

        for (let i = 0; i < numEntries; i++) {
            if (i % 10000 === 0) {
                this.showProgress(10 + Math.round((i / numEntries) * 80), `Parsing entry ${i}/${numEntries}...`);
                await this.yieldToUI();
            }

            const offset = i * 16;

            // 8-byte key (big-endian) -> hex string for map key
            const keyHigh = view.getUint32(offset, false);
            const keyLow = view.getUint32(offset + 4, false);
            const keyHex = keyHigh.toString(16).padStart(8, '0') + keyLow.toString(16).padStart(8, '0');

            // 2-byte move
            const rawMove = view.getUint16(offset + 8, false);
            const move = this.decodePolyglotMove(rawMove);

            // 2-byte weight
            const weight = view.getUint16(offset + 10, false);

            if (!positionMap[keyHex]) {
                positionMap[keyHex] = [];
            }
            positionMap[keyHex].push({ move, weight });
        }

        const positionCount = Object.keys(positionMap).length;
        this.showProgress(95, `Indexed ${positionCount} positions...`);

        return {
            data: {
                type: 'polyglot',
                positions: positionMap
            },
            entryCount: positionCount
        };
    },

    decodePolyglotMove(encoded) {
        const toFile = encoded & 0x7;
        const toRank = (encoded >> 3) & 0x7;
        const fromFile = (encoded >> 6) & 0x7;
        const fromRank = (encoded >> 9) & 0x7;
        const promotion = (encoded >> 12) & 0x7;

        const files = 'abcdefgh';
        const ranks = '12345678';

        let uci = files[fromFile] + ranks[fromRank] + files[toFile] + ranks[toRank];

        if (promotion > 0) {
            const promotionPieces = ['', 'n', 'b', 'r', 'q'];
            uci += promotionPieces[promotion];
        }

        return uci;
    },

    // ===== PGN IMPORT =====
    async importPgn(file) {
        const text = await file.text();
        this.showProgress(5, 'Splitting PGN games...');

        // Split multi-game PGN
        const gameTexts = this.splitPgnGames(text);
        const totalGames = gameTexts.length;

        if (totalGames === 0) {
            throw new Error('No valid games found in PGN file');
        }

        this.showProgress(10, `Parsing ${totalGames} games...`);

        // Build position frequency map
        // Key: FEN (without move counters) → [{san, uci, count, wins, draws, losses}]
        const positionMap = {};
        let parsed = 0;
        let failed = 0;

        for (let i = 0; i < totalGames; i++) {
            if (i % 100 === 0) {
                this.showProgress(10 + Math.round((i / totalGames) * 80), `Game ${i + 1}/${totalGames}...`);
                await this.yieldToUI();
            }

            try {
                const game = new Chess();
                const loaded = game.load_pgn(gameTexts[i], { sloppy: true });

                if (!loaded) {
                    failed++;
                    continue;
                }

                // Get result for W/D/L stats
                const headers = game.header();
                const result = headers.Result || '*';

                // Replay game to build position map
                const moves = game.history({ verbose: true });
                game.reset();

                for (const move of moves) {
                    const fenKey = this.fenToKey(game.fen());

                    if (!positionMap[fenKey]) {
                        positionMap[fenKey] = {};
                    }

                    const san = move.san;
                    const uci = move.from + move.to + (move.promotion || '');

                    if (!positionMap[fenKey][san]) {
                        positionMap[fenKey][san] = {
                            san,
                            uci,
                            count: 0,
                            wins: 0,
                            draws: 0,
                            losses: 0
                        };
                    }

                    const entry = positionMap[fenKey][san];
                    entry.count++;

                    // Track W/D/L from the perspective of side to move
                    const sideToMove = game.turn(); // 'w' or 'b'
                    if (result === '1-0') {
                        if (sideToMove === 'w') entry.wins++;
                        else entry.losses++;
                    } else if (result === '0-1') {
                        if (sideToMove === 'b') entry.wins++;
                        else entry.losses++;
                    } else if (result === '1/2-1/2') {
                        entry.draws++;
                    }

                    game.move(san);
                }

                parsed++;
            } catch (e) {
                failed++;
            }
        }

        const positionCount = Object.keys(positionMap).length;
        this.showProgress(95, `Built tree: ${positionCount} positions from ${parsed} games`);

        if (parsed === 0) {
            throw new Error(`Failed to parse any games (${failed} errors)`);
        }

        console.log(`[OpeningBook] PGN import: ${parsed} games parsed, ${failed} failed, ${positionCount} positions`);

        return {
            data: {
                type: 'pgn',
                positions: positionMap,
                stats: { games: parsed, failed }
            },
            entryCount: positionCount
        };
    },

    splitPgnGames(text) {
        // Split on "[Event " at start of line (handles multi-game PGN)
        const games = [];
        const parts = text.split(/(?=\[Event\s)/);

        for (const part of parts) {
            const trimmed = part.trim();
            if (trimmed && trimmed.startsWith('[')) {
                games.push(trimmed);
            }
        }

        // If no [Event] tags found, treat entire text as one game
        if (games.length === 0 && text.trim()) {
            games.push(text.trim());
        }

        return games;
    },

    fenToKey(fen) {
        // Strip move counters (halfmove clock + fullmove number) for position matching
        const parts = fen.split(' ');
        return parts.slice(0, 4).join(' ');
    },

    // ===== BOOK SELECTION & LOOKUP =====
    async selectBook(bookId) {
        if (!bookId || bookId === 'none') {
            this.activeBookId = null;
            this.activeBookData = null;
            this.cloudBookEnabled = false;
            this.renderMoves([]);
            this.setStatus('No book selected');
            return;
        }

        // Handle cloud book selection
        if (bookId === 'cloud:cerebellum') {
            this.activeBookId = null;
            this.activeBookData = null;
            this.cloudBookEnabled = true;

            if (this.elements.bookSelector) {
                this.elements.bookSelector.value = 'cloud:cerebellum';
            }

            this.setStatus(`Cloud: ${this.cloudBookName}`);
            console.log('[OpeningBook] Cloud book enabled');

            // Trigger lookup for current position
            this.lookupCurrentPosition();
            return;
        }

        // Local book selection
        this.cloudBookEnabled = false;

        const bookMeta = this.books.find(b => b.id === bookId);
        if (!bookMeta) return;

        this.setStatus(`Loading ${bookMeta.name}...`);

        const data = await this.loadBookData(bookId);
        if (!data) {
            this.setStatus('Failed to load book data');
            return;
        }

        this.activeBookId = bookId;
        this.activeBookData = data;

        // Update selector
        if (this.elements.bookSelector) {
            this.elements.bookSelector.value = bookId;
        }

        this.setStatus(`Active: ${bookMeta.name}`);
        console.log(`[OpeningBook] Selected: ${bookMeta.name} (${bookMeta.type})`);

        // Trigger lookup for current position
        this.lookupCurrentPosition();
    },

    lookupCurrentPosition() {
        if (!window.App?.game) {
            this.renderMoves([]);
            return;
        }

        // Cloud book takes priority over local books if enabled
        if (this.cloudBookEnabled) {
            const fen = App.game.fen();
            this.lookupCloudBook(fen);
            return;
        }

        // Local book lookup
        if (!this.activeBookData) {
            this.renderMoves([]);
            return;
        }

        const game = App.game;
        const moves = this.getMovesForPosition(game);
        this.renderMoves(moves);
    },

    async lookupCloudBook(fen) {
        // Cancel previous request if still pending
        if (this.cloudFetchAbort) {
            this.cloudFetchAbort.abort();
        }

        // Clear previous debounce timer
        if (this.cloudDebounceTimer) {
            clearTimeout(this.cloudDebounceTimer);
        }

        // Debounce 200ms
        this.cloudDebounceTimer = setTimeout(async () => {
            try {
                // Show loading state
                this.renderMoves([{ san: 'Loading...', uci: '', weight: 0, percent: 0 }]);

                // Create AbortController for this request
                this.cloudFetchAbort = new AbortController();

                const url = `${this.cloudBookUrl}?fen=${encodeURIComponent(fen)}&max=12`;
                const response = await fetch(url, {
                    signal: this.cloudFetchAbort.signal,
                    headers: { 'Accept': 'application/json' }
                });

                if (!response.ok) {
                    throw new Error(`HTTP ${response.status}`);
                }

                const data = await response.json();

                if (data.error) {
                    console.error('[OpeningBook] Cloud book error:', data.error);
                    this.renderMoves([]);
                    this.setStatus(`Cloud: ${data.error}`);
                    return;
                }

                // Adapt cloud book response to local format
                const moves = (data.moves || []).map(m => ({
                    san: m.san || m.uci,
                    uci: m.uci,
                    weight: m.weight,
                    count: m.weight,
                    percent: m.percent || 0,
                    wins: 0,
                    draws: 0,
                    losses: 0,
                    totalGames: 0
                }));

                this.renderMoves(moves);
                this.setStatus(`Cloud: ${this.cloudBookName} (${moves.length} moves)`);

            } catch (error) {
                if (error.name === 'AbortError') {
                    // Request was cancelled, ignore
                    return;
                }

                console.error('[OpeningBook] Cloud fetch failed:', error);
                this.renderMoves([]);
                this.setStatus('Cloud book unavailable');
            } finally {
                this.cloudFetchAbort = null;
                this.cloudDebounceTimer = null;
            }
        }, 200);
    },

    getMovesForPosition(game) {
        if (!this.activeBookData) return [];

        const bookType = this.activeBookData.type;

        if (bookType === 'pgn') {
            return this.lookupPgnBook(game);
        } else if (bookType === 'polyglot') {
            return this.lookupPolyglotBook(game);
        }

        return [];
    },

    lookupPgnBook(game) {
        const fenKey = this.fenToKey(game.fen());
        const positionMoves = this.activeBookData.positions[fenKey];

        if (!positionMoves) return [];

        // Convert to array and sort by frequency
        const moves = Object.values(positionMoves);
        const totalCount = moves.reduce((sum, m) => sum + m.count, 0);

        return moves
            .map(m => ({
                san: m.san,
                uci: m.uci,
                count: m.count,
                weight: m.count,
                percent: totalCount > 0 ? (m.count / totalCount * 100) : 0,
                wins: m.wins,
                draws: m.draws,
                losses: m.losses,
                totalGames: m.wins + m.draws + m.losses
            }))
            .sort((a, b) => b.count - a.count);
    },

    lookupPolyglotBook(game) {
        // Use the existing PolyglotBook class if available
        if (window.PolyglotBook) {
            const polyBook = new PolyglotBook();
            polyBook.entries = [];
            polyBook.loaded = true;

            // Compute hash and look up
            const hash = polyBook.hashPosition(game);
            const keyHex = this.bigintToHex(hash);

            const positionMoves = this.activeBookData.positions[keyHex];
            if (!positionMoves) return [];

            const totalWeight = positionMoves.reduce((sum, m) => sum + m.weight, 0);

            return positionMoves.map(m => {
                // Try to convert UCI to SAN
                let san = m.move;
                try {
                    const tempGame = new Chess(game.fen());
                    const result = tempGame.move(m.move, { sloppy: true });
                    if (result) san = result.san;
                } catch (e) {
                    // Keep UCI if SAN conversion fails
                }

                return {
                    san,
                    uci: m.move,
                    weight: m.weight,
                    count: m.weight,
                    percent: totalWeight > 0 ? (m.weight / totalWeight * 100) : 0,
                    wins: 0,
                    draws: 0,
                    losses: 0,
                    totalGames: 0
                };
            }).sort((a, b) => b.weight - a.weight);
        }

        return [];
    },

    bigintToHex(bigint) {
        const hex = bigint.toString(16);
        return hex.padStart(16, '0');
    },

    // ===== UI RENDERING =====
    renderBookSelector() {
        const selector = this.elements.bookSelector;
        if (!selector) return;

        const currentValue = selector.value;

        selector.innerHTML = '<option value="none">No book loaded</option>';

        // Add cloud book option
        const cloudOpt = document.createElement('option');
        cloudOpt.value = 'cloud:cerebellum';
        cloudOpt.textContent = `☁️ Cloud: ${this.cloudBookName} (Online)`;
        selector.appendChild(cloudOpt);

        // Add local books
        for (const book of this.books) {
            const opt = document.createElement('option');
            opt.value = book.id;
            opt.textContent = `${book.name} (${book.type === 'pgn' ? 'PGN' : 'Polyglot'}, ${book.entryCount} pos)`;
            selector.appendChild(opt);
        }

        // Restore selection
        if (currentValue === 'cloud:cerebellum') {
            selector.value = 'cloud:cerebellum';
        } else if (currentValue && this.books.find(b => b.id === currentValue)) {
            selector.value = currentValue;
        } else if (this.cloudBookEnabled) {
            selector.value = 'cloud:cerebellum';
        }

        // Show/hide delete button (only for local books)
        if (this.elements.deleteBtn) {
            this.elements.deleteBtn.style.display =
                (this.books.length > 0 && !this.cloudBookEnabled) ? 'inline-flex' : 'none';
        }
    },

    renderMoves(moves) {
        const container = this.elements.movesTable;
        if (!container) return;

        if (!moves || moves.length === 0) {
            container.innerHTML = '<div class="book-empty">No book moves for this position</div>';
            return;
        }

        const isPgn = this.activeBookData?.type === 'pgn';
        const maxCount = Math.max(...moves.map(m => m.count));

        let html = '<table class="book-moves-table"><thead><tr>';
        html += '<th>Move</th>';
        html += '<th>Games</th>';
        html += '<th class="book-col-bar">Popularity</th>';
        if (isPgn) {
            html += '<th>Score</th>';
        }
        html += '</tr></thead><tbody>';

        for (const move of moves) {
            const barWidth = maxCount > 0 ? (move.count / maxCount * 100) : 0;
            const percentText = move.percent.toFixed(1) + '%';

            html += '<tr class="book-move-row" data-uci="' + move.uci + '" data-san="' + move.san + '">';
            html += `<td class="book-move-san">${move.san}</td>`;
            html += `<td class="book-move-count">${move.count}</td>`;
            html += `<td class="book-col-bar"><div class="book-bar-container">`;
            html += `<div class="book-bar-fill" style="width: ${barWidth}%"></div>`;
            html += `<span class="book-bar-label">${percentText}</span>`;
            html += `</div></td>`;

            if (isPgn && move.totalGames > 0) {
                const winPct = (move.wins / move.totalGames * 100).toFixed(0);
                const drawPct = (move.draws / move.totalGames * 100).toFixed(0);
                const lossPct = (move.losses / move.totalGames * 100).toFixed(0);

                html += '<td class="book-move-score">';
                html += `<div class="book-wdl-bar">`;
                html += `<div class="book-wdl-win" style="width:${winPct}%" title="Win ${winPct}%"></div>`;
                html += `<div class="book-wdl-draw" style="width:${drawPct}%" title="Draw ${drawPct}%"></div>`;
                html += `<div class="book-wdl-loss" style="width:${lossPct}%" title="Loss ${lossPct}%"></div>`;
                html += `</div>`;
                html += '</td>';
            } else if (isPgn) {
                html += '<td></td>';
            }

            html += '</tr>';
        }

        html += '</tbody></table>';
        container.innerHTML = html;

        // Click to play book move
        container.querySelectorAll('.book-move-row').forEach(row => {
            row.addEventListener('click', () => {
                const san = row.dataset.san;
                if (san && window.App?.game) {
                    const result = App.game.move(san);
                    if (result) {
                        App.board.position(App.game.fen());
                        if (typeof App.updateUI === 'function') App.updateUI();
                        this.lookupCurrentPosition();
                    }
                }
            });
        });
    },

    // ===== PROGRESS & STATUS =====
    showProgress(percent, text) {
        if (this.elements.progressBar) {
            this.elements.progressBar.style.display = 'block';
            this.elements.progressBar.querySelector('.book-progress-fill').style.width = `${percent}%`;
        }
        if (this.elements.progressText) {
            this.elements.progressText.textContent = text || `${percent}%`;
            this.elements.progressText.style.display = 'block';
        }
    },

    hideProgress() {
        if (this.elements.progressBar) {
            this.elements.progressBar.style.display = 'none';
        }
        if (this.elements.progressText) {
            this.elements.progressText.style.display = 'none';
        }
    },

    setStatus(text) {
        if (this.elements.statusLabel) {
            this.elements.statusLabel.textContent = text;
        }
    },

    async deleteActiveBook() {
        if (!this.activeBookId) return;

        const book = this.books.find(b => b.id === this.activeBookId);
        const name = book ? book.name : 'this book';

        if (!confirm(`Delete "${name}"? This cannot be undone.`)) return;

        await this.deleteBook(this.activeBookId);
        this.renderBookSelector();
        this.renderMoves([]);
        this.setStatus('Book deleted');
    },

    // Yield to UI thread during heavy parsing
    yieldToUI() {
        return new Promise(resolve => setTimeout(resolve, 0));
    },

    // ===== LIFECYCLE =====
    onPositionChange() {
        this.lookupCurrentPosition();
    }
};

// Initialize when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        OpeningBookManager.init();
    });
} else {
    OpeningBookManager.init();
}

window.OpeningBookManager = OpeningBookManager;
