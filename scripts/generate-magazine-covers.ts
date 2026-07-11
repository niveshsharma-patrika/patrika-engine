/**
 * One-off: AI-generate a cover image for each of the 10 magazines into
 * public/magazines/<key>.png. Run it once (locally or on the server):
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
  "flat modern editorial magazine cover illustration, premium Indian newsroom aesthetic, rich saturated colours, clean composition, absolutely NO text, no words, no letters, no numbers, no watermark, no logos";

const COVERS: Array<{ key: string; prompt: string }> = [
  { key: "crime-files", prompt: `a magnifying glass over case files with a night city skyline, investigative crime mood, deep crimson and charcoal, ${STYLE}` },
  { key: "politics-power", prompt: `an Indian legislative assembly building with a podium and ballot-box motifs, indigo and slate blue, ${STYLE}` },
  { key: "city-pulse", prompt: `a busy Indian city street with traffic signals and apartment buildings, teal and dark green, ${STYLE}` },
  { key: "rural-panchayat", prompt: `an Indian village landscape with green fields, a water well and a panchayat building, warm greens, ${STYLE}` },
  { key: "public-guide", prompt: `government documents, a rupee coin, scales of justice and a checklist, royal blue, ${STYLE}` },
  { key: "nari-shakti", prompt: `a confident Indian woman silhouette surrounded by symbols of career, finance and health, magenta and rose, ${STYLE}` },
  { key: "health-plus", prompt: `wellness motifs — a heartbeat line, a healthy Indian thali and a yoga pose, emerald green, ${STYLE}` },
  { key: "ai-education", prompt: `students with books and a laptop with abstract AI neural-network motifs, violet and deep purple, ${STYLE}` },
  { key: "game-on", prompt: `athletes on a running track with a trophy and cricket and kabaddi motifs, energetic orange, ${STYLE}` },
  { key: "food-culture", prompt: `a traditional Indian food thali with spices in a bustling bazaar, warm amber and saffron, ${STYLE}` },
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
      try {
        await access(file);
        console.log(`  skip ${c.key} (exists — FORCE=1 to redo)`);
        continue;
      } catch {
        /* not present, generate */
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
  console.log("Now optimise to .jpg for the web — the cards load /magazines/<key>.jpg (macOS):");
  console.log('  for f in public/magazines/*.png; do sips -Z 1024 -s format jpeg "$f" --out "${f%.png}.jpg" && rm "$f"; done');
}

main();
