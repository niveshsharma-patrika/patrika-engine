"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2, Inbox, MapPin, Check, X, FileText, ExternalLink } from "lucide-react";

import { useLang } from "@/lib/i18n/context";

type Attachment = { name: string; type: string; data: string };

type Submission = {
  id: string;
  headline: string;
  details: string;
  location: string | null;
  category: string;
  attachments: Attachment[];
  status: string;
  created_at: string;
  promoted_draft_id: string | null;
  submitter_name: string | null;
  submitter_contact: string | null;
  submitter_role: string | null;
};

const CAT_LABEL: Record<string, { en: string; hi: string }> = {
  crime: { en: "Crime", hi: "अपराध" },
  politics: { en: "Politics", hi: "राजनीति" },
  civic: { en: "Civic", hi: "नागरिक" },
  business: { en: "Business", hi: "व्यापार" },
  sports: { en: "Sports", hi: "खेल" },
  entertainment: { en: "Entertainment", hi: "मनोरंजन" },
  health: { en: "Health", hi: "स्वास्थ्य" },
  education: { en: "Education", hi: "शिक्षा" },
  other: { en: "Other", hi: "अन्य" },
};

const FILTERS = [
  { key: "new", en: "New", hi: "नई" },
  { key: "reviewed", en: "Reviewed", hi: "समीक्षित" },
  { key: "promoted", en: "Promoted", hi: "ड्राफ़्ट बनी" },
  { key: "dismissed", en: "Dismissed", hi: "खारिज" },
  { key: "all", en: "All", hi: "सभी" },
];

function fmt(ms: string, lang: string): string {
  try {
    return new Date(ms).toLocaleString(lang === "hi" ? "hi-IN" : "en-IN", {
      day: "numeric", month: "short", hour: "2-digit", minute: "2-digit",
    });
  } catch { return ""; }
}

export function NewsInbox() {
  const { lang } = useLang();
  const t = (en: string, hi: string) => (lang === "hi" ? hi : en);

  const [items, setItems] = useState<Submission[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState("new");
  const [busy, setBusy] = useState<string | null>(null);
  const [lightbox, setLightbox] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/news");
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? `Failed (${res.status})`);
      setItems(json.submissions ?? []);
      setCounts(json.counts ?? {});
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function setStatus(id: string, status: string) {
    setBusy(id);
    try {
      await fetch("/api/news", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, status }),
      });
      await load();
    } finally { setBusy(null); }
  }

  async function promote(id: string) {
    setBusy(id);
    setError(null);
    try {
      const res = await fetch(`/api/news/${id}/promote`, { method: "POST" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Failed");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not create draft");
    } finally { setBusy(null); }
  }

  const shown = filter === "all" ? items : items.filter((i) => i.status === filter);

  return (
    <div className="max-w-[860px]">
      <div className="flex items-end justify-between gap-4 pb-4 mb-5 border-b border-[var(--border)]">
        <div>
          <h1 className="text-2xl font-medium flex items-center gap-2">
            <Inbox size={20} className="text-[var(--purple)]" />
            {t("News Inbox", "न्यूज़ इनबॉक्स")}
          </h1>
          <p className="text-[13px] text-[var(--text-3)] mt-1">
            {t("News tips submitted by the team. Promote one into a draft.", "टीम द्वारा भेजी गई ख़बरें। किसी को ड्राफ़्ट में बदलें।")}
          </p>
        </div>
      </div>

      <div className="flex flex-wrap gap-1 mb-5">
        {FILTERS.map((f) => (
          <button key={f.key} onClick={() => setFilter(f.key)}
            className={`text-[12px] px-3 py-1.5 rounded-lg ${
              filter === f.key ? "bg-[var(--text)] text-white font-medium" : "bg-[var(--surface-2)] text-[var(--text-2)]"
            }`}>
            {lang === "hi" ? f.hi : f.en}
            {f.key !== "all" && counts[f.key] ? ` (${counts[f.key]})` : ""}
          </button>
        ))}
      </div>

      {error && <div className="mb-4 text-[12px] px-3 py-2 rounded-lg bg-[#fee2e2] text-[#991b1b]">{error}</div>}

      {loading ? (
        <div className="flex items-center gap-2 text-[13px] text-[var(--text-3)] py-10">
          <Loader2 size={15} className="animate-spin" /> {t("Loading…", "लोड हो रहा है…")}
        </div>
      ) : shown.length === 0 ? (
        <div className="border border-dashed border-[var(--border)] rounded-xl py-14 text-center text-[13px] text-[var(--text-3)]">
          {t("Nothing here.", "यहाँ कुछ नहीं है।")}
        </div>
      ) : (
        <div className="space-y-3">
          {shown.map((s) => (
            <div key={s.id} className="border border-[var(--border)] rounded-xl bg-white p-4">
              <div className="flex items-start justify-between gap-3 mb-1.5">
                <div>
                  <h3 className="text-[15px] font-semibold leading-snug">{s.headline}</h3>
                  <div className="flex flex-wrap items-center gap-2 text-[11px] text-[var(--text-3)] mt-1">
                    <span className="px-1.5 py-0.5 rounded bg-[var(--surface-2)] text-[var(--text-2)]">
                      {CAT_LABEL[s.category]?.[lang === "hi" ? "hi" : "en"] ?? s.category}
                    </span>
                    {s.location && <span className="flex items-center gap-0.5"><MapPin size={11} /> {s.location}</span>}
                    <span>{s.submitter_name ?? "—"}</span>
                    {s.submitter_role === "external" && (
                      <span className="px-1 py-0.5 rounded bg-[var(--amber)]/15 text-[var(--amber)] text-[10px]">
                        {t("external", "बाहरी")}
                      </span>
                    )}
                    {s.submitter_contact && <span>· {s.submitter_contact}</span>}
                    <span>· {fmt(s.created_at, lang)}</span>
                  </div>
                </div>
                {s.status === "promoted" ? (
                  <span className="text-[11px] px-2 py-0.5 rounded-full bg-[#dcfce7] text-[#166534] shrink-0">
                    {t("Draft created", "ड्राफ़्ट बनी")}
                  </span>
                ) : s.status === "dismissed" ? (
                  <span className="text-[11px] px-2 py-0.5 rounded-full bg-[var(--surface-2)] text-[var(--text-3)] shrink-0">
                    {t("Dismissed", "खारिज")}
                  </span>
                ) : null}
              </div>

              {s.details && (
                <p className="text-[13px] text-[var(--text-2)] leading-relaxed whitespace-pre-wrap mb-2">{s.details}</p>
              )}

              {s.attachments?.length > 0 && (
                <div className="flex flex-wrap gap-2 mb-3">
                  {s.attachments.map((a, i) => (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img key={i} src={a.data} alt="" onClick={() => setLightbox(a.data)}
                      className="w-20 h-20 object-cover rounded-lg border border-[var(--border)] cursor-zoom-in" />
                  ))}
                </div>
              )}

              <div className="flex items-center gap-2 pt-2 border-t border-[var(--border)]">
                {s.status === "promoted" ? (
                  s.promoted_draft_id && (
                    <a href={`/generated`} className="flex items-center gap-1.5 text-[12px] text-[var(--purple)] font-medium">
                      <FileText size={13} /> {t("Open in My Articles", "मेरे लेख में खोलें")} <ExternalLink size={11} />
                    </a>
                  )
                ) : (
                  <>
                    <button onClick={() => promote(s.id)} disabled={busy === s.id}
                      className="flex items-center gap-1.5 text-[12px] font-medium px-3 py-1.5 rounded-lg text-white disabled:opacity-50"
                      style={{ background: "var(--purple)" }}>
                      {busy === s.id ? <Loader2 size={13} className="animate-spin" /> : <FileText size={13} />}
                      {t("Create draft", "ड्राफ़्ट बनाएँ")}
                    </button>
                    {s.status !== "reviewed" && (
                      <button onClick={() => setStatus(s.id, "reviewed")} disabled={busy === s.id}
                        className="flex items-center gap-1.5 text-[12px] px-3 py-1.5 rounded-lg border border-[var(--border)]">
                        <Check size={13} /> {t("Mark reviewed", "समीक्षित")}
                      </button>
                    )}
                    <button onClick={() => setStatus(s.id, "dismissed")} disabled={busy === s.id}
                      className="flex items-center gap-1.5 text-[12px] px-3 py-1.5 rounded-lg border border-[var(--border)] text-[var(--text-3)] ml-auto">
                      <X size={13} /> {t("Dismiss", "खारिज")}
                    </button>
                  </>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {lightbox && (
        <div onClick={() => setLightbox(null)}
          className="fixed inset-0 z-[80] bg-black/80 grid place-items-center p-8 cursor-zoom-out">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={lightbox} alt="" className="max-w-full max-h-full rounded-lg" />
        </div>
      )}
    </div>
  );
}
