.PHONY: help build up down init logs clean prod-up prod-down

help:
	@echo "Available commands:"
	@echo "  make build      - Build Docker images"
	@echo "  make init       - Initialize Superset (create admin, db upgrade)"
	@echo "  make up         - Start development environment"
	@echo "  make down       - Stop development environment"
	@echo "  make prod-up    - Start production environment"
	@echo "  make prod-down  - Stop production environment"
	@echo "  make logs       - View logs"
	@echo "  make clean      - Remove containers and volumes"

build:
	cd deployment && docker-compose -f docker-compose.yml build

init:
	@echo "Starting services and initializing Superset..."
	cd deployment && docker-compose -f docker-compose.yml up -d metadata_db redis
	@echo "Waiting for database to be ready..."
	@sleep 10
	docker exec superset_app /docker/superset-init.sh || \
		(cd deployment && docker-compose -f docker-compose.yml up -d && sleep 5 && docker exec superset_app /docker/superset-init.sh)

up:
	cd deployment && docker-compose -f docker-compose.yml up -d

down:
	cd deployment && docker-compose -f docker-compose.yml down

prod-up:
	cd deployment && docker-compose -f docker-compose.prod.yml up -d

prod-down:
	cd deployment && docker-compose -f docker-compose.prod.yml down

logs:
	cd deployment && docker-compose -f docker-compose.yml logs -f

clean:
	cd deployment && docker-compose -f docker-compose.yml down -v
	docker system prune -f
