"""Thin wrapper around an OpenAI-compatible chat API (Fireworks or Gemini).

Provider is resolved in config: Gemini is used when GEMINI_API_KEY is set, else Fireworks.
Gemini exposes an OpenAI-compatible endpoint, so the same client and calls work for both.
"""

import json
import re
import time

from openai import (
    APIConnectionError,
    APIError,
    APIStatusError,
    APITimeoutError,
    OpenAI,
    RateLimitError,
)

from ..config import LLM_API_KEY, LLM_BASE_URL, LLM_MODEL, LLM_PROVIDER


class LLMNotConfigured(Exception):
    pass


class LLMUpstreamError(Exception):
    """The LLM provider was reachable but returned an error (rate limit, auth,
    timeout, outage). Carries an HTTP `status_code` so routers can surface a
    clean, actionable response instead of a bare 500."""

    def __init__(self, message: str, status_code: int = 502):
        super().__init__(message)
        self.status_code = status_code


# Gemini free tier caps requests *per minute*, so the agent's burst of tool-calling
# turns routinely trips a 429 that clears within seconds. Retry those here; only a
# limit that persists across all retries (e.g. the daily cap) reaches the user.
_RATE_LIMIT_RETRIES = 2
_MAX_RETRY_SLEEP = 30.0


def _retry_delay(e: RateLimitError, attempt: int) -> float:
    """Seconds to wait before retrying a 429. Gemini includes a RetryInfo delay
    (e.g. 'retryDelay': '7s') in the error body; fall back to exponential backoff."""
    m = re.search(r"retryDelay['\"]?\s*:\s*['\"]?(\d+)", str(e))
    delay = float(m.group(1)) if m else 5.0 * (attempt + 1)
    return min(delay, _MAX_RETRY_SLEEP)


def _complete(client: "OpenAI", **kwargs):
    """Run a chat completion, translating provider SDK errors into LLMUpstreamError.

    Without this, an upstream 429/5xx bubbles up as an uncaught exception and the
    API returns an opaque 500 ("Couldn't reach the agent") — misleading, since the
    backend is fine and the provider is the one refusing the call.
    """
    try:
        for attempt in range(_RATE_LIMIT_RETRIES + 1):
            try:
                return client.chat.completions.create(**kwargs)
            except RateLimitError as e:
                if attempt == _RATE_LIMIT_RETRIES:
                    raise
                time.sleep(_retry_delay(e, attempt))
    except RateLimitError as e:
        raise LLMUpstreamError(
            f"{LLM_PROVIDER} is rate-limited (429) and retrying didn't clear it. "
            "Per-minute limits usually reset within a minute — try again shortly. "
            "If it persists, the daily free-tier quota may be exhausted: wait, "
            "switch LLM_PROVIDER, or use a paid key.",
            429,
        ) from e
    except APITimeoutError as e:
        raise LLMUpstreamError(f"{LLM_PROVIDER} timed out. Try again.", 504) from e
    except APIConnectionError as e:
        raise LLMUpstreamError(
            f"Couldn't reach {LLM_PROVIDER}. Check the network and LLM_BASE_URL.", 502
        ) from e
    except APIStatusError as e:
        # Auth (401/403) and other provider-side status errors.
        raise LLMUpstreamError(
            f"{LLM_PROVIDER} returned an error ({e.status_code}). "
            "Check the API key and model name.",
            502 if e.status_code >= 500 else e.status_code,
        ) from e
    except APIError as e:
        raise LLMUpstreamError(f"{LLM_PROVIDER} call failed: {e}", 502) from e


_client: OpenAI | None = None


def get_client() -> OpenAI:
    global _client
    if not LLM_API_KEY:
        raise LLMNotConfigured(
            "No LLM API key set. Copy backend/.env.example to backend/.env and add either "
            "GEMINI_API_KEY (preferred) or FIREWORKS_API_KEY."
        )
    if _client is None:
        _client = OpenAI(api_key=LLM_API_KEY, base_url=LLM_BASE_URL)
    return _client


def chat_json(
    system: str,
    user: str,
    temperature: float = 0.0,
    *,
    require_keys: list[str] | None = None,
    retries: int = 1,
) -> dict:
    """One-shot completion forced into JSON mode. Returns the parsed object.

    Retries up to `retries` times if the model returns unparseable JSON or omits
    any of `require_keys` — a bad/partial call otherwise silently drops records.
    Raises the last error if every attempt fails.
    """
    client = get_client()
    last_error: Exception | None = None
    for attempt in range(retries + 1):
        resp = _complete(
            client,
            model=LLM_MODEL,
            temperature=temperature,
            response_format={"type": "json_object"},
            messages=[
                {"role": "system", "content": system},
                {"role": "user", "content": user},
            ],
        )
        content = resp.choices[0].message.content or "{}"
        try:
            data = _parse_json_lenient(content)
        except (json.JSONDecodeError, ValueError) as e:
            last_error = e
            continue
        if require_keys and not all(k in data for k in require_keys):
            last_error = ValueError(
                f"response missing required keys {require_keys}; got {list(data)}"
            )
            continue
        return data
    raise last_error or ValueError("chat_json failed with no response")


def chat_text(system: str, user: str, temperature: float = 0.3) -> str:
    """One-shot completion returning free-form text (e.g. a drafted email)."""
    client = get_client()
    resp = _complete(
        client,
        model=LLM_MODEL,
        temperature=temperature,
        messages=[
            {"role": "system", "content": system},
            {"role": "user", "content": user},
        ],
    )
    return (resp.choices[0].message.content or "").strip()


def chat_raw(messages: list[dict], tools: list[dict] | None = None, temperature: float = 0.1):
    """Raw chat completion, optionally with native tool definitions."""
    client = get_client()
    kwargs: dict = {
        "model": LLM_MODEL,
        "temperature": temperature,
        "messages": messages,
    }
    if tools:
        kwargs["tools"] = tools
    return _complete(client, **kwargs)


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
