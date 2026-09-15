export const PLAY_SF18_GAMEPLAY_ENV = 'CAISSA_PLAY_SF18_GAMEPLAY';
export const PLAY_SF18_GAMEPLAY_ACTIVATION = 'ENGINE18-003';
export const PLAY_SF18_GAMEPLAY_PRODUCTION_RELEASE = 'ENGINE18-003C';
export const PLAY_SF18_GAMEPLAY_PROVIDER = 'stockfish-18-gameplay';
export const PLAY_LEGACY_GAMEPLAY_PROVIDER = 'legacy-stockfish-2019';

export function resolvePlayGameplayPreviewConfig(environment = {}) {
    const preview = environment.VERCEL_ENV === 'preview';
    const explicitlyEnabled = environment[PLAY_SF18_GAMEPLAY_ENV] === 'true';
    const enabled = preview && explicitlyEnabled;
    return Object.freeze({
        schemaVersion: '1.0.0',
        activationId: enabled ? PLAY_SF18_GAMEPLAY_ACTIVATION : null,
        deploymentEnvironment: preview ? 'preview' : 'other',
        enabled,
        providerKey: enabled ? PLAY_SF18_GAMEPLAY_PROVIDER : PLAY_LEGACY_GAMEPLAY_PROVIDER,
        reasonCode: enabled ? 'ENGINE18_003_PREVIEW_ENABLED'
            : (preview ? 'ENGINE18_003_PREVIEW_DISABLED' : 'ENGINE18_003_NOT_PREVIEW')
    });
}

export function resolvePlayGameplayDeploymentConfig(environment = {}) {
    if (environment.VERCEL_ENV !== 'production') return resolvePlayGameplayPreviewConfig(environment);
    return Object.freeze({
        schemaVersion: '1.1.0',
        activationId: PLAY_SF18_GAMEPLAY_PRODUCTION_RELEASE,
        deploymentEnvironment: 'production',
        enabled: true,
        providerKey: PLAY_SF18_GAMEPLAY_PROVIDER,
        reasonCode: 'ENGINE18_003C_PRODUCTION_RELEASED'
    });
}

export function injectPlayGameplayPreviewMarker(document, config) {
    if (!config?.enabled || typeof document !== 'string') return document;
    const activationId = config.activationId === PLAY_SF18_GAMEPLAY_PRODUCTION_RELEASE
        && config.deploymentEnvironment === 'production'
        ? PLAY_SF18_GAMEPLAY_PRODUCTION_RELEASE : PLAY_SF18_GAMEPLAY_ACTIVATION;
    const deploymentEnvironment = activationId === PLAY_SF18_GAMEPLAY_PRODUCTION_RELEASE
        ? 'production' : 'preview';
    const marker = '    <meta name="caissa-play-gameplay-provider" content="stockfish-18-gameplay" '
        + `data-activation-id="${activationId}" data-deployment-environment="${deploymentEnvironment}">\n`;
    return document.includes('</head>') ? document.replace('</head>', `${marker}</head>`) : document;
}
