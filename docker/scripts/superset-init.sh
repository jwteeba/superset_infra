#!/bin/bash

# Exit on error
set -e

echo "Initializing Superset..."

# Create Admin user
echo "Creating admin user..."
superset fab create-admin \
    --username "$SUPERSET_USER" \
    --firstname Superset \
    --lastname Admin \
    --email example@admin.com \
    --password "$SUPERSET_PASSWORD"

# Upgrade the Superset database
echo "Upgrading the Superset database..."
superset db upgrade

# Initialize Superset (roles, permissions, etc.)
echo "Initializing Superset..."
superset init

echo "Superset initialization complete."

