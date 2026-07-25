const common = {
  itemSchemaVersion: '1.0.0',
  authoredStatus: 'verified',
  attemptPolicy: { maximumAttempts: 3, firstAttemptIndependent: true },
  hintPolicy: { staged: true, finalAnswerBeforeSubmission: false },
  retryPolicy: 'reset-source-context'
};

const feedback = (concept) => ({
  correct: `Correct. This response applies ${concept} in the released position.`,
  guided: `Correct with support. This counts as guided practice for ${concept}.`,
  unsuccessful: `That response does not apply ${concept} in this position.`,
  invalid: 'That response is not valid for this activity.',
  misconception: `That response matches a common misconception about ${concept}.`,
  retry: 'Return to the original position and compare the authored alternatives again.'
});

const evidence = ({ assessment = false, transfer = false, misconceptionId = null } = {}) => ({
  independentSuccess: transfer ? 'transfer-success' : assessment ? 'assessment-success' : 'independent-success',
  guidedSuccess: 'guided-success',
  unsuccessful: assessment ? 'assessment-unsuccessful-event' : 'remediation-needed-after-two-unsuccessful',
  misconception: misconceptionId ? { evidenceType: 'misconception', misconceptionId } : null,
  reviewResolution: {
    triggerTypes: assessment
      ? ['assessment-not-yet-attempted', 'assessment-unsuccessful']
      : ['guided-success-without-independent-success', 'repeated-final-hint-dependence'],
    requires: transfer ? 'independent-transfer-success' : assessment ? 'assessment-success' : 'independent-success'
  }
});

const move = ({
  id, source, title, instruction, objective, positionId, expected, alternatives = [],
  concept, transfer = false
}) => ({
  ...common, id, sourceLearningObjectId: source, activityType: 'independent-practice',
  title, instruction, objective, responseType: 'exact-move', positionId, transfer,
  answer: {
    evaluatorType: 'authored-san-exact-v2', expected, acceptedAlternatives: alternatives,
    rejectionRules: ['illegal-move', 'unsupported-legal-move'], misconceptionMappings: []
  },
  feedback: feedback(concept), evidence: evidence({ transfer })
});

const choice = ({
  id, source, title, instruction, objective, positionId, responseType = 'single-choice',
  correctId, correctLabel, misconceptionId, misconceptionLabel, concept, transfer = false,
  activityType = 'assessment'
}) => ({
  ...common, id, sourceLearningObjectId: source, activityType,
  title, instruction, objective, responseType, positionId, transfer,
  answer: {
    evaluatorType: responseType === 'plan-choice' ? 'authored-plan-choice-v1' : 'authored-single-choice-v1',
    expected: correctId, acceptedAlternatives: [], rejectionRules: ['unknown-choice-id'],
    choices: [
      { id: correctId, label: correctLabel },
      { id: `choice:${id.split(':').slice(1).join(':')}:misconception`, label: misconceptionLabel, misconceptionId }
    ],
    misconceptionMappings: [{
      responseId: `choice:${id.split(':').slice(1).join(':')}:misconception`,
      misconceptionId,
      sourceMisconceptionIndex: 0,
      explanation: `This choice expresses the authored misconception: ${misconceptionLabel}`,
      resolutionActivityId: id
    }]
  },
  feedback: feedback(concept), evidence: evidence({ assessment: activityType === 'assessment', transfer, misconceptionId })
});

export const EVALUABLE_ENDGAME_ACTIVITIES = Object.freeze({
  'ku:endgames:pawn-foundations:rule-of-the-square': [
    choice({
      id: 'activity:rule-square:independent-boundary', source: 'check:identify-boundary',
      title: 'Apply the pawn square', instruction: 'Choose the correct use of the square in this position.',
      objective: 'Decide whether the king route reaches the pawn square in time.',
      positionId: 'pos:rule-square:a-pawn-white-king-outside', correctId: 'choice:rule-square:count-after-move',
      correctLabel: 'Count the shortest king route after accounting for the side to move.',
      misconceptionId: 'misconception:rule-square:automatic-verdict',
      misconceptionLabel: 'Treat the square as an automatic verdict regardless of move order.',
      concept: 'pawn-square geometry', transfer: true, activityType: 'independent-practice'
    }),
    choice({
      id: 'activity:rule-square:assessment-limits', source: 'check:identify-boundary',
      title: 'Assess the square rule boundary', instruction: 'Select the statement that keeps the rule within its valid boundary.',
      objective: 'Recognize when extra tactical or blocking features require calculation.',
      positionId: 'pos:rule-square:a-pawn-white-king-outside', correctId: 'choice:rule-square:bounded-test',
      correctLabel: 'Use the square as a race test, then check moves that alter the path.',
      misconceptionId: 'misconception:rule-square:automatic-verdict',
      misconceptionLabel: 'The square alone proves the final result in every pawn race.',
      concept: 'the boundary of the pawn square'
    })
  ],
  'ku:endgames:pawn-foundations:activate-the-king': [
    move({
      id: 'activity:activate-king:independent-transfer', source: 'exercise:activate-king:king-or-pawn',
      title: 'Choose a safe king approach', instruction: 'Play a king-improving move before spending the pawn tempo.',
      objective: 'Activate the king while retaining the pawn move.',
      positionId: 'pos:activate-king:transfer-flank', expected: 'Kf3', alternatives: ['Ke2'],
      concept: 'purposeful king activation'
    }),
    choice({
      id: 'activity:activate-king:assessment-plan', source: 'assessment:activate-king:varied-five',
      title: 'Assess the activation plan', instruction: 'Choose the plan that checks threats before committing the pawn.',
      objective: 'Distinguish purposeful king activity from automatic centralization.',
      positionId: 'pos:activate-king:central-route', responseType: 'plan-choice',
      correctId: 'plan:activate-king:improve-with-check', correctLabel: 'Improve the king while preserving both pawn advances.',
      misconceptionId: 'misconception:activate-king:center-without-check',
      misconceptionLabel: 'Walk toward the center without checking the concrete pawn race.',
      concept: 'purposeful king activation'
    })
  ],
  'ku:endgames:pawn-foundations:direct-opposition': [
    move({
      id: 'activity:opposition:independent-near-miss', source: 'exercise:opposition:near-miss',
      title: 'Convert a near-miss', instruction: 'Play the move that approaches a direct king relationship.',
      objective: 'Distinguish diagonal geometry from direct opposition.',
      positionId: 'pos:direct-opposition:near-miss', expected: 'Ke4', concept: 'direct opposition'
    }),
    choice({
      id: 'activity:opposition:assessment-geometry', source: 'assessment:opposition:mixed-turn-five',
      title: 'Assess opposition geometry', instruction: 'Classify the starting king relationship.',
      objective: 'Recognize the exact geometry required for direct opposition.',
      positionId: 'pos:direct-opposition:near-miss', correctId: 'choice:opposition:diagonal-near-miss',
      correctLabel: 'This is a diagonal near-miss, not direct opposition.',
      misconceptionId: 'misconception:opposition:any-facing-kings',
      misconceptionLabel: 'Any kings facing one another hold direct opposition.',
      concept: 'direct-opposition geometry'
    })
  ],
  'ku:endgames:pawn-foundations:key-squares': [
    move({
      id: 'activity:key-squares:independent-target', source: 'exercise:key-squares:contrast',
      title: 'Approach the target square', instruction: 'Play the move that pursues the relevant target.',
      objective: 'Use opposition only when it advances the target-square route.',
      positionId: 'pos:key-squares:opposition-contrast', expected: 'Kc5', concept: 'target-square planning'
    }),
    choice({
      id: 'activity:key-squares:assessment-plan', source: 'assessment:key-squares:four-of-five',
      title: 'Assess the king destination', instruction: 'Choose the plan that names a destination before a technique.',
      objective: 'Separate key-square goals from temporary opposition geometry.',
      positionId: 'pos:key-squares:central-pawn-route', responseType: 'plan-choice',
      correctId: 'plan:key-squares:target-first', correctLabel: 'Identify the target, then calculate a route toward it.',
      misconceptionId: 'misconception:key-squares:opposition-is-goal',
      misconceptionLabel: 'Pursue opposition even when it does not lead to a target square.',
      concept: 'target-square planning'
    })
  ],
  'ku:endgames:pawn-foundations:convert-with-king-support': [
    move({
      id: 'activity:king-support:independent-transfer', source: 'exercise:king-support:move-order',
      title: 'Coordinate king and pawn', instruction: 'Play the king move that preserves support against side entry.',
      objective: 'Keep the king connected to the pawn while improving access.',
      positionId: 'pos:king-support:transfer-side-entry', expected: 'Kd5', concept: 'king-pawn coordination'
    }),
    choice({
      id: 'activity:king-support:assessment-order', source: 'assessment:king-support:four-of-five',
      title: 'Assess the conversion order', instruction: 'Choose the correct division of labor between king and pawn.',
      objective: 'Coordinate the king route before an irreversible pawn push.',
      positionId: 'pos:king-support:central-coordination', responseType: 'plan-choice',
      correctId: 'plan:king-support:king-route-first', correctLabel: 'Improve king access, then advance when support remains.',
      misconceptionId: 'misconception:king-support:push-automatically',
      misconceptionLabel: 'Push the passed pawn automatically before securing king entry.',
      concept: 'king-pawn coordination'
    })
  ],
  'ku:endgames:pawn-transformations:reserve-tempo': [
    move({
      id: 'activity:reserve-tempo:independent-spent', source: 'exercise:reserve-tempo:spent',
      title: 'Play without the stored tempo', instruction: 'Play the move required after the wing tempo has already been spent.',
      objective: 'Recognize the move-order consequence of a spent reserve tempo.',
      positionId: 'pos:reserve-tempo:already-spent', expected: 'Kxe4', concept: 'reserve-tempo timing'
    }),
    choice({
      id: 'activity:reserve-tempo:assessment-resource', source: 'assessment:reserve-tempo:four-of-five',
      title: 'Assess the waiting resource', instruction: 'Choose the condition that makes a pawn move a reserve tempo.',
      objective: 'Distinguish a useful waiting move from an irreversible concession.',
      positionId: 'pos:reserve-tempo:waiting-move', correctId: 'choice:reserve-tempo:preserves-structure',
      correctLabel: 'It transfers the move while preserving the central structure.',
      misconceptionId: 'misconception:reserve-tempo:any-pawn-move',
      misconceptionLabel: 'Every legal pawn move is automatically a reserve tempo.',
      concept: 'reserve-tempo timing'
    })
  ],
  'ku:endgames:pawn-transformations:protected-passed-pawn': [
    move({
      id: 'activity:protected-passer:independent-base', source: 'exercise:protected-passer:base',
      title: 'Attack the support base', instruction: 'Play the move that exposes the boundary of the protected-passer heuristic.',
      objective: 'Test the support base before assuming the passer is stable.',
      positionId: 'pos:protected-passer:attackable-base', expected: 'Kxe4',
      concept: 'protected-passer stability', transfer: true
    }),
    choice({
      id: 'activity:protected-passer:assessment-plan', source: 'assessment:protected-passer:four-of-five',
      title: 'Assess the protected passer', instruction: 'Choose the plan that respects the support base.',
      objective: 'Evaluate restriction and support rather than assuming an automatic win.',
      positionId: 'pos:protected-passer:restriction-anchor', responseType: 'plan-choice',
      correctId: 'plan:protected-passer:improve-king', correctLabel: 'Improve the king while preserving the support chain.',
      misconceptionId: 'misconception:protected-passer:automatic-win',
      misconceptionLabel: 'Push immediately because every protected passer wins.',
      concept: 'protected-passer stability'
    })
  ],
  'ku:endgames:pawn-transformations:outside-passed-pawn': [
    move({
      id: 'activity:outside-passer:independent-return', source: 'exercise:outside-passer:return',
      title: 'Test the diversion', instruction: 'Play the candidate push before calculating the defender’s return.',
      objective: 'Evaluate the outside passer through chase-and-return geometry.',
      positionId: 'pos:outside-passer:defender-returns', expected: 'a5', concept: 'outside-passer diversion'
    }),
    choice({
      id: 'activity:outside-passer:assessment-return', source: 'assessment:outside-passer:three-of-four',
      title: 'Assess the outside passer', instruction: 'Choose the calculation required before calling the diversion successful.',
      objective: 'Include both the chase and the return route.',
      positionId: 'pos:outside-passer:defender-returns', correctId: 'choice:outside-passer:chase-return',
      correctLabel: 'Count the chase, capture, return, and opposite-wing entry.',
      misconceptionId: 'misconception:outside-passer:automatic-win',
      misconceptionLabel: 'A remote passer wins automatically because it is far from the center.',
      concept: 'outside-passer diversion'
    })
  ],
  'ku:endgames:pawn-transformations:pawn-breakthrough': [
    move({
      id: 'activity:pawn-breakthrough:independent-turn', source: 'exercise:pawn-breakthrough:side-to-move',
      title: 'Respect the side to move', instruction: 'Play the move that changes the contact before White’s pattern can begin.',
      objective: 'Recalculate the breakthrough when the side to move changes.',
      positionId: 'pos:pawn-breakthrough:black-to-move-near-miss', expected: 'b6', concept: 'breakthrough move order'
    }),
    choice({
      id: 'activity:pawn-breakthrough:assessment-truth', source: 'assessment:pawn-breakthrough:three-of-four',
      title: 'Assess the sacrifice', instruction: 'Choose what must remain after a genuine breakthrough.',
      objective: 'Separate a forcing breakthrough from a hopeful sacrifice.',
      positionId: 'pos:pawn-breakthrough:three-versus-three', correctId: 'choice:pawn-breakthrough:surviving-passer',
      correctLabel: 'A forced surviving passer after the capture sequence.',
      misconceptionId: 'misconception:pawn-breakthrough:any-sacrifice',
      misconceptionLabel: 'Any pawn sacrifice in a blocked chain is a breakthrough.',
      concept: 'breakthrough verification'
    })
  ],
  'ku:endgames:pawn-weaknesses:pawn-majority': [
    move({
      id: 'activity:pawn-majority:independent-blocked', source: 'exercise:pawn-majority:blocked',
      title: 'Improve before mobilizing', instruction: 'Play the king-improving move instead of forcing the blocked majority.',
      objective: 'Recognize when a numerical majority is not yet usable.',
      positionId: 'pos:pawn-majority:blocked-near-miss', expected: 'Kf3',
      concept: 'majority mobilization', transfer: true
    }),
    choice({
      id: 'activity:pawn-majority:assessment-plan', source: 'assessment:pawn-majority:three-of-four',
      title: 'Assess the majority plan', instruction: 'Choose the plan for a blocked numerical majority.',
      objective: 'Test mobility and exchanges before advancing.',
      positionId: 'pos:pawn-majority:blocked-near-miss', responseType: 'plan-choice',
      correctId: 'plan:pawn-majority:improve-first', correctLabel: 'Improve king support and identify the candidate before pushing.',
      misconceptionId: 'misconception:pawn-majority:number-is-enough',
      misconceptionLabel: 'Push immediately because a numerical majority always creates a passer.',
      concept: 'majority mobilization'
    })
  ],
  'ku:endgames:pawn-weaknesses:fix-pawn-weakness': [
    move({
      id: 'activity:fix-weakness:independent-route', source: 'exercise:fix-weakness:approach',
      title: 'Approach under restraint', instruction: 'Play a king route that keeps the pawn fixed.',
      objective: 'Approach the target without releasing its advance.',
      positionId: 'pos:fix-weakness:restrained-target', expected: 'Kb4', alternatives: ['Kb3'],
      concept: 'fixing before attacking'
    }),
    choice({
      id: 'activity:fix-weakness:assessment-classify', source: 'assessment:fix-weakness:three-of-four',
      title: 'Assess whether the target is fixed', instruction: 'Classify the pawn before planning an attack.',
      objective: 'Distinguish a fixed weakness from a temporary target.',
      positionId: 'pos:fix-weakness:escape-available', correctId: 'choice:fix-weakness:temporary',
      correctLabel: 'The pawn is temporary because it can advance safely.',
      misconceptionId: 'misconception:fix-weakness:exposed-is-fixed',
      misconceptionLabel: 'The pawn is fixed merely because it currently looks exposed.',
      concept: 'fixing before attacking'
    })
  ],
  'ku:endgames:pawn-weaknesses:isolated-pawn': [
    move({
      id: 'activity:isolated-pawn:independent-active', source: 'exercise:isolated-pawn:activity',
      title: 'Use the isolated pawn actively', instruction: 'Play the active pawn resource before accepting a static attack.',
      objective: 'Recognize activity that compensates for isolation.',
      positionId: 'pos:isolated-pawn:active-counterplay', expected: 'e4+', concept: 'isolated-pawn activity'
    }),
    choice({
      id: 'activity:isolated-pawn:assessment-value', source: 'assessment:isolated-pawn:three-of-four',
      title: 'Assess the isolated pawn', instruction: 'Choose the bounded evaluation of the pawn.',
      objective: 'Separate structural isolation from a final result claim.',
      positionId: 'pos:isolated-pawn:active-counterplay', correctId: 'choice:isolated-pawn:activity-matters',
      correctLabel: 'The pawn is isolated, but active counterplay must still be calculated.',
      misconceptionId: 'misconception:isolated-pawn:automatically-lost',
      misconceptionLabel: 'Every isolated pawn is automatically lost.',
      concept: 'isolated-pawn activity'
    })
  ],
  'ku:endgames:pawn-weaknesses:backward-pawn': [
    move({
      id: 'activity:backward-pawn:independent-break', source: 'exercise:backward-pawn:fix-or-transform',
      title: 'Find the liberating break', instruction: 'Play the move that transforms the alleged backward weakness.',
      objective: 'Check whether a safe break makes backwardness temporary.',
      positionId: 'pos:backward-pawn:liberating-break', expected: 'c4', concept: 'backward-pawn transformation'
    }),
    choice({
      id: 'activity:backward-pawn:assessment-status', source: 'assessment:backward-pawn:three-of-four',
      title: 'Assess backwardness', instruction: 'Choose the classification that accounts for the freeing break.',
      objective: 'Distinguish permanent restraint from temporary backwardness.',
      positionId: 'pos:backward-pawn:liberating-break', correctId: 'choice:backward-pawn:temporary',
      correctLabel: 'The safe c-pawn break can transform the structure.',
      misconceptionId: 'misconception:backward-pawn:permanent',
      misconceptionLabel: 'A pawn behind its neighbor is permanently backward.',
      concept: 'backward-pawn transformation'
    })
  ],
  'ku:endgames:pawn-exchanges:pawn-tension': [
    move({
      id: 'activity:pawn-tension:independent-clarify', source: 'exercise:pawn-tension:clarify',
      title: 'Clarify at the right moment', instruction: 'Play the capture that prevents passive waiting.',
      objective: 'Recognize when preserving tension loses access.',
      positionId: 'pos:pawn-tension:clarify-now', expected: 'dxe5+', concept: 'pawn-tension timing'
    }),
    choice({
      id: 'activity:pawn-tension:assessment-plan', source: 'assessment:pawn-tension:three-of-four',
      title: 'Assess the tension decision', instruction: 'Choose the plan justified by the current king geometry.',
      objective: 'Distinguish useful tension from passive waiting.',
      positionId: 'pos:pawn-tension:clarify-now', responseType: 'plan-choice',
      correctId: 'plan:pawn-tension:clarify-now', correctLabel: 'Clarify now before the opposing king improves.',
      misconceptionId: 'misconception:pawn-tension:always-preserve',
      misconceptionLabel: 'Always preserve tension because unresolved contact is automatically useful.',
      concept: 'pawn-tension timing'
    })
  ],
  'ku:endgames:pawn-exchanges:exchange-into-passer': [
    move({
      id: 'activity:exchange-passer:independent-enemy', source: 'exercise:exchange-passer:enemy',
      title: 'Respect the opponent’s capture', instruction: 'Play the transforming capture available to the side to move.',
      objective: 'Reconstruct the pawn race after the opponent captures first.',
      positionId: 'pos:exchange-passer:enemy-race', expected: 'exd4+', concept: 'capture-order reconstruction'
    }),
    choice({
      id: 'activity:exchange-passer:assessment-race', source: 'assessment:exchange-passer:three-of-four',
      title: 'Assess the resulting passer', instruction: 'Choose what must be calculated after the exchange.',
      objective: 'Evaluate both resulting passers and the move order.',
      positionId: 'pos:exchange-passer:enemy-race', correctId: 'choice:exchange-passer:both-races',
      correctLabel: 'Rebuild the position and calculate both passers from the actual side to move.',
      misconceptionId: 'misconception:exchange-passer:any-passer-good',
      misconceptionLabel: 'Any exchange that creates your passer is automatically favorable.',
      concept: 'capture-order reconstruction'
    })
  ],
  'ku:endgames:pawn-exchanges:second-distant-target': [
    move({
      id: 'activity:second-target:independent-shared-route', source: 'exercise:second-target:false',
      title: 'Use the shared route', instruction: 'Play the central king move that continues to cover both nearby targets.',
      objective: 'Recognize a false second target.',
      positionId: 'pos:second-target:single-route', expected: 'Kd4', concept: 'divided-defense geometry'
    }),
    choice({
      id: 'activity:second-target:assessment-genuine', source: 'assessment:second-target:three-of-four',
      title: 'Assess the second target', instruction: 'Choose the condition that makes the second target genuine.',
      objective: 'Test whether one king route can cover both targets.',
      positionId: 'pos:second-target:single-route', correctId: 'choice:second-target:shared-route',
      correctLabel: 'This is not a genuine second target because one central route covers both.',
      misconceptionId: 'misconception:second-target:any-two-weaknesses',
      misconceptionLabel: 'Any two weaknesses automatically overload the defending king.',
      concept: 'divided-defense geometry'
    })
  ],
  'ku:endgames:pawn-exchanges:favorable-king-ending': [
    move({
      id: 'activity:favorable-ending:independent-recalculate', source: 'exercise:favorable-ending:reject',
      title: 'Recalculate the exchange', instruction: 'Play the candidate capture, then evaluate the changed king access.',
      objective: 'Judge simplification from the resulting position, not pawn count.',
      positionId: 'pos:favorable-ending:advantage-disappears', expected: 'cxd5',
      concept: 'favorable simplification', transfer: true
    }),
    choice({
      id: 'activity:favorable-ending:assessment-plan', source: 'assessment:favorable-ending:three-of-four',
      title: 'Assess the simplification', instruction: 'Choose the correct evaluation process before trading.',
      objective: 'Recalculate king access, targets, tempi, and races.',
      positionId: 'pos:favorable-ending:advantage-disappears', responseType: 'plan-choice',
      correctId: 'plan:favorable-ending:feature-ledger', correctLabel: 'Compare every changed feature in the resulting pawn ending.',
      misconceptionId: 'misconception:favorable-ending:fewer-is-easier',
      misconceptionLabel: 'Trade automatically because fewer pawns always make conversion easier.',
      concept: 'favorable simplification'
    })
  ]
});

export function activityItemsFor(unitId) {
  return structuredClone(EVALUABLE_ENDGAME_ACTIVITIES[unitId] ?? []);
}
