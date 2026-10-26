# Translation API — Hindi → English

An API endpoint that accepts Hindi text in `title`, `content` and `excerpt`,
translates all three fields into English, and returns the translated JSON.

## Endpoint

```
POST https://<kairos-domain>/api/v1/translate
```

## Headers

```
Content-Type: application/json
X-API-Key: <your API key>
```

The API key is shared with you separately by the Kairos admin. Requests without
a valid key get `401`.

## Request Body

Send the Hindi article data as a JSON object.

```json
{
  "title": "भारत में आज मौसम कैसा रहेगा?",
  "content": "भारत के कई राज्यों में आज बारिश होने की संभावना है। मौसम विभाग ने कुछ क्षेत्रों में भारी बारिश की चेतावनी जारी की है।",
  "excerpt": "कई राज्यों में बारिश की संभावना।"
}
```

- `content` can be plain text or the full WordPress `post_content` HTML
  (Gutenberg block comments included). HTML tags, attributes, links, images and
  embeds come back unchanged — only the visible text is translated. Line breaks
  in plain text are kept.
- All three fields are optional, but send at least one. A field you don't send
  comes back as an empty string.
- Limits: `title` 500 characters, `excerpt` 3,000, `content` 150,000.

## Successful Response

HTTP Status: `200 OK`

The API returns the translated text in English using the same JSON structure.

```json
{
  "title": "What will the weather be like in India today?",
  "content": "Rain is likely in several states of India today. The Meteorological Department has issued a warning of heavy rainfall in some areas.",
  "excerpt": "Rain is likely in several states."
}
```

## Timing

A translation takes about **10–40 seconds** depending on length. Set the request
timeout to **at least 120 seconds**, e.g.:

```php
$response = wp_remote_post( 'https://<kairos-domain>/api/v1/translate', [
  'headers' => [ 'Content-Type' => 'application/json', 'X-API-Key' => KAIROS_TRANSLATION_KEY ],
  'body'    => wp_json_encode( [
    'title'   => $post->post_title,
    'content' => $post->post_content,
    'excerpt' => $post->post_excerpt,
  ] ),
  'timeout' => 120,
] );
$english = json_decode( wp_remote_retrieve_body( $response ), true );
```

## Optional response headers

You can ignore these; the JSON body is all you need.

| Header | Meaning |
|---|---|
| `X-Translation-Review` | `ok` — the automatic accuracy checks passed. `needs_review` — a check found something (e.g. a number missing). The English is still returned; an editor may want to check it before publishing. |
| `X-Translation-Id` | Reference ID for this translation, if you need to report a problem. |

## Errors

Errors return JSON `{ "error": "message" }`.

| Status | Meaning |
|---|---|
| 400 | Invalid request (the message says which field). |
| 401 | Missing or wrong `X-API-Key`. |
| 429 | More than 60 requests in one minute — retry after `Retry-After` seconds. |
| 502 | Translation failed — safe to retry. |

## Translation rules applied

- Translates only what the Hindi says — no added facts, context, quotes or opinions; nothing dropped.
- Numbers, amounts, dates and percentages kept exactly (lakh / crore are never converted to million / billion).
- Names written in standard English spelling, consistent through the article; designations translated, never guessed.
- Quotes and attribution kept exactly ("according to police", "alleged", "reportedly").
- Neutral Indian-English news style.
