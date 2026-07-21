"""
Thin Scweet shim for the Patrika news engine.

Deliberately dumb: it fetches a profile timeline and returns raw JSON. ALL
business logic (dedup, substance checks, research, drafting, spend caps) lives
in TypeScript in the Next app. Keeping this layer thin means the Python runtime
can be restarted, upgraded or swapped for a different scraper without touching
newsroom logic.

Stateless w.r.t. credentials: the X auth_token is passed per request in the
X-Auth-Token header, never written to disk here. It lives encrypted in Postgres
and is refreshable from the admin UI (cookie expiry is the main failure mode).

Binds to 127.0.0.1 only — this must never be reachable from the internet.

Targets Scweet 5.x:
    from Scweet import Scweet
    Scweet(auth_token=...).get_profile_tweets(["handle"], limit=N) -> list[dict]

Run:
    uvicorn app:app --host 127.0.0.1 --port 8791
"""

from __future__ import annotations

import hashlib
import logging
import os
import threading
from pathlib import Path
from typing import Any

from fastapi import FastAPI, Header, HTTPException, Query
from fastapi.responses import JSONResponse

log = logging.getLogger("twitter-shim")
logging.basicConfig(level=logging.INFO)

app = FastAPI(title="Patrika Twitter shim", docs_url=None, redoc_url=None)

# Scweet keeps a small SQLite state file. Pin it next to this module so it does
# not land in a random CWD depending on how PM2 launched us.
DB_PATH = str(Path(__file__).resolve().parent / "scweet_state.db")

# Scweet(...) provisions on construction (query-id manifest etc.), so building a
# client per request would be slow AND extra load on X. Cache one per token.
_clients: dict[str, Any] = {}
_clients_lock = threading.Lock()


def _client(auth_token: str):
    """Get or build a cached Scweet client for this token."""
    from Scweet import Scweet

    key = hashlib.sha256(auth_token.encode()).hexdigest()[:16]
    with _clients_lock:
        client = _clients.get(key)
        if client is None:
            log.info("building Scweet client %s", key)
            client = Scweet(auth_token=auth_token, db_path=DB_PATH)
            _clients[key] = client
        return client


def _drop_client(auth_token: str) -> None:
    """Forget a client whose token stopped working, so the next call rebuilds."""
    key = hashlib.sha256(auth_token.encode()).hexdigest()[:16]
    with _clients_lock:
        _clients.pop(key, None)


@app.get("/health")
def health() -> dict[str, Any]:
    """
    Liveness probe. Does not touch X, so it cannot burn rate limit.

    Imports the REAL class rather than just the package — an earlier version
    only did `import Scweet`, which succeeded even when the class was
    unreachable and reported a false green.
    """
    try:
        from Scweet import Scweet  # noqa: F401

        return {"ok": True, "scweet": True, "clients": len(_clients)}
    except Exception as exc:
        log.warning("Scweet import failed: %s", exc)
        return {"ok": True, "scweet": False, "error": str(exc)[:200]}


def _s(value: Any) -> str:
    return value.strip() if isinstance(value, str) else ""


def _as_int(value: Any) -> int:
    try:
        return int(value)
    except (TypeError, ValueError):
        return 0


def _normalise(raw: dict[str, Any], handle: str) -> dict[str, Any] | None:
    """
    Map one Scweet tweet dict onto the shape lib/twitter/crawl.ts expects.

    Field names are read through candidate lists rather than assuming one
    schema — Scweet's shape has shifted across versions. Use ?raw=1 on
    /timeline to inspect the real keys if something comes back empty.
    """

    def pick(*keys: str) -> Any:
        for key in keys:
            val = raw.get(key)
            if val not in (None, "", [], {}):
                return val
        return None

    tweet_id = _s(pick("tweet_id", "id", "id_str", "rest_id", "tweetId"))
    if not tweet_id:
        return None

    posted_at = _s(pick("created_at", "date", "timestamp", "time", "datetime"))
    if not posted_at:
        return None

    text = _s(pick("text", "full_text", "content", "tweet"))

    # Author may be flat, or nested under a user object.
    author = _s(pick("username", "screen_name", "user_name", "handle", "author"))
    if not author:
        user = pick("user", "author_user", "core")
        if isinstance(user, dict):
            author = _s(
                user.get("screen_name")
                or user.get("username")
                or user.get("name")
            )
    author = (author or handle).lstrip("@")

    url = _s(pick("url", "tweet_url", "link", "permalink"))
    if not url:
        url = f"https://x.com/{author}/status/{tweet_id}"

    is_retweet = bool(pick("is_retweet", "retweeted", "retweet")) or text.startswith("RT @")
    is_reply = bool(pick("is_reply", "in_reply_to_status_id", "reply")) or text.startswith("@")

    media_raw = pick("media", "photos", "images", "media_urls") or []
    if not isinstance(media_raw, list):
        media_raw = [media_raw]
    media: list[str] = []
    for m in media_raw:
        if isinstance(m, str):
            media.append(m.strip())
        elif isinstance(m, dict):
            u = m.get("url") or m.get("media_url_https") or m.get("media_url")
            if u:
                media.append(str(u))

    return {
        "id": tweet_id,
        "author": author,
        "text": text,
        "url": url,
        "posted_at": posted_at,
        "is_retweet": is_retweet,
        "is_reply": is_reply,
        "metrics": {
            "likes": _as_int(pick("likes", "like_count", "favorite_count", "favorite_count_str")),
            "retweets": _as_int(pick("retweets", "retweet_count")),
            "replies": _as_int(pick("replies", "reply_count")),
            "views": _as_int(pick("views", "view_count")),
        },
        "media": media,
    }


@app.get("/timeline")
def timeline(
    handle: str = Query(..., min_length=1, max_length=40),
    limit: int = Query(20, ge=1, le=100),
    since_id: str | None = Query(None),
    raw: int = Query(0, ge=0, le=1),
    x_auth_token: str | None = Header(None, alias="X-Auth-Token"),
) -> JSONResponse:
    """
    Return recent tweets for one profile.

    `since_id` is a bandwidth optimisation only — the real dedup guarantee is
    the unique index on (account_id, tweet_id) in Postgres. Note Scweet's
    get_profile_tweets has no date filter, so `limit` is the only bound.

    ?raw=1 returns Scweet's untouched dicts — use it to inspect the live field
    names if normalisation ever comes back empty.
    """
    if not x_auth_token:
        raise HTTPException(status_code=401, detail="X-Auth-Token header required")

    handle = handle.lstrip("@").strip()
    if not handle:
        raise HTTPException(status_code=400, detail="handle required")

    try:
        from Scweet import Scweet  # noqa: F401
    except Exception as exc:
        log.error("Scweet import failed: %s", exc)
        raise HTTPException(status_code=503, detail=f"Scweet unavailable: {exc}") from exc

    # Map Scweet's typed errors onto useful statuses so the desk sees "cookie
    # expired" rather than a generic failure — that is the #1 cause of a silent
    # feed, and it needs a human to paste a fresh cookie.
    try:
        from Scweet import AuthError, RateLimitError, AccountPoolExhausted
    except Exception:  # pragma: no cover - older/newer layouts
        AuthError = RateLimitError = AccountPoolExhausted = ()  # type: ignore

    try:
        client = _client(x_auth_token)
        results = client.get_profile_tweets([handle], limit=limit)
    except Exception as exc:
        name = type(exc).__name__
        detail = f"{name}: {exc}"[:300]

        if AuthError and isinstance(exc, AuthError):
            _drop_client(x_auth_token)
            raise HTTPException(
                status_code=401,
                detail="X rejected the auth_token — it has expired or been revoked. "
                       "Paste a fresh cookie in Twitter → X connection.",
            ) from exc
        if (RateLimitError and isinstance(exc, RateLimitError)) or (
            AccountPoolExhausted and isinstance(exc, AccountPoolExhausted)
        ):
            raise HTTPException(
                status_code=429,
                detail="X rate limit reached. Move accounts to a slower tier.",
            ) from exc

        log.warning("timeline fetch failed for @%s: %s", handle, detail)
        raise HTTPException(status_code=502, detail=detail) from exc

    if isinstance(results, dict):
        results = results.get("tweets") or results.get("data") or []
    if not isinstance(results, list):
        results = []

    if raw:
        return JSONResponse({"handle": handle, "count": len(results), "raw": results[:5]})

    tweets: list[dict[str, Any]] = []
    dropped = 0
    for row in results:
        if not isinstance(row, dict):
            dropped += 1
            continue
        item = _normalise(row, handle)
        if item is None:
            dropped += 1
            continue
        if since_id and item["id"] == since_id:
            break  # reached the last tweet we already stored
        tweets.append(item)

    if dropped:
        log.info("@%s: %d row(s) unparsable — check /timeline?raw=1", handle, dropped)

    return JSONResponse(
        {"handle": handle, "count": len(tweets), "dropped": dropped, "tweets": tweets}
    )
