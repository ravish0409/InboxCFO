"""Thin wrapper around an OpenAI-compatible chat API (Fireworks or Gemini).

Provider is resolved in config: Gemini is used when GEMINI_API_KEY is set, else Fireworks.
Gemini exposes an OpenAI-compatible endpoint, so the same client and calls work for both.
"""

import json

from openai import OpenAI

from ..config import LLM_API_KEY, LLM_BASE_URL, LLM_MODEL, LLM_PROVIDER


class LLMNotConfigured(Exception):
    pass


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
        resp = client.chat.completions.create(
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
    resp = client.chat.completions.create(
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
    return client.chat.completions.create(**kwargs)


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
