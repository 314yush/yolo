# Deploy Checklist – Safe for Existing Users

## Build Status
- ✅ Frontend: `npm run build` passes
- ✅ Backend: `pytest` passes (tests skip without DATABASE_URL; run with DB for full verification)

---

## Breaking Changes Audit

### 1. DELEGATE_FOR_ADDRESS Removal
- **What changed**: Removed `DELEGATE_FOR_ADDRESS` localStorage key and multi-account delegate tracking
- **Impact on existing users**: **None**
  - Old key `yolo_delegate_for_address` may remain in localStorage; we simply stop reading it
  - Delegate wallet (`DELEGATE_KEY`, `DELEGATE_ADDRESS`) unchanged
  - Avantis contract check in `useTxSigner` still verifies delegate before every trade
- **Behavior change**: When a different user logs in on same device, we no longer clear the delegate. Same delegate can serve multiple users; contract enforces per-user registration.

### 2. Database Migrations
- **001_activity_tracking.sql**: Creates `activity_users`, `activity_trades` – uses `CREATE TABLE IF NOT EXISTS`
- **002_activity_position_ids.sql**: Adds `pair_index`, `trade_index` – uses `ADD COLUMN IF NOT EXISTS`
- **003_onboarding_complete.sql**: Adds `onboarding_complete` – uses `ADD COLUMN IF NOT EXISTS`, `DEFAULT false`
- **Impact**: Safe for existing DBs. Run migrations before deploy:
  ```bash
  psql $DATABASE_URL -f backend/migrations/001_activity_tracking.sql
  psql $DATABASE_URL -f backend/migrations/002_activity_position_ids.sql
  psql $DATABASE_URL -f backend/migrations/003_onboarding_complete.sql
  ```

### 3. New Backend Endpoints (Additive)
- `/trades/log-open`, `/trades/log-close`, `/trades/log-close-by-position`
- `/activity/stats`, `/activity/trades`
- `/activity/onboarding-status`, `/activity/onboarding-complete`
- **Impact**: New only; no changes to existing endpoints.

### 4. Frontend
- Activity page, settings, PnL, charts, etc. – feature additions and fixes
- No removal of existing localStorage keys that would break current users
- `delegateStatus`, `closedTrades`, `onboarding`, `access`, `settings` – all backward compatible

---

## Pre-Deploy Steps

1. **Run migrations** on production DB (if not already applied)
2. **Set DATABASE_URL** in production env (for activity/onboarding features)
3. **Verify** backend starts: `uvicorn app.main:app --reload`

---

## Rollback

If issues arise:
- Frontend: Revert to previous deployment
- Backend: Migrations are additive; no rollback needed for schema
- localStorage: No destructive changes; old keys are ignored
