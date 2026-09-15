(function () {
  'use strict';

  const flags = window.CAISSA_SCANNER_FLAGS || {};
  const state = window.CaissaScannerState;
  const fenTools = window.CaissaScannerFen;
  const MOCK_FEN = 'r3k2r/pppq1ppp/2npbn2/3Np3/2B1P3/2N2Q2/PPP2PPP/R3K2R w KQkq - 4 10';
  const $ = (id) => document.getElementById(id);
  const els = {
    home: $('homeView'),
    workspace: $('workspaceView'),
    homeBtn: $('homeBtn'),
    homeScan: $('homeScanBtn'),
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
    boardEmpty: $('boardEmpty'),
    recognitionSummary: $('recognitionSummary'),
    confidence: $('boardConfidence'),
    confirmBar: $('confirmBar'),
    confirm: $('confirmBtn'),
    fen: $('fenInput'),
    validate: $('validateBtn'),
    flip: $('flipBtn'),
    validation: $('validationBox'),
    sidePiece: document.querySelector('#sideToMove .side-piece'),
    sideIcon: $('sideToMovePiece'),
    sideText: $('sideToMoveText'),
    editBtn: $('editBtn'),
    editSheet: $('editSheet'),
    cancelEdit: $('cancelEditBtn'),
    applyEdit: $('applyEditBtn'),
    editSquareLabel: $('editSquareLabel'),
    palette: $('piecePalette'),
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
    cancelNewScan: $('cancelNewScanBtn'),
    takePhoto: $('takePhotoBtn'),
    choosePhoto: $('choosePhotoBtn'),
    workspaceShare: $('workspaceShareBtn'),
    handoff: $('handoffCard'),
    confirmed: $('confirmedFen'),
    analyze: $('analyzeBtn'),
    engineToggle: $('engineToggle'),
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
  let selectedSquare = null;
  let toastTimer = null;
  let editWasConfirmed = false;
  let editResumeAnalysis = false;
  let editOriginalFen = '';
  let activeMenu = null;

  const lineEls = [1, 2, 3].map((number) => ({
    score: $('analysisScore' + number),
    depth: $('analysisDepth' + number),
    pv: $('analysisPv' + number)
  }));

  const analysis = window.CaissaScannerAnalysis?.create({
    board: els.board,
    fenTools,
    panel: els.analysisPanel,
    status: els.analysisStatus,
    fenOutput: els.analysisFen,
    moveHint: els.analysisMoveHint,
    lineEls,
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
    closeSheets();
    if (!shouldOpen) return;
    menu.hidden = false;
    trigger.setAttribute('aria-expanded', 'true');
    activeMenu = { menu, trigger };
    positionMenu(menu, trigger);
    menu.querySelector('[role="menuitem"]')?.focus();
  }

  function closeSheets() {
    els.editSheet.hidden = true;
    els.exportSheet.hidden = true;
    els.newScanSheet.hidden = true;
    closeMenus();
  }

  function showHome() {
    els.home.hidden = false;
    els.workspace.hidden = true;
    document.body.classList.remove('workspace-open');
  }

  function showWorkspace() {
    els.home.hidden = true;
    els.workspace.hidden = false;
    document.body.classList.add('workspace-open');
    requestAnimationFrame(() => window.dispatchEvent(new Event('resize')));
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
    const result = fenTools.validate(fen || '');
    if (!result.ok) return;
    const black = result.fen.split(' ')[1] === 'b';
    els.sidePiece.classList.toggle('white', !black);
    els.sidePiece.classList.toggle('black', black);
    els.sideIcon.src = black ? fenTools.pieceSrc('k') : fenTools.pieceSrc('K');
    els.sideText.textContent = black ? 'Black to move' : 'White to move';
  }

  function chooseSquare(row, col) {
    if (state.snapshot().state !== state.STATES.REVIEW || els.editSheet.hidden) return;
    selectedSquare = { row, col };
    els.editSquareLabel.textContent = 'Editing ' + fenTools.squareName(row, col);
    validateCurrent(false);
  }

  function validateCurrent(updateMessage = true) {
    const result = fenTools.validate(els.fen.value);
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
    const snapshot = state.snapshot();
    if (snapshot.state === state.STATES.CONFIRMED) {
      const analysisFen = analysis?.currentFen();
      if (analysisFen) return analysisFen;
      if (snapshot.confirmed?.fen) return snapshot.confirmed.fen;
    }
    const result = fenTools.validate(els.fen.value);
    return result.ok ? result.fen : '';
  }

  function openNewScan() {
    closeSheets();
    els.newScanSheet.hidden = false;
  }

  function openPicker(input) {
    els.newScanSheet.hidden = true;
    input.value = '';
    input.click();
  }

  function selectFile(file) {
    if (!file || !file.type.startsWith('image/')) {
      if (file) toast('Choose a supported image file.');
      return;
    }
    closeSheets();
    analysis?.clear();
    els.engineToggle.checked = false;
    const snapshot = state.beginSource();
    if (objectUrl) URL.revokeObjectURL(objectUrl);
    objectUrl = URL.createObjectURL(file);
    els.preview.src = objectUrl;
    els.previewWrap.hidden = false;
    els.sourceStatus.textContent = 'Image selected';
    els.candidateStatus.textContent = 'Preparing';
    els.workspaceTitle.textContent = 'Reading position';
    els.fen.value = '';
    els.confirm.disabled = true;
    els.handoff.hidden = true;
    els.confirmBar.hidden = false;
    els.recognitionSummary.hidden = false;
    selectedSquare = null;
    showWorkspace();
    state.beginRecognition(snapshot.generation);
    setBoardEmpty(true);
    const expectedGeneration = snapshot.generation;
    setTimeout(() => {
      if (state.snapshot().generation !== expectedGeneration) return;
      state.setCandidate(expectedGeneration, {
        fen: MOCK_FEN,
        boardConfidence: null,
        pieceConfidenceBySquare: {},
        lowConfidenceSquares: [],
        orientation: 'white'
      });
      els.fen.value = MOCK_FEN;
      els.confidence.textContent = 'Review';
      els.candidateStatus.textContent = 'Ready to review';
      els.workspaceTitle.textContent = 'Review position';
      validateCurrent();
      toast('Check the board. Edit anything that does not match your source.');
    }, 220);
  }

  function resetAll(goHome = true) {
    analysis?.clear();
    state.reset();
    if (objectUrl) {
      URL.revokeObjectURL(objectUrl);
      objectUrl = null;
    }
    els.camera.value = '';
    els.gallery.value = '';
    els.preview.removeAttribute('src');
    els.previewWrap.hidden = true;
    els.fen.value = '';
    els.confidence.textContent = '—';
    els.candidateStatus.textContent = 'Waiting';
    els.sourceStatus.textContent = 'No image';
    els.reviewStatus.textContent = 'Required';
    els.confirm.disabled = true;
    els.handoff.hidden = true;
    els.confirmBar.hidden = false;
    els.recognitionSummary.hidden = false;
    els.analysisPanel.hidden = true;
    els.engineToggle.checked = false;
    selectedSquare = null;
    flipped = false;
    editWasConfirmed = false;
    editResumeAnalysis = false;
    editOriginalFen = '';
    closeSheets();
    fenTools.renderEmpty(els.board);
    setBoardEmpty(true);
    setValidation('Choose an image to begin.');
    els.workspaceTitle.textContent = 'Review position';
    if (goHome) showHome();
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
    els.handoff.hidden = false;
    els.confirmBar.hidden = true;
    els.recognitionSummary.hidden = true;
    els.workspaceTitle.textContent = 'Position ready';
    els.candidateStatus.textContent = 'Confirmed';
    analysis?.setPosition(result.fen);
    fenTools.render(els.board, result.fen, flipped, null, null);
    toast('Position confirmed.');
  }

  async function startAnalysis(fen, silent = false) {
    if (!analysis || !fen) return;
    els.analyze.disabled = true;
    els.analyze.innerHTML = '<i class="fas fa-spinner fa-spin"></i><span>Starting</span>';
    els.engineToggle.checked = true;
    try {
      await analysis.start(fen);
      analysis.setFlipped(flipped);
      els.workspaceTitle.textContent = 'Analyze position';
      els.candidateStatus.textContent = 'Stockfish 18';
      els.analyze.disabled = false;
      els.analyze.innerHTML = '<i class="fas fa-chart-line"></i><span>Analyze</span>';
      if (!silent) toast('Stockfish 18 is analyzing with 3 lines.');
    } catch (error) {
      analysis.stop();
      els.analysisPanel.hidden = false;
      els.analysisStatus.textContent = 'Unavailable';
      els.analysisStatus.className = 'analysis-status error';
      els.analysisMoveHint.textContent = error?.message || 'Could not start Stockfish 18.';
      els.analyze.disabled = false;
      els.analyze.innerHTML = '<i class="fas fa-rotate-right"></i><span>Retry</span>';
      els.engineToggle.checked = false;
    }
  }

  function stopAnalysis() {
    analysis?.stop();
    els.analysisPanel.hidden = true;
    els.engineToggle.checked = false;
    els.workspaceTitle.textContent = 'Position ready';
    els.candidateStatus.textContent = 'Confirmed';
  }

  function openEdit() {
    const fen = currentFen();
    if (!fen) {
      toast('Scan or load a position first.');
      return;
    }
    const snapshot = state.snapshot();
    editWasConfirmed = snapshot.state === state.STATES.CONFIRMED;
    editResumeAnalysis = Boolean(analysis?.isActive());
    editOriginalFen = fen;
    if (editWasConfirmed) {
      analysis?.stop();
      els.analysisPanel.hidden = true;
      els.engineToggle.checked = false;
      els.fen.value = fen;
      state.revise(fen);
      els.confirmBar.hidden = true;
      els.recognitionSummary.hidden = true;
      els.handoff.hidden = false;
    } else if (snapshot.state !== state.STATES.REVIEW) {
      toast('There is no editable position yet.');
      return;
    }
    closeSheets();
    els.editSheet.hidden = false;
    selectedSquare = null;
    els.editSquareLabel.textContent = 'Tap a square';
    validateCurrent(false);
    els.workspaceTitle.textContent = 'Edit position';
    els.candidateStatus.textContent = 'Editing';
  }

  async function closeEdit(apply) {
    if (apply) {
      const result = validateCurrent();
      if (!result.ok) {
        toast(result.error);
        return;
      }
      selectedSquare = null;
      els.editSheet.hidden = true;
      if (editWasConfirmed) {
        const confirmed = state.confirm(result.fen);
        els.confirmed.textContent = confirmed.fen;
        els.handoff.hidden = false;
        els.confirmBar.hidden = true;
        els.recognitionSummary.hidden = true;
        analysis?.setPosition(result.fen);
        fenTools.render(els.board, result.fen, flipped, null, null);
        els.workspaceTitle.textContent = editResumeAnalysis ? 'Analyze position' : 'Position ready';
        els.candidateStatus.textContent = editResumeAnalysis ? 'Stockfish 18' : 'Confirmed';
        if (editResumeAnalysis) await startAnalysis(result.fen, true);
        toast('Position updated.');
      } else {
        validateCurrent(false);
      }
    } else {
      selectedSquare = null;
      els.editSheet.hidden = true;
      if (editWasConfirmed && editOriginalFen) {
        els.fen.value = editOriginalFen;
        const confirmed = state.confirm(editOriginalFen);
        els.confirmed.textContent = confirmed.fen;
        els.handoff.hidden = false;
        els.confirmBar.hidden = true;
        els.recognitionSummary.hidden = true;
        analysis?.setPosition(editOriginalFen);
        fenTools.render(els.board, editOriginalFen, flipped, null, null);
        els.workspaceTitle.textContent = editResumeAnalysis ? 'Analyze position' : 'Position ready';
        els.candidateStatus.textContent = editResumeAnalysis ? 'Stockfish 18' : 'Confirmed';
        if (editResumeAnalysis) await startAnalysis(editOriginalFen, true);
      } else {
        validateCurrent(false);
      }
    }
    editWasConfirmed = false;
    editResumeAnalysis = false;
    editOriginalFen = '';
  }

  function openExport() {
    const fen = currentFen();
    if (!fen) {
      toast('Scan or load a position first.');
      return;
    }
    closeSheets();
    els.exportSheet.hidden = false;
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
    els.exportSheet.hidden = true;
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
    els.exportSheet.hidden = true;
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
    if (analysis?.currentFen()) analysis.setFlipped(flipped);
    else validateCurrent(false);
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

  els.camera.addEventListener('change', (event) => selectFile(event.target.files?.[0]));
  els.gallery.addEventListener('change', (event) => selectFile(event.target.files?.[0]));
  ['dragenter', 'dragover'].forEach((name) => els.drop.addEventListener(name, (event) => {
    event.preventDefault();
    els.drop.classList.add('dragging');
  }));
  ['dragleave', 'drop'].forEach((name) => els.drop.addEventListener(name, (event) => {
    event.preventDefault();
    els.drop.classList.remove('dragging');
  }));
  els.drop.addEventListener('drop', (event) => selectFile(event.dataTransfer?.files?.[0]));
  els.palette.addEventListener('click', (event) => {
    const button = event.target.closest('[data-piece]');
    if (!button || !selectedSquare) return;
    const nextFen = fenTools.mutateSquare(els.fen.value, selectedSquare.row, selectedSquare.col, button.dataset.piece);
    if (!nextFen) return;
    els.fen.value = nextFen;
    validateCurrent();
  });
  els.validate.addEventListener('click', () => validateCurrent());
  els.fen.addEventListener('input', () => {
    selectedSquare = null;
    if (state.snapshot().state === state.STATES.REVIEW) validateCurrent();
  });
  els.flip.addEventListener('click', flipBoard);
  els.confirm.addEventListener('click', confirm);
  els.editBtn.addEventListener('click', openEdit);
  els.cancelEdit.addEventListener('click', () => closeEdit(false));
  els.applyEdit.addEventListener('click', () => closeEdit(true));
  els.moreBtn.addEventListener('click', () => toggleMenu(els.productMenu, els.moreBtn));
  els.boardActions.addEventListener('click', () => toggleMenu(els.analysisMenu, els.boardActions));
  els.diagramLibrary.addEventListener('click', () => placeholder('Diagram Library is coming soon.'));
  els.videoExplorer.addEventListener('click', () => placeholder('Video Board Explorer is coming soon.'));
  els.membership.addEventListener('click', () => placeholder('Membership is coming soon.'));
  els.account.addEventListener('click', openAccount);
  els.logout.addEventListener('click', logout);
  els.openLichess.addEventListener('click', openLichess);
  els.openChessCom.addEventListener('click', () => placeholder('Direct Chess.com FEN handoff is not available yet.'));
  els.openCaissa.addEventListener('click', openCaissa);
  els.closeExport.addEventListener('click', () => { els.exportSheet.hidden = true; });
  els.exportDiagram.addEventListener('click', exportDiagram);
  els.exportFen.addEventListener('click', exportFen);
  els.homeBtn.addEventListener('click', () => resetAll(true));
  els.newScan.addEventListener('click', openNewScan);
  els.homeScan.addEventListener('click', openNewScan);
  els.cancelNewScan.addEventListener('click', () => { els.newScanSheet.hidden = true; });
  els.takePhoto.addEventListener('click', () => openPicker(els.camera));
  els.choosePhoto.addEventListener('click', () => openPicker(els.gallery));
  els.workspaceShare.addEventListener('click', openExport);
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
  els.first.addEventListener('click', () => analysis?.first());
  els.previous.addEventListener('click', () => analysis?.previous());
  els.next.addEventListener('click', () => analysis?.next());
  els.last.addEventListener('click', () => analysis?.last());
  document.addEventListener('pointerdown', (event) => {
    if (!activeMenu) return;
    if (activeMenu.menu.contains(event.target) || activeMenu.trigger.contains(event.target)) return;
    closeMenus();
  });
  document.addEventListener('keydown', handleMenuKeys);
  window.addEventListener('resize', () => {
    if (activeMenu) positionMenu(activeMenu.menu, activeMenu.trigger);
  });
  window.addEventListener('caissa-auth-change', (event) => updateAuthMenu(event.detail));

  if (flags.scanner_beta_open === false) {
    document.querySelector('.scanner-page').innerHTML = '<section class="scanner-card"><h1>Scanner Lab is closed</h1><p>This feature flag is currently disabled.</p></section>';
    return;
  }

  updateAuthMenu();
  resetAll(true);
})();
