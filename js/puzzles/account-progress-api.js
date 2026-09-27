async function sessionToken(auth) {
    const token = await auth?.getToken?.();
    if (!token) throw new Error('Missing account session');
    return token;
}

function httpError(label, status) {
    const error = new Error(`${label} HTTP ${status}`);
    error.status = status;
    return error;
}

export async function requestAccountProgress(auth, method, body, fetchImpl = fetch) {
    const token = await sessionToken(auth);
    const response = await fetchImpl('/api/puzzles/progress', {
        method,
        cache: 'no-store',
        headers: {
            Authorization: `Bearer ${token}`,
            ...(body ? { 'Content-Type': 'application/json' } : {}),
        },
        ...(body ? { body: JSON.stringify(body) } : {}),
    });
    if (!response.ok) throw httpError('Account progress', response.status);
    return response.json();
}

export async function loadAccountProgress(auth, fetchImpl = fetch) {
    try { return await requestAccountProgress(auth, 'GET', undefined, fetchImpl); }
    catch (error) {
        // A newly authenticated browser can reach Puzzles before another CAISSA
        // page has created its internal user row. Synchronize the verified Clerk
        // identity once, then retry the private progress read.
        if (error?.status !== 409) throw error;
        const token = await sessionToken(auth);
        const response = await fetchImpl('/api/user/sync', {
            method: 'POST',
            cache: 'no-store',
            headers: { Authorization: `Bearer ${token}` },
        });
        if (!response.ok) throw httpError('Account sync', response.status);
        return requestAccountProgress(auth, 'GET', undefined, fetchImpl);
    }
}
