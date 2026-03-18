# Access Code Deployment Guide

## Overview

Access codes gate the app. Users must redeem a code (e.g. `YOLO-MOON-APE`) before using the app. Codes are stored in PostgreSQL.

## Architecture

```
Frontend (Vercel)          Backend (Railway)           Postgres (Railway)
     |                            |                            |
     |-- POST /access/redeem ---->|-- validate code             |
     |                            |-- insert into DB ---------->|
     |<-- { success: true } ------|                            |
     |                            |                            |
     |-- GET /access/check/{addr}>|-- query DB ---------------->|
     |<-- { hasAccess: true } ----|                            |
```

## Railway (Backend)

### 1. Required Environment Variables

| Variable | Required | Example |
|----------|----------|---------|
| `BASE_RPC_URL` | Yes | `https://base-mainnet.g.alchemy.com/v2/YOUR_KEY` |
| `DATABASE_URL` | Yes (for access codes) | Auto from Postgres service |
| `CORS_ORIGINS` | Yes | `["https://tradeyolo.fun"]` or `https://tradeyolo.fun` |
| `ADMIN_API_KEY` | Yes (to generate codes) | `your-secret-key` |

### 2. Connect Postgres to Backend

1. In Railway project, add **Postgres** service if not present
2. Select your **backend** service → **Variables**
3. Click **Add Reference** → select `DATABASE_URL` from Postgres
4. Or copy the connection string from Postgres → Variables → `DATABASE_URL`

### 3. Generate Access Codes

```bash
# Generate 10 codes
curl -X POST https://YOUR-RAILWAY-URL/admin/codes/generate \
  -H "Content-Type: application/json" \
  -H "X-Admin-Key: YOUR_ADMIN_API_KEY" \
  -d '{"count": 10}'

# Response: { "codes": ["YOLO-MOON-APE", ...], "count": 10 }
```

### 4. Verify Backend

```bash
# Health (no DB needed)
curl https://YOUR-RAILWAY-URL/health
# → {"status":"ok","version":"1.0.0"}

# Check access (requires DB)
curl https://YOUR-RAILWAY-URL/access/check/0xYourWalletAddress
# → {"hasAccess":false} or {"hasAccess":true}
```

## Vercel (Frontend)

### Required Environment Variable

| Variable | Value |
|----------|-------|
| `BACKEND_URL` | `https://YOUR-RAILWAY-URL` (no trailing slash) |

**Important:** The `/api/backend` proxy uses `BACKEND_URL`. After changing env vars, **redeploy** the frontend.

## Deployment Checklist

- [ ] Railway backend deployed and `/health` returns 200
- [ ] Postgres service added and `DATABASE_URL` referenced in backend
- [ ] `CORS_ORIGINS` includes your frontend domain (e.g. `https://tradeyolo.fun`)
- [ ] `ADMIN_API_KEY` set (for generating codes)
- [ ] Generated at least one access code via `/admin/codes/generate`
- [ ] Vercel `BACKEND_URL` = Railway backend URL
- [ ] Vercel redeployed after setting env var

## Troubleshooting

| Symptom | Cause | Fix |
|---------|-------|-----|
| "Application failed to respond" | Wrong port | Ensure Dockerfile uses `${PORT}` |
| "Connection failed" | Frontend can't reach backend | Check `BACKEND_URL` on Vercel, CORS |
| "Backend unreachable" on gate | Same as above | Verify backend URL in browser console |
| "Code not recognized" | Code not in DB | Generate codes via admin API |
| 500 on /access | DB connection failed | Check `DATABASE_URL`, Railway Postgres logs |
