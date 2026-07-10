import os
from pathlib import Path

from dotenv import load_dotenv

BACKEND_DIR = Path(__file__).resolve().parent.parent
load_dotenv(BACKEND_DIR / ".env")

FIREWORKS_API_KEY = os.getenv("FIREWORKS_API_KEY", "")
FIREWORKS_BASE_URL = os.getenv("FIREWORKS_BASE_URL", "https://api.fireworks.ai/inference/v1")
FIREWORKS_MODEL = os.getenv(
    "FIREWORKS_MODEL", "accounts/fireworks/models/llama-v3p3-70b-instruct"
)

# Gemini uses Google's OpenAI-compatible endpoint, so the same `openai` client works.
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY", "")
GEMINI_BASE_URL = os.getenv(
    "GEMINI_BASE_URL", "https://generativelanguage.googleapis.com/v1beta/openai/"
)
# gemini-2.5-flash is deprecated ("no longer available to new users"); default to 3.5-flash.
GEMINI_MODEL = os.getenv("GEMINI_MODEL", "gemini-3.5-flash")

# --- Unified LLM config (spec §3A.1) --------------------------------------------------
# `LLM_PROVIDER` is first-class: gemini | fireworks | off (default off — the app runs
# fully on seed data with no key). `LLM_API_KEY/MODEL/BASE_URL` override the per-provider
# values. Back-compat: if LLM_PROVIDER is unset, infer it from whichever provider key is
# present so existing .env files (GEMINI_API_KEY / FIREWORKS_API_KEY) keep working.
_PROVIDER_DEFAULTS = {
    "gemini": (GEMINI_BASE_URL, GEMINI_MODEL, GEMINI_API_KEY),
    "fireworks": (FIREWORKS_BASE_URL, FIREWORKS_MODEL, FIREWORKS_API_KEY),
}

LLM_PROVIDER = os.getenv("LLM_PROVIDER", "").strip().lower()
if not LLM_PROVIDER:
    LLM_PROVIDER = "gemini" if GEMINI_API_KEY else ("fireworks" if FIREWORKS_API_KEY else "off")

if LLM_PROVIDER == "off" or LLM_PROVIDER not in _PROVIDER_DEFAULTS:
    LLM_PROVIDER = "off"
    LLM_API_KEY = ""
    LLM_BASE_URL = ""
    LLM_MODEL = ""
else:
    _base, _model, _key = _PROVIDER_DEFAULTS[LLM_PROVIDER]
    LLM_API_KEY = os.getenv("LLM_API_KEY", "") or _key
    LLM_BASE_URL = os.getenv("LLM_BASE_URL", "") or _base
    LLM_MODEL = os.getenv("LLM_MODEL", "") or _model

AGENT_TOOL_MODE = os.getenv("AGENT_TOOL_MODE", "native").lower()

GMAIL_CREDENTIALS_FILE = str(BACKEND_DIR / os.getenv("GMAIL_CREDENTIALS_FILE", "credentials.json"))
GMAIL_TOKEN_FILE = str(BACKEND_DIR / os.getenv("GMAIL_TOKEN_FILE", "token.json"))
GMAIL_MAX_MESSAGES = int(os.getenv("GMAIL_MAX_MESSAGES", "40"))

# DB location: DB_PATH (relative to backend/, or absolute) builds the sqlite URL; an
# explicit DATABASE_URL still wins if set.
DB_PATH = os.getenv("DB_PATH", "data.db")
_default_db_url = f"sqlite:///{DB_PATH if os.path.isabs(DB_PATH) else BACKEND_DIR / DB_PATH}"
DATABASE_URL = os.getenv("DATABASE_URL", _default_db_url)
