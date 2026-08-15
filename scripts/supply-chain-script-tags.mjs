export function findHttpsExternalScriptTags(source) {
    const scripts = [];
    for (const match of source.matchAll(/<script\b[^>]*>/gi)) {
        const tag = match[0];
        const src = tag.match(/\bsrc\s*=\s*(["'])(https:\/\/[^"']+)\1/i);
        if (src) scripts.push({ tag, url: src[2] });
    }
    return scripts;
}

export function auditHttpsExternalScripts(source, { relative, allowedUrl, requiredIntegrity, registry = null }) {
    const failures = [];
    for (const { tag, url } of findHttpsExternalScriptTags(source)) {
        const expectedIntegrity = registry ? registry.get(url) : (url === allowedUrl ? requiredIntegrity : null);
        if (!expectedIntegrity) failures.push(`${relative}: unregistered external script ${url}`);
        if (expectedIntegrity && (!tag.includes(`integrity="${expectedIntegrity}"`) || !/crossorigin=["']anonymous["']/i.test(tag)))
            failures.push(`${relative}: registered script SRI/crossorigin missing for ${url}`);
    }
    return failures;
}
