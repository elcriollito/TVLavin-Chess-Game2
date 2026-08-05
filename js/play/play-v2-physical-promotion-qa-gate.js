export const PLAY_V2_PHYSICAL_QA_ENV = 'CAISSA_PLAY_V2_PHYSICAL_QA';

export const PLAY_V2_PHYSICAL_PROMOTION_QA = Object.freeze({
    contractId: 'PlayV2PhysicalPromotionQAPolicy@1.0.0',
    canonicalRoute: '/play/beta/qa/promotion',
    entryDocument: 'play-v2-promotion-qa.html',
    requiredStage: 'internal',
    requiredCapability: 'promotion',
    failureMode: 'fail-closed'
});

export function resolvePlayV2PhysicalPromotionQA(pathname, search, environment = {}) {
    const exactPath = String(pathname || '') === PLAY_V2_PHYSICAL_PROMOTION_QA.canonicalRoute;
    const directDocument = String(pathname || '') === `/${PLAY_V2_PHYSICAL_PROMOTION_QA.entryDocument}`;
    const requested = exactPath || directDocument
        || String(pathname || '').startsWith(`${PLAY_V2_PHYSICAL_PROMOTION_QA.canonicalRoute}/`);
    if (!requested) return Object.freeze({ requested: false, authorized: false, document: null });
    const authorized = !directDocument && exactPath && String(search || '') === ''
        && environment.CAISSA_PLAY_V2_BETA_STAGE === PLAY_V2_PHYSICAL_PROMOTION_QA.requiredStage
        && environment[PLAY_V2_PHYSICAL_QA_ENV] === PLAY_V2_PHYSICAL_PROMOTION_QA.requiredCapability;
    return Object.freeze({
        requested: true,
        authorized,
        document: authorized ? PLAY_V2_PHYSICAL_PROMOTION_QA.entryDocument : 'play-v2-unavailable.html',
        reasonCode: authorized ? 'PHYSICAL_PROMOTION_QA_ALLOWED' : 'PHYSICAL_PROMOTION_QA_PROHIBITED'
    });
}
