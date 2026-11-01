import { createHash } from 'node:crypto';
import { isIP } from 'node:net';

export function trustedOnlineSourceKey(req, env = process.env) {
    if (env.VERCEL !== '1') return '';
    const value = req?.headers?.['x-vercel-forwarded-for'];
    if (typeof value !== 'string' || value !== value.trim() || value.includes(',') || !isIP(value)) return '';
    const digest = createHash('sha256').update(`caissa-online-v1:${value}`).digest('hex');
    return `online-source:${digest}`;
}
