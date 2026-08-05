(function (global) {
    'use strict';
    const ROUTE = '/play/beta/qa/promotion';
    const fixtures = Object.freeze([
        ['white-queen', 'White to Queen', 'white', 'a7', 'a8', 'q'],
        ['white-rook', 'White to Rook', 'white', 'a7', 'a8', 'r'],
        ['white-bishop', 'White to Bishop', 'white', 'a7', 'a8', 'b'],
        ['white-knight', 'White to Knight', 'white', 'a7', 'a8', 'n'],
        ['black-queen', 'Black to Queen', 'black', 'a2', 'a1', 'q'],
        ['black-rook', 'Black to Rook', 'black', 'a2', 'a1', 'r'],
        ['black-bishop', 'Black to Bishop', 'black', 'a2', 'a1', 'b'],
        ['black-knight', 'Black to Knight', 'black', 'a2', 'a1', 'n']
    ].map(([id, label, color, from, to, piece]) => Object.freeze({
        id, label, color, from, to, piece,
        position: color === 'white' ? '4k3/P7/8/8/8/8/8/4K3 w - - 0 1' : '4k3/8/8/8/8/8/p7/4K3 b - - 0 1'
    })));
    const exact = location => String(location?.pathname || '') === ROUTE
        && String(location?.search || '') === '' && String(location?.hash || '') === '';
    const api = {
        schemaVersion: '1.0.0', contractId: 'PlayV2PhysicalPromotionQAPolicy@1.0.0',
        canonicalRoute: ROUTE, publicNavigation: 'prohibited', persistence: 'prohibited',
        arbitraryPositionInput: 'prohibited', failureMode: 'fail-closed',
        ownerRuntime: 'Games', legalAuthority: 'chess.js', boardOwner: 'BoardAdapter',
        promotionOwner: 'Play promotion modal', lifecycleOwner: 'GameLifecycle and ClockService',
        recordOwner: 'GameRecord and PostGame',
        isAuthorizedLocation: exact,
        listCases: () => fixtures.map(({ position, ...item }) => Object.freeze({ ...item })),
        resolveCase: id => fixtures.find(item => item.id === id) || null
    };
    global.CaissaPlayV2PhysicalPromotionQAPolicy = Object.freeze(api);
})(window);
