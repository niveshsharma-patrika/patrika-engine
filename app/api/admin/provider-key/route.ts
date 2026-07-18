import { z } from "zod";

import { pool } from "@/lib/db";
import { getSession } from "@/lib/auth/session";
import { encryptKey } from "@/lib/crypto";

export const dynamic = "force-dynamic";

/**
 * POST /api/admin/provider-key — admin sets (or clears) an AI provider's API key.
 * The key is encrypted at rest (AES-256-GCM) and stored on ai_providers; the AI
 * layer (lib/ai/provider.ts getApiKey) prefers it over the env var. Sending an
 * empty key clears the stored key, falling back to the env var.
 * The plaintext key is never returned or logged.
 */
const PROVIDERS = ["openai", "anthropic", "google", "groq"] as const;
const DISPLAY: Record<string, string> = {
  openai: "OpenAI",
  anthropic: "Anthropic",
  google: "Google",
  groq: "Groq",
};

const Body = z.object({
  provider: z.enum(PROVIDERS),
  key: z.string().max(500).default(""),
});

export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });
  if (session.role !== "admin") {
    return Response.json({ error: "Forbidden — admin only" }, { status: 403 });
  }

  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Invalid request" }, { status: 400 });
  const { provider } = parsed.data;
  const key = parsed.data.key.trim();

  try {
    if (key === "") {
      // Clear the stored key → the provider falls back to its env var.
      await pool.query(
        "UPDATE ai_providers SET api_key_encrypted = NULL, updated_at = now() WHERE provider_key = $1",
        [provider]
      );
      return Response.json({ ok: true, cleared: true });
    }

    if (key.length < 8) {
      return Response.json({ error: "That key looks too short." }, { status: 400 });
    }
    if (!process.env.KEY_ENCRYPTION_SECRET) {
      return Response.json(
        { error: "KEY_ENCRYPTION_SECRET is not set on the server — add it to .env to store keys." },
        { status: 503 }
      );
    }

    const encrypted = encryptKey(key);
    await pool.query(
      `INSERT INTO ai_providers (provider_key, display_name, api_key_encrypted, is_active, updated_at)
       VALUES ($1, $2, $3, true, now())
       ON CONFLICT (provider_key)
       DO UPDATE SET api_key_encrypted = EXCLUDED.api_key_encrypted, is_active = true, updated_at = now()`,
      [provider, DISPLAY[provider] ?? provider, encrypted]
    );
    return Response.json({ ok: true });
  } catch (e) {
    console.error("provider-key save failed:", e);
    return Response.json({ error: "Could not save the key." }, { status: 500 });
  }
}
