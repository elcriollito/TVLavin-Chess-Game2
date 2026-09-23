# EAE-015A isolated relay project

This Vercel configuration is used only by the dedicated Lc0 relay preview
project. Deploy it from the repository root with this file passed as the local
configuration. Its route table exposes only the relay, cleanup endpoint, and health
surface; unrelated CAISSA pages are denied.

The deterministic schedule itself is owned by the staging Supabase Cron job
`eae015a-lc0-cleanup`; the HTTP cleanup endpoint is retained for authenticated
manual recovery and observability, not as the primary scheduler.

The project must be configured with Preview-only environment variables and a
separate project link. It must never own `www.caissa-chess.org` or the future
`lc0.caissa-chess.org` production DNS name during EAE-015A.
