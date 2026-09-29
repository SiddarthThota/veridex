"""Veridex CLI — Command-line interface for administration and operations."""

import typer

app = typer.Typer(
    name="veridex",
    help="Veridex — AI Agent Governance CLI",
    no_args_is_help=True,
)


@app.command()
def dev() -> None:
    """Start the development server."""
    import uvicorn

    uvicorn.run(
        "app.main:app",
        host="0.0.0.0",  # noqa: S104
        port=8000,
        reload=True,
        log_level="info",
    )


@app.command()
def seed() -> None:
    """Seed the database with demo data."""
    typer.echo("🌱 Seeding database... (not yet implemented)")


@app.command()
def test() -> None:
    """Run the test suite."""
    import subprocess
    import sys

    result = subprocess.run(
        [sys.executable, "-m", "pytest", "tests/", "-v"],
        cwd=".",
    )
    raise SystemExit(result.returncode)


@app.command(name="verify-audit")
def verify_audit() -> None:
    """Verify audit log hash chain integrity."""
    typer.echo("🔗 Verifying audit chain... (not yet implemented)")


@app.command(name="simulate-attack")
def simulate_attack() -> None:
    """Run security attack simulations."""
    typer.echo("🛡️ Running attack simulations... (not yet implemented)")


@app.command(name="run-demo")
def run_demo() -> None:
    """Execute the full demonstration scenario."""
    typer.echo("🎬 Running demo... (not yet implemented)")


@app.command(name="eval")
def run_eval() -> None:
    """Run the evaluation framework."""
    typer.echo("📊 Running evaluations... (not yet implemented)")


if __name__ == "__main__":
    app()
