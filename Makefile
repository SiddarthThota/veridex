# ============================================================
# Veridex — Makefile
# ============================================================
# Primary for CI (Linux/macOS). Windows users: see scripts/*.ps1
# ============================================================

.PHONY: help install dev test lint typecheck security format docker-up docker-down clean

help: ## Show this help
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | sort | \
		awk 'BEGIN {FS = ":.*?## "}; {printf "\033[36m%-20s\033[0m %s\n", $$1, $$2}'

# ──────────────────────────────────────────
# Backend
# ──────────────────────────────────────────
install: ## Install backend dependencies
	cd backend && python -m pip install -e ".[dev]"

dev: ## Start backend dev server
	cd backend && python -m uvicorn app.main:app --reload --port 8000

test: ## Run backend tests
	cd backend && python -m pytest tests/ -v --tb=short

lint: ## Run linter (ruff)
	cd backend && python -m ruff check app/ tests/

typecheck: ## Run type checker (mypy)
	cd backend && python -m mypy app/

security: ## Run security scanner (bandit)
	cd backend && python -m bandit -r app/ -c pyproject.toml

format: ## Format code (ruff)
	cd backend && python -m ruff format app/ tests/
	cd backend && python -m ruff check --fix app/ tests/

# ──────────────────────────────────────────
# Frontend
# ──────────────────────────────────────────
frontend-install: ## Install frontend dependencies
	cd frontend && npm install

frontend-dev: ## Start frontend dev server
	cd frontend && npm run dev

frontend-build: ## Build frontend
	cd frontend && npm run build

frontend-lint: ## Lint frontend
	cd frontend && npm run lint

# ──────────────────────────────────────────
# Docker
# ──────────────────────────────────────────
docker-up: ## Start all services with Docker Compose
	docker compose up --build -d

docker-down: ## Stop all services
	docker compose down

docker-clean: ## Stop services and remove volumes
	docker compose down -v --remove-orphans

# ──────────────────────────────────────────
# Database
# ──────────────────────────────────────────
migrate: ## Run database migrations
	cd backend && python -m alembic upgrade head

migrate-create: ## Create a new migration (use: make migrate-create msg="description")
	cd backend && python -m alembic revision --autogenerate -m "$(msg)"

# ──────────────────────────────────────────
# CLI
# ──────────────────────────────────────────
seed: ## Seed database with demo data
	cd backend && python -m app.cli seed

verify-audit: ## Verify audit hash chain
	cd backend && python -m app.cli verify-audit

eval: ## Run evaluation suite
	cd backend && python -m app.cli eval

demo: ## Run full demo scenario
	cd backend && python -m app.cli run-demo

# ──────────────────────────────────────────
# Quality
# ──────────────────────────────────────────
check: lint typecheck test ## Run all quality checks

clean: ## Remove build artifacts
	find . -type d -name __pycache__ -exec rm -rf {} + 2>/dev/null || true
	find . -type d -name .pytest_cache -exec rm -rf {} + 2>/dev/null || true
	find . -type d -name .mypy_cache -exec rm -rf {} + 2>/dev/null || true
	find . -type d -name .ruff_cache -exec rm -rf {} + 2>/dev/null || true
	rm -rf backend/dist backend/build backend/*.egg-info
