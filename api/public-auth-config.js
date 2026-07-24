/**
 * Public auth configuration for the browser.
 *
 * Only returns safe-to-expose values. Secret keys remain server-side.
 */

export default function handler(req, res) {
    const requestUrl = new URL(req.url || '/', 'https://www.caissa-chess.org');
    if (requestUrl.searchParams.get('classicRedirect') === '1') {
        res.setHeader('Location', '/yahoo-classic');
        return res.status(308).end();
    }

    if (req.method !== 'GET') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const clerkPublishableKeyCandidates = [
        process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY,
        process.env.CLERK_PUBLISHABLE_KEY
    ].filter(Boolean);

    const clerkPublishableKey =
        clerkPublishableKeyCandidates.find((key) => String(key).startsWith('pk_live_')) ||
        clerkPublishableKeyCandidates[0] ||
        '';

    const supabaseUrl =
        process.env.SUPABASE_URL ||
        process.env.NEXT_PUBLIC_SUPABASE_URL ||
        '';

    return res.status(200).json({
        clerkPublishableKey,
        registrationTracking: Boolean(
            process.env.CLERK_SECRET_KEY &&
            supabaseUrl &&
            process.env.SUPABASE_SERVICE_ROLE_KEY
        )
    });
}
