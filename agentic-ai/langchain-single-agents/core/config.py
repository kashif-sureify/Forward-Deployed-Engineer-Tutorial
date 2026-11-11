"""Load API keys and the model name from the project's .env file."""

from __future__ import annotations

import os
from pathlib import Path

import certifi
from dotenv import load_dotenv

PROJECT_ROOT = Path(__file__).resolve().parent.parent
ENV_FILE = PROJECT_ROOT / ".env"
REQUIRED_ENV_VARS = ("GEMINI_API_KEY", "GEMINI_MODEL", "TAVILY_API_KEY", "WEATHER_API_KEY")


def load_config(env_file: Path = ENV_FILE) -> dict[str, str]:
    """Read the required settings, failing loudly if any are missing."""
    load_dotenv(env_file)
    os.environ["SSL_CERT_FILE"] = certifi.where()
    missing = [name for name in REQUIRED_ENV_VARS if not os.environ.get(name)]
    if missing:
        raise RuntimeError(f"Missing in .env: {', '.join(missing)}")
    return {name: os.environ[name] for name in REQUIRED_ENV_VARS}
