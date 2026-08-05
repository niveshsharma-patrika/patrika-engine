/**
 * House-style Hindi typography normalization — applied deterministically to
 * generated copy (a post-processor, NOT a prompt rule the model can slip on).
 *
 * Patrika newspaper style:
 *   • NO nuqta on क़ ख़ ग़ ज़ फ़ → क ख ग ज फ (e.g. ज़रूरी → जरूरी, अख़बार → अखबार).
 *     Native retroflex ड़ ढ़ KEEP their nuqta — only the five Perso-Arabic
 *     letters above are stripped.
 *   • Chandrabindu ँ → anusvara ं (e.g. माँ → मां, हाँ → हां).
 *
 * A no-op on non-Devanagari text, so it is safe to run on English copy too.
 */
export function normalizeHindiTypography(s: string): string {
  if (!s) return s;
  return (
    s
      // Precomposed nuqta letters → base letter.
      .replace(/क़/g, "क") // क़ → क
      .replace(/ख़/g, "ख") // ख़ → ख
      .replace(/ग़/g, "ग") // ग़ → ग
      .replace(/ज़/g, "ज") // ज़ → ज
      .replace(/फ़/g, "फ") // फ़ → फ
      // Decomposed form (base + combining nuqta U+093C) — only for क ख ग ज फ;
      // leave ड ढ (their nuqta is part of a distinct native letter).
      .replace(/([कखगजफ])़/g, "$1")
      // Chandrabindu (ँ, U+0901) → anusvara (ं, U+0902).
      .replace(/ँ/g, "ं")
  );
}
