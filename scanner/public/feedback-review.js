const $ = (id) => document.getElementById(id);
const filterControls = [...document.querySelectorAll("[data-filter]")];
let records = [];
let selectedId = null;
const openedCaseIds = new Set();
const pieceAssets = Object.freeze({
  K: "wK",
  Q: "wQ",
  R: "wR",
  B: "wB",
  N: "wN",
  P: "wP",
  k: "bK",
  q: "bQ",
  r: "bR",
  b: "bB",
  n: "bN",
  p: "bP",
});

function element(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
}

function formatDate(value) {
  const instant = new Date(value);
  return Number.isNaN(instant.getTime())
    ? "Unknown date"
    : instant.toLocaleString();
}

function renderCounters(values = {}) {
  const labels = {
    rawInbox: "Raw inbox",
    needsReview: "Needs review",
    certified: "Certified",
    held: "Held",
    excluded: "Excluded",
    eligibleForTraining: "Training eligible",
    classifierCandidates: "Classifier candidates",
    localizationCandidates: "Localization candidates",
  };
  $("reviewCounters").replaceChildren(
    ...Object.entries(labels).map(([key, label]) => {
      const card = element("div", "counter");
      card.append(
        element("strong", "", String(values[key] || 0)),
        element("span", "", label),
      );
      return card;
    }),
  );
}

function filteredRecords() {
  const priority = $("priorityFilter").value;
  return priority
    ? records.filter((record) => record.priority === priority)
    : records;
}

function renderList() {
  const list = $("caseList");
  list.replaceChildren(
    ...filteredRecords().map((record) => {
      const button = element("button", "case-row");
      button.type = "button";
      button.dataset.feedbackId = record.feedbackId;
      button.setAttribute(
        "aria-current",
        String(record.feedbackId === selectedId),
      );
      button.append(element("span", `priority ${record.priority}`));
      const copy = element("span");
      copy.append(
        element("strong", "", record.feedbackType),
        element(
          "small",
          "",
          `${record.platform || "unspecified"} · ${formatDate(record.submittedAt)}`,
        ),
      );
      button.append(copy, element("em", "", record.currentStatus));
      button.addEventListener("click", () => selectCase(record.feedbackId));
      return button;
    }),
  );
  $("listStatus").textContent =
    `${filteredRecords().length} case${filteredRecords().length === 1 ? "" : "s"}`;
}

function dataRow(list, name, value) {
  list.append(
    element("dt", "", name),
    element("dd", "", value == null || value === "" ? "—" : String(value)),
  );
}

function renderFenBoard(fen, label) {
  const figure = document.createElement("figure");
  figure.append(element("figcaption", "", label));
  const board = element("div", "fen-board");
  board.setAttribute("aria-label", label);
  const squares = [];
  for (const rank of String(fen || "")
    .split(" ")[0]
    .split("/")) {
    for (const token of rank) {
      if (/\d/.test(token)) squares.push(...Array(Number(token)).fill(null));
      else squares.push(token);
    }
  }
  for (const piece of squares.slice(0, 64)) {
    const square = document.createElement("span");
    if (pieceAssets[piece]) {
      const image = new Image();
      image.alt = piece;
      image.src = `/img/chesspieces/wikipedia/${pieceAssets[piece]}.png`;
      square.append(image);
    }
    board.append(square);
  }
  figure.append(board);
  return figure;
}

function renderDiff(record) {
  const card = element("section", "data-card");
  card.append(element("h3", "", "Square-by-square difference"));
  const table = element("table", "diff-table");
  const head = document.createElement("thead");
  const headRow = document.createElement("tr");
  [
    "Square",
    "Predicted",
    "Corrected",
    "Confidence",
    "Occupancy",
    "Type probabilities",
    "Color probabilities",
  ].forEach((value) => headRow.append(element("th", "", value)));
  head.append(headRow);
  table.append(head);
  const body = document.createElement("tbody");
  for (const change of record.payload?.changedSquares || []) {
    const row = document.createElement("tr");
    [
      change.square,
      change.predicted,
      change.corrected,
      change.originalConfidence,
      change.occupancyProbability,
      JSON.stringify(change.pieceTypeProbabilities || []),
      JSON.stringify(change.colorProbabilities || []),
    ].forEach((value) => row.append(element("td", "", value)));
    body.append(row);
  }
  if (!body.children.length) {
    const row = document.createElement("tr");
    const cell = element("td", "", "No piece correction was supplied.");
    cell.colSpan = 7;
    row.append(cell);
    body.append(row);
  }
  table.append(body);
  card.append(table);
  return card;
}

async function sourceImage(record, frame) {
  if (
    !record.imageStorageReference ||
    record.payload?.consent?.shareImageForImprovement !== true
  ) {
    frame.append(
      element(
        "p",
        "",
        "Source image was not shared. Correction consent and image consent are separate.",
      ),
    );
    return;
  }
  frame.append(element("p", "", "Requesting short-lived private access…"));
  const response = await fetch(
    `/api/scanner/feedback-review/image?feedbackId=${encodeURIComponent(record.feedbackId)}`,
    { credentials: "same-origin" },
  );
  if (!response.ok) {
    frame.replaceChildren(element("p", "", "Private image is unavailable."));
    return;
  }
  const value = await response.json();
  const image = new Image();
  image.alt = "Consented source evidence";
  image.src = value.signedUrl;
  frame.replaceChildren(image);
}

function actionButton(action) {
  const button = element("button", "", action.replaceAll("_", " "));
  button.type = "button";
  button.dataset.action = action;
  button.addEventListener("click", () => submitAction(action));
  return button;
}

function renderDetail(record) {
  const root = $("caseDetail");
  root.replaceChildren();
  const head = element("div", "detail-head");
  const title = element("div");
  title.append(
    element("h2", "", record.feedbackType),
    element("code", "", record.feedbackId),
  );
  head.append(
    title,
    element(
      "strong",
      `priority ${record.priority}`,
      record.priority.toUpperCase(),
    ),
  );
  root.append(head);
  const badges = element("div", "detail-badges");
  for (const value of [
    record.certificationStatus,
    record.currentStatus,
    record.sourceTrust,
    record.captureType || "capture unspecified",
    record.duplicateSuspected ? "possible duplicate" : "not flagged duplicate",
  ]) {
    badges.append(
      element(
        "span",
        `badge ${value === "raw-unverified" ? "raw" : ""}`,
        value,
      ),
    );
  }
  root.append(badges);
  const evidence = element("div", "evidence-grid");
  const frame = element("div", "source-frame");
  evidence.append(frame);
  const data = element("section", "data-card");
  data.append(element("h3", "", "Evidence"));
  const list = element("dl", "data-grid");
  dataRow(list, "Submitted", formatDate(record.submittedAt));
  dataRow(list, "Platform", record.platform);
  dataRow(list, "Model", record.modelVersion);
  dataRow(list, "Localization", record.localizationVersion);
  dataRow(list, "Orientation correction", record.payload?.clientMetadata?.orientationCorrectionApplied === true ? "Canonical 180Â° rotation â€” review required" : "None");
  dataRow(list, "Training truth policy", record.payload?.clientMetadata?.trainingTruthPolicy || "STANDARD");
  dataRow(list, "Structural state", record.payload?.structuralStatus);
  dataRow(list, "Warnings", (record.payload?.warningCodes || []).join(", "));
  dataRow(
    list,
    "Correction consent",
    record.payload?.consent?.shareCorrectionForImprovement,
  );
  dataRow(
    list,
    "Image consent",
    record.payload?.consent?.shareImageForImprovement,
  );
  dataRow(list, "Capture", record.captureType);
  dataRow(list, "Fingerprint", record.evidenceFingerprint);
  data.append(
    list,
    element("strong", "", "Predicted FEN"),
    element("code", "fen-block", record.payload?.originalFEN || "Unavailable"),
    element("strong", "", "User-corrected FEN"),
    element(
      "code",
      "fen-block",
      record.payload?.correctedFEN || "Not supplied",
    ),
  );
  const diagnostics = element("details");
  diagnostics.append(
    element("summary", "", "Localization diagnostics and metadata"),
  );
  diagnostics.append(
    element(
      "pre",
      "fen-block",
      JSON.stringify(record.payload?.clientMetadata || {}, null, 2),
    ),
  );
  data.append(diagnostics);
  evidence.append(data);
  root.append(evidence);
  void sourceImage(record, frame);
  const boardEvidence = element("section", "board-evidence");
  boardEvidence.append(
    renderFenBoard(record.payload?.originalFEN, "Predicted board"),
  );
  if (record.payload?.correctedFEN) {
    boardEvidence.append(
      renderFenBoard(record.payload.correctedFEN, "User-corrected board"),
    );
  }
  root.append(boardEvidence);
  root.append(renderDiff(record));
  const panel = element("section", "certification-panel");
  panel.append(element("h3", "", "Record a separate certification decision"));
  const notes = document.createElement("textarea");
  notes.id = "certificationNotes";
  notes.maxLength = 2000;
  notes.placeholder = "Notes or reason for this decision";
  panel.append(notes);
  const training = element("label", "training-row");
  const checkbox = document.createElement("input");
  checkbox.type = "checkbox";
  checkbox.id = "trainingEligible";
  training.append(
    checkbox,
    document.createTextNode(
      " Explicitly mark eligible for training (all governance gates must pass)",
    ),
  );
  panel.append(training);
  const actions = element("div", "action-grid");
  [
    "CERTIFY",
    "CERTIFY_CLASSIFIER_CORRECTION",
    "CERTIFY_LOCALIZATION_FAILURE",
    "NEEDS_FIX",
    "DUPLICATE",
    "HOLD",
    "EXCLUDE",
  ].forEach((action) => actions.append(actionButton(action)));
  panel.append(
    actions,
    element("p", "feedback-status", "No bulk certification is available."),
  );
  const history = element("div", "history");
  history.append(element("h3", "", "Immutable decision history"));
  const historyList = document.createElement("ol");
  for (const item of record.certifications || [])
    historyList.append(
      element(
        "li",
        "",
        `${formatDate(item.certifiedAt)} — ${item.action} by ${item.certifiedBy}${item.trainingEligible ? " · training eligible" : ""}`,
      ),
    );
  if (!historyList.children.length)
    historyList.append(element("li", "", "No owner decision yet."));
  history.append(historyList);
  panel.append(history);
  root.append(panel);
}

function selectCase(id) {
  selectedId = id;
  renderList();
  const record = records.find((item) => item.feedbackId === id);
  if (record) {
    renderDetail(record);
    if (!openedCaseIds.has(id)) {
      openedCaseIds.add(id);
      void fetch('/api/scanner/feedback-review/audit', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ feedbackId: id, eventType: 'CASE_OPENED' })
      }).catch(() => { /* review remains available if noncritical audit transport fails */ });
    }
  }
}

async function submitAction(action) {
  const record = records.find((item) => item.feedbackId === selectedId);
  if (!record) return;
  let duplicateOf = null;
  if (action === "DUPLICATE") {
    duplicateOf = prompt("Canonical feedback UUID for this duplicate:");
    if (!duplicateOf) return;
  }
  const status = $("caseDetail").querySelector(".feedback-status");
  status.textContent = "Recording decision…";
  const response = await fetch("/api/scanner/feedback-review/action", {
    method: "POST",
    credentials: "same-origin",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      feedbackId: record.feedbackId,
      action,
      notes: $("certificationNotes").value,
      trainingEligible: $("trainingEligible").checked,
      duplicateOf,
      reasonCodes: [],
    }),
  });
  const value = await response.json().catch(() => ({}));
  if (!response.ok) {
    status.textContent = value.error || "Decision could not be recorded.";
    return;
  }
  status.textContent = "Decision recorded in immutable history.";
  await loadCases(record.feedbackId);
}

async function loadCases(reselect = selectedId) {
  $("listStatus").textContent = "Loading…";
  const params = new URLSearchParams();
  for (const control of filterControls)
    if (control.value) params.set(control.dataset.filter, control.value);
  const response = await fetch(`/api/scanner/feedback-review/list?${params}`, {
    credentials: "same-origin",
  });
  if (!response.ok) {
    $("listStatus").textContent =
      response.status === 403
        ? "Reviewer access denied."
        : "Review queue unavailable.";
    return;
  }
  const value = await response.json();
  records = value.records || [];
  renderCounters(value.counters);
  renderList();
  if (reselect && records.some((item) => item.feedbackId === reselect))
    selectCase(reselect);
}

filterControls.forEach((control) =>
  control.addEventListener("change", () => loadCases()),
);
$("priorityFilter").addEventListener("change", renderList);
$("refreshReview").addEventListener("click", () => loadCases());
void loadCases();
