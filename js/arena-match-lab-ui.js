const MATCH_LAB_PANEL_STORAGE_KEY = 'caissa_arena_match_lab_advanced_panel';

export const STANDARD_START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

export const TIME_CONTROL_PRESETS = Object.freeze({
    bullet: Object.freeze([
        Object.freeze({ value: '1+0', label: '1 + 0' }),
        Object.freeze({ value: '1+1', label: '1 + 1' }),
        Object.freeze({ value: 'custom', label: 'Custom' })
    ]),
    blitz: Object.freeze([
        Object.freeze({ value: '3+0', label: '3 + 0' }),
        Object.freeze({ value: '3+2', label: '3 + 2' }),
        Object.freeze({ value: '5+0', label: '5 + 0' }),
        Object.freeze({ value: '5+3', label: '5 + 3' }),
        Object.freeze({ value: 'custom', label: 'Custom' })
    ]),
    rapid: Object.freeze([
        Object.freeze({ value: '10+0', label: '10 + 0' }),
        Object.freeze({ value: '10+5', label: '10 + 5' }),
        Object.freeze({ value: '15+10', label: '15 + 10' }),
        Object.freeze({ value: 'custom', label: 'Custom' })
    ]),
    long: Object.freeze([
        Object.freeze({ value: '30+0', label: '30 + 0' }),
        Object.freeze({ value: '30+20', label: '30 + 20' }),
        Object.freeze({ value: '60+30', label: '60 + 30' }),
        Object.freeze({ value: 'custom', label: 'Custom' })
    ]),
    'fixed-depth': Object.freeze([
        Object.freeze({ value: '8', label: 'Depth 8' }),
        Object.freeze({ value: '12', label: 'Depth 12' }),
        Object.freeze({ value: '16', label: 'Depth 16' }),
        Object.freeze({ value: '20', label: 'Depth 20' }),
        Object.freeze({ value: '24', label: 'Depth 24' }),
        Object.freeze({ value: 'custom', label: 'Custom' })
    ])
});

const DEFAULT_PRESET = Object.freeze({
    bullet: '1+0',
    blitz: '3+2',
    rapid: '10+0',
    long: '30+0',
    'fixed-depth': '12'
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

export function initMatchLabUi(documentRef = document, storage = globalThis.localStorage) {
    const elements = {
        details: documentRef.getElementById('arenaAdvancedMatchOptions'),
        whiteEngine: documentRef.getElementById('arenaWhiteEngine'),
        blackEngine: documentRef.getElementById('arenaBlackEngine'),
        title: documentRef.getElementById('arenaMatchTitle'),
        gameCount: documentRef.getElementById('arenaMatchGameCount'),
        customGameCountField: documentRef.getElementById('arenaMatchCustomGameCountField'),
        moveLimit: documentRef.getElementById('arenaMatchMoveLimit'),
        customMoveLimitField: documentRef.getElementById('arenaMatchCustomMoveLimitField'),
        timeMode: documentRef.getElementById('arenaTimeControlMode'),
        timePreset: documentRef.getElementById('arenaTimeControlPreset'),
        timeSummary: documentRef.getElementById('arenaTimeControlSummary'),
        openingMode: documentRef.getElementById('arenaOpeningMode'),
        ecoSelect: documentRef.getElementById('arenaEcoSelect'),
        openingSummary: documentRef.getElementById('arenaOpeningSummary'),
        openingDescription: documentRef.getElementById('arenaOpeningDescription'),
        openingFen: documentRef.getElementById('arenaOpeningFenPreview'),
        phaseNote: documentRef.getElementById('arenaMatchLabPhaseNote'),
        flipBoard: documentRef.getElementById('arenaFlipBoard'),
        savePgn: documentRef.getElementById('arenaSavePgn')
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
        config.gameCount = elements.gameCount.value === 'custom' ? null : Number(elements.gameCount.value);
    });
    elements.moveLimit?.addEventListener('change', () => {
        setCustomFieldVisibility(elements.moveLimit, elements.customMoveLimitField);
        config.moveLimit = ['none', 'custom'].includes(elements.moveLimit.value)
            ? null : Number(elements.moveLimit.value);
    });
    setCustomFieldVisibility(elements.gameCount, elements.customGameCountField);
    setCustomFieldVisibility(elements.moveLimit, elements.customMoveLimitField);

    const refreshTimeControl = () => {
        const mode = elements.timeMode?.value || 'blitz';
        replacePresetOptions(documentRef, elements.timePreset, mode);
        config.timeControl = { mode, preset: elements.timePreset?.value || DEFAULT_PRESET[mode] };
        if (elements.timeSummary) {
            elements.timeSummary.textContent = mode === 'fixed-depth'
                ? `Fixed search: ${elements.timePreset.selectedOptions[0]?.textContent || 'Depth'}`
                : `Clock preset: ${elements.timePreset.selectedOptions[0]?.textContent || ''}`;
        }
    };
    elements.timeMode?.addEventListener('change', refreshTimeControl);
    elements.timePreset?.addEventListener('change', () => {
        config.timeControl.preset = elements.timePreset.value;
        if (elements.timeSummary) {
            elements.timeSummary.textContent = config.timeControl.mode === 'fixed-depth'
                ? `Fixed search: ${elements.timePreset.selectedOptions[0]?.textContent || 'Depth'}`
                : `Clock preset: ${elements.timePreset.selectedOptions[0]?.textContent || ''}`;
        }
    });
    refreshTimeControl();

    const refreshOpening = () => {
        const type = elements.openingMode?.value || 'standard';
        const presentation = OPENING_PRESENTATION[type] || OPENING_PRESENTATION.standard;
        config.opening = { type, fen: type === 'standard' ? STANDARD_START_FEN : null };
        if (elements.openingSummary) elements.openingSummary.textContent = presentation.summary;
        if (elements.openingDescription) elements.openingDescription.textContent = presentation.description;
        if (elements.openingFen) elements.openingFen.textContent = presentation.fen;
        elements.ecoSelect?.classList.toggle('is-contextual', type === 'eco');
    };
    elements.openingMode?.addEventListener('change', refreshOpening);
    elements.ecoSelect?.addEventListener('click', () => {
        if (elements.openingMode) elements.openingMode.value = 'eco';
        refreshOpening();
        if (elements.phaseNote) {
            elements.phaseNote.textContent = 'ECO database handoff is prepared for ML-001D; this delivery is the approved UI shell only.';
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

    const controller = Object.freeze({
        phase: 'ML-001A',
        config,
        elements,
        refreshAutomaticTitle,
        refreshOpening,
        refreshTimeControl
    });
    globalThis.CaissaArenaMatchLabUI = controller;
    return controller;
}

const initialize = () => initMatchLabUi();
if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initialize);
    else initialize();
}
