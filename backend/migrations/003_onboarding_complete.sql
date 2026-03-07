-- Migration: Add onboarding_complete to activity_users
-- Run: psql $DATABASE_URL -f migrations/003_onboarding_complete.sql

ALTER TABLE activity_users ADD COLUMN IF NOT EXISTS onboarding_complete BOOLEAN NOT NULL DEFAULT false;
