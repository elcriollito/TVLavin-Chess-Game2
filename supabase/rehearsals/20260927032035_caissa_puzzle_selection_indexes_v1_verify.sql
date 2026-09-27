-- Run only on an isolated branch after loading a representative sample.
select indexname, indexdef
from pg_catalog.pg_indexes
where schemaname = 'public'
  and tablename = 'puzzles'
  and indexname in ('puzzles_training_standard_idx', 'puzzles_training_relaxed_idx', 'puzzles_training_equality_idx')
order by indexname;

explain (analyze, buffers, format json)
select puzzle_id, fen, moves, rating, rating_deviation, popularity, nb_plays, themes
from public.puzzles
where themes && array['fork']::text[]
  and rating between 1700 and 2100
  and rating_deviation <= 100 and popularity >= 80 and nb_plays >= 500
order by rating, popularity desc, nb_plays desc, puzzle_id
limit 12;

explain (analyze, buffers, format json)
select puzzle_id, fen, moves, rating, rating_deviation, popularity, nb_plays, themes
from public.puzzles
where themes @> array['equality']::text[]
  and rating between 1700 and 2100
  and rating_deviation <= 100 and popularity >= 80 and nb_plays >= 100
order by rating, popularity desc, nb_plays desc, puzzle_id
limit 12;

explain (analyze, buffers, format json)
select puzzle_id, fen, moves, rating, opening_tags
from public.puzzles
where opening_tags && array['Sicilian_Defense']::text[]
  and rating between 1700 and 2100
  and rating_deviation <= 100 and popularity >= 80 and nb_plays >= 500
order by rating, popularity desc, nb_plays desc, puzzle_id
limit 12;
