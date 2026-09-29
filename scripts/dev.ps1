# Veridex — Development Helper Scripts (Windows PowerShell)
# Usage: .\scripts\dev.ps1 <command>

param(
    [Parameter(Position=0)]
    [string]$Command = "help"
)

$ProjectRoot = Split-Path -Parent $PSScriptRoot
$BackendDir = Join-Path $ProjectRoot "backend"
$FrontendDir = Join-Path $ProjectRoot "frontend"

function Show-Help {
    Write-Host ""
    Write-Host "Veridex Development Commands" -ForegroundColor Cyan
    Write-Host "=============================" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "  install          Install backend dependencies"
    Write-Host "  dev              Start backend dev server"
    Write-Host "  test             Run backend tests"
    Write-Host "  lint             Run ruff linter"
    Write-Host "  typecheck        Run mypy type checker"
    Write-Host "  format           Format code with ruff"
    Write-Host "  frontend-install Install frontend dependencies"
    Write-Host "  frontend-dev     Start frontend dev server"
    Write-Host "  docker-up        Start Docker Compose stack"
    Write-Host "  docker-down      Stop Docker Compose stack"
    Write-Host "  migrate          Run database migrations"
    Write-Host "  seed             Seed database with demo data"
    Write-Host "  check            Run all quality checks"
    Write-Host ""
}

switch ($Command) {
    "install" {
        Push-Location $BackendDir
        python -m venv .venv
        & .\.venv\Scripts\Activate.ps1
        python -m pip install -e ".[dev]"
        Pop-Location
    }
    "dev" {
        Push-Location $BackendDir
        & .\.venv\Scripts\Activate.ps1
        python -m uvicorn app.main:app --reload --port 8000
        Pop-Location
    }
    "test" {
        Push-Location $BackendDir
        & .\.venv\Scripts\Activate.ps1
        python -m pytest tests/ -v --tb=short
        Pop-Location
    }
    "lint" {
        Push-Location $BackendDir
        & .\.venv\Scripts\Activate.ps1
        python -m ruff check app/ tests/
        Pop-Location
    }
    "typecheck" {
        Push-Location $BackendDir
        & .\.venv\Scripts\Activate.ps1
        python -m mypy app/
        Pop-Location
    }
    "format" {
        Push-Location $BackendDir
        & .\.venv\Scripts\Activate.ps1
        python -m ruff format app/ tests/
        python -m ruff check --fix app/ tests/
        Pop-Location
    }
    "frontend-install" {
        Push-Location $FrontendDir
        npm install
        Pop-Location
    }
    "frontend-dev" {
        Push-Location $FrontendDir
        npm run dev
        Pop-Location
    }
    "docker-up" {
        Push-Location $ProjectRoot
        docker compose up --build -d
        Pop-Location
    }
    "docker-down" {
        Push-Location $ProjectRoot
        docker compose down
        Pop-Location
    }
    "migrate" {
        Push-Location $BackendDir
        & .\.venv\Scripts\Activate.ps1
        python -m alembic upgrade head
        Pop-Location
    }
    "seed" {
        Push-Location $BackendDir
        & .\.venv\Scripts\Activate.ps1
        python -m app.cli seed
        Pop-Location
    }
    "check" {
        Push-Location $BackendDir
        & .\.venv\Scripts\Activate.ps1
        python -m ruff check app/ tests/
        python -m mypy app/
        python -m pytest tests/ -v --tb=short
        Pop-Location
    }
    default {
        Show-Help
    }
}
