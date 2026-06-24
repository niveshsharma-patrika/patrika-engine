import { makeCompatClient } from "../lib/db/compat";

// Exercises the supabase-compat shim against the real (local) Postgres to prove
// the generated SQL is correct across every pattern the app uses.
async function main() {
  const sb = makeCompatClient();
  let pass = 0;
  const ok = (label: string, cond: boolean, extra?: unknown) => {
    console.log(`${cond ? "✓" : "✗ FAIL"}  ${label}`, cond ? "" : JSON.stringify(extra));
    if (cond) pass++;
    else throw new Error("assertion failed: " + label);
  };

  const tag = "compat-" + Date.now();

  // insert + select().single()  (+ unique url)
  const ins = await sb
    .from("sources")
    .insert({ name: tag, source_type: "rss", url: "https://compat.test/" + tag })
    .select()
    .single();
  ok("insert source → row with id", !!ins.data?.id && ins.error === null, ins);
  const sourceId = ins.data.id as string;

  // insert with jsonb (metadata) + real array column (keywords)
  const sig = await sb.from("signals").insert({
    source_id: sourceId,
    external_id: "ext-" + tag,
    content: "Alpha beta gamma",
    published_at: new Date().toISOString(),
    metadata: { title: "Headline", image: "https://x/y.jpg" },
    keywords: ["alpha", "beta"],
  });
  ok("insert signal (jsonb + text[]) no error", sig.error === null, sig.error);

  // embed: signals → sources(name)  (the one-level join)
  const emb = await sb
    .from("signals")
    .select("id, content, metadata, sources(name)")
    .eq("source_id", sourceId);
  ok(
    "embed sources(name) nests correctly",
    emb.error === null && emb.data?.[0]?.sources?.name === tag,
    emb.data?.[0]
  );
  ok("jsonb round-trips as object", emb.data?.[0]?.metadata?.title === "Headline", emb.data?.[0]?.metadata);

  // filter + order + limit
  const ord = await sb
    .from("signals")
    .select("id, published_at")
    .eq("source_id", sourceId)
    .gte("published_at", "2000-01-01")
    .order("published_at", { ascending: false })
    .limit(5);
  ok("gte + order + limit", ord.error === null && ord.data.length === 1, ord);

  // count head
  const cnt = await sb
    .from("signals")
    .select("id", { count: "exact", head: true })
    .eq("source_id", sourceId);
  ok("count head:true → count=1, data=null", cnt.count === 1 && cnt.data === null, cnt);

  // is null + not
  const isn = await sb.from("signals").select("id").eq("source_id", sourceId).is("topic_id", null);
  ok("is null filter", isn.error === null && isn.data.length === 1, isn);
  const notn = await sb.from("signals").select("id").eq("source_id", sourceId).not("content", "is", null);
  ok("not(is null) filter", notn.error === null && notn.data.length === 1, notn);

  // in()
  const inq = await sb.from("sources").select("id, name").in("id", [sourceId]);
  ok("in() filter", inq.error === null && inq.data.length === 1, inq);

  // update + select().single()
  const upd = await sb.from("sources").update({ desk: "test-desk" }).eq("id", sourceId).select().single();
  ok("update + returning", upd.data?.desk === "test-desk", upd);

  // upsert (ignoreDuplicates → DO NOTHING)
  const ups = await sb
    .from("sources")
    .upsert({ id: sourceId, name: tag, source_type: "rss", url: "https://compat.test/" + tag }, { onConflict: "id", ignoreDuplicates: true });
  ok("upsert ignoreDuplicates no error", ups.error === null, ups.error);

  // maybeSingle no match → null, no error
  const ms = await sb.from("sources").select("id").eq("name", "no-such-" + tag).maybeSingle();
  ok("maybeSingle no match → null", ms.data === null && ms.error === null, ms);

  // delete with count
  const delS = await sb.from("signals").delete({ count: "exact" }).eq("source_id", sourceId);
  ok("delete signal → count=1", delS.count === 1, delS);
  await sb.from("sources").delete().eq("id", sourceId);

  console.log(`\nALL ${pass} CHECKS PASSED`);
  process.exit(0);
}

main().catch((e) => {
  console.error("TEST FAILED:", e.message);
  process.exit(1);
});
