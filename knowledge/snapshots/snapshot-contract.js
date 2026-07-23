export const LIBRARY_SNAPSHOT_SCHEMA_VERSION = '1.0.0';
export const SUPPORTED_LIBRARY_SNAPSHOT_SCHEMAS = Object.freeze([LIBRARY_SNAPSHOT_SCHEMA_VERSION]);
export const DEFAULT_LIBRARY_VERSION = '0.1.0';
export const DEFAULT_RELEASE_LABEL = 'season-9-foundation';
export const RELEASE_ID_PATTERN = /^rel-[a-f0-9]{64}$/;

export function assertSafeReleaseId(releaseId) {
    if (typeof releaseId !== 'string' || !RELEASE_ID_PATTERN.test(releaseId)) {
        throw new Error(`invalid-release-id: ${String(releaseId)}`);
    }
    return releaseId;
}
