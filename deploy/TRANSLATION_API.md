# Kairos Translation API — Hindi → English

For the WordPress developer. WordPress sends each Hindi article written by the
editorial team; Kairos translates it to English under strict news-accuracy rules,
checks the result, and POSTs the English back to your callback URL.

**Base URL:** `https://<kairos-domain>` (ask the Kairos admin)
**Auth:** every request carries the header `X-API-Key: <key>` (the admin generates
it in Kairos → Admin → Translations and shares it with you privately).

---

## 1. Send an article

`POST /api/v1/translate`

```http
Content-Type: application/json
X-API-Key: kt_…
```

```json
{
  "id": 482913,
  "title": "12 जिलों में पेयजल के लिए 1,250 करोड़ की योजना मंजूर",
  "excerpt": "18 लाख लोगों को मिलेगा लाभ",
  "content": "<!-- wp:paragraph --><p>जयपुर। राज्य सरकार ने …</p><!-- /wp:paragraph -->"
}
```

| Field | Required | Notes |
|---|---|---|
| `id` | yes | Your WordPress post ID (string or number). Returned in the callback so you can match it. |
| `title` | yes | Hindi headline (max 500 chars). |
| `excerpt` | no | Hindi summary / excerpt (max 3,000 chars). |
| `content` | yes | Full `post_content` HTML, Gutenberg comments included (max 150,000 chars). |
| `callback_url` | no | Override the callback for this request. Must be https **and on the same site** as the callback URL configured in Kairos. |

**Response — `202 Accepted`** (immediately):

```json
{ "job_id": "7f1c…", "id": "482913", "status": "queued", "duplicate": false, "status_url": "/api/v1/translate/7f1c…" }
```

Sending the identical article (same `id` and same title/excerpt/content) again
within 30 minutes returns the same `job_id` with `"duplicate": true` — safe to
call from `save_post`, which can fire several times per edit. Changed content
creates a new job.

Example from WordPress:

```php
wp_remote_post( 'https://<kairos-domain>/api/v1/translate', [
  'headers' => [ 'Content-Type' => 'application/json', 'X-API-Key' => KAIROS_TRANSLATION_KEY ],
  'body'    => wp_json_encode( [
    'id'      => $post->ID,
    'title'   => $post->post_title,
    'excerpt' => $post->post_excerpt,
    'content' => $post->post_content,
  ] ),
  'timeout' => 15,
] );
```

## 2. Receive the translation (callback)

When the translation is ready (usually 20–60 seconds), Kairos POSTs this to your
callback URL:

```http
Content-Type: application/json
X-Kairos-Signature: sha256=<hex HMAC-SHA256 of the raw body, keyed with your API key>
X-Kairos-Job: 7f1c…
```

```json
{
  "job_id": "7f1c…",
  "id": "482913",
  "status": "done",
  "review": "ok",
  "flags": [],
  "translation": {
    "title": "Rs 1,250 crore scheme approved for drinking water in 12 districts",
    "excerpt": "18 lakh people to benefit",
    "content": "<!-- wp:paragraph --><p>Jaipur. The state government on Monday …</p><!-- /wp:paragraph -->",
    "slug": "rs-1-250-crore-scheme-approved-for-drinking-water-in-12-districts"
  },
  "error": null,
  "model": "gpt-4.1",
  "created_at": "2026-10-26T06:20:11.000Z",
  "completed_at": "2026-10-26T06:20:49.000Z",
  "sent_at": "2026-10-26T06:20:49.512Z"
}
```

- **`review: "ok"`** — every check passed.
- **`review: "needs_review"`** — the English is still returned, but `flags` lists
  exactly what to check, e.g.
  `{ "type": "number_missing", "detail": "Paragraph 3: number(s) 40 from the Hindi are not in the English." }`.
  **Recommended:** save these as a draft (or hold them) for an editor, and only
  auto-publish `ok` ones.
- **`status: "failed"`** — translation could not be done after 3 tries; `translation`
  is `null` and `error` says why.

**Verify the signature** before trusting the body:

```php
$raw      = $request->get_body();
$expected = 'sha256=' . hash_hmac( 'sha256', $raw, KAIROS_TRANSLATION_KEY );
if ( ! hash_equals( $expected, (string) $request->get_header( 'x_kairos_signature' ) ) ) {
  return new WP_REST_Response( [ 'error' => 'bad signature' ], 401 );
}
$data = json_decode( $raw, true );
```

**Reply `200` quickly.** Any non-2xx is retried (a few times right away, then about every
5 minutes for up to an hour). Because of retries you may receive the same
`job_id` more than once — treat `job_id` as the idempotency key.

The HTML structure of `content` is preserved: Gutenberg comments, images,
embeds, scripts and every tag/attribute/URL come back unchanged; only the visible
text is translated.

## 3. Check a job (optional fallback)

`GET /api/v1/translate/{job_id}` with the same `X-API-Key` → the same JSON as the
callback (without `sent_at`). Useful if a callback was missed.

## Errors

| Status | Meaning |
|---|---|
| 400 | Invalid body (message says which field), or `callback_url` not allowed / not configured. |
| 401 | Missing or wrong `X-API-Key`. |
| 429 | More than 60 articles in one minute — retry after the `Retry-After` seconds. |
| 500 | Could not queue — retry. |

## What the translation guarantees

- Translates only what the Hindi says — no added facts, context, quotes or opinions; nothing dropped.
- Numbers, amounts, dates and percentages kept exactly (digits stay digits; lakh/crore are never converted to million/billion).
- Names transliterated with standard English spellings, used consistently through the article; designations translated, never guessed.
- Quotes and attribution kept exactly ("according to police", "alleged", "reportedly").
- Neutral Indian-English news style.

Every article is then checked automatically — every figure in the Hindi must be in
the English and none added, no Hindi left untranslated, no paragraph that shrank or
grew suspiciously, formatting intact — and by an independent AI review that compares
each English paragraph with its Hindi source for anything added, omitted or changed.
