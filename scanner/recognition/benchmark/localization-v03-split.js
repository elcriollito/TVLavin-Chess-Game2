// Frozen before any v0.3 detector run. IDs 020–033 are exact v0.1 overlaps.
export const V03_CORPUS_SHA256 = Object.freeze({
  starter: '46700321AFDF531D3D295CC7B31EFC0CFD59DFA68833C505208B0ADC65AD44F1',
  annotated: 'D059F172747921D6D5AEF3106099ABCF6C8553074E4961ACDA626C2312248BA6'
});

const groups = [
  ['digital-001', 'development', 'digital-2d', ['positive-001']],
  ['playchess-session', 'development', 'digital-2d', ['positive-002', 'positive-003']],
  ['digital-004', 'evaluation', 'digital-2d', ['positive-004']],
  ['digital-005', 'development', 'digital-2d', ['positive-005']],
  ['digital-006', 'development', 'digital-2d', ['positive-006']],
  ['digital-007', 'development', 'digital-2d', ['positive-007']],
  ['digital-008', 'evaluation', 'digital-2d', ['positive-008']],
  ['digital-009', 'development', 'digital-2d', ['positive-009']],
  ['digital-010', 'development', 'digital-2d', ['positive-010']],
  ['digital-011', 'development', 'digital-2d', ['positive-011']],
  ['print-012', 'evaluation', 'printed', ['positive-012']],
  ['mobile-theme-013-014', 'evaluation', 'digital-2d', ['positive-013', 'positive-014']],
  ['digital-015', 'development', 'digital-2d', ['positive-015']],
  ['print-016', 'development', 'printed', ['positive-016']],
  ['stream-017', 'development', 'livestream', ['positive-017']],
  ['digital-018', 'development', 'digital-2d', ['positive-018']],
  ['digital-019', 'evaluation', 'digital-2d', ['positive-019']],
  ['math-001', 'development', 'math-notebook', ['negative-001']],
  ['checkers-002', 'evaluation', 'checkers-board', ['negative-002']],
  ['grid-paper-003-004', 'development', 'grid-paper', ['negative-003', 'negative-004']],
  ['grid-paper-005', 'evaluation', 'grid-paper', ['negative-005']],
  ['notebook-006-009', 'development', 'math-notebook', ['negative-006', 'negative-009']],
  ['checker-pattern-007', 'evaluation', 'checker-pattern', ['negative-007']],
  ['notebook-008', 'development', 'math-notebook', ['negative-008']],
  ['rectangular-layout-010-011', 'evaluation', 'rectangular-layout', ['negative-010', 'negative-011']],
  ['checkers-012', 'development', 'checkers-board', ['negative-012']],
  ['checker-pattern-013', 'development', 'checker-pattern', ['negative-013']]
];

export const V03_GROUPS = Object.freeze(groups.map(([group, split, category, suffixes]) => Object.freeze({
  group, split, category, sampleIds: Object.freeze(suffixes.map((suffix) => `real-v03-${suffix}`))
})));

export function classifyV03Sample(sampleId) {
  const match = /^real-v03-positive-(\d{3})$/.exec(sampleId);
  if (match && Number(match[1]) >= 20 && Number(match[1]) <= 33) {
    return Object.freeze({ split: 'legacy-overlap', category: 'historical', group: 'v0.1-exact-byte-overlap' });
  }
  const group = V03_GROUPS.find((entry) => entry.sampleIds.includes(sampleId));
  if (!group) throw new Error(`Unassigned v0.3 sample: ${sampleId}`);
  return Object.freeze({ split: group.split, category: group.category, group: group.group });
}

export function verifyV03Split(samples) {
  const ids = new Set();
  const counts = { developmentPositive: 0, developmentNegative: 0, evaluationPositive: 0,
    evaluationNegative: 0, legacyOverlap: 0 };
  for (const sample of samples) {
    if (ids.has(sample.sampleId)) throw new Error(`Duplicate v0.3 sample: ${sample.sampleId}`);
    ids.add(sample.sampleId);
    const { split } = classifyV03Sample(sample.sampleId);
    if (split === 'legacy-overlap') {
      if (!sample.boardPresent || !sample.priorCorpusSampleId) throw new Error(`${sample.sampleId}: invalid legacy overlap`);
      counts.legacyOverlap += 1;
    } else {
      if (sample.priorCorpusSampleId) throw new Error(`${sample.sampleId}: overlap leaked into fresh split`);
      const key = `${split}${sample.boardPresent ? 'Positive' : 'Negative'}`;
      counts[key] += 1;
    }
  }
  if (ids.size !== 46 || counts.developmentPositive !== 13 || counts.developmentNegative !== 8
      || counts.evaluationPositive !== 6 || counts.evaluationNegative !== 5 || counts.legacyOverlap !== 14) {
    throw new Error(`Invalid v0.3 split: ${JSON.stringify(counts)}`);
  }
  for (const group of V03_GROUPS) {
    if (group.sampleIds.some((id) => !ids.has(id))) throw new Error(`Incomplete leakage group: ${group.group}`);
  }
  return Object.freeze(counts);
}
