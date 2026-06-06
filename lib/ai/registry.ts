/**
 * Registry of supported AI providers and their models.
 * Admins pick from these in the Admin UI; new providers are added here.
 *
 * Prices are USD per million tokens (input / output).
 */

export const AI_PROVIDERS = {
  anthropic: {
    key: "anthropic",
    name: "Anthropic",
    env_var: "ANTHROPIC_API_KEY",
    models: [
      { key: "claude-opus-4-5", name: "Claude Opus 4.5", context: 200000, input: 15, output: 75, vision: true },
      { key: "claude-sonnet-4-5", name: "Claude Sonnet 4.5", context: 200000, input: 3, output: 15, vision: true },
      { key: "claude-haiku-4-5", name: "Claude Haiku 4.5", context: 200000, input: 1, output: 5, vision: true },
    ],
  },
  openai: {
    key: "openai",
    name: "OpenAI",
    env_var: "OPENAI_API_KEY",
    models: [
      { key: "gpt-4o", name: "GPT-4o", context: 128000, input: 2.5, output: 10, vision: true },
      { key: "gpt-4o-mini", name: "GPT-4o mini", context: 128000, input: 0.15, output: 0.6, vision: true },
      { key: "gpt-4.1", name: "GPT-4.1", context: 1000000, input: 5, output: 15, vision: true },
    ],
  },
  google: {
    key: "google",
    name: "Google Gemini",
    env_var: "GOOGLE_GENERATIVE_AI_API_KEY",
    models: [
      { key: "gemini-2.0-flash", name: "Gemini 2.0 Flash", context: 1000000, input: 0.075, output: 0.3, vision: true },
      { key: "gemini-2.0-pro", name: "Gemini 2.0 Pro", context: 2000000, input: 1.25, output: 5, vision: true },
    ],
  },
  groq: {
    key: "groq",
    name: "Groq (fast inference)",
    env_var: "GROQ_API_KEY",
    models: [
      { key: "llama-3.3-70b-versatile", name: "Llama 3.3 70B", context: 128000, input: 0.59, output: 0.79 },
      { key: "mixtral-8x7b-32768", name: "Mixtral 8x7B", context: 32768, input: 0.24, output: 0.24 },
    ],
  },
} as const;

export type ProviderKey = keyof typeof AI_PROVIDERS;

/**
 * Use cases the system supports. Each can be wired to a different model
 * via the ai_config table.
 */
export const USE_CASES = [
  "drafting", // generate article body
  "angles", // propose 2-3 editorial angles for a story
  "headline", // polish/regenerate headline
  "summary", // condense for ticker / brief
  "embedding", // RAG retrieval
] as const;
export type UseCase = (typeof USE_CASES)[number];
