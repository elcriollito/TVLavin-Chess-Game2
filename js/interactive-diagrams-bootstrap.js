(function () {
  'use strict';
  const host = document.querySelector('[data-interactive-diagrams-host]');
  const manifest = window.CaissaInteractiveDiagramsManifest;
  const adapter = window.CaissaInteractiveDiagramAdapter;
  if (!host || !manifest || !adapter) throw new Error('ICD_BOOTSTRAP_MISSING');
  const diagrams = adapter.validateManifest(manifest);
  diagrams.forEach(item => {
    const diagram = document.createElement('div');
    diagram.className = 'cbdiagram';
    diagram.dataset.diagramId = item.diagramId;
    diagram.dataset.size = '400';
    diagram.dataset.buttons = '0';
    diagram.dataset.fen = item.fen;
    diagram.dataset.title = item.title;
    diagram.dataset.legend = item.legend;
    if (item.arrows.length) diagram.dataset.arrows = item.arrows.join(',');
    if (item.squares.length) diagram.dataset.squares = item.squares.join(',');
    host.appendChild(diagram);
  });
  document.documentElement.dataset.interactiveDiagramCount = String(diagrams.length);
}());
