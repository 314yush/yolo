# Deployment Guide

This guide will help you deploy the YOLO Trading application:
- **Backend** (FastAPI) → Railway.app
- **Frontend** (Next.js) → Vercel

## Prerequisites

1. GitHub repository with your code pushed
2. Railway.app account (sign up at https://railway.app)
3. Vercel account (sign up at https://vercel.com)
4. Base RPC URL (e.g., from Alchemy: https://base-mainnet.g.alchemy.com/v2/YOUR_KEY)

---

## Backend Deployment (Railway.app)

### Step 1: Connect Repository to Railway

1. Go to [Railway.app](https://railway.app) and sign in
2. Click **"New Project"**
3. Select **"Deploy from GitHub repo"**
4. Choose your repository
5. Railway will detect the `Dockerfile` in the `backend/` directory

### Step 2: Configure Root Directory

1. In your Railway project, go to **Settings**
2. Under **"Root Directory"**, set it to: `backend`
3. This tells Railway to use the `backend/` folder as the root

### Step 3: Set Environment Variables

In Railway, go to **Variables** tab and add:

```
BASE_RPC_URL=https://base-mainnet.g.alchemy.com/v2/YOUR_ALCHEMY_KEY
CORS_ORIGINS=https://your-frontend-domain.vercel.app
DEBUG=false
```

**Important Notes:**
- Replace `YOUR_ALCHEMY_KEY` with your actual Alchemy API key
- Replace `your-frontend-domain.vercel.app` with your actual Vercel domain (you'll get this after deploying the frontend)
- `CORS_ORIGINS` should be a comma-separated list if you have multiple origins, or a single URL
- You can use `["*"]` for development, but restrict it in production

### Step 4: Deploy

1. Railway will automatically deploy when you push to your main branch
2. Once deployed, Railway will provide a public URL (e.g., `https://your-app.up.railway.app`)
3. **Copy this URL** - you'll need it for the frontend configuration

### Step 5: Verify Deployment

Visit `https://your-railway-url.up.railway.app/health` - you should see:
```json
{"status": "ok", "version": "1.0.0"}
```

---

## Frontend Deployment (Vercel)

### Step 1: Connect Repository to Vercel

1. Go to [Vercel](https://vercel.com) and sign in
2. Click **"Add New Project"**
3. Import your GitHub repository
4. Vercel will auto-detect Next.js

### Step 2: Configure Project Settings

1. **Root Directory**: Set to `frontend` (important!)
2. **Framework Preset**: Next.js (auto-detected)
3. Vercel will automatically detect Next.js and use the correct build settings

### Step 3: Set Environment Variables

In Vercel, go to **Environment Variables** and add:

```
NEXT_PUBLIC_BASE_RPC_URL=https://base-mainnet.g.alchemy.com/v2/YOUR_ALCHEMY_KEY
NEXT_PUBLIC_API_URL=https://your-railway-url.up.railway.app
```

**Important Notes:**
- Replace `YOUR_ALCHEMY_KEY` with your actual Alchemy API key
- Replace `your-railway-url.up.railway.app` with your Railway backend URL (from Step 4 of backend deployment)
- **CRITICAL**: `NEXT_PUBLIC_API_URL` is required - without it, the frontend will try to connect to `localhost:8000` and fail
- Make sure to add these to **Production**, **Preview**, and **Development** environments
- After adding environment variables, you must **redeploy** your Vercel project for them to take effect

### Step 4: Deploy

1. Click **"Deploy"**
2. Vercel will build and deploy your frontend
3. Once complete, you'll get a URL like `https://your-app.vercel.app`

### Step 5: Update Backend CORS

1. Go back to Railway
2. Update the `CORS_ORIGINS` environment variable with your Vercel URL:
   ```
   CORS_ORIGINS=https://your-app.vercel.app
   ```
3. Railway will automatically redeploy with the new CORS settings

### Step 6: Verify Deployment

1. Visit your Vercel URL
2. The app should load and connect to your Railway backend
3. Check browser console for any connection errors

---

## Continuous Deployment

Both platforms support automatic deployments:

- **Railway**: Automatically deploys on push to your main branch
- **Vercel**: Automatically deploys on push to your main branch (and creates preview deployments for PRs)

---

## Troubleshooting

### Backend Issues

**Problem**: Backend not starting
- Check Railway logs for errors
- Verify `BASE_RPC_URL` is set correctly
- Ensure Dockerfile is in the `backend/` directory

**Problem**: CORS errors
- Verify `CORS_ORIGINS` includes your Vercel domain
- Check that the URL matches exactly (including `https://`)

**Problem**: Health check fails
- Check that port 8000 is exposed in Dockerfile
- Verify Railway is using the correct root directory

### Frontend Issues

**Problem**: Frontend can't connect to backend
- Verify `NEXT_PUBLIC_API_URL` is set correctly in Vercel
- Check that the backend URL is accessible (visit `/health` endpoint)
- Ensure CORS is configured correctly on the backend

**Problem**: Build fails
- Check Vercel build logs
- Verify all dependencies are in `package.json`
- Ensure TypeScript compilation passes locally

**Problem**: Environment variables not working
- Remember: Next.js requires `NEXT_PUBLIC_` prefix for client-side variables
- Redeploy after adding new environment variables
- Check that variables are set for the correct environment (Production/Preview/Development)

---

## Security Best Practices

1. **Never commit `.env` files** - They're already in `.gitignore`
2. **Use different RPC keys** for development and production if possible
3. **Restrict CORS origins** in production (don't use `["*"]`)
4. **Monitor Railway and Vercel logs** for any suspicious activity
5. **Use Railway's private networking** if available for internal communication

---

## Cost Considerations

- **Railway**: Offers a free tier with $5 credit/month. Check current pricing.
- **Vercel**: Offers a generous free tier for Next.js apps. Check current pricing.

---

## Additional Resources

- [Railway Documentation](https://docs.railway.app)
- [Vercel Documentation](https://vercel.com/docs)
- [Next.js Deployment](https://nextjs.org/docs/deployment)
