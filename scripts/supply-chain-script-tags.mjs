export function findHttpsExternalScriptTags(source) {
    const scripts = [];
    for (const match of source.matchAll(/<script\b[^>]*>/gi)) {
        const tag = match[0];
        const src = tag.match(/\bsrc\s*=\s*(["'])(https:\/\/[^"']+)\1/i);
        if (src) scripts.push({ tag, url: src[2] });
    }
    return scripts;
}

export function auditHttpsExternalScripts(source, { relative, allowedUrl, requiredIntegrity }) {
    const failures = [];
    for (const { tag, url } of findHttpsExternalScriptTags(source)) {
        if (url !== allowedUrl) failures.push(`${relative}: unregistered external script ${url}`);
        if (url === allowedUrl && (!tag.includes(`integrity="${requiredIntegrity}"`) || !/crossorigin=["']anonymous["']/i.test(tag)))
            failures.push(`${relative}: Clerk SRI/crossorigin missing`);
    }
    return failures;
}
