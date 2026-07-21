# Twitter shim (Scweet)

Thin HTTP wrapper around [Scweet](https://github.com/Altimis/Scweet) so the
Next.js engine can read X profile timelines. All business logic lives in
TypeScript (`lib/twitter/`); this only fetches and normalises.

## Why this exists as a separate process

Scweet is Python, the engine is Node. Running it as its own PM2 process means a
crash, hang or ban here **cannot** affect the news pipeline — it has its own
cron, its own tables and its own process.

## Setup (on the Azure VM)

```bash
cd ~/patrika-engine/twitter-crawler
python3 -m venv venv
./venv/bin/pip install -r requirements.txt
```

Then start it via PM2 (already defined in `ecosystem.config.cjs`):

```bash
pm2 restart ecosystem.config.cjs --update-env && pm2 save
```

Check it is alive:

```bash
curl -s 127.0.0.1:8791/health
# {"ok":true,"scweet":true}
```

## The auth cookie

Scweet authenticates with an `auth_token` cookie, **not** a username/password
(X's anti-automation defences broke password login).

To get it:

1. Log into x.com in a browser **using a dedicated throwaway account** — never
   a Patrika-identifiable one.
2. DevTools → Application → Cookies → `https://x.com` → copy `auth_token`.
3. Paste it into Kairos: **Twitter → Settings → X auth token**.

It is stored AES-256-GCM encrypted in `integration_secrets` and passed to this
shim per request in the `X-Auth-Token` header. The shim never stores it.

Cookies expire. When the feed goes quiet, re-copy the cookie — that is the most
common cause.

## Rate limits

Scweet's own guidance is that a single account survives roughly a few thousand
tweets a day. The engine's tiered crawl (5 / 30 / 120 min by account tier)
exists to stay under that. Raising every account to tier 1 is the fastest way to
get the scraping account suspended.

## Endpoints

| Method | Path | Notes |
| ------ | ---- | ----- |
| GET | `/health` | Liveness. Does not call X, so it is free. |
| GET | `/timeline?handle=&limit=&since_id=` | Needs `X-Auth-Token`. Newest first. |

Binds to `127.0.0.1` only and must never be exposed publicly — it proxies an
authenticated X session.
