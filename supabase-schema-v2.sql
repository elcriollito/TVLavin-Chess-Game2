-- ============================================
-- CAISSA Chess — Supabase Schema v2
-- Run AFTER supabase-schema.sql (additive only)
-- ============================================

-- ============================================
-- BLOCK 1: Stripe Webhook Idempotency
-- ============================================

-- Prevents duplicate processing of Stripe webhook events.
-- Before processing any webhook event, check if event_id exists.
-- After processing, insert the event_id.
CREATE TABLE IF NOT EXISTS stripe_events (
  event_id TEXT PRIMARY KEY,
  event_type TEXT NOT NULL,
  processed_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_stripe_events_type ON stripe_events(event_type);

-- ============================================
-- BLOCK 2: Cloud Library Sync
-- ============================================

-- Cloud positions (per user)
CREATE TABLE IF NOT EXISTS library_positions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  local_id TEXT NOT NULL,
  fen TEXT NOT NULL,
  fen_hash TEXT,
  title TEXT,
  author TEXT,
  source TEXT,
  tags JSONB DEFAULT '[]',
  themes JSONB DEFAULT '[]',
  collection_local_id TEXT,
  engine_report JSONB,
  annotations JSONB DEFAULT '[]',
  is_favorite BOOLEAN DEFAULT false,
  is_archived BOOLEAN DEFAULT false,
  game_context JSONB,
  local_created_at BIGINT,
  local_updated_at BIGINT,
  synced_at TIMESTAMPTZ DEFAULT now(),
  version INTEGER DEFAULT 1,
  UNIQUE(user_id, local_id)
);

CREATE INDEX IF NOT EXISTS idx_library_positions_user ON library_positions(user_id);
CREATE INDEX IF NOT EXISTS idx_library_positions_synced ON library_positions(user_id, synced_at);

-- Cloud collections (per user)
CREATE TABLE IF NOT EXISTS library_collections (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  local_id TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  type TEXT DEFAULT 'manual',
  game_metadata JSONB,
  is_default BOOLEAN DEFAULT false,
  local_created_at BIGINT,
  local_updated_at BIGINT,
  synced_at TIMESTAMPTZ DEFAULT now(),
  version INTEGER DEFAULT 1,
  UNIQUE(user_id, local_id)
);

CREATE INDEX IF NOT EXISTS idx_library_collections_user ON library_collections(user_id);

-- Sync log (audit trail)
CREATE TABLE IF NOT EXISTS library_sync_log (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  action TEXT NOT NULL,
  item_type TEXT NOT NULL,
  item_count INTEGER DEFAULT 0,
  synced_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_library_sync_log_user ON library_sync_log(user_id);
