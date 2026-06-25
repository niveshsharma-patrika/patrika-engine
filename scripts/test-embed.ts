import { makeCompatClient } from "../lib/db/compat";

// Proves the nested one-to-many embed the trends feed relies on:
//   trends → signals[] → sources(one)
async function main() {
  const sb = makeCompatClient();
  const tag = "emb-" + Date.now();

  const src = await sb
    .from("sources")
    .insert({ name: tag, source_type: "rss", url: "https://e.test/" + tag })
    .select()
    .single();
  const tr = await sb
    .from("trends")
    .insert({ title: tag + " story", status: "active", publisher_count: 3, signal_count: 2 })
    .select()
    .single();
  for (const n of [1, 2]) {
    await sb.from("signals").insert({
      source_id: src.data.id,
      topic_id: tr.data.id,
      external_id: `e${n}-${tag}`,
      content: `Signal ${n} ${tag}`,
      published_at: new Date().toISOString(),
      metadata: { title: "H" + n },
    });
  }

  const q = await sb
    .from("trends")
    .select(
      `id, title, publisher_count,
       signals ( id, content, metadata, sources (source_type, name) )`
    )
    .eq("id", tr.data.id)
    .single();

  const row = q.data;
  console.log(JSON.stringify(row, null, 2).slice(0, 700));
  const ok =
    q.error === null &&
    Array.isArray(row?.signals) &&
    row.signals.length === 2 &&
    row.signals[0].sources?.name === tag &&
    row.signals[0].metadata?.title?.startsWith("H");

  // cleanup
  await sb.from("signals").delete().eq("topic_id", tr.data.id);
  await sb.from("trends").delete().eq("id", tr.data.id);
  await sb.from("sources").delete().eq("id", src.data.id);

  console.log(ok ? "\n✓ nested one-to-many embed WORKS" : "\n✗ FAIL");
  process.exit(ok ? 0 : 1);
}

main().catch((e) => {
  console.error("FAIL:", e.message);
  process.exit(1);
});
