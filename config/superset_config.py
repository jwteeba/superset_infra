# Configuration file for Superset
import os
from datetime import timedelta
from typing import Optional
from superset.themes.types import Theme

from cachelib.redis import RedisCache
from celery.schedules import crontab

# Secret key for session management
SECRET_KEY = os.getenv("SUPERSET_SECRET_KEY")

# This is used as a workaround for the alerts & reports scheduler task to get the time
# celery beat triggered it, see https://github.com/celery/celery/issues/6974 for details
CELERY_BEAT_SCHEDULER_EXPIRES = timedelta(weeks=1)

# Connection to metadata database
SQLALCHEMY_DATABASE_URI = f"postgresql://{os.getenv('SUPERSET_META_USER')}:{os.getenv('SUPERSET_META_PASS')}@metadata_db:{os.getenv('SUPERSET_META_PORT')}/superset"

FEATURE_FLAGS = {
    "HORIZONTAL_FILTER_BAR": True,
    "DRILL_BY": True,
    "ENABLE_TEMPLATE_PROCESSING": True,
    "ALERT_REPORTS": True,
}

APP_NAME = "Superset"

class CeleryConfig:  # pylint: disable=too-few-public-methods
    broker_url = os.getenv("CELERY_BROKER_URL", "redis://redis:6379/0")
    imports = (
        "superset.sql_lab",
        "superset.tasks.scheduler",
        "superset.tasks.thumbnails",
        "superset.tasks.cache",
        "superset.tasks.slack",
    )
    result_backend = os.getenv("CELERY_RESULT_BACKEND", "redis://redis:6379/1")
    worker_prefetch_multiplier = 1
    task_acks_late = False
    task_annotations = {
        "sql_lab.get_sql_results": {
            "rate_limit": "100/s",
        },
    }
    beat_schedule = {
        "reports.scheduler": {
            "task": "reports.scheduler",
            "schedule": crontab(minute="*", hour="*"),
            "options": {"expires": int(CELERY_BEAT_SCHEDULER_EXPIRES.total_seconds())},
        },
        "reports.prune_log": {
            "task": "reports.prune_log",
            "schedule": crontab(minute=0, hour=0),
        },
    }

CELERY_CONFIG: type[CeleryConfig] | None = CeleryConfig


# Driver Settings
WEBDRIVER_BASEURL = "http://superset_app:8088"
WEBDRIVER_BASEURL_USER_FRIENDLY = "http://localhost:8088"

# Email SMTP Configurations
SMTP_HOST = "smtp.gmail.com"
SMTP_PORT = 587
SMTP_STARTTLS = True
SMTP_SSL_SERVER_AUTH = True 
SMTP_SSL = False
SMTP_USER = os.getenv("SMTP_USER")
SMTP_PASSWORD = os.getenv("SMTP_PASSWORD")
SMTP_MAIL_FROM = SMTP_USER
EMAIL_REPORTS_SUBJECT_PREFIX = "[Superset] "

# Configuring Caching
REDIS_CACHE_URL = os.getenv("REDIS_CACHE_URL", "redis://redis:6379/0")
REDIS_HOST = os.getenv("REDIS_HOST", "redis")
REDIS_PORT = os.getenv("REDIS_PORT", 6379)

# Cache Config
CACHE_CONFIG = {
    "CACHE_TYPE": "RedisCache",
    "CACHE_DEFAULT_TIMEOUT": 86400,
    "CACHE_KEY_PREFIX": "superset_",
    "CACHE_REDIS_URL": REDIS_CACHE_URL,
}

# Data Query Cache
DATA_CACHE_CONFIG = {
    "CACHE_TYPE": "RedisCache",
    "CACHE_REDIS_URL": REDIS_CACHE_URL,
    "CACHE_DEFAULT_TIMEOUT": 86400,
    "CACHE_KEY_PREFIX": "superset_results_cache_",
}

# Dashboard Filter State Cache
FILTER_STATE_CACHE_CONFIG = {
    "CACHE_TYPE": "RedisCache",
    "CACHE_REDIS_URL": REDIS_CACHE_URL,
    "CACHE_DEFAULT_TIMEOUT": 86400,
    "CACHE_KEY_PREFIX": "superset_filter_cache_",
}

# Explore Form Data Cache
EXPLORE_FORM_DATA_CACHE_CONFIG = {
    "CACHE_TYPE": "RedisCache",
    "CACHE_REDIS_URL": REDIS_CACHE_URL,
    "CACHE_DEFAULT_TIMEOUT": 86400,
    "CACHE_KEY_PREFIX": "superset_explore_cache_",
}

RESULT_BACKEND = RedisCache(
    host=os.getenv("REDIS_HOST"),
    port=os.getenv("REDIS_PORT"),
    key_prefix="superset_results_backend_",
)

ALERT_REPORTS_NOTIFICATION_DRY_RUN = False

## Set up a text next to the logo
LOGO_RIGHT_TEXT: str = "Created by Jah-Wilson Teeba"

## Set up a tooltop text for the logo
LOGO_TOOLTIP = ""

## Set up a favourite icon
FAVICONS = [{"href": "/static/assets/images/custom_logos/favicon.png"}]

# Custom branding
APP_ICON = "/static/assets/images/custom_logos/logo.png"
