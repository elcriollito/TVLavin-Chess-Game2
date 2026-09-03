# CAISSA Global Languages Foundation

Status: GL-001 implemented

## Locale registry

The public runtime has one explicit registry and keeps support separate from availability.

| Locale | Native name | Supported | Enabled after GL-001 |
| --- | --- | --- | --- |
| `en` | English | Yes | Yes |
| `es` | Español | Yes | Yes |
| `pt` | Português | Yes | No |
| `fr` | Français | Yes | No |
| `de` | Deutsch | Yes | No |
| `ru` | Русский | Yes | No |
| `hi` | हिन्दी | Yes | No |

Regional tags normalize to their supported language family (`en-*`, `es-*`, `pt-*`, `fr-*`, `de-*`, `ru-*`, and `hi-*`). Only enabled locales can be selected, persisted, or suggested. Automatic suggestion expansion remains reserved for GL-007.

## Unicode and typography

All source files, HTML responses, catalogs, DOM APIs, local storage values, and tests use UTF-8/Unicode strings. The current system font stack supports Latin Extended and Cyrillic without a new font dependency. Devanagari is represented safely end to end; GL-006 must perform a physical typography audit on supported devices and add a fallback only if that audit demonstrates a real rendering gap.

The locale implementation does not assume ASCII when normalizing tags, rendering native names, persisting choices, interpolating variables, or dispatching locale events.

## Invariants

- English remains the universal per-key fallback.
- Incomplete languages never appear in the public selector.
- Manual selection remains authoritative over browser preference.
- Locale changes continue through the existing `caissa:locale-change` event.
- No GeoIP, GPS, account migration, or external locale service is introduced.
