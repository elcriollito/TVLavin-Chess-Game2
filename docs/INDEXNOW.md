# IndexNow release workflow

IndexNow notifies participating search engines that a canonical URL was added,
meaningfully updated, redirected, or removed. Acceptance does not guarantee
crawling or indexing.

## Verification key

The existing public verification key is retained in
`public/caissa-indexnow-2026.txt`. Vercel maps it to the site root. The
submission script reads the same file and sends its root URL as `keyLocation`.
Do not copy the key into environment variables, documentation, logs, or browser
JavaScript.

To rotate the key, generate a valid 8–128 character value using letters,
numbers, or hyphens; rename the public text file to match; update the key-file
constant and Vercel rewrite; then deploy and verify the new root URL before
submitting.

## Selecting URLs

Prefer an explicit list when release-to-route mapping requires judgment:

```bash
npm run indexnow:dry -- --url https://www.caissa-chess.org/yahoo-classic
npm run indexnow:submit -- --url https://www.caissa-chess.org/yahoo-classic
```

For changes with direct route mappings, compare the previously deployed commit
with the release commit:

```bash
npm run indexnow:dry -- --from-git <previous-production-sha> --to <release-sha>
npm run indexnow:submit -- --from-git <previous-production-sha> --to <release-sha>
```

The Git mode recognizes standalone HTML routes, generated blog pages, and
published article registry changes. If a change is shared or ambiguous, provide
the affected canonical URL explicitly. The script deduplicates URLs and rejects
query states, previews, assets, APIs, authentication routes, fragments, and
non-production hosts.

## Controlled submission

Run the live command only after:

1. Git and production deployment SHAs match.
2. The key file returns HTTP 200 with its exact plain-text body.
3. Added or modified URLs are healthy in production.
4. Removed URLs return their intended redirect, 404, or 410.

The script verifies those conditions, sends one batch to the official IndexNow
endpoint, accepts HTTP 200 or 202, and exits non-zero for rejection, timeout, or
network failure. A 429 response should be retried only after `Retry-After`.
Avoid resubmitting unchanged URLs; submissions consume crawl quota.

Dry-run mode performs no network requests. Tests always mock network access and
must never contact IndexNow.

After the first controlled submission, verify discovery in Bing Webmaster Tools.
IndexNow complements the sitemap; it does not replace it.
