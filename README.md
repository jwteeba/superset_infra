# Custom Superset Production Deployment

Production-ready Apache Superset deployment with Celery, Redis, and PostgreSQL.

## Architecture

See [ARCHITECTURE.md](ARCHITECTURE.md) for detailed system design and component diagrams.

## Structure

```
superset_infra/
├── assets/              # Static assets
├── cdk/                 # AWS CDK Deployment files
├── config/              # Configuration files
├── deployment/          # Docker Compose files
├── docker/              # Dockerfile and scripts
├── env/                 # Environment variables
└── requirements/        # Python dependencies
```

## Quick Start

### First Time Setup

```bash
# 1. Configure environment
cp env/.env.example env/.superset.env
# Edit env/.superset.env with your settings

# 2. Build images
make build

# 3. Start services
make up

# 4. Initialize Superset (creates admin user & database)
make init

# 5. Access Superset
# Open http://localhost:8088
# Login: admin / admin (or your configured credentials)
```

### Daily Usage

```bash
# Start services
make up

# View logs
make logs

# Stop services
make down
```

### Production

```bash
# Start production environment
make prod-up

# Stop production environment
make prod-down
```

## Configuration

1. Copy environment example:
   ```bash
   cp env/.env.example env/.superset.env
   ```

2. Update environment variables in `env/.superset.env` and `env/.metadata.env`

3. Customize `config/superset_config.py` for your needs

## Services

- **superset**: Main web application (port 8088)
- **metadata_db**: PostgreSQL database (port 5432)
- **redis**: Cache and message broker (port 6379)
- **celery_worker**: Async task worker
- **celery_beat**: Scheduled task scheduler

## Features

- ✅ Production-ready Gunicorn configuration
- ✅ Celery for async tasks and alerts
- ✅ Redis caching
- ✅ PostgreSQL metadata store
- ✅ Email alerts and reports
- ✅ Snowflake connector
- ✅ Health checks
- ✅ Proper logging

## Deployment

For production deployment, use `docker-compose.prod.yml` which includes:
- Health checks
- Alpine-based images for smaller size
- Optimized restart policies
- Proper service dependencies

## Maintenance

```bash
# View logs
make logs

# Clean up (removes containers and volumes)
make clean

# Restart services
make down && make up
```
