const freezeProfile = profile => Object.freeze({
    ...profile,
    surfaces: Object.freeze([...profile.surfaces])
});

export const PLAY_RESPONSIVE_PROFILE_VERSION = '1.0.0';

export const PLAY_RESPONSIVE_PROFILES = Object.freeze([
    freezeProfile({ profileId: 'mobile-320x568', width: 320, height: 568, orientation: 'portrait', scale: 1, zoomEquivalent: false, expectedLayout: 'phone-compact', surfaces: ['shell', 'games'] }),
    freezeProfile({ profileId: 'mobile-375x667', width: 375, height: 667, orientation: 'portrait', scale: 1, zoomEquivalent: false, expectedLayout: 'phone-standard', surfaces: ['shell', 'games', 'postgame', 'promotion'] }),
    freezeProfile({ profileId: 'mobile-390x844', width: 390, height: 844, orientation: 'portrait', scale: 1, zoomEquivalent: false, expectedLayout: 'phone-standard', surfaces: ['shell', 'games', 'bots', 'coach', 'players', 'mentor', 'replay'] }),
    freezeProfile({ profileId: 'mobile-412x915', width: 412, height: 915, orientation: 'portrait', scale: 1, zoomEquivalent: false, expectedLayout: 'phone-standard', surfaces: ['shell', 'games'] }),
    freezeProfile({ profileId: 'tablet-768x1024', width: 768, height: 1024, orientation: 'portrait', scale: 1, zoomEquivalent: false, expectedLayout: 'tablet-portrait-stacked', surfaces: ['shell', 'games', 'postgame', 'mentor', 'replay'] }),
    freezeProfile({ profileId: 'tablet-1024x768', width: 1024, height: 768, orientation: 'landscape', scale: 1, zoomEquivalent: false, expectedLayout: 'tablet-landscape-split', surfaces: ['shell', 'games', 'postgame', 'promotion'] }),
    freezeProfile({ profileId: 'desktop-1366x768', width: 1366, height: 768, orientation: 'landscape', scale: 1, zoomEquivalent: false, expectedLayout: 'desktop-split', surfaces: ['shell', 'games'] }),
    freezeProfile({ profileId: 'desktop-1440x900', width: 1440, height: 900, orientation: 'landscape', scale: 1, zoomEquivalent: false, expectedLayout: 'desktop-split', surfaces: ['shell', 'games', 'postgame', 'mentor', 'replay'] }),
    freezeProfile({ profileId: 'desktop-1920x1080', width: 1920, height: 1080, orientation: 'landscape', scale: 1, zoomEquivalent: false, expectedLayout: 'desktop-split', surfaces: ['shell', 'games'] }),
    freezeProfile({ profileId: 'reflow-640x720', width: 640, height: 720, orientation: 'portrait', scale: 2, zoomEquivalent: true, expectedLayout: 'tablet-portrait-stacked', surfaces: ['shell', 'games', 'postgame', 'promotion'] }),
    freezeProfile({ profileId: 'phone-landscape-667x375', width: 667, height: 375, orientation: 'landscape', scale: 1, zoomEquivalent: false, expectedLayout: 'phone-landscape', surfaces: ['shell', 'games', 'promotion'] }),
    freezeProfile({ profileId: 'phone-landscape-844x390', width: 844, height: 390, orientation: 'landscape', scale: 1, zoomEquivalent: false, expectedLayout: 'phone-landscape', surfaces: ['shell', 'games', 'postgame'] }),
    freezeProfile({ profileId: 'phone-landscape-915x412', width: 915, height: 412, orientation: 'landscape', scale: 1, zoomEquivalent: false, expectedLayout: 'phone-landscape', surfaces: ['shell', 'games'] }),
    freezeProfile({ profileId: 'constrained-1366x600', width: 1366, height: 600, orientation: 'landscape', scale: 1, zoomEquivalent: false, expectedLayout: 'constrained-height', surfaces: ['shell', 'games', 'postgame'] }),
    freezeProfile({ profileId: 'split-1200x800', width: 1200, height: 800, orientation: 'landscape', scale: 1, zoomEquivalent: false, expectedLayout: 'desktop-split', surfaces: ['shell', 'games', 'players'] })
]);

export const REQUIRED_CROSS_BROWSER_PROFILE_IDS = Object.freeze([
    'mobile-375x667', 'mobile-390x844', 'tablet-768x1024',
    'tablet-1024x768', 'desktop-1440x900'
]);

export function profilesForBrowser(browserName) {
    return browserName === 'chromium'
        ? PLAY_RESPONSIVE_PROFILES
        : Object.freeze(PLAY_RESPONSIVE_PROFILES.filter(profile =>
            REQUIRED_CROSS_BROWSER_PROFILE_IDS.includes(profile.profileId)));
}
