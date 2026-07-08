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
GEMINI_MODEL = os.getenv("GEMINI_MODEL", "gemini-2.5-flash")

# Resolve the active LLM provider: Gemini wins when its key is present, else Fireworks.
if GEMINI_API_KEY:
    LLM_PROVIDER = "gemini"
    LLM_API_KEY = GEMINI_API_KEY
    LLM_BASE_URL = GEMINI_BASE_URL
    LLM_MODEL = GEMINI_MODEL
else:
    LLM_PROVIDER = "fireworks"
    LLM_API_KEY = FIREWORKS_API_KEY
    LLM_BASE_URL = FIREWORKS_BASE_URL
    LLM_MODEL = FIREWORKS_MODEL

AGENT_TOOL_MODE = os.getenv("AGENT_TOOL_MODE", "native").lower()

GMAIL_CREDENTIALS_FILE = str(BACKEND_DIR / os.getenv("GMAIL_CREDENTIALS_FILE", "credentials.json"))
GMAIL_TOKEN_FILE = str(BACKEND_DIR / os.getenv("GMAIL_TOKEN_FILE", "token.json"))
GMAIL_MAX_MESSAGES = int(os.getenv("GMAIL_MAX_MESSAGES", "40"))

DATABASE_URL = os.getenv("DATABASE_URL", f"sqlite:///{BACKEND_DIR / 'data.db'}")
