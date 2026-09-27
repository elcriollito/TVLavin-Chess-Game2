-- Candidate production schema for the immutable Lichess puzzle catalog.
-- This file is local design evidence only. No D1 database has been created.

create table catalog_metadata (
  key text primary key,
  value text not null
) without rowid;

create table puzzles (
  puzzle_id text primary key,
  fen text not null,
  moves text not null,
  rating integer not null,
  rating_deviation integer not null,
  popularity integer not null,
  nb_plays integer not null,
  themes text not null,
  game_url text not null,
  opening_tags text not null,
  daily_date text not null,
  source_version text not null
) without rowid;

-- pool_key encodes dimension, official tag, disjoint quality tier, and
-- 100-point rating bucket, for example theme:fork:q2:b17.
-- shuffle_key is a stable 48-bit hash of puzzle_id. A signed opaque cursor
-- advances through this key and puzzle_id; OFFSET and ORDER BY random() are
-- deliberately unnecessary.
create table puzzle_pool_entries (
  pool_key text not null,
  shuffle_key integer not null,
  puzzle_id text not null,
  rating integer not null,
  primary key (pool_key, shuffle_key, puzzle_id)
) without rowid;

create table puzzle_pool_counts (
  pool_key text primary key,
  entry_count integer not null check (entry_count >= 0)
) without rowid;
