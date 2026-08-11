import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export function summarizeIdentityReadiness(users) {
    if (!Array.isArray(users)) throw new TypeError('users must be an array');

    const normalized = users.map((user) => ({
        clerkId: typeof user?.clerk_id === 'string' && user.clerk_id.trim() ? user.clerk_id.trim() : null,
        email: typeof user?.email === 'string' && user.email.trim() ? user.email.trim().toLowerCase() : null,
        stripeCustomerId: typeof user?.stripe_customer_id === 'string' && user.stripe_customer_id.trim()
            ? user.stripe_customer_id.trim()
            : null,
        premium: user?.is_premium === true,
        credits: Number.isFinite(user?.credits) ? user.credits : 0
    }));

    return Object.freeze({
        totalUsers: normalized.length,
        usersWithClerkId: count(normalized, 'clerkId'),
        usersWithoutClerkId: normalized.filter((user) => !user.clerkId).length,
        duplicateClerkIdGroups: duplicateGroups(normalized.map((user) => user.clerkId)),
        usersWithEmail: count(normalized, 'email'),
        usersWithoutEmail: normalized.filter((user) => !user.email).length,
        duplicateEmailGroups: duplicateGroups(normalized.map((user) => user.email)),
        usersWithStripeCustomerId: count(normalized, 'stripeCustomerId'),
        duplicateStripeCustomerIdGroups: duplicateGroups(normalized.map((user) => user.stripeCustomerId)),
        premiumUsers: normalized.filter((user) => user.premium).length,
        usersWithPositiveCredits: normalized.filter((user) => user.credits > 0).length
    });
}

function count(users, field) {
    return users.filter((user) => user[field]).length;
}

function duplicateGroups(values) {
    const counts = new Map();
    for (const value of values) {
        if (value) counts.set(value, (counts.get(value) || 0) + 1);
    }
    return [...counts.values()].filter((value) => value > 1).length;
}

function runCli() {
    const inputIndex = process.argv.indexOf('--input');
    if (inputIndex === -1 || !process.argv[inputIndex + 1]) {
        console.error('Usage: node scripts/audit-identity-migration-readiness.mjs --input <redacted-users.json>');
        process.exitCode = 2;
        return;
    }

    const inputPath = path.resolve(process.argv[inputIndex + 1]);
    const parsed = JSON.parse(fs.readFileSync(inputPath, 'utf8'));
    const users = Array.isArray(parsed) ? parsed : parsed.users;
    console.log(JSON.stringify(summarizeIdentityReadiness(users), null, 2));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) runCli();
