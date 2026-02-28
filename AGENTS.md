# AGENTS.md

## Cursor Cloud specific instructions

### Project overview

YOLO is a monorepo with two services — a **Next.js 16 frontend** (`frontend/`) and a **FastAPI backend** (`backend/`). See `README.md` for full architecture and API endpoint docs.

### Running services

| Service | Command | Port | Working dir |
|---------|---------|------|-------------|
| Backend | `source venv/bin/activate && uvicorn app.main:app --reload --port 8000` | 8000 | `backend/` |
| Frontend | `npm run dev` | 3000 | `frontend/` |

Start the backend before the frontend. The frontend calls the backend via `NEXT_PUBLIC_API_URL` (configured in `.env.local` to point to the backend port).

### Environment variables

- **Backend** (`backend/.env`): Only `BASE_RPC_URL` is required. Use `https://mainnet.base.org` (public, no key needed). `DATABASE_URL` is optional — when absent, the app runs in open-access bypass mode (no access code gating).
- **Frontend** (`frontend/.env.local`): `NEXT_PUBLIC_API_URL`, `NEXT_PUBLIC_BASE_RPC_URL`, `NEXT_PUBLIC_PRIVY_APP_ID`, and `NEXT_PUBLIC_TACHYON_API_KEY` are listed. Privy and Tachyon need real keys for wallet auth and gas sponsorship; without them the UI loads but wallet connect and trading won't function.

### Lint / Build / Test

- **Frontend lint**: `npm run lint` (in `frontend/`). Pre-existing warnings/errors exist in the codebase; exit code 1 is expected.
- **Frontend build**: `npm run build` (in `frontend/`). Compiles cleanly.
- **Backend**: No dedicated test or lint command is configured. Verify by starting the server and hitting `GET /health`.

### Non-obvious caveats

- `python3.12-venv` and `python3.12-dev` system packages are needed for the backend venv and native extensions (e.g. `lru-dict`). The VM snapshot includes these.
- The backend `config.py` reads `.env` from the working directory (`backend/`), so always start uvicorn from within `backend/`.
- The frontend first compile on `npm run dev` takes ~15-20s. First request to the dev server may time out; subsequent requests are fast.
