"use client";

import { useCallback, useEffect, useState } from "react";
import { Plus, Trash2 } from "lucide-react";

import { useLang } from "@/lib/i18n/context";

type Source = {
  id: string;
  platform: "reddit" | "x";
  query: string;
  label: string | null;
  is_active: boolean;
  last_error: string | null;
  item_count?: number;
};

/** Manage what the Social crawl reads (subreddits / X queries). Editor+admin.
 * Platform CREDENTIALS live in Admin → Social & platform keys, not here. */
export function SocialSources({ onChanged }: { onChanged?: () => void }) {
  const { lang } = useLang();
  const t = (en: string, hi: string) => (lang === "hi" ? hi : en);

  const [sources, setSources] = useState<Source[]>([]);
  const [platform, setPlatform] = useState<"reddit" | "x">("reddit");
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const r = await fetch("/api/social/trend-sources");
      const j = await r.json();
      setSources(Array.isArray(j.sources) ? j.sources : []);
    } catch {
      /* ignore */
    }
  }, []);
  useEffect(() => { void load(); }, [load]);

  async function add() {
    if (!query.trim()) return;
    setBusy(true); setErr(null);
    try {
      const r = await fetch("/api/social/trend-sources", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ platform, query: query.trim() }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error ?? "Failed");
      setQuery(""); await load(); onChanged?.();
    } catch (e) { setErr(e instanceof Error ? e.message : "Failed"); }
    finally { setBusy(false); }
  }

  async function remove(id: string) {
    try { await fetch(`/api/social/trend-sources/${id}`, { method: "DELETE" }); await load(); onChanged?.(); }
    catch { /* ignore */ }
  }

  return (
    <div className="space-y-3">
      {/* Add a source */}
      <div className="flex flex-wrap gap-2">
        <select
          value={platform}
          onChange={(e) => setPlatform(e.target.value as "reddit" | "x")}
          className="bg-white border border-[var(--border)] text-[13px] px-2 py-1.5 rounded-lg outline-none"
        >
          <option value="reddit">Reddit</option>
          <option value="x">X / Twitter</option>
        </select>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && add()}
          placeholder={platform === "reddit" ? t("subreddit e.g. india", "सबरेडिट जैसे india") : t("keyword / #hashtag", "कीवर्ड / #hashtag")}
          className="flex-1 min-w-[200px] bg-white border border-[var(--border)] text-[13px] px-3 py-1.5 rounded-lg outline-none focus:border-[var(--purple)]"
        />
        <button
          onClick={add}
          disabled={busy || !query.trim()}
          className="flex items-center gap-1 bg-[var(--text)] hover:bg-black text-white text-[12px] font-medium px-3 py-1.5 rounded-lg disabled:opacity-50"
        >
          <Plus size={13} /> {t("Add", "जोड़ें")}
        </button>
      </div>
      {err && <div className="text-[11px] text-[var(--red)]">{err}</div>}

      {/* Existing sources */}
      {sources.length > 0 && (
        <div className="space-y-1">
          {sources.map((s) => (
            <div key={s.id} className="flex items-center gap-2 text-[12px] bg-[var(--surface-2)] rounded px-2.5 py-1.5">
              <span className="text-[10px] uppercase tracking-wide text-[var(--text-3)] w-12">{s.platform}</span>
              <span className="font-medium text-[var(--text)]">{s.label || s.query}</span>
              <span className="text-[var(--text-3)]">· {s.item_count ?? 0} {t("items", "आइटम")}</span>
              {s.last_error && <span className="text-[var(--red)] truncate max-w-[220px]" title={s.last_error}>· {s.last_error}</span>}
              <button onClick={() => remove(s.id)} className="ml-auto text-[var(--text-3)] hover:text-[var(--red)]" title={t("Remove", "हटाएँ")}>
                <Trash2 size={13} />
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="text-[10.5px] text-[var(--text-3)]">
        {t("Platform keys (Reddit / Meta / X / YouTube) live in Admin → Social & platform keys.",
           "प्लेटफ़ॉर्म कीज़ (Reddit / Meta / X / YouTube) Admin → Social & platform keys में हैं।")}
      </div>
    </div>
  );
}
