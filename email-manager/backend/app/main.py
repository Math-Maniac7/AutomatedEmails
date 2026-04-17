from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from slowapi.util import get_remote_address

from app.config import settings
from app.routers import auth, email_accounts, emails, templates, auto_replies, oauth

limiter = Limiter(key_func=get_remote_address)

app = FastAPI(
    title="Email Manager API",
    version="1.0.0",
    docs_url="/docs",
    redoc_url="/redoc",
)

# Rate limiting
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=[settings.frontend_origin],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Routers
app.include_router(auth.router)
app.include_router(email_accounts.router)
app.include_router(emails.router)
app.include_router(templates.router)
app.include_router(auto_replies.router)
app.include_router(oauth.router)


@app.get("/health")
async def health():
    return {"status": "ok"}
