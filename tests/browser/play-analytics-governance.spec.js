import { test, expect } from '@playwright/test';

test('governance stays complete, redacted, memory-only, and externally blocked', async ({ page }) => {
    const deliveries = []; page.on('request', request => { if (['fetch','xhr'].includes(request.resourceType())
        && /analytics|telemetry|collect|beacon/i.test(request.url())) deliveries.push(request.url()); });
    await page.goto('/play/games?simplified=1');
    const result = await page.evaluate(() => { const G = window.CaissaPlayAnalyticsGovernance;
        const before = { local: { ...localStorage }, session: { ...sessionStorage }, cookie: document.cookie };
        return { registry: G.getEventRegistry(), validation: G.validateRegistry(), policy: G.getPolicy(), health: G.inspect(),
            before, after: { local: { ...localStorage }, session: { ...sessionStorage }, cookie: document.cookie } }; });
    expect(result.registry).toHaveLength(31); expect(result.validation.ok).toBe(true);
    expect(new Set(result.registry.map(item => item.eventId)).size).toBe(31);
    expect(result.registry.every(item => !item.productionEligible && !item.externalTransportEligible)).toBe(true);
    expect(result.policy.consent.status).toBe('missing'); expect(result.policy.transport.transport).toBe('none');
    expect(result.health).not.toHaveProperty('events'); expect(result.health).not.toHaveProperty('payload');
    expect(result.health.bufferLimit).toBe(50); expect(result.after).toEqual(result.before); expect(deliveries).toEqual([]);
});
