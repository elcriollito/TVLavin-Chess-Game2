export const MARKET_READER_PRODUCT_ID = 'caissa-pgn-reader';
export const MARKET_READER_RC1_RELEASE_ID = '1.0.0-rc1';
export const MARKET_READER_RC1_BLOB_PATHNAME =
    'products/caissa-pgn-reader/1.0.0-rc1/CAISSA-PGN-Reader-v1.0.0-rc1-windows-x64-portable.zip';
export const MARKET_READER_RC1_FILENAME =
    'CAISSA-PGN-Reader-v1.0.0-rc1-windows-x64-portable.zip';
export const MARKET_READER_RC1_SIZE = 81_744_651;
export const MARKET_READER_RC1_SHA256 =
    '9FC58B593C1E7774DC2E326DBE91635973D3FD18AA718F73C3B2C0869641EE88';

export const MARKET_READER_DOWNLOAD_TTL_MS = 10 * 60 * 1000;
export const PRODUCTION_MARKET_DOWNLOADS_ENABLED = false;

const SAFE_IDENTIFIER = /^[a-z0-9](?:[a-z0-9.-]{0,62}[a-z0-9])?$/;

const PRODUCT = Object.freeze({
    productId: MARKET_READER_PRODUCT_ID,
    name: 'CAISSA PGN Reader',
    status: 'prelaunch',
    platform: 'Windows',
    architecture: 'x64'
});

const RC1_RELEASE = Object.freeze({
    productId: MARKET_READER_PRODUCT_ID,
    releaseId: MARKET_READER_RC1_RELEASE_ID,
    version: MARKET_READER_RC1_RELEASE_ID,
    channel: 'release-candidate',
    platform: 'windows',
    architecture: 'x64',
    distribution: 'portable',
    filename: MARKET_READER_RC1_FILENAME,
    pathname: MARKET_READER_RC1_BLOB_PATHNAME,
    contentType: 'application/zip',
    size: MARKET_READER_RC1_SIZE,
    sha256: MARKET_READER_RC1_SHA256,
    authenticode: 'NotSigned',
    historicalBaseline: true
});

const RELEASES = new Map([
    [`${MARKET_READER_PRODUCT_ID}:${MARKET_READER_RC1_RELEASE_ID}`, RC1_RELEASE]
]);

function isExactStagingSupabaseTarget(env) {
    const projectRef = String(env.CAISSA_MARKET_STAGING_SUPABASE_PROJECT_REF || '');
    if (!/^[a-z0-9]{20}$/.test(projectRef)) return false;
    let url;
    try { url = new URL(String(env.SUPABASE_URL || '')); } catch { return false; }
    return url.protocol === 'https:'
        && url.hostname === `${projectRef}.supabase.co`
        && url.pathname === '/'
        && !url.username
        && !url.password
        && !url.search
        && !url.hash;
}

export function isMarketReaderStagingEnabled(env = process.env) {
    return PRODUCTION_MARKET_DOWNLOADS_ENABLED === false
        && env.PRODUCTION_MARKET_DOWNLOADS_ENABLED === 'false'
        && env.CAISSA_MARKET_STAGING_ENABLED === 'true'
        && env.VERCEL_TARGET_ENV === 'staging'
        && env.VERCEL_ENV !== 'production'
        && typeof env.CLERK_SECRET_KEY === 'string'
        && env.CLERK_SECRET_KEY.length > 0
        && typeof env.SUPABASE_SERVICE_ROLE_KEY === 'string'
        && env.SUPABASE_SERVICE_ROLE_KEY.length > 0
        && isExactStagingSupabaseTarget(env);
}

export function parseMarketReleaseRequest(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
    const keys = Object.keys(value).sort();
    if (keys.length !== 2 || keys[0] !== 'productId' || keys[1] !== 'releaseId') return null;
    const productId = String(value.productId || '');
    const releaseId = String(value.releaseId || '');
    if (!SAFE_IDENTIFIER.test(productId) || !SAFE_IDENTIFIER.test(releaseId)) return null;
    return Object.freeze({ productId, releaseId });
}

export function resolveMarketReaderRelease({ productId, releaseId }) {
    if (!SAFE_IDENTIFIER.test(String(productId || '')) || !SAFE_IDENTIFIER.test(String(releaseId || ''))) {
        return null;
    }
    return RELEASES.get(`${productId}:${releaseId}`) || null;
}

export function getMarketReaderProduct() {
    return PRODUCT;
}

export function toPublicRelease(release) {
    if (!release) return null;
    const { pathname: _privatePathname, ...publicRelease } = release;
    return Object.freeze(publicRelease);
}

export function listMarketReaderReleases() {
    return Object.freeze([toPublicRelease(RC1_RELEASE)]);
}
