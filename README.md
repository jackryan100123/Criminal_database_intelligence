# Criminal Database Intelligence System (Phase 1)

FastAPI backend + React frontend + PostgreSQL + Elasticsearch (Docker).

## Prerequisites
- Docker / Docker Compose
- Node.js + npm
- Python 3.10+

## Start dependencies (Postgres + Elasticsearch)
```bash
docker-compose up -d
```
Elasticsearch should be reachable at: `http://localhost:9200`.

## One-command Full Stack (Recommended)
```bash
docker-compose up -d --build
```

Frontend UI: `http://localhost:5173`  
Backend health: `http://localhost:8000/health`

Note: the frontend container proxies API calls to the backend, so the browser should not hit CORS issues.

## Backend
```bash
cd backend
python -m venv .venv
.venv\Scripts\activate   # Windows
pip install -r requirements.txt

# Backend loads .env from backend/ folder.
cp ..\.env.example .env
uvicorn app.main:app --reload --port 8000
```

## Frontend
```bash
cd frontend
cp .env.example .env
npm install
npm run dev
```

Frontend dev server runs at `http://localhost:5173`.

## What to test (Phase 1)
1. Login/register in the UI.
2. Create a `criminal` profile (store your `profile_id`).
3. Create a `user` or another `criminal` profile.
4. Link the second profile into the first as `supporter`/`follower`.
5. Use `Search` (name / FIR / social_media / organization) and verify results include:
   - `profiles` (matched criminals)
   - `related_profiles` (connected supporters/followers)

