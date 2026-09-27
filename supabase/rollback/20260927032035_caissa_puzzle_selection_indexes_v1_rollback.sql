begin;
drop index if exists public.puzzles_training_standard_idx;
drop index if exists public.puzzles_training_relaxed_idx;
drop index if exists public.puzzles_training_equality_idx;
commit;
