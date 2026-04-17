from celery import Celery
from app.config import settings

celery_app = Celery(
    "email_manager",
    broker=settings.redis_url,
    backend=settings.redis_url.replace("/0", "/1"),
    include=[
        "app.workers.email_polling",
        "app.workers.auto_reply_processor",
    ],
)

celery_app.conf.update(
    task_serializer="json",
    result_serializer="json",
    accept_content=["json"],
    timezone="UTC",
    enable_utc=True,
    beat_schedule={
        "poll-all-accounts": {
            "task": "app.workers.email_polling.poll_all_active_accounts",
            "schedule": 60.0,  # every 60 seconds
        },
    },
    # Windows compatibility: use eventlet pool
    # Start with: celery -A app.workers.celery_app worker --pool=eventlet -c 10 -B
    worker_pool="eventlet",
)
