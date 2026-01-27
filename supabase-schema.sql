-- ============================================
-- CAISSA Chess — Supabase Schema
-- Run this in the Supabase SQL Editor
-- ============================================

-- 1. Users table
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clerk_id TEXT UNIQUE NOT NULL,
  email TEXT,
  role TEXT NOT NULL DEFAULT 'member',
  is_premium BOOLEAN NOT NULL DEFAULT false,
  credits INTEGER NOT NULL DEFAULT 5,
  stripe_customer_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_users_clerk_id ON users(clerk_id);
CREATE INDEX IF NOT EXISTS idx_users_stripe_customer ON users(stripe_customer_id);

-- 2. Credit events log
CREATE TABLE IF NOT EXISTS credit_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  action TEXT NOT NULL,
  delta INTEGER NOT NULL,
  balance_after INTEGER NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_credit_events_user_id ON credit_events(user_id);
CREATE INDEX IF NOT EXISTS idx_credit_events_created_at ON credit_events(created_at);

-- 3. Atomic credit consumption (RPC)
CREATE OR REPLACE FUNCTION consume_credits(
  p_clerk_id TEXT,
  p_cost INTEGER,
  p_action TEXT
)
RETURNS TABLE(success BOOLEAN, new_balance INTEGER, message TEXT)
LANGUAGE plpgsql
AS $$
DECLARE
  v_user RECORD;
  v_new_balance INTEGER;
BEGIN
  -- Lock the user row for atomic update
  SELECT * INTO v_user FROM users WHERE clerk_id = p_clerk_id FOR UPDATE;

  IF v_user IS NULL THEN
    RETURN QUERY SELECT false, 0, 'User not found'::TEXT;
    RETURN;
  END IF;

  -- Premium users: no deduction needed
  IF v_user.is_premium THEN
    RETURN QUERY SELECT true, v_user.credits, 'Premium user - no deduction'::TEXT;
    RETURN;
  END IF;

  -- Check sufficient balance
  IF v_user.credits < p_cost THEN
    RETURN QUERY SELECT false, v_user.credits, 'Insufficient credits'::TEXT;
    RETURN;
  END IF;

  -- Deduct credits
  v_new_balance := v_user.credits - p_cost;
  UPDATE users SET credits = v_new_balance, updated_at = now() WHERE id = v_user.id;

  -- Log the event
  INSERT INTO credit_events (user_id, action, delta, balance_after)
  VALUES (v_user.id, p_action, -p_cost, v_new_balance);

  RETURN QUERY SELECT true, v_new_balance, 'Credits consumed'::TEXT;
END;
$$;

-- 4. Atomic credit addition (RPC)
CREATE OR REPLACE FUNCTION add_credits(
  p_clerk_id TEXT,
  p_amount INTEGER,
  p_reason TEXT
)
RETURNS TABLE(success BOOLEAN, new_balance INTEGER)
LANGUAGE plpgsql
AS $$
DECLARE
  v_user RECORD;
  v_new_balance INTEGER;
BEGIN
  SELECT * INTO v_user FROM users WHERE clerk_id = p_clerk_id FOR UPDATE;

  IF v_user IS NULL THEN
    RETURN QUERY SELECT false, 0;
    RETURN;
  END IF;

  v_new_balance := v_user.credits + p_amount;
  UPDATE users SET credits = v_new_balance, updated_at = now() WHERE id = v_user.id;

  INSERT INTO credit_events (user_id, action, delta, balance_after)
  VALUES (v_user.id, p_reason, p_amount, v_new_balance);

  RETURN QUERY SELECT true, v_new_balance;
END;
$$;
