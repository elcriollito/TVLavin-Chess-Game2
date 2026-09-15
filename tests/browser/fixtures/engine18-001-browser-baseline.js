export const ENGINE18_001_BROWSER_BASELINE = Object.freeze({
    contractId: 'ENGINE18-001',
    originMainSha: '197d5e26ec408a6ffdc97078724f2c4f3c07fdac',
    profiles: Object.freeze({
        desktopChromium: Object.freeze({ viewport: Object.freeze({ width: 1440, height: 1000 }),
            isMobile: false, hasTouch: false }),
        mobileEmulatedChromium: Object.freeze({ viewport: Object.freeze({ width: 390, height: 844 }),
            isMobile: true, hasTouch: true,
            userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148' })
    }),
    routes: Object.freeze({
        play: Object.freeze({ route: '/play', mode: 'games', panel: '[data-caissa-games-panel]',
            directRegions: Object.freeze(['head', 'body', 'foot']) }),
        bots: Object.freeze({ route: '/play/bots', mode: 'bots', panel: '[data-caissa-bots-panel]',
            directRegions: Object.freeze(['head', 'body', 'foot']) }),
        coach: Object.freeze({ route: '/play/coach', mode: 'coach', panel: '[data-caissa-native-coach-panel]',
            directRegions: Object.freeze(['head', 'body', 'foot']) })
    }),
    expectedTabLabels: Object.freeze(['Play Game', 'Play Bots', 'Play Coach']),
    performanceBudgetsMs: Object.freeze({
        startup: 10000,
        uciok: 10000,
        readyok: 10000,
        firstDepth4Result: 10000,
        repeatedDepth4Result: 10000,
        routeTransition: 5000,
        coachReviewHandoff: 15000
    }),
    measuredAt: '2026-09-14T22:30:00.000Z',
    measurements: Object.freeze({
        dom: Object.freeze({
            desktopChromium: Object.freeze({
                play: Object.freeze({ layout: 'desktop-split', directRegions: Object.freeze(['head', 'body', 'foot']),
                    boxes: Object.freeze({ shell: [232, 40, 1208, 901], board: [287.3, 149, 731, 731],
                        tabs: [1039.69, 104, 380, 64.5], panel: [1050.69, 193.89, 358, 720.11],
                        head: [1050.69, 193.89, 358, 142], body: [1050.69, 344.98, 358, 505.83],
                        foot: [1050.69, 859.91, 358, 54.09] }) }),
                bots: Object.freeze({ layout: 'desktop-split', directRegions: Object.freeze(['head', 'body', 'foot']),
                    boxes: Object.freeze({ shell: [232, 40, 1208, 901], board: [287.3, 149, 731, 731],
                        tabs: [1039.69, 104, 380, 64.5], panel: [1050.69, 176.5, 358, 737.5],
                        head: [1050.69, 176.5, 358, 150], body: [1050.69, 335.59, 358, 491.44],
                        foot: [1050.69, 836.13, 358, 77.88] }) }),
                coach: Object.freeze({ layout: 'desktop-split', directRegions: Object.freeze(['head', 'body', 'foot']),
                    footPosition: 'static', footCount: 1,
                    boxes: Object.freeze({ shell: [232, 40, 1208, 901], board: [287.3, 149, 731, 731],
                        tabs: [1039.69, 104, 380, 64.5], panel: [1050.69, 183.89, 358, 730.11],
                        head: [1050.69, 183.89, 358, 142], body: [1050.69, 334.98, 358, 515.83],
                        foot: [1050.69, 859.91, 358, 54.09] }) })
            }),
            mobileEmulatedChromium: Object.freeze({
                play: Object.freeze({ layout: 'phone-standard', directRegions: Object.freeze(['head', 'body', 'foot']),
                    boxes: Object.freeze({ shell: [0, 24, 390, 1258.5], board: [33, 69, 350, 350],
                        tabs: [6, 466, 378, 64.5], panel: [17, 549.5, 356, 700],
                        head: [17, 549.5, 356, 112], body: [17, 670.59, 356, 515.72],
                        foot: [17, 1195.41, 356, 54.09] }) }),
                bots: Object.freeze({ layout: 'phone-standard', directRegions: Object.freeze(['head', 'body', 'foot']),
                    boxes: Object.freeze({ shell: [0, 24, 390, 1125.5], board: [33, 69, 350, 350],
                        tabs: [6, 465, 378, 64.5], panel: [17, 537.5, 356, 581],
                        head: [17, 537.5, 356, 112], body: [17, 658.59, 356, 372.94],
                        foot: [17, 1040.63, 356, 77.88] }) }),
                coach: Object.freeze({ layout: 'phone-standard', directRegions: Object.freeze(['head', 'body', 'foot']),
                    footPosition: 'fixed', footCount: 2,
                    boxes: Object.freeze({ shell: [0, 0, 390, 945.34], board: [33, 13, 350, 350],
                        tabs: [4, 786, 382, 58], panel: [13, 385, 364, 477.34],
                        head: [13, 385, 364, 84.94], body: [13, 474.41, 364, 387.94],
                        foot: [4, 786, 382, 58] }) })
            })
        }),
        performance: Object.freeze({
            desktopChromium: Object.freeze({
                play: Object.freeze({ uciokMs: 177.2, readyokMs: 178.1, startupMs: 178.5,
                    resultMs: Object.freeze([39.1, 19.8, 9.4]), bestMoves: Object.freeze(['d2d4', 'b1c3', 'f7g7']) }),
                coach: Object.freeze({ uciokMs: 174.7, readyokMs: 175.1, startupMs: 175.5,
                    resultMs: Object.freeze([35, 20.1, 10.4]), bestMoves: Object.freeze(['d2d4', 'b1c3', 'f7g7']) })
            }),
            mobileEmulatedChromium: Object.freeze({
                play: Object.freeze({ uciokMs: 183.2, readyokMs: 183.7, startupMs: 184.1,
                    resultMs: Object.freeze([36.1, 21.3, 10.6]), bestMoves: Object.freeze(['d2d4', 'b1c3', 'f7g7']) }),
                coach: Object.freeze({ uciokMs: 179.1, readyokMs: 179.6, startupMs: 179.9,
                    resultMs: Object.freeze([35.5, 20.1, 9.1]), bestMoves: Object.freeze(['d2d4', 'b1c3', 'f7g7']) })
            })
        }),
        playStrengths: Object.freeze({
            canonicalFen: '7k/5Q2/6K1/8/8/8/8/8 w - - 0 1',
            samples: Object.freeze([
                Object.freeze({ target: 250, depth: 1, movetimeMs: null, multiPv: 1, bestMove: 'f7g7', sampleElapsedMs: 23.8 }),
                Object.freeze({ target: 500, depth: 2, movetimeMs: null, multiPv: 1, bestMove: 'f7g7', sampleElapsedMs: 4.9 }),
                Object.freeze({ target: 800, depth: 3, movetimeMs: null, multiPv: 1, bestMove: 'f7g7', sampleElapsedMs: 8.1 }),
                Object.freeze({ target: 1200, depth: 5, movetimeMs: null, multiPv: 1, bestMove: 'f7g7', sampleElapsedMs: 14.5 }),
                Object.freeze({ target: 1600, depth: 8, movetimeMs: null, multiPv: 1, bestMove: 'f7g7', sampleElapsedMs: 27.5 }),
                Object.freeze({ target: 2000, depth: 12, movetimeMs: null, multiPv: 1, bestMove: 'f7g7', sampleElapsedMs: 47.3 }),
                Object.freeze({ target: 2400, depth: 16, movetimeMs: null, multiPv: 1, bestMove: 'f7g7', sampleElapsedMs: 67.6 }),
                Object.freeze({ target: 2800, depth: 20, movetimeMs: null, multiPv: 1, bestMove: 'f7g7', sampleElapsedMs: 85.9 }),
                Object.freeze({ target: 3200, depth: null, movetimeMs: 2000, multiPv: 1, bestMove: 'f7g7', sampleElapsedMs: 656.4 })
            ])
        }),
        handoff: Object.freeze({
            desktopChromium: Object.freeze({ routeTransitionMs: 161, coachReviewHandoffMs: 164.3,
                maximumWorkers: 1 }),
            mobileEmulatedChromium: Object.freeze({ routeTransitionMs: 152, coachReviewHandoffMs: 167.3,
                maximumWorkers: 1 })
        })
    })
});
