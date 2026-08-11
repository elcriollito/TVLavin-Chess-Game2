# SEC-015 — Active XSS and taint verification

## Sources and sinks reviewed

The review covered LLM output and errors, PGN headers/comments/FEN, Chess.com/Lichess import metadata and usernames, FICS multiline/status/player data, query strings, fragments, stored-like browser fixtures, external responses, and URL attributes. Static sink inventory covered HTML insertion, document/dynamic-code APIs, attribute and navigation assignments, DOM parsing, and Workers.

Most `innerHTML` uses are fixed templates or insert values passed through existing HTML escaping. Three tainted sinks were confirmed and changed:

1. Mentor provider/server error text was interpolated into `innerHTML`; it now uses an icon element and a text node.
2. FICS multiline game status joined external lines with `<br>` into `innerHTML`; it now creates text nodes and explicit `<br>` elements.
3. Chess.com/Lichess usernames were concatenated into fallback-link HTML; links now use fixed HTTPS bases, `encodeURIComponent`, DOM properties, `textContent`, and `noopener noreferrer`. Unknown providers create no URL.

## LLM/Markdown model

Mentor converts input to a string, escapes `&`, `<`, and `>` first, and only then applies a bounded Markdown-like transformation for code, emphasis, chess moves, and line breaks. It creates no Markdown links or images, so `javascript:`, `data:`, `vbscript:`, raw HTML, SVG, iframe `srcdoc`, event handlers, malformed tags, and encoded payloads remain inert text. Rich arbitrary HTML and DOMPurify are not required for this deliberately limited model.

## Active evidence

Chromium and WebKit each ran 15 product-path tests. The harness loaded the actual local Mentor, Analyze, and FICS modules and exercised six HTML/event payload variants, a JavaScript-link payload, hostile PGN headers/comments/import metadata, FICS multiline data, query/hash reflection, stored-like reload, BYO sentinel plus taint, and pagehide/reload cleanup.

`window.__CAISSA_XSS_TRIGGERED__` remained false in every case. No injected script, image, SVG, iframe, details handler, or JavaScript link appeared as executable DOM. The sentinel remained absent from public configuration and document text.

CSP remains defense in depth only. No CSP, CORS, Worker, or script-source policy was broadened for the harness.

## Residual scope

Static trusted templates remain as `innerHTML` where they do not incorporate unescaped taint. Future features that add rich Markdown, dynamic links/images, user-generated blog content, or new external metadata must use safe DOM construction or an explicitly configured sanitizer and extend this payload suite.
