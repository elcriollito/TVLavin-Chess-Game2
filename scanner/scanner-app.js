(function () {
  'use strict';

  const flags = window.CAISSA_SCANNER_FLAGS || {};
  const state = window.CaissaScannerState;
  const viewState = window.CaissaScannerViewState;
  const VIEW_STATES = viewState.STATES;
  const fenTools = window.CaissaScannerFen;
  const MIN_READING_DURATION_MS = 320;
  const EDIT_ENTRY = Object.freeze({ RECOGNITION_REVIEW: 'recognition-review', MANUAL_EDIT: 'manual-edit' });
  const PIECE_NAMES = Object.freeze({ K: 'White King', Q: 'White Queen', R: 'White Rook', B: 'White Bishop', N: 'White Knight', P: 'White Pawn', k: 'Black King', q: 'Black Queen', r: 'Black Rook', b: 'Black Bishop', n: 'Black Knight', p: 'Black Pawn' });
  const $ = (id) => document.getElementById(id);
  const els = {
    topbar: document.querySelector('.app-topbar'),
    home: $('homeView'),
    reading: $('readingView'),
    readingTitle: $('readingTitle'),
    workspace: $('workspaceView'),
    reviewEdit: $('reviewEditView'),
    app: $('scannerApp'),
    homeBtn: $('homeBtn'),
    homeScan: $('homeScanBtn'),
    reportFailure: $('reportScanFailureBtn'),
    publicServiceStatus: $('publicServiceStatus'),
    camera: $('cameraInput'),
    gallery: $('galleryInput'),
    drop: $('dropZone'),
    previewWrap: $('sourcePreviewWrap'),
    preview: $('sourcePreview'),
    sourceStatus: $('sourceStatus'),
    candidateStatus: $('candidateStatus'),
    reviewStatus: $('reviewStatus'),
    workspaceTitle: $('workspaceTitle'),
    board: $('scannerBoard'),
    boardShell: $('scannerBoardShell'),
    workspaceBoardSlot: $('workspaceBoardSlot'),
    editBoardSlot: $('editBoardSlot'),
    boardEmpty: $('boardEmpty'),
    recognitionSummary: $('recognitionSummary'),
    confidence: $('boardConfidence'),
    confirmBar: $('confirmBar'),
    confirm: $('confirmBtn'),
    fen: $('fenInput'),
    validate: $('validateBtn'),
    flip: $('flipBtn'),
    coordinatesVisibility: $('coordinatesVisibilityBtn'),
    validation: $('validationBox'),
    sidePiece: document.querySelector('#sideToMove .side-piece'),
    sideIcon: $('sideToMovePiece'),
    sideText: $('sideToMoveText'),
    editBtn: $('editBtn'),
    editSheet: $('editSheet'),
    cancelEdit: $('cancelEditBtn'),
    applyEdit: $('applyEditBtn'),
    editFooter: $('editBoardFooter'),
    editToolStatus: $('editToolStatus'),
    editValidation: $('editValidation'),
    structuralWarning: $('publicStructuralWarning'),
    structuralTitle: $('publicStructuralTitle'),
    structuralMessage: $('publicStructuralMessage'),
    structuralAcknowledgeRow: $('publicStructuralAcknowledgeRow'),
    structuralAcknowledge: $('publicStructuralAcknowledge'),
    orientationReview: $('orientationReview'),
    orientationReviewTitle: $('orientationReviewTitle'),
    orientationReviewMessage: $('orientationReviewMessage'),
    orientationReviewScores: $('orientationReviewScores'),
    whiteBottom: $('whiteBottomBtn'),
    blackBottom: $('blackBottomBtn'),
    localizationWrong: $('publicLocalizationWrongBtn'),
    blackPalette: $('blackPiecePalette'),
    whitePalette: $('whitePiecePalette'),
    clearSquare: $('clearSquareBtn'),
    clearBoard: $('clearBoardBtn'),
    editWhiteTurn: $('editWhiteTurnBtn'),
    editBlackTurn: $('editBlackTurnBtn'),
    editCastling: $('editCastlingBtn'),
    editCastlingPanel: $('editCastlingPanel'),
    castlingInputs: [...document.querySelectorAll('#editCastlingPanel [data-castling]')],
    editFlip: $('editFlipBtn'),
    editCoordinatesVisibility: $('editCoordinatesVisibilityBtn'),
    correctOrientation: $('correctOrientationBtn'),
    editLibrary: $('editLibraryBtn'),
    editExport: $('editExportBtn'),
    editMenu: $('editMenuBtn'),
    moreBtn: $('moreBtn'),
    boardActions: $('boardActionsBtn'),
    productMenu: $('scannerProductMenu'),
    analysisMenu: $('scannerAnalysisMenu'),
    diagramLibrary: $('diagramLibraryBtn'),
    videoExplorer: $('videoExplorerBtn'),
    account: $('accountBtn'),
    accountHint: $('accountMenuHint'),
    membership: $('membershipBtn'),
    logout: $('logoutBtn'),
    logoutHint: $('logoutMenuHint'),
    openLichess: $('openLichessBtn'),
    openChessCom: $('openChessComBtn'),
    openCaissa: $('openCaissaBtn'),
    exportSheet: $('exportSheet'),
    closeExport: $('closeExportBtn'),
    exportDiagram: $('exportDiagramBtn'),
    exportFen: $('exportFenBtn'),
    newScan: $('newScanBtn'),
    newScanSheet: $('newScanSheet'),
    feedbackSheet: $('feedbackSheet'),
    sheetBackdrop: $('sheetBackdrop'),
    cancelNewScan: $('cancelNewScanBtn'),
    takePhoto: $('takePhotoBtn'),
    choosePhoto: $('choosePhotoBtn'),
    helpImprove: $('helpImproveBtn'),
    cancelFeedback: $('cancelFeedbackBtn'),
    shareCorrection: $('shareCorrectionConsent'),
    shareImage: $('shareImageConsent'),
    sourceImageRightsRow: $('sourceImageRightsRow'),
    sourceImageRights: $('sourceImageRightsConsent'),
    feedbackImageReselect: $('feedbackImageReselectBtn'),
    feedbackImageInput: $('feedbackImageInput'),
    submitFeedback: $('submitFeedbackBtn'),
    feedbackDescription: $('feedbackSheetDescription'),
    feedbackStatus: $('feedbackStatus'),
    workspaceSaveDiagram: $('workspaceSaveDiagramBtn'),
    workspaceShare: $('workspaceShareBtn'),
    handoff: $('handoffCard'),
    confirmed: $('confirmedFen'),
    analyze: $('analyzeBtn'),
    engineToggle: $('engineToggle'),
    arrowsToggle: $('arrowsToggle'),
    bestMoveArrowOverlay: $('bestMoveArrowOverlay'),
    bestMoveArrowLine: $('bestMoveArrowLine'),
    analysisPanel: $('analysisPanel'),
    analysisStatus: $('analysisStatus'),
    analysisFen: $('analysisFen'),
    analysisMoveHint: $('analysisMoveHint'),
    first: $('firstMoveBtn'),
    previous: $('previousMoveBtn'),
    next: $('nextMoveBtn'),
    last: $('lastMoveBtn'),
    toast: $('appToast')
  };

  let objectUrl = null;
  let flipped = false;
  let coordinatesVisible = true;
  let orientationCorrectionApplied = false;
  let orientationInference = null;
  let selectedCanonicalOrientation = 'white-bottom';
  let userOrientationOverride = false;
  let orientationResolved = true;
  let selectedSquare = null;
  let toastTimer = null;
  let editWasConfirmed = false;
  let editResumeAnalysis = false;
  let editOriginalFen = '';
  let editOriginalFlipped = false;
  let editOriginalOrientationCorrectionApplied = false;
  let editOriginalCanonicalOrientation = 'white-bottom';
  let editOriginalUserOrientationOverride = false;
  let editEntryMode = null;
  let activeEditTool = null;
  let activeMenu = null;
  let activeSheet = null;
  let viewFocusSequence = 0;
  let recognitionRuntime = null;
  let publicClient = null;
  let publicRecognition = null;
  let publicFailureContext = null;
  let publicFailureError = null;
  let selectedSourceFile = null;
  let selectedCaptureType = null;
  let pendingFeedbackType = null;
  let pendingConsentContinuation = false;
  let pendingFeedbackOwnerUserId = null;
  let feedbackNeedsReauthentication = false;
  let feedbackIdentityConflict = false;
  let restoredFeedbackDraft = false;
  let feedbackSubmissionPending = false;
  let feedbackRetryAvailable = false;
  let structuralAcknowledged = false;
  let publicRecognitionController = null;

  async function loadPublicClient() {
    publicClient ||= await import('/scanner/public/scanner-public-client.js?v=1.0.2');
    return publicClient;
  }

  function createRecognitionRuntime() {
    return window.CaissaScannerRecognitionRuntime?.create({
      isGenerationCurrent: (generation) => state.snapshot().generation === generation
    }) || null;
  }

  recognitionRuntime = createRecognitionRuntime();

  const lineEls = [1, 2, 3].map((number) => ({
    score: $('analysisScore' + number),
    depth: $('analysisDepth' + number),
    pv: $('analysisPv' + number)
  }));

  const bestMoveArrow = window.CaissaScannerBestMoveArrow?.create({
    board: els.board,
    overlay: els.bestMoveArrowOverlay,
    line: els.bestMoveArrowLine,
    fenTools,
    enabled: els.arrowsToggle?.checked !== false
  }) || null;

  const analysis = window.CaissaScannerAnalysis?.create({
    board: els.board,
    fenTools,
    panel: els.analysisPanel,
    status: els.analysisStatus,
    fenOutput: els.analysisFen,
    moveHint: els.analysisMoveHint,
    lineEls,
    arrow: bestMoveArrow,
    onFenChange: (fen) => {
      els.confirmed.textContent = fen;
      els.candidateStatus.textContent = 'Analyzing';
      updateSideToMove(fen);
    },
    onPositionChange: updateSideToMove,
    onHistoryChange: ({ index, length }) => {
      els.first.disabled = index <= 0;
      els.previous.disabled = index <= 0;
      els.next.disabled = index < 0 || index >= length - 1;
      els.last.disabled = index < 0 || index >= length - 1;
    },
    onActiveChange: (active) => {
      els.engineToggle.checked = active;
    }
  }) || null;

  function orientationValue(value) {
    return value ? 'black-bottom' : 'white-bottom';
  }

  function syncOrientationPresentation() {
    els.board.dataset.boardOrientation = orientationValue(flipped);
    els.board.dataset.coordinateContract = 'canonical-square';
    els.board.dataset.coordinatesVisible = String(coordinatesVisible);
    els.board.dataset.orientationCorrectionApplied = String(orientationCorrectionApplied);
    els.board.classList.toggle('coordinates-hidden', !coordinatesVisible);
    [els.coordinatesVisibility, els.editCoordinatesVisibility].forEach((button) => {
      button.setAttribute('aria-pressed', String(coordinatesVisible));
      button.setAttribute('aria-label', coordinatesVisible ? 'Hide coordinates' : 'Show coordinates');
      button.title = coordinatesVisible ? 'Hide coordinates' : 'Show coordinates';
      const icon = button.querySelector('i');
      icon?.classList.toggle('fa-eye', coordinatesVisible);
      icon?.classList.toggle('fa-eye-slash', !coordinatesVisible);
    });
    els.correctOrientation.setAttribute('aria-pressed', String(orientationCorrectionApplied));
  }

  function initializeOrientation(orientation = 'white-at-bottom') {
    flipped = ['black-at-bottom', 'black-bottom'].includes(orientation);
    selectedCanonicalOrientation = flipped ? 'black-bottom' : 'white-bottom';
    coordinatesVisible = true;
    orientationCorrectionApplied = false;
    userOrientationOverride = false;
    orientationResolved = true;
    analysis?.setFlipped(flipped);
    syncOrientationPresentation();
  }

  function renderOrientationReview() {
    const confidence = orientationInference?.orientationConfidence;
    const show = confidence === 'MEDIUM' || confidence === 'LOW_AMBIGUOUS';
    els.orientationReview.hidden = !show;
    if (!show) {
      els.applyEdit.disabled = false;
      return;
    }
    const unresolved = confidence === 'LOW_AMBIGUOUS' && !orientationResolved;
    els.orientationReviewTitle.textContent = 'Check board orientation';
    els.orientationReviewMessage.textContent = unresolved
      ? 'The scan is ambiguous. Choose which side was physically at the bottom before applying.'
      : 'CAISSA has a recommendation, but please verify which side was physically at the bottom.';
    els.orientationReviewScores.textContent = `White ${orientationInference.whiteBottomScore.toFixed(2)} · Black ${orientationInference.blackBottomScore.toFixed(2)} · ${confidence.replace('_', ' / ')}`;
    els.whiteBottom.setAttribute('aria-pressed', String(orientationResolved && selectedCanonicalOrientation === 'white-bottom'));
    els.blackBottom.setAttribute('aria-pressed', String(orientationResolved && selectedCanonicalOrientation === 'black-bottom'));
    els.applyEdit.disabled = unresolved;
  }

  function chooseCanonicalOrientation(orientation, { human = true } = {}) {
    if (!orientationInference?.canonicalFens?.[orientation]) return false;
    const previous = selectedCanonicalOrientation;
    selectedCanonicalOrientation = orientation;
    orientationResolved = true;
    flipped = orientation === 'black-bottom';
    els.fen.value = orientationInference.canonicalFens[orientation];
    if (human) {
      userOrientationOverride = orientation !== orientationInference.recommendedOrientation;
      orientationCorrectionApplied = userOrientationOverride;
    }
    selectedSquare = null;
    structuralAcknowledged = false;
    analysis?.setFlipped(flipped);
    syncOrientationPresentation();
    validateCurrent(false);
    renderPublicStructuralGuardrail(els.fen.value);
    renderOrientationReview();
    if (human) setEditFeedback(`${orientation === 'black-bottom' ? 'Black' : 'White'} at bottom selected. Verify the pieces and side to move.`, 'ok');
    return previous !== orientation;
  }

  window.CaissaScannerPresentationState = Object.freeze({
    snapshot: () => Object.freeze({
      boardOrientation: orientationValue(flipped),
      coordinateContract: 'canonical-square',
      coordinatesVisible,
      orientationCorrectionApplied
    })
  });

  function toast(text) {
    clearTimeout(toastTimer);
    els.toast.textContent = text;
    els.toast.hidden = false;
    toastTimer = setTimeout(() => { els.toast.hidden = true; }, 2600);
  }

  function closeMenus(restoreFocus = false) {
    const trigger = activeMenu?.trigger;
    [
      { menu: els.productMenu, trigger: els.moreBtn },
      { menu: els.productMenu, trigger: els.editMenu },
      { menu: els.analysisMenu, trigger: els.boardActions }
    ].forEach(({ menu, trigger: menuTrigger }) => {
      menu.hidden = true;
      menu.removeAttribute('style');
      menuTrigger.setAttribute('aria-expanded', 'false');
    });
    activeMenu = null;
    if (restoreFocus && trigger) trigger.focus();
  }

  function positionMenu(menu, trigger) {
    const margin = 8;
    const triggerRect = trigger.getBoundingClientRect();
    const menuRect = menu.getBoundingClientRect();
    const rootStyle = getComputedStyle(document.documentElement);
    const inset = (name) => Number.parseFloat(rootStyle.getPropertyValue(name)) || 0;
    const safeLeft = Math.max(margin, inset('--safe-left'));
    const safeRight = Math.max(margin, inset('--safe-right'));
    const safeTop = Math.max(margin, inset('--safe-top'));
    const safeBottom = Math.max(margin, inset('--safe-bottom'));
    const maxLeft = Math.max(safeLeft, window.innerWidth - menuRect.width - safeRight);
    const left = Math.min(maxLeft, Math.max(safeLeft, triggerRect.right - menuRect.width));
    const below = triggerRect.bottom + margin;
    const above = triggerRect.top - menuRect.height - margin;
    const maxTop = Math.max(safeTop, window.innerHeight - menuRect.height - safeBottom);
    const top = below + menuRect.height <= window.innerHeight - safeBottom
      ? below
      : Math.max(safeTop, Math.min(maxTop, above));
    menu.style.left = Math.round(left) + 'px';
    menu.style.top = Math.round(top) + 'px';
  }

  function toggleMenu(menu, trigger) {
    const shouldOpen = menu.hidden || activeMenu?.menu !== menu;
    closeSheets(false);
    if (!shouldOpen) return;
    menu.hidden = false;
    trigger.setAttribute('aria-expanded', 'true');
    activeMenu = { menu, trigger };
    positionMenu(menu, trigger);
    menu.querySelector('[role="menuitem"]')?.focus();
  }

  function principalViews() {
    return {
      [VIEW_STATES.CAPTURE]: els.home,
      [VIEW_STATES.READING]: els.reading,
      [VIEW_STATES.REVIEW_EDIT]: els.reviewEdit,
      [VIEW_STATES.WORKSPACE]: els.workspace
    };
  }

  function syncPrincipalAccessibility() {
    const activeView = viewState.snapshot().view;
    const sheetIsOpen = Boolean(activeSheet);
    els.topbar.inert = sheetIsOpen;
    els.topbar.setAttribute('aria-hidden', String(sheetIsOpen));
    Object.entries(principalViews()).forEach(([name, element]) => {
      const visible = name === activeView;
      element.hidden = !visible;
      element.inert = !visible || sheetIsOpen;
      element.setAttribute('aria-hidden', String(!visible));
    });
  }

  function closeSheets(restoreFocus = false) {
    const trigger = activeSheet?.trigger;
    els.exportSheet.hidden = true;
    els.newScanSheet.hidden = true;
    els.feedbackSheet.hidden = true;
    els.sheetBackdrop.hidden = true;
    activeSheet = null;
    document.body.classList.remove('sheet-open');
    syncPrincipalAccessibility();
    closeMenus();
    if (restoreFocus && trigger?.isConnected) trigger.focus({ preventScroll: true });
  }

  function openSheet(sheet, trigger) {
    closeSheets(false);
    activeSheet = { sheet, trigger };
    sheet.hidden = false;
    els.sheetBackdrop.hidden = false;
    document.body.classList.add('sheet-open');
    syncPrincipalAccessibility();
    requestAnimationFrame(() => sheet.querySelector('button:not([disabled])')?.focus({ preventScroll: true }));
  }

  function setPrincipalView(nextView, { focus = true, reason = 'navigation', reset = false } = {}) {
    closeSheets(false);
    const result = reset ? viewState.reset({ reason }) : viewState.transition(nextView, { reason });
    if (!result) return false;
    if (nextView === VIEW_STATES.REVIEW_EDIT && els.boardShell.parentElement !== els.editBoardSlot) {
      els.editBoardSlot.appendChild(els.boardShell);
    } else if (nextView === VIEW_STATES.WORKSPACE && els.boardShell.parentElement !== els.workspaceBoardSlot) {
      els.workspaceBoardSlot.appendChild(els.boardShell);
    }
    els.app.dataset.scannerView = nextView;
    document.body.classList.toggle('workspace-open', nextView === VIEW_STATES.WORKSPACE || nextView === VIEW_STATES.REVIEW_EDIT);
    syncPrincipalAccessibility();
    const focusTargets = {
      [VIEW_STATES.CAPTURE]: els.homeScan,
      [VIEW_STATES.READING]: els.readingTitle,
      [VIEW_STATES.REVIEW_EDIT]: els.applyEdit,
      [VIEW_STATES.WORKSPACE]: els.editBtn
    };
    const sequence = ++viewFocusSequence;
    requestAnimationFrame(() => {
      window.dispatchEvent(new Event('resize'));
      if (focus && sequence === viewFocusSequence) focusTargets[nextView]?.focus({ preventScroll: true });
    });
    return true;
  }

  function showHome(options = {}) {
    return setPrincipalView(VIEW_STATES.CAPTURE, options);
  }

  function showReading() {
    return setPrincipalView(VIEW_STATES.READING, { reason: 'valid-image-selected' });
  }

  function showReviewEdit(reason) {
    return setPrincipalView(VIEW_STATES.REVIEW_EDIT, { reason });
  }

  function showWorkspace(options = {}) {
    return setPrincipalView(VIEW_STATES.WORKSPACE, options);
  }

  function setValidation(text, type) {
    els.validation.textContent = text;
    els.validation.className = 'validation-box' + (type ? ' ' + type : '');
  }

  function setBoardEmpty(empty) {
    els.board.classList.toggle('is-empty', empty);
    els.boardEmpty.hidden = !empty;
  }

  function updateSideToMove(fen) {
    const result = fenTools.validateDraft(fen || '');
    if (!result.ok) return;
    const black = result.fen.split(' ')[1] === 'b';
    els.sidePiece.classList.toggle('white', !black);
    els.sidePiece.classList.toggle('black', black);
    els.sideIcon.src = black ? fenTools.pieceSrc('k') : fenTools.pieceSrc('K');
    els.sideText.textContent = black ? 'Black to move' : 'White to move';
  }

  function isEditing() {
    return viewState.snapshot().view === VIEW_STATES.REVIEW_EDIT;
  }

  function setEditFeedback(text, type = '') {
    els.editValidation.textContent = text;
    els.editValidation.className = 'edit-validation' + (type ? ' ' + type : '');
  }

  function renderPublicStructuralGuardrail(fen) {
    if (!publicClient || !fen) {
      els.structuralWarning.hidden = true;
      return { status: 'NORMAL', warnings: [] };
    }
    const result = publicClient.analyzeStructuralPosition(fen);
    els.structuralWarning.dataset.status = result.status;
    if (result.status === 'NORMAL') {
      els.structuralWarning.hidden = true;
      els.structuralAcknowledgeRow.hidden = true;
      els.structuralAcknowledge.checked = false;
      structuralAcknowledged = false;
      return result;
    }
    const required = result.status === 'REVIEW_REQUIRED';
    els.structuralWarning.hidden = false;
    els.structuralTitle.textContent = required ? 'Review required' : 'Review recommended';
    els.structuralMessage.textContent = result.warnings.map(item => item.message || item.code).join(' ')
      || 'This position has unusual material. Check it carefully before continuing.';
    els.structuralAcknowledgeRow.hidden = !required;
    els.structuralAcknowledge.checked = required && structuralAcknowledged;
    return result;
  }

  function syncEditFields(fen) {
    const result = fenTools.validateDraft(fen);
    if (!result.ok) return;
    const [, turn, castling] = result.fen.split(' ');
    els.editWhiteTurn.setAttribute('aria-pressed', String(turn === 'w'));
    els.editBlackTurn.setAttribute('aria-pressed', String(turn === 'b'));
    els.castlingInputs.forEach((input) => { input.checked = castling.includes(input.dataset.castling); });
  }

  function selectEditTool(tool) {
    activeEditTool = tool;
    const buttons = [...els.blackPalette.querySelectorAll('[data-piece]'), ...els.whitePalette.querySelectorAll('[data-piece]'), els.clearSquare];
    buttons.forEach((button) => {
      const value = button.dataset.tool === 'clear' ? 'clear' : button.dataset.piece;
      button.setAttribute('aria-pressed', String(value === tool));
    });
    const label = tool === 'clear' ? 'Clear Square' : PIECE_NAMES[tool];
    els.editToolStatus.classList.toggle('is-active', Boolean(label));
    els.editToolStatus.querySelector('span').textContent = label ? 'Selected: ' + label : 'Select a piece or Clear Square';
    if (label) setEditFeedback(label + ' is ready. Tap one or more squares.');
  }

  function chooseSquare(row, col) {
    if (!isEditing()) return;
    if (!activeEditTool) {
      setEditFeedback('Select a piece or Clear Square before tapping the board.', 'error');
      return;
    }
    const piece = activeEditTool === 'clear' ? '' : activeEditTool;
    const nextFen = fenTools.mutateSquare(els.fen.value, row, col, piece);
    if (!nextFen) return;
    els.fen.value = nextFen;
    selectedSquare = { row, col };
    structuralAcknowledged = false;
    const action = activeEditTool === 'clear' ? 'Cleared ' : 'Placed ' + PIECE_NAMES[activeEditTool] + ' on ';
    validateCurrent(false);
    const result = fenTools.validate(nextFen);
    renderPublicStructuralGuardrail(nextFen);
    setEditFeedback(action + fenTools.squareName(row, col) + (result.ok ? '. Ready to apply.' : '. ' + result.error), result.ok ? 'ok' : 'error');
  }

  function validateCurrent(updateMessage = true) {
    const result = fenTools.validate(els.fen.value);
    if (isEditing()) {
      const draft = fenTools.validateDraft(els.fen.value);
      if (draft.ok) {
        setBoardEmpty(false);
        fenTools.renderDraft(els.board, draft.fen, flipped, chooseSquare, selectedSquare);
        updateSideToMove(draft.fen);
        syncEditFields(draft.fen);
      }
      if (updateMessage) setEditFeedback(result.ok ? 'Position is valid and ready to apply.' : result.error, result.ok ? 'ok' : 'error');
      return result;
    }
    els.confirm.disabled = !result.ok || state.snapshot().state !== state.STATES.REVIEW;
    if (result.ok) {
      setBoardEmpty(false);
      const click = els.editSheet.hidden ? null : chooseSquare;
      fenTools.render(els.board, result.fen, flipped, click, selectedSquare);
      updateSideToMove(result.fen);
      if (updateMessage) setValidation('Position is valid.', 'ok');
    } else if (updateMessage) setValidation(result.error, 'error');
    return result;
  }

  function currentFen() {
    if (isEditing()) {
      const editing = fenTools.validate(els.fen.value);
      return editing.ok ? editing.fen : '';
    }
    const snapshot = state.snapshot();
    if (snapshot.state === state.STATES.CONFIRMED) {
      const analysisFen = analysis?.currentFen();
      if (analysisFen) return analysisFen;
      if (snapshot.confirmed?.fen) return snapshot.confirmed.fen;
    }
    const result = fenTools.validate(els.fen.value);
    return result.ok ? result.fen : '';
  }

  function openNewScan(trigger = document.activeElement) {
    clearFeedbackHandoff();
    openSheet(els.newScanSheet, trigger);
  }

  function openPicker(input) {
    closeSheets(false);
    input.value = '';
    input.click();
  }

  function feedbackHandoff() {
    return window.CaissaScannerFeedbackAuthHandoff;
  }

  function clearFeedbackHandoff() {
    feedbackHandoff()?.clear(sessionStorage);
    pendingFeedbackOwnerUserId = null;
    feedbackNeedsReauthentication = false;
    feedbackIdentityConflict = false;
    restoredFeedbackDraft = false;
    els.feedbackImageInput.value = '';
    els.feedbackImageReselect.hidden = true;
  }

  function feedbackDraft() {
    const snapshot = publicRecognition?.snapshot;
    const reviewedFen = currentFen() || els.fen.value;
    if (!snapshot || !reviewedFen || !pendingFeedbackType) return null;
    return feedbackHandoff()?.createDraft({
      reviewedFen,
      feedbackType: pendingFeedbackType,
      continueToAnalysis: pendingConsentContinuation,
      shareResults: els.shareCorrection.checked,
      shareImage: els.shareImage.checked,
      captureType: selectedCaptureType,
      snapshot,
      orientationInference,
      orientationCorrectionApplied,
      userOrientationOverride,
      selectedCanonicalOrientation,
      ownerUserId: window.CAISSA_AUTH?.userId || pendingFeedbackOwnerUserId
    }) || null;
  }

  function saveFeedbackHandoff() {
    try {
      const draft = feedbackDraft();
      return Boolean(draft && feedbackHandoff()?.save(sessionStorage, draft));
    } catch (_) {
      return false;
    }
  }

  function stripFeedbackReturnMarker() {
    const url = new URL(window.location.href);
    if (!url.searchParams.has('feedback_return')) return;
    url.searchParams.delete('feedback_return');
    window.history.replaceState(null, '', url.pathname + url.search + url.hash);
  }

  function updateFeedbackEligibility() {
    const shareResults = els.shareCorrection.checked;
    const shareImage = els.shareImage.checked;
    const wantsContribution = shareResults || shareImage;
    const missingReselectedImage = shareImage && !selectedSourceFile;
    els.feedbackImageReselect.hidden = !missingReselectedImage || !restoredFeedbackDraft;
    els.sourceImageRights.disabled = !shareImage || missingReselectedImage;
    els.sourceImageRightsRow.hidden = !shareImage;
    if (!shareImage || missingReselectedImage) els.sourceImageRights.checked = false;
    const auth = window.CAISSA_AUTH;
    const needsSignIn = wantsContribution && (feedbackNeedsReauthentication || auth?.isSignedIn !== true);
    els.submitFeedback.textContent = needsSignIn
      ? 'Sign in to share feedback'
      : wantsContribution ? (feedbackRetryAvailable ? 'Retry sharing' : 'Confirm and share feedback') : 'Continue';
    els.submitFeedback.disabled = feedbackSubmissionPending || feedbackIdentityConflict
      || (shareImage && (missingReselectedImage || !els.sourceImageRights.checked));
  }

  function beginFeedbackSignIn() {
    if (!saveFeedbackHandoff()) {
      els.feedbackStatus.textContent = 'Your reviewed position could not be prepared for sign-in. You can retry or continue without sharing.';
      return false;
    }
    feedbackNeedsReauthentication = true;
    updateFeedbackEligibility();
    const destination = feedbackHandoff()?.returnPath(window.CAISSA_REDIRECTS) || '/scanner';
    const auth = window.CAISSA_AUTH;
    if (typeof auth?.redirectToSignIn === 'function') auth.redirectToSignIn(destination);
    else window.location.assign(feedbackHandoff()?.signInPath(window.CAISSA_REDIRECTS)
      || '/signin?redirect_url=%2Fscanner');
    return true;
  }

  function restoreFeedbackHandoff() {
    const handoff = feedbackHandoff();
    const draft = handoff?.load(sessionStorage);
    stripFeedbackReturnMarker();
    if (!draft) return false;
    const validated = fenTools.validate(draft.reviewedFen);
    if (!validated.ok || !draft.snapshot?.scanId || !draft.snapshot?.imageHash) {
      handoff.clear(sessionStorage);
      return false;
    }
    const auth = window.CAISSA_AUTH;
    if (draft.ownerUserId && auth?.isSignedIn && auth.userId !== draft.ownerUserId) {
      handoff.clear(sessionStorage);
      toast('The saved feedback draft belongs to a different signed-in account and was discarded.');
      return false;
    }

    publicRecognition = Object.freeze({ snapshot: draft.snapshot });
    orientationInference = draft.orientationInference;
    orientationCorrectionApplied = draft.orientationCorrectionApplied;
    userOrientationOverride = draft.userOrientationOverride;
    selectedCanonicalOrientation = draft.selectedCanonicalOrientation;
    flipped = selectedCanonicalOrientation === 'black-bottom';
    selectedCaptureType = draft.captureType;
    selectedSourceFile = null;
    pendingFeedbackOwnerUserId = auth?.isSignedIn ? auth.userId : draft.ownerUserId;
    feedbackNeedsReauthentication = auth?.isSignedIn !== true;
    restoredFeedbackDraft = true;

    const started = state.beginSource();
    state.setCandidate(started.generation, { fen: validated.fen, source: 'feedback-auth-handoff' });
    state.confirm(validated.fen);
    els.fen.value = validated.fen;
    els.confirmed.textContent = validated.fen;
    els.workspaceTitle.textContent = 'Position ready';
    els.candidateStatus.textContent = 'Confirmed';
    els.confirmBar.hidden = true;
    els.recognitionSummary.hidden = true;
    els.handoff.hidden = draft.continueToAnalysis;
    analysis?.setFlipped(flipped);
    analysis?.setPosition(validated.fen);
    syncOrientationPresentation();
    showReading();
    showWorkspace({ reason: 'feedback-auth-return' });
    fenTools.render(els.board, validated.fen, flipped);
    updateSideToMove(validated.fen);
    openFeedback(draft.feedbackType, els.editBtn, { continueToAnalysis: draft.continueToAnalysis });
    restoredFeedbackDraft = true;
    pendingFeedbackOwnerUserId = auth?.isSignedIn ? auth.userId : draft.ownerUserId;
    feedbackNeedsReauthentication = auth?.isSignedIn !== true;
    els.shareCorrection.checked = draft.shareResults;
    els.shareImage.checked = draft.shareImage;
    els.sourceImageRights.checked = false;
    els.feedbackStatus.textContent = draft.shareImage
      ? 'Your position and choices were restored. Reselect the original photo, review the choices, and confirm again.'
      : auth?.isSignedIn
        ? 'Your position and choices were restored. Review them and confirm again before anything is submitted.'
        : 'Sign-in was not completed. Retry, or choose Not now to continue without sharing.';
    updateFeedbackEligibility();
    return true;
  }

  function completeConsentStep(message = '') {
    if (pendingConsentContinuation) {
      pendingConsentContinuation = false;
      els.handoff.hidden = false;
      requestAnimationFrame(() => els.analyze.focus({ preventScroll: true }));
    }
    if (message) toast(message);
  }

  function declineOptionalContribution() {
    const continueToAnalysis = pendingConsentContinuation;
    closeSheets(false);
    pendingFeedbackType = null;
    clearFeedbackHandoff();
    if (continueToAnalysis) completeConsentStep('Position ready. Optional sharing was declined.');
  }

  function dismissActiveSheet() {
    if (activeSheet?.sheet === els.feedbackSheet) declineOptionalContribution();
    else closeSheets(true);
  }

  function openFeedback(type = 'AUTO', trigger = document.activeElement, { continueToAnalysis = false } = {}) {
    if (type === 'SCAN_FAILURE' ? !publicFailureContext : !publicRecognition?.snapshot) {
      toast('There is no scan available to share.');
      return;
    }
    pendingFeedbackType = type;
    pendingConsentContinuation = continueToAnalysis;
    els.shareCorrection.checked = false;
    els.shareImage.checked = false;
    els.sourceImageRights.checked = false;
    els.sourceImageRights.disabled = true;
    els.sourceImageRightsRow.hidden = true;
    els.submitFeedback.disabled = false;
    els.submitFeedback.textContent = 'Continue';
    els.cancelFeedback.textContent = 'Not now';
    feedbackSubmissionPending = false;
    feedbackRetryAvailable = false;
    els.feedbackImageReselect.hidden = true;
    els.feedbackStatus.textContent = '';
    els.feedbackDescription.textContent = type === 'LOCALIZATION_FAILURE'
      ? 'Tell CAISSA the board was detected incorrectly. This routes only to localization review.'
      : type === 'SCAN_FAILURE'
        ? 'Share this failed attempt for private owner review. The image remains optional.'
        : 'Did we recognize your chess position correctly? You can optionally share the recognition results and any corrections to help us improve future scans. Sharing your original photo is a separate choice.';
    openSheet(els.feedbackSheet, trigger);
    updateFeedbackEligibility();
  }

  async function sendPublicFeedback() {
    if (!pendingFeedbackType || feedbackSubmissionPending) return;
    const shareResults = els.shareCorrection.checked;
    const shareImage = els.shareImage.checked;
    if (!shareResults && !shareImage) {
      declineOptionalContribution();
      return;
    }
    const auth = window.CAISSA_AUTH;
    if (feedbackIdentityConflict) {
      els.feedbackStatus.textContent = 'This feedback draft belongs to a different account. Choose Not now and start a new scan.';
      return;
    }
    if (feedbackNeedsReauthentication || auth?.isSignedIn !== true) {
      beginFeedbackSignIn();
      return;
    }
    if (pendingFeedbackOwnerUserId && pendingFeedbackOwnerUserId !== auth.userId) {
      clearFeedbackHandoff();
      els.feedbackStatus.textContent = 'This feedback draft belongs to a different account. Start a new scan to share feedback.';
      els.submitFeedback.disabled = true;
      return;
    }
    pendingFeedbackOwnerUserId ||= auth.userId;
    if (shareImage && !selectedSourceFile) {
      els.feedbackStatus.textContent = 'Reselect the original photo before confirming photo sharing.';
      els.feedbackImageReselect.hidden = false;
      els.feedbackImageReselect.focus();
      return;
    }
    if (shareImage && !els.sourceImageRights.checked) {
      els.feedbackStatus.textContent = 'Confirm that you have the right to share this image, or turn off photo sharing.';
      els.sourceImageRights.focus();
      return;
    }
    feedbackSubmissionPending = true;
    feedbackRetryAvailable = false;
    els.submitFeedback.disabled = true;
    els.cancelFeedback.textContent = 'Not now';
    els.feedbackStatus.textContent = 'Saving your choices securely…';
    try {
      const client = await loadPublicClient();
      if (!shareResults && shareImage) {
        await client.submitOriginalPhotoContribution({
          snapshot: publicRecognition?.snapshot || null,
          context: publicFailureContext,
          file: selectedSourceFile,
          sourceImageRightsConfirmed: true
        });
      } else if (pendingFeedbackType === 'SCAN_FAILURE') {
        await client.submitPublicFailure({
          context: publicFailureContext,
          error: publicFailureError,
          file: selectedSourceFile,
          shareCorrectionForImprovement: true,
          shareImageForImprovement: shareImage,
          sourceImageRightsConfirmed: els.sourceImageRights.checked
        });
      } else {
        const correctedFen = currentFen() || els.fen.value;
        const predictedPlacement = (orientationInference?.canonicalFens?.[orientationInference?.recommendedOrientation]
          || publicRecognition.snapshot.predictedFEN).split(/\s+/)[0];
        const correctedPlacement = correctedFen.split(/\s+/)[0];
        const feedbackType = pendingFeedbackType === 'LOCALIZATION_FAILURE'
          ? 'LOCALIZATION_FAILURE'
          : predictedPlacement === correctedPlacement ? 'CONFIRMED_CORRECT' : 'PIECE_CORRECTION';
        await client.submitPublicFeedback({
          snapshot: publicRecognition.snapshot,
          correctedFEN: correctedFen,
          feedbackType,
          captureType: selectedCaptureType,
          file: selectedSourceFile,
          orientationCorrectionApplied,
          orientationInference,
          userOrientationOverride,
          finalCanonicalOrientation: selectedCanonicalOrientation,
          shareCorrectionForImprovement: true,
          shareImageForImprovement: shareImage,
          sourceImageRightsConfirmed: els.sourceImageRights.checked
        });
      }
      const returnsHome = pendingFeedbackType !== 'AUTO';
      const successMessage = shareResults
        ? 'Results saved securely as raw-unverified. Returning to your board…'
        : 'Photo saved privately. Returning to your board…';
      els.feedbackStatus.textContent = successMessage;
      els.cancelFeedback.disabled = true;
      await new Promise((resolve) => setTimeout(resolve, 650));
      closeSheets(false);
      els.cancelFeedback.disabled = false;
      if (returnsHome) resetAll(true);
      if (!returnsHome) completeConsentStep(shareResults
        ? 'Results saved as raw-unverified for owner review.'
        : 'Photo saved privately for authorized review.');
      else toast(shareResults
        ? 'Feedback saved as raw-unverified for owner review.'
        : 'Photo saved privately for authorized review.');
      pendingFeedbackType = null;
      clearFeedbackHandoff();
      feedbackSubmissionPending = false;
      feedbackRetryAvailable = false;
    } catch (error) {
      feedbackSubmissionPending = false;
      feedbackRetryAvailable = true;
      els.feedbackStatus.textContent = (await loadPublicClient()).publicErrorMessage(error);
      if (error?.code === 'AUTH_REQUIRED') {
        feedbackNeedsReauthentication = true;
        saveFeedbackHandoff();
        els.feedbackStatus.textContent = 'Your session expired. Sign in again to retry, or choose Not now to continue without sharing.';
      }
      els.cancelFeedback.textContent = 'Continue without sharing';
      updateFeedbackEligibility();
    }
  }

  function routeRecognitionResult() {
    // Phase 3 replaces this deterministic decision with confidence and warning policy.
    openEdit(EDIT_ENTRY.RECOGNITION_REVIEW);
  }

  function releaseSourcePreview() {
    if (objectUrl) {
      URL.revokeObjectURL(objectUrl);
      objectUrl = null;
    }
    els.preview.removeAttribute('src');
    els.previewWrap.hidden = true;
  }

  function preserveReadingDuration(startedAt) {
    const remaining = Math.max(0, MIN_READING_DURATION_MS - (performance.now() - startedAt));
    return remaining > 0 ? new Promise((resolve) => setTimeout(resolve, remaining)) : Promise.resolve();
  }

  async function selectFile(file, source = 'gallery') {
    if (!file || (file.type && !file.type.startsWith('image/'))) {
      if (file) toast('Choose a supported image file.');
      return;
    }
    let client;
    let selected;
    try {
      client = await loadPublicClient();
      selected = client.resolvePublicImage(file);
    } catch (error) {
      toast(publicClient?.publicErrorMessage(error) || 'Choose a JPEG, PNG, or WebP image.');
      return;
    }
    if (!recognitionRuntime?.supportsMimeType(selected.sourceImageType)) {
      toast('Choose a JPEG, PNG, or WebP image.');
      return;
    }
    closeSheets(false);
    analysis?.clear();
    initializeOrientation('white-at-bottom');
    els.engineToggle.checked = false;
    publicRecognitionController?.abort();
    publicRecognitionController = new AbortController();
    const snapshot = state.beginSource();
    selectedSourceFile = file;
    selectedCaptureType = source;
    publicRecognition = null;
    publicFailureContext = null;
    publicFailureError = null;
    els.reportFailure.hidden = true;
    els.publicServiceStatus.textContent = '';
    releaseSourcePreview();
    objectUrl = URL.createObjectURL(file);
    els.preview.src = objectUrl;
    els.previewWrap.hidden = false;
    els.sourceStatus.textContent = 'Image selected';
    els.candidateStatus.textContent = 'Preparing';
    els.workspaceTitle.textContent = 'Reading position';
    els.fen.value = '';
    els.confirm.disabled = true;
    els.handoff.hidden = true;
    els.confirmBar.hidden = true;
    els.recognitionSummary.hidden = true;
    selectedSquare = null;
    showReading();
    const readingStartedAt = performance.now();
    state.beginRecognition(snapshot.generation);
    setBoardEmpty(true);
    const expectedGeneration = snapshot.generation;
    try {
      const prepared = await recognitionRuntime.processImage(selected.blob, expectedGeneration);
      const recognized = await client.recognizePublicPosition({
        file,
        prepared,
        captureType: source,
        orientation: 'white-at-bottom',
        signal: publicRecognitionController.signal
      });
      await preserveReadingDuration(readingStartedAt);
      if (state.snapshot().generation !== expectedGeneration) return;
      publicRecognition = recognized;
      orientationInference = recognized.orientationInference;
      orientationResolved = orientationInference.orientationConfidence !== 'LOW_AMBIGUOUS';
      selectedCanonicalOrientation = orientationResolved ? orientationInference.recommendedOrientation : null;
      const initialOrientation = selectedCanonicalOrientation || 'white-bottom';
      const canonicalFen = orientationInference.canonicalFens[initialOrientation];
      const confidences = recognized.snapshot.squarePredictions.map(item => item.confidence);
      const confidenceBySquare = Object.fromEntries(recognized.snapshot.squarePredictions.map(item => [item.square, item.confidence]));
      const accepted = state.setCandidate(expectedGeneration, {
        fen: canonicalFen,
        boardConfidence: confidences.reduce((sum, value) => sum + value, 0) / confidences.length,
        pieceConfidenceBySquare: confidenceBySquare,
        lowConfidenceSquares: recognized.snapshot.squarePredictions.filter(item => item.confidence < 0.8).map(item => item.square),
        orientation: initialOrientation === 'black-bottom' ? 'black-at-bottom' : 'white-at-bottom',
        orientationInference: {
          version: orientationInference.orientationInferenceVersion,
          confidence: orientationInference.orientationConfidence,
          whiteBottomScore: orientationInference.whiteBottomScore,
          blackBottomScore: orientationInference.blackBottomScore,
          recommendedOrientation: orientationInference.recommendedOrientation
        },
        recognitionStage: 'production-v05',
        pieceRecognition: recognized.snapshot.modelVersion,
        localization: prepared.board ? {
          status: prepared.status,
          corners: prepared.board.corners,
          boardSize: prepared.board.boardSize,
          candidateScore: prepared.board.candidateScore,
          geometryScore: prepared.board.geometryScore,
          gridEvidenceScore: prepared.board.gridEvidenceScore,
          transformMetadata: prepared.board.transformMetadata
        } : null,
        preprocessing: prepared.metadata,
        timingsMs: prepared.timing
      });
      if (!accepted) return;
      flipped = initialOrientation === 'black-bottom';
      coordinatesVisible = true;
      orientationCorrectionApplied = false;
      userOrientationOverride = false;
      analysis?.setFlipped(flipped);
      syncOrientationPresentation();
      releaseSourcePreview();
      els.fen.value = canonicalFen;
      els.candidateStatus.textContent = orientationInference.orientationConfidence === 'HIGH'
        && initialOrientation === 'black-bottom' ? 'Black side detected' : 'Ready to review';
      els.workspaceTitle.textContent = 'Review position';
      routeRecognitionResult();
    } catch (error) {
      if (error?.name === 'AbortError' || error?.code === 'canceled' || error?.code === 'stale-generation') return;
      if (state.snapshot().generation !== expectedGeneration) return;
      state.fail(expectedGeneration, error?.code || 'worker-processing-failed');
      let failureContext = error.publicFailureContext || null;
      if (!failureContext) {
        try { failureContext = await client.createPublicFailureContext(file, source); }
        catch (_) { /* Unreadable files cannot form a governed failure record. */ }
      }
      resetAll(true);
      selectedSourceFile = file;
      selectedCaptureType = source;
      publicFailureContext = failureContext;
      publicFailureError = error;
      els.reportFailure.hidden = !failureContext;
      const message = client.publicErrorMessage(error);
      els.publicServiceStatus.textContent = message;
      toast(message);
    }
  }

  function resetAll(goHome = true) {
    analysis?.clear();
    recognitionRuntime?.cancelActive('scanner-reset');
    publicRecognitionController?.abort();
    publicRecognitionController = null;
    state.reset();
    releaseSourcePreview();
    els.camera.value = '';
    els.gallery.value = '';
    els.fen.value = '';
    els.confidence.textContent = '—';
    els.candidateStatus.textContent = 'Waiting';
    els.sourceStatus.textContent = 'No image';
    els.reviewStatus.textContent = 'Required';
    els.confirm.disabled = true;
    els.handoff.hidden = true;
    els.confirmBar.hidden = true;
    els.recognitionSummary.hidden = true;
    els.analysisPanel.hidden = true;
    els.engineToggle.checked = false;
    selectedSquare = null;
    initializeOrientation('white-at-bottom');
    editWasConfirmed = false;
    editResumeAnalysis = false;
    editOriginalFen = '';
    editOriginalFlipped = false;
    editOriginalOrientationCorrectionApplied = false;
    editEntryMode = null;
    activeEditTool = null;
    publicRecognition = null;
    orientationInference = null;
    selectedCanonicalOrientation = 'white-bottom';
    userOrientationOverride = false;
    orientationResolved = true;
    publicFailureContext = null;
    publicFailureError = null;
    selectedSourceFile = null;
    selectedCaptureType = null;
    pendingFeedbackType = null;
    pendingConsentContinuation = false;
    pendingFeedbackOwnerUserId = null;
    feedbackNeedsReauthentication = false;
    feedbackIdentityConflict = false;
    restoredFeedbackDraft = false;
    structuralAcknowledged = false;
    els.reportFailure.hidden = true;
    els.publicServiceStatus.textContent = '';
    els.structuralWarning.hidden = true;
    els.orientationReview.hidden = true;
    els.structuralAcknowledge.checked = false;
    els.editSheet.hidden = true;
    els.editFooter.hidden = true;
    els.feedbackImageInput.value = '';
    els.feedbackImageReselect.hidden = true;
    els.reviewEdit.classList.remove('edit-mode');
    closeSheets(false);
    fenTools.renderEmpty(els.board);
    setBoardEmpty(true);
    setValidation('Choose an image to begin.');
    els.workspaceTitle.textContent = 'Review position';
    if (goHome) showHome({ reset: true, reason: 'scanner-reset' });
  }

  function confirm() {
    analysis?.clear();
    const result = validateCurrent();
    if (!result.ok) {
      toast(result.error);
      return;
    }
    const confirmed = state.confirm(result.fen);
    if (!confirmed) return;
    selectedSquare = null;
    els.confirmed.textContent = confirmed.fen;
    const requiresConsentStep = Boolean(publicRecognition?.snapshot);
    els.handoff.hidden = requiresConsentStep;
    els.confirmBar.hidden = true;
    els.recognitionSummary.hidden = true;
    els.workspaceTitle.textContent = 'Position ready';
    els.candidateStatus.textContent = 'Confirmed';
    analysis?.setFlipped(flipped);
    analysis?.setPosition(result.fen);
    showWorkspace({ reason: 'position-confirmed' });
    fenTools.render(els.board, result.fen, flipped);
    if (requiresConsentStep) openFeedback('AUTO', els.confirm, { continueToAnalysis: true });
    else toast('Position confirmed.');
  }

  async function startAnalysis(fen, silent = false) {
    if (!analysis || !fen) return false;
    els.analyze.disabled = true;
    els.analyze.innerHTML = '<i class="fas fa-spinner fa-spin"></i><span>Starting</span>';
    els.engineToggle.checked = true;
    try {
      const started = await analysis.start(fen);
      if (!started) {
        els.analyze.disabled = false;
        els.analyze.innerHTML = '<i class="fas fa-chart-line"></i><span>Analyze</span>';
        return false;
      }
      analysis.setFlipped(flipped);
      els.workspaceTitle.textContent = 'Analyze position';
      els.candidateStatus.textContent = 'Stockfish 18';
      els.analyze.disabled = false;
      els.analyze.innerHTML = '<i class="fas fa-chart-line"></i><span>Analyze</span>';
      if (!silent) toast('Stockfish 18 is analyzing with 3 lines.');
      return true;
    } catch (error) {
      analysis.stop();
      els.analysisPanel.hidden = false;
      els.analysisStatus.textContent = 'Unavailable';
      els.analysisStatus.className = 'analysis-status error';
      els.analysisMoveHint.textContent = error?.message || 'Could not start Stockfish 18.';
      els.analyze.disabled = false;
      els.analyze.innerHTML = '<i class="fas fa-rotate-right"></i><span>Retry</span>';
      els.engineToggle.checked = false;
      return false;
    }
  }

  function stopAnalysis() {
    analysis?.stop();
    els.analysisPanel.hidden = true;
    els.engineToggle.checked = false;
    els.workspaceTitle.textContent = 'Position ready';
    els.candidateStatus.textContent = 'Confirmed';
  }

  function openEdit(entryMode = EDIT_ENTRY.MANUAL_EDIT) {
    const fen = currentFen();
    if (!fen) {
      toast('Scan or load a position first.');
      return;
    }
    const snapshot = state.snapshot();
    const recognitionReview = entryMode === EDIT_ENTRY.RECOGNITION_REVIEW;
    if (recognitionReview && snapshot.state !== state.STATES.REVIEW) return;
    if (!recognitionReview && snapshot.state !== state.STATES.CONFIRMED) {
      toast('There is no editable position yet.');
      return;
    }
    editEntryMode = entryMode;
    editWasConfirmed = !recognitionReview;
    editResumeAnalysis = editWasConfirmed && Boolean(analysis?.isActive());
    editOriginalFen = fen;
    editOriginalFlipped = flipped;
    editOriginalOrientationCorrectionApplied = orientationCorrectionApplied;
    editOriginalCanonicalOrientation = selectedCanonicalOrientation;
    editOriginalUserOrientationOverride = userOrientationOverride;
    if (editWasConfirmed) {
      analysis?.stop();
      els.analysisPanel.hidden = true;
      els.engineToggle.checked = false;
      els.fen.value = fen;
      els.confirmBar.hidden = true;
      els.recognitionSummary.hidden = true;
      els.handoff.hidden = false;
    } else {
      els.fen.value = fen;
      els.handoff.hidden = true;
    }
    closeSheets(false);
    els.editSheet.hidden = false;
    els.editFooter.hidden = false;
    els.reviewEdit.classList.add('edit-mode');
    showReviewEdit(entryMode);
    selectedSquare = null;
    selectEditTool(null);
    syncEditFields(fen);
    validateCurrent(false);
    structuralAcknowledged = false;
    renderPublicStructuralGuardrail(fen);
    renderOrientationReview();
    setEditFeedback('Select a piece or Clear Square, then tap the board.');
    els.workspaceTitle.textContent = 'Edit position';
    els.candidateStatus.textContent = 'Editing';
  }

  function leaveEditMode() {
    els.editSheet.hidden = true;
    els.editFooter.hidden = true;
    els.editCastlingPanel.hidden = true;
    els.editCastling.setAttribute('aria-expanded', 'false');
    els.reviewEdit.classList.remove('edit-mode');
    selectedSquare = null;
    selectEditTool(null);
  }

  function clearEditContext() {
    editWasConfirmed = false;
    editResumeAnalysis = false;
    editOriginalFen = '';
    editOriginalFlipped = false;
    editOriginalOrientationCorrectionApplied = false;
    editOriginalCanonicalOrientation = 'white-bottom';
    editOriginalUserOrientationOverride = false;
    editEntryMode = null;
  }

  async function closeEdit(apply) {
    const recognitionReview = editEntryMode === EDIT_ENTRY.RECOGNITION_REVIEW;
    if (apply) {
      const result = validateCurrent();
      if (!orientationResolved) {
        toast('Choose White at bottom or Black at bottom before applying.');
        return;
      }
      if (!result.ok) {
        toast(result.error);
        return;
      }
      const structural = renderPublicStructuralGuardrail(result.fen);
      if (structural.status === 'REVIEW_REQUIRED' && !structuralAcknowledged) {
        toast('Review and acknowledge the structural warning before continuing.');
        return;
      }
      state.revise(result.fen);
      const confirmed = state.confirm(result.fen);
      if (!confirmed) return;
      els.confirmed.textContent = confirmed.fen;
      const requiresConsentStep = recognitionReview && Boolean(publicRecognition?.snapshot);
      els.handoff.hidden = requiresConsentStep;
      els.confirmBar.hidden = true;
      els.recognitionSummary.hidden = true;
      analysis?.setFlipped(flipped);
      analysis?.setPosition(result.fen);
      leaveEditMode();
      showWorkspace({ reason: recognitionReview ? 'recognition-approved' : 'manual-edit-applied' });
      fenTools.render(els.board, result.fen, flipped);
      els.workspaceTitle.textContent = editResumeAnalysis ? 'Analyze position' : 'Position ready';
      els.candidateStatus.textContent = editResumeAnalysis ? 'Stockfish 18' : 'Confirmed';
      if (editResumeAnalysis) await startAnalysis(result.fen, true);
      if (requiresConsentStep) openFeedback('AUTO', els.applyEdit, { continueToAnalysis: true });
      else toast(recognitionReview ? 'Position ready.' : 'Position updated.');
    } else {
      if (recognitionReview) {
        leaveEditMode();
        clearEditContext();
        resetAll(true);
        return;
      }
      flipped = editOriginalFlipped;
      orientationCorrectionApplied = editOriginalOrientationCorrectionApplied;
      selectedCanonicalOrientation = editOriginalCanonicalOrientation;
      userOrientationOverride = editOriginalUserOrientationOverride;
      orientationResolved = true;
      syncOrientationPresentation();
      if (editOriginalFen) {
        els.fen.value = editOriginalFen;
        els.confirmed.textContent = editOriginalFen;
        els.handoff.hidden = false;
        els.confirmBar.hidden = true;
        els.recognitionSummary.hidden = true;
        analysis?.setFlipped(flipped);
        analysis?.setPosition(editOriginalFen);
        leaveEditMode();
        showWorkspace({ reason: 'manual-edit-cancelled' });
        fenTools.render(els.board, editOriginalFen, flipped);
        els.workspaceTitle.textContent = editResumeAnalysis ? 'Analyze position' : 'Position ready';
        els.candidateStatus.textContent = editResumeAnalysis ? 'Stockfish 18' : 'Confirmed';
        if (editResumeAnalysis) await startAnalysis(editOriginalFen, true);
      }
    }
    clearEditContext();
  }

  function setEditTurn(side) {
    const nextFen = fenTools.setSideToMove(els.fen.value, side);
    if (!nextFen) return;
    els.fen.value = nextFen;
    selectedSquare = null;
    validateCurrent();
  }

  function updateCastling() {
    const rights = els.castlingInputs.filter((input) => input.checked).map((input) => input.dataset.castling).join('');
    const nextFen = fenTools.setCastling(els.fen.value, rights);
    if (!nextFen) return;
    els.fen.value = nextFen;
    validateCurrent();
  }

  function clearEditingBoard() {
    const nextFen = fenTools.clearBoard(els.fen.value);
    if (!nextFen) return;
    els.fen.value = nextFen;
    selectedSquare = null;
    validateCurrent(false);
    setEditFeedback('Board cleared. Add exactly one white king and one black king before applying.', 'error');
  }

  function openExport(trigger = document.activeElement) {
    const fen = currentFen();
    if (!fen) {
      toast('Scan or load a position first.');
      return;
    }
    openSheet(els.exportSheet, trigger);
  }

  function loadImage(src) {
    return new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = reject;
      image.src = src;
    });
  }

  async function exportDiagram() {
    const fen = currentFen();
    const result = fenTools.validate(fen);
    if (!result.ok) {
      toast('No valid position to export.');
      return;
    }
    closeSheets(false);
    const size = 1200;
    const margin = 60;
    const boardSize = 1080;
    const squareSize = boardSize / 8;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const context = canvas.getContext('2d');
    context.fillStyle = '#071521';
    context.fillRect(0, 0, size, size);
    for (let displayRow = 0; displayRow < 8; displayRow += 1) {
      for (let displayCol = 0; displayCol < 8; displayCol += 1) {
        const row = flipped ? 7 - displayRow : displayRow;
        const col = flipped ? 7 - displayCol : displayCol;
        context.fillStyle = ((row + col) % 2 === 0) ? '#e7d6b3' : '#9b6f4a';
        context.fillRect(margin + displayCol * squareSize, margin + displayRow * squareSize, squareSize, squareSize);
        const piece = result.board[row][col];
        if (piece) {
          try {
            const image = await loadImage(fenTools.pieceSrc(piece));
            const pad = squareSize * 0.06;
            context.drawImage(image, margin + displayCol * squareSize + pad, margin + displayRow * squareSize + pad, squareSize - pad * 2, squareSize - pad * 2);
          } catch (_) {}
        }
      }
    }
    context.fillStyle = '#f4f7fb';
    context.font = '700 24px system-ui';
    context.fillText('CAISSA Scanner', margin, size - 18);
    canvas.toBlob((blob) => {
      if (!blob) {
        toast('Could not create diagram image.');
        return;
      }
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = 'caissa-position.png';
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1500);
      toast('Diagram image exported.');
    }, 'image/png');
  }

  async function exportFen() {
    const fen = currentFen();
    closeSheets(false);
    if (!fen) return;
    try {
      await navigator.clipboard.writeText(fen);
      toast('FEN copied to clipboard.');
    } catch (_) {
      toast(fen);
    }
  }

  function flipBoard() {
    flipped = !flipped;
    syncOrientationPresentation();
    if (isEditing()) validateCurrent(false);
    else if (analysis?.currentFen()) analysis.setFlipped(flipped);
    else validateCurrent(false);
  }

  function toggleCoordinates() {
    coordinatesVisible = !coordinatesVisible;
    syncOrientationPresentation();
  }

  function correctOrientation() {
    if (!isEditing()) return;
    const nextFen = fenTools.rotatePosition180(els.fen.value);
    if (!nextFen) {
      setEditFeedback('The current position cannot be orientation-corrected.', 'error');
      return;
    }
    els.fen.value = nextFen;
    flipped = !flipped;
    selectedCanonicalOrientation = flipped ? 'black-bottom' : 'white-bottom';
    selectedSquare = null;
    orientationCorrectionApplied = true;
    userOrientationOverride = true;
    orientationResolved = true;
    structuralAcknowledged = false;
    syncOrientationPresentation();
    validateCurrent(false);
    renderPublicStructuralGuardrail(nextFen);
    renderOrientationReview();
    setEditFeedback('Recognized orientation corrected. Verify the pieces and side to move before applying.', 'ok');
  }

  function openExternal(url) {
    const opened = window.open(url, '_blank', 'noopener,noreferrer');
    if (opened) opened.opener = null;
  }

  function openLichess() {
    const fen = currentFen();
    closeMenus();
    if (!fen) {
      toast('Confirm a position first.');
      return;
    }
    const url = window.CaissaScannerAdapters?.createLichessAnalysisUrl?.(fen);
    if (!url) {
      toast('Lichess handoff is unavailable.');
      return;
    }
    openExternal(url);
  }

  function openCaissa() {
    const fen = currentFen();
    closeMenus();
    if (!fen) {
      toast('Confirm a position first.');
      return;
    }
    const result = window.CaissaScannerAdapters?.handoffToAnalyze?.(fen, { orientation: flipped ? 'black' : 'white' });
    if (!result?.ok) toast('CAISSA Analyze handoff is unavailable.');
  }

  function placeholder(message) {
    closeMenus();
    toast(message);
  }

  function showDiagramLibraryPlaceholder() {
    placeholder('Diagram Library — coming soon.');
  }

  function openAccount() {
    closeMenus();
    const auth = window.CAISSA_AUTH;
    if (auth?.isSignedIn) {
      toast('Account settings are coming soon.');
      return;
    }
    if (typeof auth?.redirectToSignIn === 'function') {
      auth.redirectToSignIn('/scanner/index.html');
      return;
    }
    window.location.assign('/signin?redirect_url=%2Fscanner%2Findex.html');
  }

  async function logout() {
    closeMenus();
    const auth = window.CAISSA_AUTH;
    if (!auth?.isSignedIn || typeof auth.signOut !== 'function') {
      toast('You are not signed in.');
      return;
    }
    await auth.signOut();
    toast('Signed out of CAISSA.');
  }

  function updateAuthMenu(auth = window.CAISSA_AUTH) {
    const signedIn = auth?.isSignedIn === true;
    els.accountHint.textContent = signedIn ? 'Account settings' : 'Sign in to CAISSA';
    els.logoutHint.textContent = signedIn ? 'Sign out of CAISSA' : 'Currently signed out';
  }

  function handleMenuKeys(event) {
    if (activeSheet) {
      if (event.key === 'Escape') {
        event.preventDefault();
        dismissActiveSheet();
        return;
      }
      if (event.key === 'Tab') {
        const focusable = [...activeSheet.sheet.querySelectorAll(
          'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
        )].filter((element) => !element.hidden && element.getClientRects().length > 0);
        const first = focusable[0];
        const last = focusable.at(-1);
        if (!first || !last) {
          event.preventDefault();
          return;
        }
        if (event.shiftKey && (event.target === first || !activeSheet.sheet.contains(event.target))) {
          event.preventDefault();
          last.focus({ preventScroll: true });
          return;
        }
        if (!event.shiftKey && (event.target === last || !activeSheet.sheet.contains(event.target))) {
          event.preventDefault();
          first.focus({ preventScroll: true });
          return;
        }
      }
    }
    if (!activeMenu) return;
    if (event.key === 'Escape') {
      event.preventDefault();
      closeMenus(true);
      return;
    }
    if (!activeMenu.menu.contains(event.target)) return;
    if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
    const items = [...activeMenu.menu.querySelectorAll('[role="menuitem"]')];
    if (!items.length) return;
    event.preventDefault();
    const current = items.indexOf(document.activeElement);
    const target = event.key === 'Home' ? 0
      : event.key === 'End' ? items.length - 1
        : event.key === 'ArrowDown' ? (current + 1 + items.length) % items.length
          : (current - 1 + items.length) % items.length;
    items[target].focus();
  }

  els.camera.addEventListener('change', (event) => selectFile(event.target.files?.[0], 'camera'));
  els.gallery.addEventListener('change', (event) => selectFile(event.target.files?.[0], 'gallery'));
  ['dragenter', 'dragover'].forEach((name) => els.drop.addEventListener(name, (event) => {
    event.preventDefault();
    els.drop.classList.add('dragging');
  }));
  ['dragleave', 'drop'].forEach((name) => els.drop.addEventListener(name, (event) => {
    event.preventDefault();
    els.drop.classList.remove('dragging');
  }));
  els.drop.addEventListener('drop', (event) => selectFile(event.dataTransfer?.files?.[0], 'gallery'));
  [els.blackPalette, els.whitePalette].forEach((palette) => palette.addEventListener('click', (event) => {
    const button = event.target.closest('[data-piece]');
    if (!button) return;
    selectEditTool(button.dataset.piece);
  }));
  els.clearSquare.addEventListener('click', () => selectEditTool('clear'));
  els.clearBoard.addEventListener('click', clearEditingBoard);
  els.editWhiteTurn.addEventListener('click', () => setEditTurn('w'));
  els.editBlackTurn.addEventListener('click', () => setEditTurn('b'));
  els.editCastling.addEventListener('click', () => {
    const open = els.editCastlingPanel.hidden;
    els.editCastlingPanel.hidden = !open;
    els.editCastling.setAttribute('aria-expanded', String(open));
  });
  els.castlingInputs.forEach((input) => input.addEventListener('change', updateCastling));
  els.structuralAcknowledge.addEventListener('change', () => {
    structuralAcknowledged = els.structuralAcknowledge.checked;
    renderPublicStructuralGuardrail(els.fen.value);
  });
  els.whiteBottom.addEventListener('click', () => chooseCanonicalOrientation('white-bottom'));
  els.blackBottom.addEventListener('click', () => chooseCanonicalOrientation('black-bottom'));
  els.localizationWrong.addEventListener('click', () => openFeedback('LOCALIZATION_FAILURE', els.localizationWrong));
  els.validate.addEventListener('click', () => validateCurrent());
  els.fen.addEventListener('input', () => {
    selectedSquare = null;
    if (state.snapshot().state === state.STATES.REVIEW) validateCurrent();
  });
  els.flip.addEventListener('click', flipBoard);
  els.coordinatesVisibility.addEventListener('click', toggleCoordinates);
  els.confirm.addEventListener('click', confirm);
  els.editBtn.addEventListener('click', () => openEdit(EDIT_ENTRY.MANUAL_EDIT));
  els.cancelEdit.addEventListener('click', () => closeEdit(false));
  els.applyEdit.addEventListener('click', () => closeEdit(true));
  els.editFlip.addEventListener('click', flipBoard);
  els.editCoordinatesVisibility.addEventListener('click', toggleCoordinates);
  els.correctOrientation.addEventListener('click', correctOrientation);
  els.editLibrary.addEventListener('click', showDiagramLibraryPlaceholder);
  els.editExport.addEventListener('click', () => openExport(els.editExport));
  els.editMenu.addEventListener('click', () => toggleMenu(els.productMenu, els.editMenu));
  els.moreBtn.addEventListener('click', () => toggleMenu(els.productMenu, els.moreBtn));
  els.boardActions.addEventListener('click', () => toggleMenu(els.analysisMenu, els.boardActions));
  els.diagramLibrary.addEventListener('click', showDiagramLibraryPlaceholder);
  els.videoExplorer.addEventListener('click', () => placeholder('Video Board Explorer is coming soon.'));
  els.membership.addEventListener('click', () => placeholder('Membership is coming soon.'));
  els.account.addEventListener('click', openAccount);
  els.logout.addEventListener('click', logout);
  els.openLichess.addEventListener('click', openLichess);
  els.openChessCom.addEventListener('click', () => placeholder('Direct Chess.com FEN handoff is not available yet.'));
  els.openCaissa.addEventListener('click', openCaissa);
  els.closeExport.addEventListener('click', () => closeSheets(true));
  els.exportDiagram.addEventListener('click', exportDiagram);
  els.exportFen.addEventListener('click', exportFen);
  els.homeBtn.addEventListener('click', () => {
    clearFeedbackHandoff();
    resetAll(true);
  });
  els.newScan.addEventListener('click', () => openNewScan(els.newScan));
  els.homeScan.addEventListener('click', () => openNewScan(els.homeScan));
  els.cancelNewScan.addEventListener('click', () => closeSheets(true));
  els.takePhoto.addEventListener('click', () => openPicker(els.camera));
  els.choosePhoto.addEventListener('click', () => openPicker(els.gallery));
  els.helpImprove.addEventListener('click', () => openFeedback('AUTO', els.helpImprove));
  els.reportFailure.addEventListener('click', () => openFeedback('SCAN_FAILURE', els.reportFailure));
  els.cancelFeedback.addEventListener('click', declineOptionalContribution);
  els.shareCorrection.addEventListener('change', updateFeedbackEligibility);
  els.shareImage.addEventListener('change', updateFeedbackEligibility);
  els.sourceImageRights.addEventListener('change', updateFeedbackEligibility);
  els.feedbackImageReselect.addEventListener('click', () => {
    els.feedbackImageInput.value = '';
    els.feedbackImageInput.click();
  });
  els.feedbackImageInput.addEventListener('change', async () => {
    const file = els.feedbackImageInput.files?.[0];
    if (!file) return;
    try {
      const client = await loadPublicClient();
      client.resolvePublicImage(file);
      const imageHash = await client.publicImageHash(file);
      if (imageHash.toLowerCase() !== String(publicRecognition?.snapshot?.imageHash || '').toLowerCase()) {
        throw new Error('IMAGE_DOES_NOT_MATCH_SCAN');
      }
      selectedSourceFile = file;
      els.sourceImageRights.checked = false;
      els.feedbackStatus.textContent = 'Photo reselected. Confirm your right to share it, review both choices, and confirm again.';
    } catch (error) {
      selectedSourceFile = null;
      els.feedbackStatus.textContent = error?.message === 'IMAGE_DOES_NOT_MATCH_SCAN'
        ? 'That is not the original photo used for this scan. Choose the original photo, or turn off photo sharing.'
        : (await loadPublicClient()).publicErrorMessage(error);
    }
    updateFeedbackEligibility();
  });
  els.submitFeedback.addEventListener('click', sendPublicFeedback);
  els.workspaceSaveDiagram.addEventListener('click', showDiagramLibraryPlaceholder);
  els.workspaceShare.addEventListener('click', () => openExport(els.workspaceShare));
  els.analyze.addEventListener('click', () => {
    const fen = currentFen();
    if (!fen || !analysis) {
      toast('Confirm the position first.');
      return;
    }
    startAnalysis(fen);
  });
  els.engineToggle.addEventListener('change', () => {
    if (!els.engineToggle.checked) {
      stopAnalysis();
      return;
    }
    const fen = currentFen();
    if (!fen) {
      els.engineToggle.checked = false;
      toast('Confirm the position first.');
      return;
    }
    startAnalysis(fen);
  });
  els.arrowsToggle.addEventListener('change', () => {
    bestMoveArrow?.setEnabled(els.arrowsToggle.checked);
  });
  els.first.addEventListener('click', () => analysis?.first());
  els.previous.addEventListener('click', () => analysis?.previous());
  els.next.addEventListener('click', () => analysis?.next());
  els.last.addEventListener('click', () => analysis?.last());
  els.sheetBackdrop.addEventListener('click', dismissActiveSheet);
  document.addEventListener('pointerdown', (event) => {
    if (!activeMenu) return;
    if (activeMenu.menu.contains(event.target) || activeMenu.trigger.contains(event.target)) return;
    closeMenus();
  });
  document.addEventListener('keydown', handleMenuKeys);
  window.addEventListener('resize', () => {
    if (activeMenu) positionMenu(activeMenu.menu, activeMenu.trigger);
  });
  window.addEventListener('caissa-auth-change', (event) => {
    const auth = event.detail;
    updateAuthMenu(auth);
    if (auth?.isSignedIn && restoredFeedbackDraft && !pendingFeedbackOwnerUserId) {
      pendingFeedbackOwnerUserId = auth.userId;
      feedbackNeedsReauthentication = false;
      feedbackIdentityConflict = false;
      els.feedbackStatus.textContent = 'Signed in. Review your restored choices and confirm again before anything is submitted.';
    } else if (auth?.isSignedIn && pendingFeedbackOwnerUserId && pendingFeedbackOwnerUserId !== auth.userId) {
      feedbackIdentityConflict = true;
      feedbackNeedsReauthentication = false;
      feedbackHandoff()?.clear(sessionStorage);
      els.feedbackStatus.textContent = 'The saved feedback draft belongs to a different account and cannot be submitted.';
    }
    if (activeSheet?.sheet === els.feedbackSheet) updateFeedbackEligibility();
  });
  window.addEventListener('pagehide', () => {
    recognitionRuntime?.dispose();
    recognitionRuntime = null;
    releaseSourcePreview();
  });
  window.addEventListener('pageshow', () => {
    if (!recognitionRuntime) recognitionRuntime = createRecognitionRuntime();
  });

  if (flags.scanner_beta_open === false) {
    document.querySelector('.scanner-page').innerHTML = '<section class="scanner-card"><h1>Scanner Lab is closed</h1><p>This feature flag is currently disabled.</p></section>';
    return;
  }

  updateAuthMenu();
  resetAll(true);
  restoreFeedbackHandoff();
  $('copyScannerUrlBtn')?.addEventListener('click', async () => {
    const value = $('scannerCanonicalUrl').value;
    if (!value) return;
    try {
      await navigator.clipboard.writeText(value);
      $('copyScannerUrlBtn').textContent = 'Copied';
    } catch (_) {
      $('scannerCanonicalUrl').select();
      document.execCommand?.('copy');
      $('copyScannerUrlBtn').textContent = 'Copied';
    }
  });
  loadPublicClient().then(client => client.publicStatus()).then(status => {
    if (!status.known || status.available) return;
    els.homeScan.disabled = true;
    els.publicServiceStatus.textContent = 'Scanner is temporarily paused. The mobile guide remains available while service is restored.';
  }).catch(() => { /* A static/offline shell remains usable in test and local preview environments. */ });
})();
