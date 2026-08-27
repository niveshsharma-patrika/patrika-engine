/**
 * AI-generate a cover image for each magazine into public/magazines/<key>.png.
 * Skips any desk that already has a cover (.png or .jpg), so re-running only
 * fills in NEW desks. Run it (locally or on the server):
 *
 *   OPENAI_API_KEY=sk-... npx tsx scripts/generate-magazine-covers.ts
 *
 * Options (env):
 *   IMAGE_MODEL=dall-e-3 (default) | gpt-image-1
 *   FORCE=1                 regenerate even if the file already exists
 *
 * Costs ~$0.08–0.12 per image on dall-e-3 (≈ $1 for all ten). Existing files
 * are skipped so re-running is cheap. Commit the PNGs so every deploy has them.
 */
import { writeFile, mkdir, access } from "node:fs/promises";
import { join } from "node:path";

const KEY = process.env.OPENAI_API_KEY;
if (!KEY) {
  console.error("Set OPENAI_API_KEY.");
  process.exit(1);
}
const MODEL = process.env.IMAGE_MODEL ?? "gpt-image-1";
const FORCE = process.env.FORCE === "1";
const OUT_DIR = join(process.cwd(), "public", "magazines");

const STYLE =
  "realistic editorial photograph, photojournalistic, natural lighting, authentic Indian context, shot on a DSLR with shallow depth of field, premium magazine cover photo — NOT an illustration, not a cartoon, not 3D-rendered, not a painting; absolutely NO text, no words, no letters, no numbers, no watermark, no logos";

const COVERS: Array<{ key: string; prompt: string }> = [
  { key: "crime-files", prompt: `a detective's desk at night with paper case files and a magnifying glass, a city skyline glowing through a window, moody investigative atmosphere, ${STYLE}` },
  { key: "politics-power", prompt: `the grand facade of an Indian state legislative assembly building at dusk, columns and flags, ${STYLE}` },
  { key: "city-pulse", prompt: `a busy Indian city street at rush hour with traffic, an auto-rickshaw and signals, apartment buildings behind, ${STYLE}` },
  { key: "rural-panchayat", prompt: `an Indian village at golden hour — green wheat fields, a hand-pump well and a farmer walking a dirt path, ${STYLE}` },
  { key: "public-guide", prompt: `an ordinary Indian citizen holding documents at a government service counter, a helpful clerk across the desk, ${STYLE}` },
  { key: "nari-shakti", prompt: `a confident Indian woman professional in her thirties in a bright modern office, looking to camera, ${STYLE}` },
  { key: "health-plus", prompt: `a fit Indian woman doing yoga on a mat at sunrise beside a healthy home-cooked thali, ${STYLE}` },
  { key: "ai-education", prompt: `Indian school and college students studying together around a laptop in a bright classroom, ${STYLE}` },
  { key: "game-on", prompt: `an Indian athlete sprinting on a stadium running track under floodlights, motion and effort, ${STYLE}` },
  { key: "food-culture", prompt: `a colourful traditional Indian thali of regional dishes and spices on a wooden table, top-down food photography, ${STYLE}` },
  // ── New desks ──
  { key: "world", prompt: `a large desk globe beside a folded newspaper and a cup of tea by a bright window in a study, world-affairs mood, ${STYLE}` },
  { key: "business", prompt: `an Indian small-business owner reviewing finances on a smartphone and a calculator at a shop counter, ledger and rupee notes, warm daylight, entrepreneurial mood, ${STYLE}` },
  { key: "tech-pulse", prompt: `a young Indian professional working on a laptop in a bright modern co-working space, smartphone and notebook beside, focused tech-career mood, ${STYLE}` },
  { key: "climate", prompt: `an Indian city skyline under a hazy hot summer sun with heat shimmer, a few green trees in the foreground, environmental weather mood, ${STYLE}` },
  { key: "kisan", prompt: `an Indian farmer at golden hour in a lush green crop field, holding a smartphone while inspecting the crop, a tractor softly blurred behind, hopeful modern-farming mood, ${STYLE}` },
  { key: "aastha", prompt: `a traditional Indian temple at dawn with lit oil lamps (diyas) and marigold flowers in the foreground, serene devotional mood, ${STYLE}` },
  { key: "astro-guide", prompt: `a starry night sky over a calm Indian landscape with a softly silhouetted temple, a brass oil lamp and marigold on a table in the foreground, warm mystical traditional mood, ${STYLE}` },
  { key: "travel", prompt: `a traveller with a backpack looking out over a scenic Indian landscape of hills and a lake at golden hour, wanderlust mood, ${STYLE}` },
  // ── Olloi Content ──
  { key: "cancer-care", prompt: `a warm, hopeful and dignified moment — a caring Indian family member gently holding the hand of an older cancer patient wearing a soft headscarf, both calm and reassured, in a bright airy room with soft natural light, compassionate and supportive mood, ${STYLE}` },
];

async function generate(prompt: string): Promise<Buffer> {
  const isGpt = MODEL.startsWith("gpt-image");
  // Minimal body — the images API rejects extra params like response_format.
  // dall-e-3 returns a temporary URL; gpt-image-1 returns b64_json. Handle both.
  const body: Record<string, unknown> = {
    model: MODEL,
    prompt,
    n: 1,
    size: isGpt ? "1536x1024" : "1792x1024",
  };

  const res = await fetch("https://api.openai.com/v1/images/generations", {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${KEY}` },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`${res.status} ${(await res.text()).slice(0, 300)}`);
  const json = (await res.json()) as { data?: Array<{ b64_json?: string; url?: string }> };
  const item = json.data?.[0];
  if (item?.b64_json) return Buffer.from(item.b64_json, "base64");
  if (item?.url) {
    const img = await fetch(item.url);
    if (!img.ok) throw new Error(`image download ${img.status}`);
    return Buffer.from(await img.arrayBuffer());
  }
  throw new Error("no image in response");
}

async function main() {
  await mkdir(OUT_DIR, { recursive: true });
  console.log(`Generating ${COVERS.length} covers with ${MODEL} → public/magazines/`);
  for (const c of COVERS) {
    const file = join(OUT_DIR, `${c.key}.png`);
    if (!FORCE) {
      // Skip if EITHER the raw PNG or the web JPG already exists, so re-running
      // only fills in the missing desks (the live covers are .jpg).
      const has = async (f: string) => access(f).then(() => true).catch(() => false);
      if ((await has(file)) || (await has(join(OUT_DIR, `${c.key}.jpg`)))) {
        console.log(`  skip ${c.key} (exists — FORCE=1 to redo)`);
        continue;
      }
    }
    process.stdout.write(`  → ${c.key} … `);
    try {
      const buf = await generate(c.prompt);
      await writeFile(file, buf);
      console.log(`ok (${Math.round(buf.length / 1024)} KB)`);
    } catch (e) {
      console.log(`FAILED: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  console.log("done. Raw PNGs written to public/magazines/.");
  console.log("Now optimise to .jpg for the web — the cards load /magazines/<key>.jpg.");
  console.log("macOS:");
  console.log('  for f in public/magazines/*.png; do sips -Z 1024 -s format jpeg "$f" --out "${f%.png}.jpg" && rm "$f"; done');
  console.log("Linux (ImageMagick):");
  console.log('  for f in public/magazines/*.png; do convert "$f" -resize 1024x -quality 82 "${f%.png}.jpg" && rm "$f"; done');
  console.log("Then commit the new .jpg files so every deploy has them.");
}

main();
