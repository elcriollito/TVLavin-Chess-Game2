-- Only run after disabling CAISSA tablebase public traffic.
drop function if exists public.release_caissa_tablebase_provider(uuid,integer);
drop function if exists public.claim_caissa_tablebase_provider();
drop table if exists public.caissa_tablebase_provider_gate;
