"""Thin wrapper around the native Google Gen AI SDK (`google-genai`).

The app runs on Gemini via `client.models.generate_content` / `generate_content_stream`.
Higher layers use four things and never import `google.genai` directly:
  - chat_json / chat_text : one-shot JSON / free-text completions (extraction, insights, drafts)
  - generate / generate_stream : raw calls the chat agent drives for function-calling
  - LLMNotConfigured / LLMUpstreamError : typed errors routers translate into clean HTTP responses
"""

import collections
import json
import re
import threading
import time

from google import genai
from google.genai import errors as genai_errors
from google.genai import types

from ..config import LLM_API_KEY, LLM_MAX_RPM, LLM_MODEL, LLM_PROVIDER


class LLMNotConfigured(Exception):
    pass


class LLMUpstreamError(Exception):
    """The LLM provider was reachable but returned an error (rate limit, auth, timeout,
    outage). Carries an HTTP `status_code` so routers can surface a clean, actionable
    response instead of a bare 500."""

    def __init__(self, message: str, status_code: int = 502):
        super().__init__(message)
        self.status_code = status_code


# Gemini's free tier caps requests *per minute*, so a burst of tool-calling turns can trip
# a 429 that clears within seconds. Retry those on the non-streaming path; only a limit that
# persists across all retries (e.g. the daily cap) reaches the user.
_RATE_LIMIT_RETRIES = 2
_MAX_RETRY_SLEEP = 30.0
# Fail fast instead of hanging: cap each request (milliseconds, per google-genai HttpOptions).
_REQUEST_TIMEOUT_MS = 45_000


def _error_code(e: genai_errors.APIError) -> int:
    code = getattr(e, "code", None)
    if isinstance(code, int):
        return code
    m = re.search(r"\b(4\d\d|5\d\d)\b", str(e))
    return int(m.group(1)) if m else 502


def _retry_delay(e: Exception, attempt: int) -> float:
    """Seconds to wait before retrying a 429. Gemini includes a RetryInfo delay
    (e.g. 'retryDelay': '7s') in the error body; fall back to exponential backoff."""
    m = re.search(r"retryDelay['\"]?\s*:\s*['\"]?(\d+)", str(e))
    delay = float(m.group(1)) if m else 5.0 * (attempt + 1)
    return min(delay, _MAX_RETRY_SLEEP)


def _raise_upstream(e: genai_errors.APIError) -> "LLMUpstreamError":
    """Translate a google-genai APIError into an LLMUpstreamError. Returns the exception
    so callers can `raise _raise_upstream(e)` and keep the traceback readable."""
    code = _error_code(e)
    if code == 429:
        return LLMUpstreamError(
            f"{LLM_PROVIDER} is rate-limited (429) and retrying didn't clear it. "
            "Per-minute limits usually reset within a minute — try again shortly. "
            "If it persists, the daily free-tier quota may be exhausted: wait, "
            "switch the model/key, or use a paid key.",
            429,
        )
    if code in (401, 403):
        return LLMUpstreamError(
            f"{LLM_PROVIDER} rejected the request ({code}). Check GEMINI_API_KEY and the model name.",
            code,
        )
    return LLMUpstreamError(f"{LLM_PROVIDER} returned an error ({code}).", 502 if code >= 500 else code)


class _RateLimiter:
    """Sliding-window request pacer: allows at most `max_per_min` calls in any rolling 60s
    window. Thread-safe, and BLOCKS the caller until a slot is free — so a burst (bulk
    upload, a 40-message Gmail sync) is spread out to stay under the provider's RPM cap
    instead of firing all at once and getting 429'd. `max_per_min <= 0` disables pacing."""

    def __init__(self, max_per_min: int):
        self.max = max_per_min
        self._lock = threading.Lock()
        self._calls: "collections.deque[float]" = collections.deque()

    def acquire(self) -> None:
        if self.max <= 0:
            return
        while True:
            with self._lock:
                now = time.monotonic()
                while self._calls and now - self._calls[0] >= 60.0:
                    self._calls.popleft()
                if len(self._calls) < self.max:
                    self._calls.append(now)
                    return
                wait = 60.0 - (now - self._calls[0])
            time.sleep(min(max(wait, 0.0), 5.0) + 0.01)


_LIMITER = _RateLimiter(LLM_MAX_RPM)


_client: "genai.Client | None" = None


def get_client() -> "genai.Client":
    global _client
    if not LLM_API_KEY:
        raise LLMNotConfigured(
            "No LLM API key set. Copy backend/.env.example to backend/.env and add "
            "GEMINI_API_KEY (LLM_PROVIDER=gemini)."
        )
    if _client is None:
        _client = genai.Client(
            api_key=LLM_API_KEY,
            http_options=types.HttpOptions(timeout=_REQUEST_TIMEOUT_MS),
        )
    return _client


def generate(contents, config: "types.GenerateContentConfig"):
    """One non-streaming completion, with 429 retry and error translation. `contents` may
    be a plain string or a list of types.Content. Returns the raw GenerateContentResponse."""
    client = get_client()
    for attempt in range(_RATE_LIMIT_RETRIES + 1):
        try:
            _LIMITER.acquire()  # stay under the provider's RPM cap (each attempt is a call)
            return client.models.generate_content(model=LLM_MODEL, contents=contents, config=config)
        except genai_errors.APIError as e:
            if _error_code(e) == 429 and attempt < _RATE_LIMIT_RETRIES:
                time.sleep(_retry_delay(e, attempt))
                continue
            raise _raise_upstream(e) from e
        except (LLMNotConfigured, LLMUpstreamError):
            raise
        except Exception as e:
            raise LLMUpstreamError(f"Couldn't reach {LLM_PROVIDER}: {e}", 502) from e


def generate_stream(contents, config: "types.GenerateContentConfig"):
    """Streaming completion — yields raw chunks. No mid-stream retry (fail fast); errors are
    translated so the SSE route can emit a clean error event."""
    client = get_client()
    try:
        _LIMITER.acquire()  # stay under the provider's RPM cap
        stream = client.models.generate_content_stream(model=LLM_MODEL, contents=contents, config=config)
        for chunk in stream:
            yield chunk
    except genai_errors.APIError as e:
        raise _raise_upstream(e) from e
    except (LLMNotConfigured, LLMUpstreamError):
        raise
    except Exception as e:
        raise LLMUpstreamError(f"Couldn't reach {LLM_PROVIDER}: {e}", 502) from e


def chat_json(
    system: str,
    user: str,
    temperature: float = 0.0,
    *,
    require_keys: list[str] | None = None,
    retries: int = 1,
) -> dict:
    """One-shot completion forced into JSON mode. Returns the parsed object.

    Retries up to `retries` times if the model returns unparseable JSON or omits any of
    `require_keys` — a bad/partial call otherwise silently drops records."""
    config = types.GenerateContentConfig(
        system_instruction=system,
        temperature=temperature,
        response_mime_type="application/json",
    )
    last_error: Exception | None = None
    for _ in range(retries + 1):
        resp = generate(user, config)
        content = (resp.text or "{}").strip()
        try:
            data = _parse_json_lenient(content)
        except (json.JSONDecodeError, ValueError) as e:
            last_error = e
            continue
        if require_keys and not all(k in data for k in require_keys):
            last_error = ValueError(f"response missing required keys {require_keys}; got {list(data)}")
            continue
        return data
    raise last_error or ValueError("chat_json failed with no response")


def chat_text(system: str, user: str, temperature: float = 0.3) -> str:
    """One-shot completion returning free-form text (e.g. a drafted email)."""
    config = types.GenerateContentConfig(system_instruction=system, temperature=temperature)
    resp = generate(user, config)
    return (resp.text or "").strip()


def _parse_json_lenient(text: str) -> dict:
    """Parse JSON even if the model wrapped it in prose or code fences."""
    text = text.strip()
    if text.startswith("```"):
        text = text.strip("`")
        if text.startswith("json"):
            text = text[4:]
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        start, end = text.find("{"), text.rfind("}")
        if start != -1 and end > start:
            return json.loads(text[start : end + 1])
        raise
