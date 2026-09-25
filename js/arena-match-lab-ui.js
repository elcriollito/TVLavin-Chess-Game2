const MATCH_LAB_PANEL_STORAGE_KEY = 'caissa_arena_match_lab_advanced_panel';

export const STANDARD_START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

export const TIME_CONTROL_PRESETS = Object.freeze({
    bullet: Object.freeze([
        Object.freeze({ value: '1+0', label: '1 + 0' }),
        Object.freeze({ value: '1+1', label: '1 + 1' })
    ]),
    blitz: Object.freeze([
        Object.freeze({ value: '3+0', label: '3 + 0' }),
        Object.freeze({ value: '3+2', label: '3 + 2' }),
        Object.freeze({ value: '5+0', label: '5 + 0' }),
        Object.freeze({ value: '5+3', label: '5 + 3' })
    ]),
    rapid: Object.freeze([
        Object.freeze({ value: '10+0', label: '10 + 0' }),
        Object.freeze({ value: '10+5', label: '10 + 5' }),
        Object.freeze({ value: '15+10', label: '15 + 10' })
    ]),
    long: Object.freeze([
        Object.freeze({ value: '30+0', label: '30 + 0' }),
        Object.freeze({ value: '30+20', label: '30 + 20' }),
        Object.freeze({ value: '60+30', label: '60 + 30' })
    ]),
    'fixed-depth': Object.freeze([
        Object.freeze({ value: '8', label: 'Depth 8' }),
        Object.freeze({ value: '12', label: 'Depth 12' }),
        Object.freeze({ value: '16', label: 'Depth 16' }),
        Object.freeze({ value: '20', label: 'Depth 20' }),
        Object.freeze({ value: '24', label: 'Depth 24' })
    ])
});

const DEFAULT_PRESET = Object.freeze({
    bullet: '1+0',
    blitz: '3+2',
    rapid: '10+0',
    long: '30+0',
    'fixed-depth': '12'
});

export const ML001C_CLOCK_CONTRACT = Object.freeze({
    owner: 'arena-match-clock',
    flagFall: 'remaining time at zero loses on time',
    pgnResults: Object.freeze(['1-0', '0-1']),
    termination: 'time-forfeit',
    implementedInThisPhase: true
});

const OPENING_PRESENTATION = Object.freeze({
    standard: Object.freeze({
        summary: 'Standard Position',
        description: 'Normal initial chess position',
        fen: STANDARD_START_FEN
    }),
    eco: Object.freeze({
        summary: 'Choose an ECO opening',
        description: 'Select a line from the existing CAISSA ECO database',
        fen: 'ECO resulting FEN will appear here'
    }),
    set: Object.freeze({
        summary: 'Balanced Opening Set',
        description: 'Fixed positions with both-colors pairing',
        fen: 'Opening-set positions will appear here'
    }),
    fen: Object.freeze({
        summary: 'Custom FEN',
        description: 'Use Set Position or Manual Setup above',
        fen: 'Validated six-field FEN will appear here'
    })
});

export function getTimeControlPresets(mode) {
    return TIME_CONTROL_PRESETS[mode] || TIME_CONTROL_PRESETS.blitz;
}

export function buildMatchTitle(whiteName, blackName) {
    const white = String(whiteName || 'White').trim();
    const black = String(blackName || 'Black').trim();
    return `${white} vs ${black}`;
}

export function formatClockDisplay(milliseconds) {
    if (!Number.isFinite(milliseconds) || milliseconds < 0) return '--:--';
    const totalSeconds = Math.ceil(milliseconds / 1000);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    if (hours > 0) return `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
    return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

export function createClockDisplayState({ mode = 'blitz', preset } = {}) {
    const resolvedPreset = preset || DEFAULT_PRESET[mode] || DEFAULT_PRESET.blitz;
    if (mode === 'fixed-depth') {
        const depth = Number.parseInt(resolvedPreset, 10);
        return {
            kind: 'depth',
            text: Number.isFinite(depth) ? `Depth ${depth}` : 'Depth —',
            depth: Number.isFinite(depth) ? depth : null,
            remainingMs: null,
            authoritative: false,
            active: false
        };
    }

    const initialMinutes = Number.parseInt(String(resolvedPreset).split('+')[0], 10);
    const remainingMs = Number.isFinite(initialMinutes) ? initialMinutes * 60_000 : null;
    return {
        kind: 'clock',
        text: remainingMs === null ? '--:--' : formatClockDisplay(remainingMs),
        depth: null,
        remainingMs,
        authoritative: false,
        active: false
    };
}

export function createMatchLabUiConfig({ whiteName, blackName } = {}) {
    return {
        title: buildMatchTitle(whiteName, blackName),
        gameCount: 1,
        moveLimit: null,
        alternateColors: true,
        timeControl: { mode: 'blitz', preset: '3+2' },
        opening: { type: 'standard', fen: STANDARD_START_FEN },
        savePgn: true,
        flipBoard: false
    };
}

function safeStorage(storage) {
    return {
        get(key) {
            try { return storage?.getItem?.(key) ?? null; } catch (_) { return null; }
        },
        set(key, value) {
            try { storage?.setItem?.(key, value); } catch (_) { /* preference remains session-local */ }
        }
    };
}

function selectedLabel(select, fallback) {
    return select?.selectedOptions?.[0]?.textContent?.trim() || fallback;
}

function selectedEngineName(select, fallback) {
    return selectedLabel(select, fallback).replace(/\s+\(Tier [^)]+\).*$/, '').trim();
}

function setCustomFieldVisibility(select, field) {
    if (!select || !field) return;
    field.hidden = select.value !== 'custom';
}

function replacePresetOptions(documentRef, select, mode) {
    if (!select) return;
    const preset = DEFAULT_PRESET[mode] || DEFAULT_PRESET.blitz;
    select.replaceChildren(...getTimeControlPresets(mode).map(({ value, label }) => {
        const option = documentRef.createElement('option');
        option.value = value;
        option.textContent = label;
        option.selected = value === preset;
        return option;
    }));
}

const MINI_PIECES = Object.freeze({
    K: '♔', Q: '♕', R: '♖', B: '♗', N: '♘', P: '♙',
    k: '♚', q: '♛', r: '♜', b: '♝', n: '♞', p: '♟'
});

function renderMiniBoard(documentRef, container, fen, label) {
    if (!container) return;
    const rows = String(fen || '').split(' ')[0].split('/');
    if (rows.length !== 8) {
        container.replaceChildren();
        container.hidden = true;
        return;
    }
    const squares = [];
    rows.forEach((row, rankIndex) => {
        let fileIndex = 0;
        for (const token of row) {
            const count = Number(token);
            if (Number.isInteger(count) && count > 0) {
                for (let offset = 0; offset < count; offset += 1) {
                    squares.push({ piece: '', fileIndex: fileIndex++, rankIndex });
                }
            } else {
                squares.push({ piece: MINI_PIECES[token] || '', fileIndex: fileIndex++, rankIndex });
            }
        }
    });
    if (squares.length !== 64) {
        container.replaceChildren();
        container.hidden = true;
        return;
    }
    container.replaceChildren(...squares.map(square => {
        const element = documentRef.createElement('span');
        element.className = `arena-opening-mini-square ${(square.fileIndex + square.rankIndex) % 2 ? 'dark' : 'light'}`;
        element.textContent = square.piece;
        element.setAttribute('aria-hidden', 'true');
        return element;
    }));
    container.hidden = false;
    container.setAttribute('aria-label', `${label || 'Opening'} position preview`);
}

function snapshotTitle(snapshot) {
    if (!snapshot) return 'Choose an opening';
    if (snapshot.type === 'standard') return 'Standard Position';
    if (snapshot.type === 'fen') return 'Custom FEN';
    return [snapshot.eco, snapshot.openingName].filter(Boolean).join(' — ');
}

function snapshotDescription(snapshot) {
    if (!snapshot) return 'No starting position selected';
    if (snapshot.type === 'standard') return 'Normal initial chess position';
    if (snapshot.type === 'fen') return `${snapshot.resultingFen.split(' ')[1] === 'b' ? 'Black' : 'White'} to move`;
    const variation = snapshot.variationName ? ` · ${snapshot.variationName}` : '';
    const moves = Array.isArray(snapshot.sanMoves) ? snapshot.sanMoves.join(' ') : '';
    return `${variation}${variation && moves ? ' · ' : ''}${moves}`.replace(/^ · /, '');
}

export function initMatchLabUi(documentRef = document, storage = globalThis.localStorage) {
    const elements = {
        details: documentRef.getElementById('arenaAdvancedMatchOptions'),
        whiteEngine: documentRef.getElementById('arenaWhiteEngine'),
        blackEngine: documentRef.getElementById('arenaBlackEngine'),
        title: documentRef.getElementById('arenaMatchTitle'),
        gameCount: documentRef.getElementById('arenaMatchGameCount'),
        customGameCount: documentRef.getElementById('arenaMatchCustomGameCount'),
        customGameCountField: documentRef.getElementById('arenaMatchCustomGameCountField'),
        moveLimit: documentRef.getElementById('arenaMatchMoveLimit'),
        customMoveLimit: documentRef.getElementById('arenaMatchCustomMoveLimit'),
        customMoveLimitField: documentRef.getElementById('arenaMatchCustomMoveLimitField'),
        timeMode: documentRef.getElementById('arenaTimeControlMode'),
        timePreset: documentRef.getElementById('arenaTimeControlPreset'),
        timeSummary: documentRef.getElementById('arenaTimeControlSummary'),
        openingMode: documentRef.getElementById('arenaOpeningMode'),
        ecoSelect: documentRef.getElementById('arenaEcoSelect'),
        openingSummary: documentRef.getElementById('arenaOpeningSummary'),
        openingDescription: documentRef.getElementById('arenaOpeningDescription'),
        openingFen: documentRef.getElementById('arenaOpeningFenPreview'),
        openingMiniBoard: documentRef.getElementById('arenaOpeningMiniBoard'),
        openingModal: documentRef.getElementById('arenaOpeningModal'),
        openingDialogTitle: documentRef.getElementById('arenaOpeningDialogTitle'),
        openingDialogClose: documentRef.getElementById('arenaOpeningDialogClose'),
        openingSearch: documentRef.getElementById('arenaOpeningSearch'),
        openingResults: documentRef.getElementById('arenaOpeningResults'),
        openingResultsStatus: documentRef.getElementById('arenaOpeningResultsStatus'),
        openingCatalog: documentRef.getElementById('arenaOpeningCatalog'),
        openingSetEditor: documentRef.getElementById('arenaOpeningSetEditor'),
        openingSetPositions: documentRef.getElementById('arenaOpeningSetPositions'),
        openingSetCount: documentRef.getElementById('arenaOpeningSetCount'),
        openingPlayBothColors: documentRef.getElementById('arenaOpeningPlayBothColors'),
        openingAddPosition: documentRef.getElementById('arenaOpeningAddPosition'),
        openingSetActions: documentRef.getElementById('arenaOpeningSetActions'),
        openingSetDone: documentRef.getElementById('arenaOpeningSetDone'),
        phaseNote: documentRef.getElementById('arenaMatchLabPhaseNote'),
        flipBoard: documentRef.getElementById('arenaFlipBoard'),
        savePgn: documentRef.getElementById('arenaSavePgn'),
        blackClock: documentRef.getElementById('arenaBlackClock'),
        whiteClock: documentRef.getElementById('arenaWhiteClock')
    };

    if (!elements.details) return null;

    const preference = safeStorage(storage);
    elements.details.open = preference.get(MATCH_LAB_PANEL_STORAGE_KEY) === 'expanded';
    elements.details.addEventListener('toggle', () => {
        preference.set(MATCH_LAB_PANEL_STORAGE_KEY, elements.details.open ? 'expanded' : 'collapsed');
    });

    const config = createMatchLabUiConfig({
        whiteName: selectedEngineName(elements.whiteEngine, 'White'),
        blackName: selectedEngineName(elements.blackEngine, 'Black')
    });
    let titleIsAutomatic = true;

    const refreshAutomaticTitle = () => {
        if (!elements.title || !titleIsAutomatic) return;
        config.title = buildMatchTitle(
            selectedEngineName(elements.whiteEngine, 'White'),
            selectedEngineName(elements.blackEngine, 'Black')
        );
        elements.title.value = config.title;
    };

    elements.title?.addEventListener('input', () => {
        titleIsAutomatic = false;
        config.title = elements.title.value;
    });
    elements.whiteEngine?.addEventListener('change', refreshAutomaticTitle);
    elements.blackEngine?.addEventListener('change', refreshAutomaticTitle);
    refreshAutomaticTitle();

    elements.gameCount?.addEventListener('change', () => {
        setCustomFieldVisibility(elements.gameCount, elements.customGameCountField);
        config.gameCount = elements.gameCount.value === 'custom'
            ? Number(elements.customGameCount?.value || 1) : Number(elements.gameCount.value);
        globalThis.CaissaArena?.updateStartButtonLabel?.();
    });
    elements.customGameCount?.addEventListener('input', () => {
        config.gameCount = Number(elements.customGameCount.value || 0);
        globalThis.CaissaArena?.updateStartButtonLabel?.();
    });
    elements.moveLimit?.addEventListener('change', () => {
        setCustomFieldVisibility(elements.moveLimit, elements.customMoveLimitField);
        config.moveLimit = elements.moveLimit.value === 'none' ? null
            : elements.moveLimit.value === 'custom'
                ? Number(elements.customMoveLimit?.value || 100)
                : Number(elements.moveLimit.value);
    });
    elements.customMoveLimit?.addEventListener('input', () => {
        config.moveLimit = Number(elements.customMoveLimit.value || 0);
    });
    setCustomFieldVisibility(elements.gameCount, elements.customGameCountField);
    setCustomFieldVisibility(elements.moveLimit, elements.customMoveLimitField);
    globalThis.CaissaArena?.updateStartButtonLabel?.();

    const clockDisplay = { black: null, white: null };
    const setClockDisplay = (color, display) => {
        if (!['black', 'white'].includes(color)) return null;
        const output = color === 'black' ? elements.blackClock : elements.whiteClock;
        const kind = display?.kind === 'depth' ? 'depth' : 'clock';
        const next = {
            ...display,
            kind,
            text: display?.text || (kind === 'depth'
                ? `Depth ${Number.isFinite(display?.depth) ? display.depth : '—'}`
                : formatClockDisplay(display?.remainingMs)),
            authoritative: display?.authoritative === true,
            active: display?.active === true
        };
        clockDisplay[color] = next;
        if (!output) return next;
        output.textContent = next.text;
        output.dataset.displayKind = next.kind;
        output.dataset.authoritative = String(next.authoritative === true);
        output.dataset.active = String(next.active === true);
        const accessibleLabel = next.kind === 'depth'
            ? `${color === 'black' ? 'Black' : 'White'} engine search depth`
            : `${color === 'black' ? 'Black' : 'White'} engine time`;
        output.setAttribute('aria-label', `${accessibleLabel}${next.active ? ', active' : ''}`);
        return next;
    };
    const resetClockPreview = () => {
        const preview = createClockDisplayState(config.timeControl);
        setClockDisplay('black', preview);
        setClockDisplay('white', preview);
    };

    const refreshTimeControl = () => {
        const mode = elements.timeMode?.value || 'blitz';
        replacePresetOptions(documentRef, elements.timePreset, mode);
        config.timeControl = { mode, preset: elements.timePreset?.value || DEFAULT_PRESET[mode] };
        if (elements.timeSummary) {
            elements.timeSummary.textContent = mode === 'fixed-depth'
                ? `Fixed search: ${elements.timePreset.selectedOptions[0]?.textContent || 'Depth'}`
                : `Clock preset: ${elements.timePreset.selectedOptions[0]?.textContent || ''}`;
        }
        resetClockPreview();
    };
    elements.timeMode?.addEventListener('change', refreshTimeControl);
    elements.timePreset?.addEventListener('change', () => {
        config.timeControl.preset = elements.timePreset.value;
        if (elements.timeSummary) {
            elements.timeSummary.textContent = config.timeControl.mode === 'fixed-depth'
                ? `Fixed search: ${elements.timePreset.selectedOptions[0]?.textContent || 'Depth'}`
                : `Clock preset: ${elements.timePreset.selectedOptions[0]?.textContent || ''}`;
        }
        resetClockPreview();
    });
    refreshTimeControl();

    const openingApi = globalThis.CaissaArenaOpeningSnapshots;
    let catalogEntries = null;
    let visibleEntries = [];
    let openingSetPositions = [];
    let dialogTrigger = null;

    const presentSnapshot = snapshot => {
        config.opening = snapshot;
        if (elements.openingSummary) elements.openingSummary.textContent = snapshotTitle(snapshot);
        if (elements.openingDescription) elements.openingDescription.textContent = snapshotDescription(snapshot);
        if (elements.openingFen) elements.openingFen.textContent = snapshot?.resultingFen || 'Select a valid starting position';
        renderMiniBoard(documentRef, elements.openingMiniBoard, snapshot?.resultingFen, snapshotTitle(snapshot));
    };

    const setDerivedGameCount = openingSet => {
        if (!elements.gameCount) return;
        if (!openingSet) {
            elements.gameCount.disabled = false;
            return;
        }
        const count = openingSet.gameCount;
        const standardOption = [...elements.gameCount.options].find(option => option.value === String(count));
        elements.gameCount.value = standardOption ? String(count) : 'custom';
        if (!standardOption && elements.customGameCount) elements.customGameCount.value = String(count);
        setCustomFieldVisibility(elements.gameCount, elements.customGameCountField);
        elements.gameCount.disabled = true;
        if (elements.customGameCount) elements.customGameCount.disabled = true;
        config.gameCount = count;
        globalThis.CaissaArena?.updateStartButtonLabel?.();
    };

    const renderSetEditor = () => {
        if (!elements.openingSetPositions) return;
        elements.openingSetPositions.replaceChildren(...openingSetPositions.map((snapshot, index) => {
            const item = documentRef.createElement('li');
            item.className = 'arena-opening-set-position';
            const label = documentRef.createElement('span');
            label.textContent = `${snapshot.eco || 'FEN'} · ${snapshot.openingName || 'Position'}`;
            label.title = snapshot.resultingFen;
            const actions = documentRef.createElement('span');
            actions.className = 'arena-opening-set-position-actions';
            [['↑', -1, 'Move up'], ['↓', 1, 'Move down']].forEach(([text, delta, aria]) => {
                const button = documentRef.createElement('button');
                button.type = 'button';
                button.className = 'btn btn-secondary btn-sm';
                button.textContent = text;
                button.setAttribute('aria-label', `${aria}: ${label.textContent}`);
                button.disabled = index + delta < 0 || index + delta >= openingSetPositions.length;
                button.addEventListener('click', () => {
                    const next = index + delta;
                    [openingSetPositions[index], openingSetPositions[next]] = [openingSetPositions[next], openingSetPositions[index]];
                    renderSetEditor();
                });
                actions.append(button);
            });
            const remove = documentRef.createElement('button');
            remove.type = 'button';
            remove.className = 'btn btn-secondary btn-sm';
            remove.textContent = '×';
            remove.setAttribute('aria-label', `Remove ${label.textContent}`);
            remove.addEventListener('click', () => {
                openingSetPositions.splice(index, 1);
                renderSetEditor();
            });
            actions.append(remove);
            item.append(label, actions);
            return item;
        }));
        const both = elements.openingPlayBothColors?.checked !== false;
        const count = openingSetPositions.length * (both ? 2 : 1);
        if (elements.openingSetCount) {
            elements.openingSetCount.textContent = openingSetPositions.length
                ? `${count} games from ${openingSetPositions.length} positions × ${both ? 'both colors' : 'one color'}`
                : '0 positions · add at least one ECO position';
        }
    };

    const renderCatalogResults = query => {
        if (!elements.openingResults || !catalogEntries) return;
        const needle = String(query || '').trim().toLocaleLowerCase();
        visibleEntries = catalogEntries.filter(({ snapshot }) => {
            const haystack = `${snapshot.eco} ${snapshot.openingName} ${snapshot.variationName || ''}`.toLocaleLowerCase();
            return !needle || haystack.includes(needle);
        }).slice(0, 60);
        elements.openingResults.replaceChildren(...visibleEntries.map(({ snapshot }, index) => {
            const button = documentRef.createElement('button');
            button.type = 'button';
            button.className = 'arena-opening-result';
            button.setAttribute('role', 'option');
            button.setAttribute('aria-selected', 'false');
            button.dataset.resultIndex = String(index);
            const code = documentRef.createElement('span');
            code.className = 'arena-opening-result-code';
            code.textContent = snapshot.eco;
            const name = documentRef.createElement('span');
            name.className = 'arena-opening-result-name';
            name.textContent = [snapshot.openingName, snapshot.variationName].filter(Boolean).join(' — ');
            button.append(code, name);
            button.addEventListener('click', () => selectCatalogEntry(index));
            return button;
        }));
        if (elements.openingResultsStatus) {
            elements.openingResultsStatus.textContent = visibleEntries.length
                ? `${visibleEntries.length}${visibleEntries.length === 60 ? '+' : ''} valid openings`
                : 'No valid openings found.';
        }
    };

    const closeOpeningDialog = () => {
        if (!elements.openingModal) return;
        elements.openingModal.hidden = true;
        dialogTrigger?.focus?.();
        dialogTrigger = null;
    };

    const selectCatalogEntry = index => {
        const entry = visibleEntries[index];
        if (!entry) return;
        const mode = elements.openingMode?.value || 'eco';
        if (mode === 'set') {
            openingSetPositions.push(entry.snapshot);
            renderSetEditor();
            return;
        }
        presentSnapshot(entry.snapshot);
        globalThis.CaissaArena?.previewOpeningSnapshot?.(entry.snapshot);
        if (elements.phaseNote) elements.phaseNote.textContent = `${entry.snapshot.eco} opening ready. ${entry.snapshot.resultingFen.split(' ')[1] === 'b' ? 'Black' : 'White'} to move.`;
        closeOpeningDialog();
    };

    const loadCatalog = async () => {
        if (catalogEntries) return catalogEntries;
        if (elements.openingResultsStatus) elements.openingResultsStatus.textContent = 'Loading CAISSA ECO Database…';
        const catalog = await globalThis.CaissaEcoOpeningResolver?.loadCatalog?.();
        catalogEntries = openingApi?.searchCatalog?.(catalog || [], '', globalThis.Chess) || [];
        return catalogEntries;
    };

    const openOpeningDialog = async trigger => {
        if (!elements.openingModal) return;
        dialogTrigger = trigger || documentRef.activeElement;
        const mode = elements.openingMode?.value || 'eco';
        const isSet = mode === 'set';
        elements.openingModal.hidden = false;
        if (elements.openingDialogTitle) elements.openingDialogTitle.textContent = isSet ? 'Balanced Opening Set' : 'Select an ECO opening';
        if (elements.openingSetEditor) elements.openingSetEditor.hidden = !isSet;
        if (elements.openingSetActions) elements.openingSetActions.hidden = !isSet;
        renderSetEditor();
        await loadCatalog();
        renderCatalogResults(elements.openingSearch?.value || '');
        elements.openingSearch?.focus();
    };

    const useOpeningSet = () => {
        try {
            const openingSet = openingApi.createOpeningSet({
                positions: openingSetPositions,
                playBothColors: elements.openingPlayBothColors?.checked !== false
            });
            const displaySnapshot = openingApi.deepFreeze({
                ...openingSet,
                eco: null,
                openingName: openingSet.title,
                variationName: `${openingSet.positions.length} positions`,
                resultingFen: openingSet.positions[0].resultingFen,
                sanMoves: []
            });
            presentSnapshot(displaySnapshot);
            globalThis.CaissaArena?.previewOpeningSnapshot?.(displaySnapshot);
            setDerivedGameCount(openingSet);
            if (elements.phaseNote) elements.phaseNote.textContent = `${openingSet.gameCount} games from ${openingSet.positions.length} positions × ${openingSet.playBothColors ? 'both colors' : 'one color'}.`;
            closeOpeningDialog();
        } catch (error) {
            if (elements.openingResultsStatus) elements.openingResultsStatus.textContent = error.message;
        }
    };

    const refreshOpening = () => {
        const type = elements.openingMode?.value || 'standard';
        const presentation = OPENING_PRESENTATION[type] || OPENING_PRESENTATION.standard;
        setDerivedGameCount(null);
        if (elements.customGameCount) elements.customGameCount.disabled = false;
        if (elements.ecoSelect) {
            elements.ecoSelect.innerHTML = type === 'set'
                ? 'View / Edit Set <i class="fas fa-arrow-right" aria-hidden="true"></i>'
                : 'Select from ECO Database <i class="fas fa-arrow-right" aria-hidden="true"></i>';
            elements.ecoSelect.classList.toggle('is-contextual', ['eco', 'set'].includes(type));
        }
        if (type === 'standard') {
            const snapshot = openingApi?.createStandardSnapshot?.() || { type, resultingFen: STANDARD_START_FEN };
            presentSnapshot(snapshot);
            globalThis.CaissaArena?.previewOpeningSnapshot?.(snapshot);
        } else if (type === 'fen') {
            const customFen = globalThis.CaissaArena?.state?.customStartFen;
            if (customFen) {
                try { presentSnapshot(openingApi.createFenSnapshot(customFen, globalThis.Chess)); } catch (_) { /* retain placeholder */ }
            } else {
                config.opening = { type: 'fen', resultingFen: null };
                if (elements.openingSummary) elements.openingSummary.textContent = presentation.summary;
                if (elements.openingDescription) elements.openingDescription.textContent = presentation.description;
                if (elements.openingFen) elements.openingFen.textContent = presentation.fen;
                renderMiniBoard(documentRef, elements.openingMiniBoard, null);
            }
        } else if (type === 'set' && config.opening?.type === 'set') {
            setDerivedGameCount(config.opening);
        } else if (config.opening?.type !== type) {
            config.opening = { type, resultingFen: null };
            if (elements.openingSummary) elements.openingSummary.textContent = presentation.summary;
            if (elements.openingDescription) elements.openingDescription.textContent = presentation.description;
            if (elements.openingFen) elements.openingFen.textContent = presentation.fen;
            renderMiniBoard(documentRef, elements.openingMiniBoard, null);
        }
    };
    elements.openingMode?.addEventListener('change', refreshOpening);
    elements.ecoSelect?.addEventListener('click', event => {
        if (!['eco', 'set'].includes(elements.openingMode?.value)) {
            elements.openingMode.value = 'eco';
            refreshOpening();
        }
        openOpeningDialog(event.currentTarget);
    });
    elements.openingDialogClose?.addEventListener('click', closeOpeningDialog);
    elements.openingModal?.addEventListener('click', event => {
        if (event.target === elements.openingModal) closeOpeningDialog();
    });
    elements.openingSearch?.addEventListener('input', () => renderCatalogResults(elements.openingSearch.value));
    elements.openingSearch?.addEventListener('keydown', event => {
        if (event.key === 'Enter' && visibleEntries.length) {
            event.preventDefault();
            selectCatalogEntry(0);
        }
    });
    elements.openingAddPosition?.addEventListener('click', () => elements.openingSearch?.focus());
    elements.openingPlayBothColors?.addEventListener('change', renderSetEditor);
    elements.openingSetDone?.addEventListener('click', useOpeningSet);
    documentRef.addEventListener('keydown', event => {
        if (elements.openingModal?.hidden !== false) return;
        if (event.key === 'Escape') {
            closeOpeningDialog();
            return;
        }
        if (event.key !== 'Tab') return;
        const focusable = [...elements.openingModal.querySelectorAll('button:not([disabled]), input:not([disabled])')]
            .filter(element => !element.closest('[hidden]'));
        if (!focusable.length) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (event.shiftKey && documentRef.activeElement === first) {
            event.preventDefault();
            last.focus();
        } else if (!event.shiftKey && documentRef.activeElement === last) {
            event.preventDefault();
            first.focus();
        }
    });
    refreshOpening();

    elements.flipBoard?.addEventListener('change', () => {
        config.flipBoard = elements.flipBoard.checked;
        globalThis.CaissaArena?.setBoardFlipped?.(config.flipBoard);
    });
    elements.savePgn?.addEventListener('change', () => {
        config.savePgn = elements.savePgn.checked;
    });

    const getOpeningSnapshot = () => {
        const type = elements.openingMode?.value || 'standard';
        if (type === 'standard') return openingApi.createStandardSnapshot();
        if (type === 'fen') {
            const fen = globalThis.CaissaArena?.state?.customStartFen;
            if (!fen) throw new Error('Starting position is invalid.');
            return openingApi.createFenSnapshot(fen, globalThis.Chess);
        }
        if (config.opening?.type !== type || !config.opening?.resultingFen) {
            throw new Error(type === 'set' ? 'Add at least one opening position.' : 'Opening could not be loaded.');
        }
        return config.opening;
    };

    const selectCustomFen = fen => {
        if (elements.openingMode) elements.openingMode.value = 'fen';
        const snapshot = openingApi.createFenSnapshot(fen, globalThis.Chess);
        presentSnapshot(snapshot);
        return snapshot;
    };

    const controller = Object.freeze({
        phase: 'ML-001D',
        config,
        clockDisplay,
        elements,
        closeOpeningDialog,
        formatClockDisplay,
        getOpeningSnapshot,
        openOpeningDialog,
        refreshAutomaticTitle,
        refreshOpening,
        refreshTimeControl,
        resetClockPreview,
        selectCustomFen,
        setClockDisplay
    });
    globalThis.CaissaArenaMatchLabUI = controller;
    return controller;
}

const initialize = () => initMatchLabUi();
if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initialize);
    else initialize();
}
