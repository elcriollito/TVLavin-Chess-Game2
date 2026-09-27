-- CAISSA Puzzle Catalog v1. Versioned only; validate before applying anywhere.
begin;

create table public.puzzles (
  puzzle_id text primary key check (puzzle_id ~ '^[0-9A-Za-z]{5}$'),
  fen text not null check (length(fen) between 15 and 120),
  moves text not null check (moves ~ '^[a-h][1-8][a-h][1-8][nbrq]?( [a-h][1-8][a-h][1-8][nbrq]?)+$'),
  rating smallint not null check (rating between 1 and 5000),
  rating_deviation smallint not null check (rating_deviation between 0 and 1000),
  popularity smallint not null check (popularity between -100 and 100),
  nb_plays integer not null check (nb_plays >= 0),
  themes text[] not null check (cardinality(themes) > 0),
  game_url text not null check (game_url ~ '^https://lichess[.]org/'),
  opening_tags text[] not null default '{}',
  daily_date bigint check (daily_date is null or daily_date > 0),
  source_version date not null,
  imported_at timestamptz not null default now()
);

create index puzzles_rating_quality_idx
  on public.puzzles(rating, popularity desc, nb_plays desc, puzzle_id);
create index puzzles_themes_gin_idx on public.puzzles using gin(themes);
create index puzzles_opening_tags_gin_idx on public.puzzles using gin(opening_tags);
create index puzzles_daily_date_idx on public.puzzles(daily_date) where daily_date is not null;

comment on table public.puzzles is
  'Versioned Lichess CC0 puzzle catalog. Puzzle rating is source difficulty, never a CAISSA account rating.';
comment on column public.puzzles.moves is
  'UCI sequence whose first move prepares the opponent position; the solution begins with the second move.';

alter table public.puzzles enable row level security;
alter table public.puzzles force row level security;

revoke all on public.puzzles from public, anon, authenticated;
grant select, insert, update, delete on public.puzzles to service_role;

commit;
