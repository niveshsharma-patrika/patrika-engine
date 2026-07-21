"""
Thin Scweet shim for the Patrika news engine.

Deliberately dumb: it fetches a profile timeline and returns raw JSON. ALL
business logic (dedup, substance checks, research, drafting, spend caps) lives
in TypeScript in the Next app. Keeping this layer thin means the Python runtime
can be restarted, upgraded or swapped for a different scraper without touching
newsroom logic.

Stateless by design: the X auth_token is passed per request in the
X-Auth-Token header, never stored here. It lives encrypted in Postgres and is
refreshable from the admin UI (cookie expiry is the main failure mode).

Binds to 127.0.0.1 only — this must never be reachable from the internet.

Run:
    uvicorn app:app --host 127.0.0.1 --port 8791
"""

from __future__ import annotations

import logging
import os
from datetime import datetime, timedelta, timezone
from typing import Any

from fastapi import FastAPI, Header, HTTPException, Query
from fastapi.responses import JSONResponse

log = logging.getLogger("twitter-shim")
logging.basicConfig(level=logging.INFO)

app = FastAPI(title="Patrika Twitter shim", docs_url=None, redoc_url=None)

# How far back to look when an account has never been crawled before. Keeps the
# first crawl from pulling years of history and burning the rate limit.
FIRST_CRAWL_DAYS = int(os.getenv("TWITTER_FIRST_CRAWL_DAYS", "2"))


@app.get("/health")
def health() -> dict[str, Any]:
    """Liveness probe — does not touch X, so it cannot burn rate limit."""
    try:
        import Scweet  # noqa: F401

        scweet_ok = True
    except Exception as exc:  # pragma: no cover - import guard
        log.warning("Scweet import failed: %s", exc)
        scweet_ok = False
    return {"ok": True, "scweet": scweet_ok}


def _s(value: Any) -> str:
    return value.strip() if isinstance(value, str) else ""


def _as_int(value: Any) -> int:
    try:
        return int(value)
    except (TypeError, ValueError):
        return 0


def _normalise(raw: dict[str, Any], handle: str) -> dict[str, Any] | None:
    """
    Map one Scweet result onto the shape lib/sources/twitter.ts expects.

    Scweet's field names have shifted between versions, so every field is read
    defensively through a list of candidate keys rather than assuming one
    schema. A row without an id or a timestamp is unusable and returns None.
    """

    def pick(*keys: str) -> Any:
        for key in keys:
            if key in raw and raw[key] not in (None, ""):
                return raw[key]
        return None

    tweet_id = _s(pick("tweet_id", "id", "conversation_id", "tweetId"))
    if not tweet_id:
        return None

    posted_at = _s(pick("date", "created_at", "timestamp", "time"))
    if not posted_at:
        return None

    text = _s(pick("text", "content", "tweet", "full_text"))
    author = _s(pick("username", "user", "screen_name", "handle")) or handle

    url = _s(pick("url", "tweet_url", "link"))
    if not url:
        url = f"https://x.com/{author.lstrip('@')}/status/{tweet_id}"

    is_retweet = bool(pick("is_retweet", "retweet")) or text.startswith("RT @")
    is_reply = bool(pick("is_reply", "reply")) or text.startswith("@")

    media = pick("media", "photos", "images") or []
    if not isinstance(media, list):
        media = [media]

    return {
        "id": tweet_id,
        "author": author.lstrip("@"),
        "text": text,
        "url": url,
        "posted_at": posted_at,
        "is_retweet": is_retweet,
        "is_reply": is_reply,
        "metrics": {
            "likes": _as_int(pick("likes", "like_count", "favorite_count")),
            "retweets": _as_int(pick("retweets", "retweet_count")),
            "replies": _as_int(pick("replies", "reply_count")),
            "views": _as_int(pick("views", "view_count")),
        },
        "media": [_s(m) if isinstance(m, str) else _s(m.get("url")) for m in media if m],
    }


@app.get("/timeline")
def timeline(
    handle: str = Query(..., min_length=1, max_length=40),
    limit: int = Query(20, ge=1, le=100),
    since_id: str | None = Query(None),
    x_auth_token: str | None = Header(None, alias="X-Auth-Token"),
) -> JSONResponse:
    """
    Return recent tweets for one profile, newest first.

    `since_id` is applied by the CALLER as well (the DB has a unique index on
    (account_id, tweet_id)), so this is only a bandwidth optimisation — we must
    never rely on it for correctness.
    """
    if not x_auth_token:
        raise HTTPException(status_code=401, detail="X-Auth-Token header required")

    handle = handle.lstrip("@").strip()
    if not handle:
        raise HTTPException(status_code=400, detail="handle required")

    try:
        from Scweet.scweet import Scweet
    except Exception as exc:
        log.error("Scweet import failed: %s", exc)
        raise HTTPException(
            status_code=503, detail=f"Scweet unavailable: {exc}"
        ) from exc

    since = (datetime.now(timezone.utc) - timedelta(days=FIRST_CRAWL_DAYS)).strftime(
        "%Y-%m-%d"
    )

    try:
        scweet = Scweet(cookies={"auth_token": x_auth_token})
        raw_results = scweet.user_tweets(handle=handle, limit=limit, since=since)
    except Exception as exc:
        # Surface as 502 so the TS caller can record the account error and keep
        # going with the other accounts rather than failing the whole crawl.
        log.warning("timeline fetch failed for @%s: %s", handle, exc)
        raise HTTPException(status_code=502, detail=str(exc)[:300]) from exc

    if isinstance(raw_results, dict):
        raw_results = raw_results.get("tweets") or raw_results.get("data") or []
    if not isinstance(raw_results, list):
        raw_results = []

    tweets: list[dict[str, Any]] = []
    for row in raw_results:
        if not isinstance(row, dict):
            continue
        item = _normalise(row, handle)
        if item is None:
            continue
        if since_id and item["id"] == since_id:
            break  # reached the last tweet we already have
        tweets.append(item)

    return JSONResponse({"handle": handle, "count": len(tweets), "tweets": tweets})
