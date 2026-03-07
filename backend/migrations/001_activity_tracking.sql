-- Migration: Activity Tracking
-- Run against Railway Postgres: psql $DATABASE_URL -f migrations/001_activity_tracking.sql
-- Or via Railway CLI: railway run psql $DATABASE_URL -f migrations/001_activity_tracking.sql

-- Enable uuid-ossp if not already (gen_random_uuid is built-in in PostgreSQL 13+)
-- CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Table: activity_users (activity tracking)
-- Named activity_users to avoid conflicts; maps to spec "users"
CREATE TABLE IF NOT EXISTS activity_users (
    wallet_address VARCHAR(42) PRIMARY KEY,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    total_trades INTEGER NOT NULL DEFAULT 0,
    total_volume DECIMAL(20,6) NOT NULL DEFAULT 0,
    total_pnl DECIMAL(20,6) NOT NULL DEFAULT 0,
    last_trade_at TIMESTAMP WITH TIME ZONE
);

-- Table: activity_trades
-- Named activity_trades to avoid conflicts with Avantis trades; maps to spec "trades"
CREATE TABLE IF NOT EXISTS activity_trades (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    wallet_address VARCHAR(42) NOT NULL REFERENCES activity_users(wallet_address) ON DELETE CASCADE,
    pair VARCHAR(20) NOT NULL,
    direction VARCHAR(5) NOT NULL CHECK (direction IN ('LONG', 'SHORT')),
    leverage INTEGER NOT NULL,
    collateral DECIMAL(20,6) NOT NULL,
    volume DECIMAL(20,6) NOT NULL,
    entry_price DECIMAL(20,10) NOT NULL,
    tp_price DECIMAL(20,10),
    liq_price DECIMAL(20,10),
    exit_price DECIMAL(20,10),
    pnl DECIMAL(20,6),
    opened_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    closed_at TIMESTAMP WITH TIME ZONE,
    status VARCHAR(20) NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed', 'liquidated')),
    tx_hash_open VARCHAR(66),
    tx_hash_close VARCHAR(66)
);

-- Indexes for activity_trades
CREATE INDEX IF NOT EXISTS idx_activity_trades_wallet ON activity_trades(wallet_address);
CREATE INDEX IF NOT EXISTS idx_activity_trades_status ON activity_trades(status);
CREATE INDEX IF NOT EXISTS idx_activity_trades_opened_at ON activity_trades(opened_at DESC);
