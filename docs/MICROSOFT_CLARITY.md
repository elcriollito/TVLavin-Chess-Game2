# Microsoft Clarity

CAISSA uses Microsoft Clarity on selected public pages to identify aggregate
navigation, click, scroll, device, and usability patterns. The public Clarity
project ID is `xsjvqwy3ns`.

## Architecture

Eligible pages load `/js/caissa-clarity.js`. The loader:

- runs only over HTTPS on `www.caissa-chess.org` or `caissa-chess.org`;
- skips automated browsers, localhost, IP hosts, and Vercel deployments;
- queues Consent API V2 before loading the asynchronous Microsoft tag;
- prevents duplicate initialization and duplicate tag elements;
- keeps advertising storage denied;
- masks interactive pages that can contain account, chat, PGN, file, game,
  annotation, progress, or other user-specific content.

The eligible set is the homepage/application, About, Help, Blog and published
articles, Yahoo Classic, ECO, Opening Database, Polyglot, and Endgame Trainer.
Authentication, registration, premium/billing, Vault, and Library pages are
excluded. Custom events are deferred.

## Consent and privacy

No general consent platform existed when Clarity was added. The existing
learning-progress choice is deliberately separate and is not analytics consent.
Clarity receives `analytics_Storage: denied` by default and can therefore
operate only in Microsoft's limited cookieless mode. The About privacy section
offers a narrow device-level choice to grant or withdraw optional analytics
cookies. Advertising storage remains denied in either state.

This technical control is not a claim of legal compliance. A privacy/legal
review should decide whether CAISSA needs a first-visit consent banner or a full
CMP for its audiences and jurisdictions. Consent Mode must remain enabled in
the Clarity project settings.

## Verification and operations

On production, confirm one request for
`https://www.clarity.ms/tag/xsjvqwy3ns?ref=bwt`, no request on localhost or a
Vercel URL, and no `_clck` or `_clsk` cookie while analytics consent is denied.
The CSP permits Clarity's documented load-balanced `*.clarity.ms` script and
connection hosts plus `c.bing.com`; production currently loads its runtime from
`scripts.clarity.ms`.
Use Clarity's metadata verification command to inspect the consent signal.
Recordings and heatmaps are available in the Clarity project dashboard.

To disable Clarity quickly, remove the shared loader references or set
`caissa:clarity-disabled:v1` to `1` in local storage for a single browser.
Automated browsers are excluded through `navigator.webdriver`. For owner and
staff traffic, configure internal IP blocking in Clarity project settings; do
not commit private IP addresses.

The integration adds one small deferred same-origin loader and one asynchronous
third-party tag. It adds no visual element outside the About consent controls
and cannot be described as zero-cost. Review transfer size, main-thread work,
cookies, blocked requests, and layout stability after deployment.

Future event candidates include entering Classic, following a blog-to-tool
link, successful Polyglot generation, opening ECO details, and selecting an
Opening Database tab. Event names must never contain PGN, filenames, usernames,
account identifiers, credentials, or other user data.
