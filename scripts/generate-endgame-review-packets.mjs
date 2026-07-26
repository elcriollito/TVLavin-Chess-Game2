import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ChessRulesFacade } from '../js/endgame-trainer/chess-rules-facade.js';
import {
    ALLOWED_REVIEW_DECISIONS, REMOTE_PROVIDER, REVIEW_PACKET_SCHEMA_VERSION,
    compareEvidence, fetchRemoteTablebase, normalizeTablebaseResponse, sha256, validateRemoteEligibility
} from './endgame-remote-tablebase.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const sourcePath = join(root, 'endgame-pools/authoring/pools/caissa-king-pawn-decisions-1.0.0.json');
const enginePath = join(root, 'endgame-pools/private/evidence/caissa-king-pawn-decisions-1.0.0.stockfish-18.json');
const discrepancyPath = join(root, 'endgame-pools/private/evidence/caissa-king-pawn-decisions-1.0.0.discrepancies.json');
const evidenceDirectory = join(root, 'endgame-pools/private/remote-tablebase');
const packetDirectory = join(root, 'endgame-pools/private/review-packets');
const summaryPath = join(root, 'docs/verification/SEASON_10_5A_HUMAN_CHESS_REVIEW_PACKET_SUMMARY.md');
const argument = (name) => {
    const index = process.argv.indexOf(name);
    return index < 0 ? null : process.argv[index + 1];
};
const has = (name) => process.argv.includes(name);
const readJson = async (path) => JSON.parse(await readFile(path, 'utf8'));
const writeJson = async (path, value) => writeFile(path, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
const moveToUci = (fen, move) => {
    const rules = ChessRulesFacade.fromFen(fen);
    return rules.move(move).lan;
};
const boardText = (fen) => {
    const placement = fen.split(' ')[0].split('/');
    return placement.map((rank, index) => {
        const cells = [...rank].flatMap((token) => /\d/.test(token) ? Array(Number(token)).fill('.') : [token]);
        return `${8 - index} ${cells.join(' ')}`;
    }).concat('  a b c d e f g h').join('\n');
};

export async function generatePackets({
    offline = has('--offline'), force = has('--force-refresh'), dryRun = has('--dry-run'),
    timeoutMs = Number(argument('--timeout') || REMOTE_PROVIDER.timeoutPolicy.defaultMs),
    now = () => new Date().toISOString(), fetchImpl = fetch
} = {}) {
    const [source, engineCollection, discrepancies] = await Promise.all([
        readJson(sourcePath), readJson(enginePath), readJson(discrepancyPath)
    ]);
    const unresolvedIds = new Set(engineCollection.records
        .filter((record) => record.resultClassification !== 'confirmed')
        .map((record) => record.positionId));
    if (discrepancies.summary?.requiresHumanReview + discrepancies.summary?.authoredAnswerQuestioned !== unresolvedIds.size)
        throw new Error('discrepancy-summary-mismatch');
    const engineById = new Map(engineCollection.records.map((record) => [record.positionId, record]));
    await Promise.all([mkdir(evidenceDirectory, { recursive: true }), mkdir(packetDirectory, { recursive: true }), mkdir(dirname(summaryPath), { recursive: true })]);
    const packets = [];
    const acquisitionStatuses = new Map();
    const stats = { networkRequests: 0, cacheHits: 0, providerFailures: 0, latenciesMs: [] };
    for (const position of source.positions.filter((item) => unresolvedIds.has(item.positionId))) {
        const engine = engineById.get(position.positionId);
        const eligibility = validateRemoteEligibility(position.fen);
        const cachePath = join(evidenceDirectory, `${position.positionId}.json`);
        let tablebase = null;
        let cacheStatus = 'not-requested';
        if (eligibility.status === 'eligible') {
            if (!force) {
                tablebase = await readJson(cachePath).catch(() => null);
                if (tablebase && tablebase.positionContentDigest === engine.positionContentDigest &&
                    tablebase.evidenceDigest === sha256(Object.fromEntries(Object.entries(tablebase).filter(([key]) => key !== 'evidenceDigest' &&
                        key !== 'cacheStatus')))) {
                    cacheStatus = 'cache-hit';
                    stats.cacheHits += 1;
                } else tablebase = null;
            }
            if (!tablebase && !offline) {
                const started = performance.now();
                try {
                    stats.networkRequests += 1;
                    const response = await fetchRemoteTablebase(position.fen, { fetchImpl, timeoutMs });
                    tablebase = normalizeTablebaseResponse({
                        positionId: position.positionId, fen: position.fen,
                        positionContentDigest: engine.positionContentDigest,
                        body: response.body, httpStatus: response.httpStatus, retrievedAt: now()
                    });
                    cacheStatus = 'retrieved';
                    stats.latenciesMs.push(Number((performance.now() - started).toFixed(2)));
                    if (!dryRun) await writeJson(cachePath, tablebase);
                } catch (error) {
                    cacheStatus = error.code || 'provider-unavailable';
                    stats.providerFailures += 1;
                }
            } else if (!tablebase) cacheStatus = 'provider-unavailable';
        } else cacheStatus = eligibility.status;
        const engineForComparison = {
            ...engine,
            authoredExpectedMoveUci: moveToUci(position.fen, position.expectedMove),
            authoredAcceptedAlternativesUci: position.acceptedAlternatives.map((move) => moveToUci(position.fen, move))
        };
        const comparison = compareEvidence(position, engineForComparison, tablebase);
        acquisitionStatuses.set(position.positionId, cacheStatus);
        const packetBase = {
            packetSchemaVersion: REVIEW_PACKET_SCHEMA_VERSION,
            packetId: `caissa-review:${source.poolId}@${source.poolVersion}:${position.positionId}`,
            positionId: position.positionId,
            poolId: source.poolId,
            poolVersion: source.poolVersion,
            positionContentDigest: engine.positionContentDigest,
            authoredContent: {
                fen: position.fen, sideToMove: position.sideToMove, board: boardText(position.fen),
                currentObjective: position.objective, authoredExpectedMove: position.expectedMove,
                authoredExpectedMoveUci: engineForComparison.authoredExpectedMoveUci,
                acceptedAlternatives: position.acceptedAlternatives,
                acceptedAlternativesUci: engineForComparison.authoredAcceptedAlternativesUci,
                hints: position.hintStages, feedback: position.feedback
            },
            knowledgeProvenance: position.provenance,
            engineEvidenceSummary: {
                engine: engine.engineIdentity.engineName, policy: engine.analysisPolicy.policyId,
                classification: engine.resultClassification, bestMove: engine.bestMove,
                multiPv: engine.multiPv.map((line) => ({
                    move: line.principalVariation[0], score: line.score,
                    principalVariation: line.principalVariation
                })),
                engineEvidenceDigest: engine.evidenceDigest
            },
            tablebaseEligibility: eligibility,
            tablebaseEvidenceSummary: tablebase ? {
                status: 'retrieved', provider: tablebase.providerId, category: tablebase.category,
                dtz: tablebase.dtz ?? null, wdlPreservingMoves: tablebase.wdlPreservingMoves,
                dtzOptimalMoves: tablebase.dtzOptimalMoves,
                remoteEvidenceDigest: tablebase.evidenceDigest,
                localTablebaseVerified: false, humanReviewedRemoteEvidence: false
            } : { status: cacheStatus, remoteEvidenceDigest: null, localTablebaseVerified: false, humanReviewedRemoteEvidence: false },
            evidenceComparison: comparison,
            openQuestions: [
                'Does the authored move satisfy the intended pedagogical objective?',
                'Is the current uniqueness claim defensible?',
                'Should the position remain eligible for Quick Challenge?'
            ],
            allowedReviewDecisions: ALLOWED_REVIEW_DECISIONS,
            reviewTemplate: {
                reviewDecision: null, reviewRationale: null, reviewerReference: null, reviewRevision: null,
                reviewedPositionDigest: engine.positionContentDigest,
                reviewedEngineEvidenceDigest: engine.evidenceDigest,
                reviewedTablebaseEvidenceDigest: tablebase?.evidenceDigest || null
            }
        };
        const packet = { ...packetBase, packetDigest: sha256(packetBase) };
        packets.push(packet);
        if (!dryRun) {
            await writeJson(join(packetDirectory, `${position.positionId}.json`), packet);
            await writeFile(join(packetDirectory, `${position.positionId}.md`), packetMarkdown(packet), 'utf8');
        }
    }
    const indexBase = {
        packetIndexSchemaVersion: '1.0.0', poolId: source.poolId, poolVersion: source.poolVersion,
        provider: REMOTE_PROVIDER, generatedAt: now(),
        packets: packets.map((packet) => ({
            positionId: packet.positionId, packetId: packet.packetId, packetDigest: packet.packetDigest,
            path: `${packet.positionId}.json`, tablebaseStatus: packet.tablebaseEvidenceSummary.status,
            cacheStatus: acquisitionStatuses.get(packet.positionId)
        })),
        stats
    };
    const index = { ...indexBase, indexDigest: sha256(indexBase) };
    if (!dryRun) {
        await writeJson(join(packetDirectory, 'index.json'), index);
        await writeFile(summaryPath, summaryMarkdown(packets, index), 'utf8');
    }
    return { packets, index };
}

function packetMarkdown(packet) {
    const tablebase = packet.tablebaseEvidenceSummary;
    return `# Human chess review packet — ${packet.positionId}

Decision status: **UNRESOLVED — HUMAN INPUT REQUIRED**

## Position

\`\`\`
${packet.authoredContent.board}
\`\`\`

- FEN: \`${packet.authoredContent.fen}\`
- Side: ${packet.authoredContent.sideToMove}
- Objective: ${packet.authoredContent.currentObjective.type}
- Authored move: ${packet.authoredContent.authoredExpectedMove} (${packet.authoredContent.authoredExpectedMoveUci})
- Authored alternatives: ${packet.authoredContent.acceptedAlternatives.join(', ') || 'none'}

## Authored instruction

- Hint: ${packet.authoredContent.hints.map((hint) => hint.text).join(' / ')}
- Correct feedback: ${packet.authoredContent.feedback.correct}
- Incorrect feedback: ${packet.authoredContent.feedback.incorrect}
- Provenance: \`${packet.knowledgeProvenance.sourceReference}\`

## Machine evidence

- Stockfish: ${packet.engineEvidenceSummary.classification}; best move \`${packet.engineEvidenceSummary.bestMove}\`
- Tablebase: ${tablebase.status}; category ${tablebase.category || 'unavailable'}
- WDL-preserving moves: ${(tablebase.wdlPreservingMoves || []).map((move) => `\`${move}\``).join(', ') || 'unavailable'}
- DTZ-optimal moves: ${(tablebase.dtzOptimalMoves || []).map((move) => `\`${move}\``).join(', ') || 'unavailable'}
- Technical observation: ${packet.evidenceComparison.technicalClassification}

## Human question

${packet.openQuestions.map((question) => `- ${question}`).join('\n')}

## Reviewer input

Leave the JSON values empty until a real reviewer supplies the decision, rationale, stable private reference, revision, and confirms all three evidence digests.

- Position digest: \`${packet.positionContentDigest}\`
- Engine evidence digest: \`${packet.engineEvidenceSummary.engineEvidenceDigest}\`
- Remote evidence digest: \`${tablebase.remoteEvidenceDigest || 'unavailable'}\`
- Packet digest: \`${packet.packetDigest}\`
`;
}

function summaryMarkdown(packets, index) {
    return `# Season 10.5A Human Chess Review Packet Summary

Status: machine evidence prepared; no human decision is implied.

| Position | Authored claim | Stockfish | Remote tablebase | Technical observation | Human question |
|---|---|---|---|---|---|
${packets.map((packet) => `| ${packet.positionId} | ${packet.authoredContent.currentObjective.type}: ${packet.authoredContent.authoredExpectedMove} | ${packet.engineEvidenceSummary.classification}: ${packet.engineEvidenceSummary.bestMove} | ${packet.tablebaseEvidenceSummary.status}: ${packet.tablebaseEvidenceSummary.category || 'unavailable'} | ${packet.evidenceComparison.technicalClassification} | Decide pedagogical validity and publication disposition |`).join('\n')}

Network requests: ${index.stats.networkRequests}; cache hits: ${index.stats.cacheHits}; provider failures: ${index.stats.providerFailures}.

Each reviewer must complete \`reviewDecision\`, \`reviewRationale\`, \`reviewerReference\`,
\`reviewRevision\`, \`reviewedPositionDigest\`, \`reviewedEngineEvidenceDigest\`, and
\`reviewedTablebaseEvidenceDigest\`. Season 10.5B must reject missing or stale values.
`;
}

if (process.argv[1]?.endsWith('generate-endgame-review-packets.mjs')) {
    const result = await generatePackets();
    console.log(JSON.stringify(result.index, null, 2));
}
