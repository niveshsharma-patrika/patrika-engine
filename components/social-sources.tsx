"use client";

import { useCallback, useEffect, useState } from "react";
import { Plus, Trash2, ChevronDown, ChevronRight, KeyRound } from "lucide-react";

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
type Settings = {
  youtube_api_key: boolean;
  meta_access_token: boolean;
  meta_ig_user_id: boolean;
  x_auth_token: boolean;
  reddit_client_id: boolean;
  reddit_client_secret: boolean;
};

const CRED_FIELDS: Array<{ key: keyof Settings; label: string; hint: string }> = [
  { key: "reddit_client_id",     label: "Reddit client id",     hint: "reddit.com/prefs/apps" },
  { key: "reddit_client_secret", label: "Reddit client secret", hint: "reddit.com/prefs/apps" },
  { key: "x_auth_token",         label: "X auth token",         hint: "or set it in Twitter → Settings" },
  { key: "meta_access_token",    label: "Meta access token",    hint: "long-lived, instagram_basic + pages_read_engagement" },
  { key: "meta_ig_user_id",      label: "Meta IG business id",  hint: "your IG business account id" },
  { key: "youtube_api_key",      label: "YouTube API key",      hint: "optional" },
];

/** Manage what the Social crawl reads (subreddits / X queries) + the platform
 * credentials. Sources are editor+admin; credentials are admin-only (the
 * settings GET 403s for editors, so that block simply hides). */
export function SocialSources({ onChanged }: { onChanged?: () => void }) {
  const { lang } = useLang();
  const t = (en: string, hi: string) => (lang === "hi" ? hi : en);

  const [open, setOpen] = useState(false);
  const [sources, setSources] = useState<Source[]>([]);
  const [platform, setPlatform] = useState<"reddit" | "x">("reddit");
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const [settings, setSettings] = useState<Settings | null>(null);
  const [creds, setCreds] = useState<Partial<Record<keyof Settings, string>>>({});
  const [savingCreds, setSavingCreds] = useState(false);
  const [credNote, setCredNote] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const r = await fetch("/api/social/trend-sources");
      const j = await r.json();
      const rows: Source[] = Array.isArray(j.sources) ? j.sources : [];
      setSources(rows);
      if (rows.length === 0) setOpen(true); // no sources yet → guide the desk
    } catch {
      /* ignore */
    }
    try {
      const s = await fetch("/api/social/settings");
      if (s.ok) setSettings(await s.json()); // admin only; editors get 403 → hidden
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

  async function saveCreds() {
    const payload = Object.fromEntries(
      Object.entries(creds).filter(([, v]) => typeof v === "string" && v.trim())
    );
    if (Object.keys(payload).length === 0) return;
    setSavingCreds(true); setCredNote(null);
    try {
      const r = await fetch("/api/social/settings", {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error ?? "Failed");
      setCreds({}); setCredNote(t("Saved ✓", "सेव हो गया ✓")); await load();
    } catch (e) { setCredNote(e instanceof Error ? e.message : "Failed"); }
    finally { setSavingCreds(false); }
  }

  return (
    <div className="mb-5 border border-[var(--border)] rounded-lg bg-white">
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center gap-2 px-4 py-2.5 text-[13px] font-medium text-[var(--text-2)]"
      >
        {open ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
        {t("Sources & credentials", "स्रोत और क्रेडेंशियल")}
        <span className="text-[11px] text-[var(--text-3)] font-normal">
          ({sources.length} {t("sources", "स्रोत")})
        </span>
      </button>

      {open && (
        <div className="border-t border-[var(--border)] p-4 space-y-4">
          {/* Add a source */}
          <div>
            <div className="text-[11px] font-semibold text-[var(--text-2)] mb-1.5">
              {t("Add a source to crawl", "क्रॉल करने के लिए स्रोत जोड़ें")}
            </div>
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
                className="flex-1 min-w-[180px] bg-white border border-[var(--border)] text-[13px] px-3 py-1.5 rounded-lg outline-none focus:border-[var(--purple)]"
              />
              <button
                onClick={add}
                disabled={busy || !query.trim()}
                className="flex items-center gap-1 bg-[var(--text)] hover:bg-black text-white text-[12px] font-medium px-3 py-1.5 rounded-lg disabled:opacity-50"
              >
                <Plus size={13} /> {t("Add", "जोड़ें")}
              </button>
            </div>
            {err && <div className="text-[11px] text-[var(--red)] mt-1">{err}</div>}
          </div>

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

          {/* Credentials (admin only — hidden for editors) */}
          {settings && (
            <div className="pt-1 border-t border-[var(--border)]">
              <div className="flex items-center gap-1.5 text-[11px] font-semibold text-[var(--text-2)] mt-3 mb-2">
                <KeyRound size={12} /> {t("Platform credentials", "प्लेटफ़ॉर्म क्रेडेंशियल")}
              </div>
              <div className="space-y-1.5">
                {CRED_FIELDS.map((f) => (
                  <div key={f.key} className="flex items-center gap-2">
                    <div className="w-[150px] shrink-0">
                      <div className="text-[11.5px] text-[var(--text-2)]">{f.label}</div>
                      <div className="text-[9.5px] text-[var(--text-3)]">{f.hint}</div>
                    </div>
                    <input
                      type="password"
                      value={creds[f.key] ?? ""}
                      onChange={(e) => setCreds((c) => ({ ...c, [f.key]: e.target.value }))}
                      placeholder={settings[f.key] ? t("set ✓ — enter to replace", "सेट ✓ — बदलने के लिए भरें") : t("not set", "सेट नहीं")}
                      className="flex-1 bg-white border border-[var(--border)] text-[12px] px-2.5 py-1.5 rounded outline-none focus:border-[var(--purple)]"
                    />
                    {settings[f.key] && <span className="text-[var(--green)] text-[12px]">✓</span>}
                  </div>
                ))}
              </div>
              <div className="flex items-center gap-3 mt-2">
                <button
                  onClick={saveCreds}
                  disabled={savingCreds}
                  className="bg-[var(--purple)] hover:opacity-90 text-white text-[12px] font-medium px-3 py-1.5 rounded-lg disabled:opacity-50"
                >
                  {savingCreds ? t("Saving…", "सेव हो रहा…") : t("Save credentials", "क्रेडेंशियल सेव करें")}
                </button>
                {credNote && <span className="text-[11px] text-[var(--text-3)]">{credNote}</span>}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
