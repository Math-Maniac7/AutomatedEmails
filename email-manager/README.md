# Email Manager MVP

This repo contains a FastAPI backend and a Vite/React frontend for a minimal email automation app:

- Create an account and sign in
- Connect an IMAP/SMTP mailbox
- View synced emails
- Create templates and auto-reply rules
- Manually trigger inbox sync from the UI

## What Was Finished

The backend now avoids crashing at startup when optional integrations are not configured:

- Missing `ENCRYPTION_KEY` falls back to a development-only key so local boot is possible
- Anthropic is only required when you actually use AI-powered rules
- Manual account sync falls back to inline processing if Celery/Redis is not running
- OAuth endpoints fail with a clear message instead of redirecting with empty credentials

## Local Run

### Backend

1. Install Python 3.11+.
2. Create and activate a virtualenv in `backend`.
3. Install dependencies:

```powershell
pip install -r requirements.txt
```

4. Copy `backend/.env.example` to `backend/.env`.
5. Set at least:

```env
DATABASE_URL=postgresql+asyncpg://postgres:password@localhost:5432/email_manager
JWT_SECRET_KEY=replace-this
FRONTEND_ORIGIN=http://localhost:5173
```

`ENCRYPTION_KEY` is strongly recommended, but the app can now boot without it for local development.

6. Start the API from `backend`:

```powershell
uvicorn app.main:app --reload
```

7. Run migrations:

```powershell
alembic upgrade head
```

### Frontend

1. Install Node dependencies from `frontend`:

```powershell
cmd /c npm install
```

2. Copy `frontend/.env.example` to `frontend/.env`.
3. Start the app:

```powershell
cmd /c npm run dev
```

## Optional Services

- PostgreSQL is required
- Redis/Celery is optional for the MVP because manual sync now falls back inline
- Anthropic is optional unless you use AI actions
- Gmail/Outlook OAuth is optional unless you configure those credentials
