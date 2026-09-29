# VERIDEX — Operations Guide

> Full operations documentation will be completed in Phase 19.

## Local Development

```bash
# Start infrastructure
docker compose up postgres redis -d

# Backend
cd backend
python -m venv .venv
.venv/Scripts/activate  # Windows
pip install -e ".[dev]"
uvicorn app.main:app --reload

# Frontend
cd frontend
npm install
npm run dev
```

## Docker Deployment

```bash
docker compose up --build
```

## Environment Variables

See `.env.example` for all available configuration options.

## Database Migrations

```bash
cd backend
alembic upgrade head          # Apply all migrations
alembic revision --autogenerate -m "description"  # Create migration
alembic downgrade -1          # Rollback one migration
```
