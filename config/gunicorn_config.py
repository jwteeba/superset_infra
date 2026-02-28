import os

bind = f"0.0.0.0:{os.getenv('SUPERSET_PORT', '8088')}"
workers = int(os.getenv('GUNICORN_WORKERS', '4'))
worker_class = 'gevent'
timeout = int(os.getenv('GUNICORN_TIMEOUT', '120'))
keepalive = 5
max_requests = 1000
max_requests_jitter = 50
preload_app = True
accesslog = '-'
errorlog = '-'
loglevel = 'info'
