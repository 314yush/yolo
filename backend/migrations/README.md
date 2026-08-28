# Database Migrations

## Running migrations

### Option 1: Direct SQL (Railway / psql)

```bash
# From backend directory
psql $DATABASE_URL -f migrations/001_activity_tracking.sql
```

Or with Railway CLI:

```bash
railway run psql $DATABASE_URL -f migrations/001_activity_tracking.sql
```

### Option 2: SQLAlchemy create_all

If you prefer to let SQLAlchemy create tables from models, start the FastAPI app with `DATABASE_URL` set. The startup hook runs `init_db()` which creates any missing tables (including `activity_users` and `activity_trades`).

**Note:** Run the SQL migration first if you want indexes and constraints to match exactly. `create_all` will create tables but may not add all constraints from the migration.

### Option 3: Auto-migration on startup

The backend runs migration `002` automatically on startup (adds `pair_index`, `trade_index`, unique index). No manual `psql` needed. Deploy/restart and it applies.

## Migration files

- `001_activity_tracking.sql` – Activity users and trades tables
- `002_activity_position_ids.sql` – Adds `pair_index`, `trade_index` for close-by-position (also run automatically)
- `003_onboarding_complete.sql` – Adds `activity_users.onboarding_complete` (also run automatically)

## Deprecated: `access_codes`

Access codes were removed when signup became open. The `access_codes` table is no
longer modelled or queried, so `create_all` will not create it on fresh databases.
Existing deploys keep the table; dropping it is optional and not done automatically
so a rollback stays possible.
