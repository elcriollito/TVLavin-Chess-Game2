import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
    PLAY_RESPONSIVE_PROFILES, PLAY_RESPONSIVE_PROFILE_VERSION,
    REQUIRED_CROSS_BROWSER_PROFILE_IDS, profilesForBrowser
} from '../browser/fixtures/play-responsive-profiles.js';
import {
    isSquare, rectHasSize, rectWithinParent, rectWithinViewport, validateTolerance
} from '../browser/helpers/play-responsive-geometry.js';

test('responsive profiles have a versioned immutable schema and unique fixed dimensions', () => {
    assert.match(PLAY_RESPONSIVE_PROFILE_VERSION, /^\d+\.\d+\.\d+$/);
    assert(Object.isFrozen(PLAY_RESPONSIVE_PROFILES));
    assert.equal(new Set(PLAY_RESPONSIVE_PROFILES.map(profile => profile.profileId)).size, PLAY_RESPONSIVE_PROFILES.length);
    for (const profile of PLAY_RESPONSIVE_PROFILES) {
        assert.match(profile.profileId, /^[a-z0-9-]+$/);
        assert(Number.isInteger(profile.width) && profile.width >= 320);
        assert(Number.isInteger(profile.height) && profile.height >= 375);
        assert(['portrait', 'landscape'].includes(profile.orientation));
        assert.equal(profile.orientation, profile.height >= profile.width ? 'portrait' : 'landscape');
        assert(Object.isFrozen(profile));
        assert(Object.isFrozen(profile.surfaces));
    }
});

test('browser selection gives Chromium the full catalog and other engines the required representatives', () => {
    assert.equal(profilesForBrowser('chromium').length, PLAY_RESPONSIVE_PROFILES.length);
    for (const browserName of ['firefox', 'webkit']) {
        assert.deepEqual(profilesForBrowser(browserName).map(profile => profile.profileId), REQUIRED_CROSS_BROWSER_PROFILE_IDS);
    }
});

test('geometry predicates enforce nonzero size, clipping, viewport, square, and narrow tolerances', () => {
    const rect = { left: 0, right: 100, top: 0, bottom: 100, width: 100, height: 100 };
    const parent = { left: -1, right: 101, top: 0, bottom: 100, width: 102, height: 100 };
    assert(rectHasSize(rect));
    assert(rectWithinViewport(rect, { width: 100, height: 100 }));
    assert(rectWithinParent(rect, parent));
    assert(isSquare(rect));
    assert(!isSquare({ ...rect, height: 97 }));
    assert.throws(() => validateTolerance(5), RangeError);
    assert.throws(() => validateTolerance(-1), RangeError);
});

test('responsive fixtures and helpers do not leak into production entry points', () => {
    for (const file of ['index.html', 'app.js', 'js/play/simplified-play-shell.js']) {
        const source = fs.readFileSync(new URL(`../../${file}`, import.meta.url), 'utf8');
        assert(!source.includes('play-responsive-profiles'));
        assert(!source.includes('play-responsive-geometry'));
    }
});
