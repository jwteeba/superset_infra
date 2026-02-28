#!/bin/bash
set -euo pipefail

echo "Starting Superset webserver..."
exec gunicorn -c /app/gunicorn_config.py "${FLASK_APP}"
