-- Partial indexes for the server-side CAISSA training selection quality gates.
begin;

create index puzzles_training_standard_idx
  on public.puzzles(rating, popularity desc, nb_plays desc, puzzle_id)
  where rating_deviation <= 100 and popularity >= 80 and nb_plays >= 500;

create index puzzles_training_relaxed_idx
  on public.puzzles(rating, popularity desc, nb_plays desc, puzzle_id)
  where rating_deviation <= 100 and popularity >= 80 and nb_plays >= 100;

create index puzzles_training_equality_idx
  on public.puzzles(rating, popularity desc, nb_plays desc, puzzle_id)
  where rating_deviation <= 100 and popularity >= 80 and nb_plays >= 100
    and themes @> array['equality']::text[];

comment on index public.puzzles_training_standard_idx is
  'CAISSA standard training gate; combine with the themes GIN index.';
comment on index public.puzzles_training_relaxed_idx is
  'CAISSA sparse-theme fallback gate; currently reserved for equality.';
comment on index public.puzzles_training_equality_idx is
  'CAISSA equality selection; avoids scanning the wider relaxed-quality population.';

commit;
