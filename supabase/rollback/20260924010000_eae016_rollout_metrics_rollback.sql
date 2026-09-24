-- EAE-016 telemetry rollback. Apply only after DRAINING -> DISABLED and zero sessions.
drop function if exists public.eae016_rollout_dashboard(integer);
drop function if exists public.eae016_record_rollout_event(text, text, integer);
drop table if exists public.eae016_rollout_latency_samples;
drop table if exists public.eae016_rollout_actor_events;
