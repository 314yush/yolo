# Quick Deployment Checklist

## Backend (Railway) ✅

- [ ] Sign up/login to Railway.app
- [ ] Create new project from GitHub repo
- [ ] Set root directory to `backend`
- [ ] Add environment variables:
  - [ ] `BASE_RPC_URL` (your Alchemy RPC URL)
  - [ ] `CORS_ORIGINS` (will update after frontend deploy)
  - [ ] `DEBUG=false`
- [ ] Deploy and get Railway URL
- [ ] Test health endpoint: `https://your-url.up.railway.app/health`

## Frontend (Vercel) ✅

- [ ] Sign up/login to Vercel
- [ ] Import GitHub repository
- [ ] Set root directory to `frontend`
- [ ] Add environment variables:
  - [ ] `NEXT_PUBLIC_BASE_RPC_URL` (your Alchemy RPC URL)
  - [ ] `NEXT_PUBLIC_API_URL` (your Railway backend URL)
- [ ] Deploy and get Vercel URL
- [ ] Test frontend loads correctly

## Final Steps ✅

- [ ] Update Railway `CORS_ORIGINS` with Vercel URL
- [ ] Verify frontend can connect to backend
- [ ] Test full application flow
- [ ] Monitor logs for any errors

## Quick Commands Reference

### Test Backend Locally
```bash
cd backend
pip install -r requirements.txt
export BASE_RPC_URL="your-rpc-url"
uvicorn app.main:app --reload
```

### Test Frontend Locally
```bash
cd frontend
npm install
export NEXT_PUBLIC_BASE_RPC_URL="your-rpc-url"
export NEXT_PUBLIC_API_URL="http://localhost:8000"
npm run dev
```
