-- Migration: Add pair_index and trade_index for close-by-position support
-- Run: psql $DATABASE_URL -f migrations/002_activity_position_ids.sql

ALTER TABLE activity_trades ADD COLUMN IF NOT EXISTS pair_index INTEGER;
ALTER TABLE activity_trades ADD COLUMN IF NOT EXISTS trade_index INTEGER;

-- Unique index for open trades (one open position per wallet+pair+index)
CREATE UNIQUE INDEX IF NOT EXISTS idx_activity_trades_position_open
  ON activity_trades(wallet_address, pair_index, trade_index)
  WHERE status = 'open';
