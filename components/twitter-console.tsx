"use client";

import { useCallback, useEffect, useState } from "react";
import {
  AtSign,
  Loader2,
  Plus,
  RefreshCw,
  Trash2,
  AlertTriangle,
  CheckCircle2,
  KeyRound,
  Pause,
  Play,
} from "lucide-react";

import { useLang } from "@/lib/i18n/context";

type Account = {
  id: string;
  handle: string;
  display_name: string | null;
  category: string;
  tier: number;
  desk: string | null;
  language: string;
  is_active: boolean;
  last_crawled_at: string | null;
  consecutive_errors: number;
  last_error: string | null;
  tweets_total: number;
  tweets_24h?: number;
};

type Tweet = {
  id: string;
  tweet_id: string;
  author_handle: string;
  content: string;
  url: string | null;
  posted_at: string;
  status: string;
  status_reason: string | null;
  metrics: Record<string, number>;
  tier: number;
};

const CATEGORIES = ["figure", "company", "organisation", "government", "media"] as const;

const CATEGORY_LABEL: Record<string, { en: string; hi: string }> = {
  figure: { en: "Public figure", hi: "प्रमुख व्यक्ति" },
  company: { en: "Company", hi: "कंपनी" },
  organisation: { en: "Organisation", hi: "संगठन" },
  government: { en: "Government", hi: "सरकार" },
  media: { en: "Media", hi: "मीडिया" },
};

// Tier drives crawl frequency. Keeping most accounts off tier 1 is what stops
// the scraping account getting rate-limited and then suspended.
const TIERS = [
  { value: 1, en: "Every 5 min", hi: "हर 5 मिनट" },
  { value: 2, en: "Every 30 min", hi: "हर 30 मिनट" },
  { value: 3, en: "Every 2 hours", hi: "हर 2 घंटे" },
];

const STATUS_STYLE: Record<string, { bg: string; fg: string; en: string; hi: string }> = {
  new: { bg: "var(--surface-2)", fg: "var(--text-2)", en: "Captured", hi: "प्राप्त" },
  queued: { bg: "var(--surface-2)", fg: "var(--text-2)", en: "Queued", hi: "क़तार में" },
  drafted: { bg: "#dcfce7", fg: "#166534", en: "Article ready", hi: "लेख तैयार" },
  failed: { bg: "#fee2e2", fg: "#991b1b", en: "Failed", hi: "विफल" },
  skipped_retweet: { bg: "var(--surface-2)", fg: "var(--text-3)", en: "Retweet", hi: "रीट्वीट" },
  nothing_to_write: {
    bg: "var(--surface-2)", fg: "var(--text-3)",
    en: "Nothing to write", hi: "लिखने योग्य नहीं",
  },
};

function timeAgo(iso: string | null, lang: string): string {
  if (!iso) return lang === "hi" ? "कभी नहीं" : "never";
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 1) return lang === "hi" ? "अभी" : "just now";
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h`;
  return `${Math.floor(hrs / 24)}d`;
}

export function TwitterConsole({ isAdmin }: { isAdmin: boolean }) {
  const { lang } = useLang();
  const t = (en: string, hi: string) => (lang === "hi" ? hi : en);

  const [tab, setTab] = useState<"accounts" | "feed">("accounts");
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [tweets, setTweets] = useState<Tweet[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [crawling, setCrawling] = useState(false);
  const [crawlNote, setCrawlNote] = useState<string | null>(null);

  // Add-account form
  const [handle, setHandle] = useState("");
  const [category, setCategory] = useState<string>("figure");
  const [tier, setTier] = useState(2);
  const [desk, setDesk] = useState("");
  const [language, setLanguage] = useState("hi");
  const [adding, setAdding] = useState(false);

  const loadAccounts = useCallback(async () => {
    try {
      const res = await fetch("/api/twitter/accounts");
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? `Failed (${res.status})`);
      setAccounts(json.accounts ?? []);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load accounts");
    } finally {
      setLoading(false);
    }
  }, []);

  const loadTweets = useCallback(async () => {
    try {
      const res = await fetch("/api/twitter/tweets?limit=100");
      const json = await res.json();
      if (res.ok) {
        setTweets(json.tweets ?? []);
        setCounts(json.counts ?? {});
      }
    } catch {
      /* feed is secondary — don't blank the page over it */
    }
  }, []);

  useEffect(() => {
    loadAccounts();
    loadTweets();
  }, [loadAccounts, loadTweets]);

  async function addAccount() {
    if (!handle.trim()) return;
    setAdding(true);
    setError(null);
    try {
      const res = await fetch("/api/twitter/accounts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          handle,
          category,
          tier,
          desk: desk.trim() || undefined,
          language,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? `Failed (${res.status})`);
      setAccounts((prev) => [...prev, json.account]);
      setHandle("");
      setDesk("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not add account");
    } finally {
      setAdding(false);
    }
  }

  async function patchAccount(id: string, patch: Partial<Account>) {
    const res = await fetch(`/api/twitter/accounts/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
    const json = await res.json();
    if (res.ok) {
      setAccounts((prev) => prev.map((a) => (a.id === id ? { ...a, ...json.account } : a)));
    } else {
      setError(json.error ?? "Update failed");
    }
  }

  async function removeAccount(id: string, h: string) {
    if (!confirm(t(`Stop watching @${h}? Its captured tweets are removed too.`,
                  `@${h} को हटाएँ? इसके सभी ट्वीट भी हट जाएँगे।`))) return;
    const res = await fetch(`/api/twitter/accounts/${id}`, { method: "DELETE" });
    if (res.ok) {
      setAccounts((prev) => prev.filter((a) => a.id !== id));
      loadTweets();
    }
  }

  async function crawlNow() {
    setCrawling(true);
    setCrawlNote(null);
    try {
      const res = await fetch("/api/twitter/crawl", { method: "POST" });
      const json = await res.json();
      if (!res.ok || json.ok === false) throw new Error(json.error ?? `Failed (${res.status})`);
      setCrawlNote(
        json.skipped_reason
          ? json.skipped_reason
          : t(
              `${json.accounts_due} due · ${json.tweets_inserted} new tweets · ${json.accounts_failed} failed`,
              `${json.accounts_due} बाकी · ${json.tweets_inserted} नए ट्वीट · ${json.accounts_failed} विफल`
            )
      );
      await Promise.all([loadAccounts(), loadTweets()]);
    } catch (e) {
      setCrawlNote(e instanceof Error ? e.message : "Crawl failed");
    } finally {
      setCrawling(false);
    }
  }

  return (
    <div className="p-8 max-w-[1100px]">
      <div className="flex items-start justify-between gap-4 mb-1">
        <h1 className="text-[22px] font-semibold flex items-center gap-2">
          <AtSign size={20} className="text-[var(--purple)]" />
          {t("Twitter", "ट्विटर")}
        </h1>
        <div className="flex items-center gap-2">
          <button
            onClick={crawlNow}
            disabled={crawling}
            className="flex items-center gap-1.5 text-[12px] font-medium px-3 py-2 rounded-lg text-white disabled:opacity-60"
            style={{ background: "var(--purple)" }}
          >
            {crawling ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />}
            {crawling ? t("Crawling…", "चल रहा है…") : t("Crawl now", "अभी क्रॉल करें")}
          </button>
        </div>
      </div>
      <p className="text-[13px] text-[var(--text-3)] mb-5">
        {t(
          "Watch X accounts and turn their posts into stories. Runs separately from the news pipeline.",
          "एक्स अकाउंट्स पर नज़र रखें और उनकी पोस्ट से ख़बर बनाएँ। यह न्यूज़ पाइपलाइन से अलग चलता है।"
        )}
      </p>

      {crawlNote && (
        <div className="mb-4 text-[12px] px-3 py-2 rounded-lg bg-[var(--surface-2)] text-[var(--text-2)]">
          {crawlNote}
        </div>
      )}
      {error && (
        <div className="mb-4 text-[12px] px-3 py-2 rounded-lg bg-[#fee2e2] text-[#991b1b] flex items-start gap-2">
          <AlertTriangle size={14} className="mt-0.5 shrink-0" /> {error}
        </div>
      )}

      {isAdmin && <AuthTokenPanel t={t} />}

      {/* Tabs */}
      <div className="flex gap-1 border-b border-[var(--border)] mb-5">
        {([
          ["accounts", t("Accounts", "अकाउंट्स"), accounts.length],
          ["feed", t("Feed", "फ़ीड"), tweets.length],
        ] as const).map(([key, label, n]) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`text-[13px] px-3.5 py-2 -mb-px border-b-2 ${
              tab === key
                ? "border-[var(--purple)] text-[var(--text)] font-medium"
                : "border-transparent text-[var(--text-3)]"
            }`}
          >
            {label} <span className="text-[11px] text-[var(--text-3)]">({n})</span>
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex items-center gap-2 text-[13px] text-[var(--text-3)] py-10">
          <Loader2 size={15} className="animate-spin" /> {t("Loading…", "लोड हो रहा है…")}
        </div>
      ) : tab === "accounts" ? (
        <>
          {/* Add form */}
          <div className="border border-[var(--border)] rounded-xl p-4 mb-5 bg-white">
            <div className="flex flex-wrap gap-2.5 items-end">
              <Field label={t("Handle", "हैंडल")} width="w-[190px]">
                <input
                  value={handle}
                  onChange={(e) => setHandle(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && addAccount()}
                  placeholder="@PMOIndia"
                  className="w-full bg-white border border-[var(--border)] text-[13px] px-3 py-2 rounded-lg outline-none focus:border-[var(--purple)]"
                />
              </Field>
              <Field label={t("Type", "प्रकार")} width="w-[150px]">
                <Select value={category} onChange={setCategory}
                  options={CATEGORIES.map((c) => [c, CATEGORY_LABEL[c][lang === "hi" ? "hi" : "en"]])} />
              </Field>
              <Field label={t("Check every", "जाँच अंतराल")} width="w-[150px]">
                <Select value={String(tier)} onChange={(v) => setTier(Number(v))}
                  options={TIERS.map((x) => [String(x.value), lang === "hi" ? x.hi : x.en])} />
              </Field>
              <Field label={t("Desk", "डेस्क")} width="w-[130px]">
                <input value={desk} onChange={(e) => setDesk(e.target.value)}
                  placeholder={t("optional", "वैकल्पिक")}
                  className="w-full bg-white border border-[var(--border)] text-[13px] px-3 py-2 rounded-lg outline-none focus:border-[var(--purple)]" />
              </Field>
              <Field label={t("Language", "भाषा")} width="w-[110px]">
                <Select value={language} onChange={setLanguage}
                  options={[["hi", t("Hindi", "हिन्दी")], ["en", t("English", "अंग्रेज़ी")]]} />
              </Field>
              <button
                onClick={addAccount}
                disabled={adding || !handle.trim()}
                className="flex items-center gap-1.5 text-[13px] font-medium px-4 py-2 rounded-lg text-white disabled:opacity-50"
                style={{ background: "var(--purple)" }}
              >
                {adding ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
                {t("Add", "जोड़ें")}
              </button>
            </div>
          </div>

          {accounts.length === 0 ? (
            <Empty text={t("No accounts yet. Add one above to start watching.",
                           "अभी कोई अकाउंट नहीं। ऊपर से एक जोड़ें।")} />
          ) : (
            <div className="border border-[var(--border)] rounded-xl overflow-hidden bg-white">
              <table className="w-full text-[13px]">
                <thead className="bg-[var(--surface-2)] text-[var(--text-3)] text-[11px] uppercase">
                  <tr>
                    <Th>{t("Account", "अकाउंट")}</Th>
                    <Th>{t("Type", "प्रकार")}</Th>
                    <Th>{t("Frequency", "अंतराल")}</Th>
                    <Th>{t("Last check", "आख़िरी जाँच")}</Th>
                    <Th>{t("Tweets", "ट्वीट")}</Th>
                    <Th> </Th>
                  </tr>
                </thead>
                <tbody>
                  {accounts.map((a) => (
                    <tr key={a.id} className="border-t border-[var(--border)]">
                      <td className="px-3 py-2.5">
                        <div className={`font-medium ${a.is_active ? "" : "text-[var(--text-3)]"}`}>
                          @{a.handle}
                        </div>
                        {a.consecutive_errors > 0 && (
                          <div className="text-[11px] text-[#991b1b] flex items-center gap-1 mt-0.5">
                            <AlertTriangle size={11} />
                            {t(`${a.consecutive_errors} failed checks`,
                               `${a.consecutive_errors} बार विफल`)}
                          </div>
                        )}
                      </td>
                      <td className="px-3 py-2.5 text-[var(--text-2)]">
                        {CATEGORY_LABEL[a.category]?.[lang === "hi" ? "hi" : "en"] ?? a.category}
                      </td>
                      <td className="px-3 py-2.5">
                        <Select
                          value={String(a.tier)}
                          onChange={(v) => patchAccount(a.id, { tier: Number(v) })}
                          options={TIERS.map((x) => [String(x.value), lang === "hi" ? x.hi : x.en])}
                          compact
                        />
                      </td>
                      <td className="px-3 py-2.5 text-[var(--text-3)]">
                        {timeAgo(a.last_crawled_at, lang)}
                      </td>
                      <td className="px-3 py-2.5 text-[var(--text-2)]">{a.tweets_total}</td>
                      <td className="px-3 py-2.5">
                        <div className="flex items-center gap-1 justify-end">
                          <IconBtn
                            title={a.is_active ? t("Pause", "रोकें") : t("Resume", "चालू करें")}
                            onClick={() => patchAccount(a.id, { is_active: !a.is_active })}
                          >
                            {a.is_active ? <Pause size={14} /> : <Play size={14} />}
                          </IconBtn>
                          <IconBtn title={t("Remove", "हटाएँ")}
                            onClick={() => removeAccount(a.id, a.handle)} danger>
                            <Trash2 size={14} />
                          </IconBtn>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      ) : (
        <>
          {Object.keys(counts).length > 0 && (
            <div className="flex flex-wrap gap-2 mb-4">
              {Object.entries(counts).map(([s, n]) => {
                const style = STATUS_STYLE[s] ?? STATUS_STYLE.new;
                return (
                  <span key={s} className="text-[11px] px-2 py-1 rounded-full"
                    style={{ background: style.bg, color: style.fg }}>
                    {lang === "hi" ? style.hi : style.en}: {n}
                  </span>
                );
              })}
            </div>
          )}

          {tweets.length === 0 ? (
            <Empty text={t("No tweets captured yet. Add an account, then press Crawl now.",
                           "अभी कोई ट्वीट नहीं। एक अकाउंट जोड़ें, फिर 'अभी क्रॉल करें' दबाएँ।")} />
          ) : (
            <div className="space-y-2.5">
              {tweets.map((tw) => {
                const style = STATUS_STYLE[tw.status] ?? STATUS_STYLE.new;
                return (
                  <div key={tw.id} className="border border-[var(--border)] rounded-xl p-4 bg-white">
                    <div className="flex items-center justify-between gap-3 mb-1.5">
                      <div className="flex items-center gap-2 text-[12px]">
                        <span className="font-medium">@{tw.author_handle}</span>
                        <span className="text-[var(--text-3)]">
                          {timeAgo(tw.posted_at, lang)}
                        </span>
                      </div>
                      <span className="text-[10px] px-2 py-0.5 rounded-full shrink-0"
                        style={{ background: style.bg, color: style.fg }}>
                        {lang === "hi" ? style.hi : style.en}
                      </span>
                    </div>
                    <p className="text-[14px] leading-relaxed whitespace-pre-wrap">{tw.content}</p>
                    {tw.status_reason && (
                      <div className="text-[11px] text-[var(--text-3)] mt-2">{tw.status_reason}</div>
                    )}
                    {tw.url && (
                      <a href={tw.url} target="_blank" rel="noopener noreferrer"
                        className="text-[11px] text-[var(--text-3)] hover:text-[var(--text)] mt-2 inline-block">
                        {t("View on X", "एक्स पर देखें")} ↗
                      </a>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}
    </div>
  );
}

/** Admin-only: store the X auth_token cookie and check the crawler is alive. */
function AuthTokenPanel({ t }: { t: (en: string, hi: string) => string }) {
  const [status, setStatus] = useState<{
    token: { set: boolean; updatedAt: string | null };
    shim: { up: boolean; scweet: boolean; error: string | null };
  } | null>(null);
  const [token, setToken] = useState("");
  const [saving, setSaving] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/twitter/settings");
      if (res.ok) setStatus(await res.json());
    } catch {
      /* panel is advisory */
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function save() {
    if (!token.trim()) return;
    setSaving(true);
    setNote(null);
    try {
      const res = await fetch("/api/twitter/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ auth_token: token.trim() }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Failed");
      setToken("");
      setNote(t("Saved.", "सहेजा गया।"));
      load();
    } catch (e) {
      setNote(e instanceof Error ? e.message : "Failed");
    } finally {
      setSaving(false);
    }
  }

  async function test() {
    setSaving(true);
    setNote(null);
    try {
      const res = await fetch("/api/twitter/settings", { method: "POST" });
      const json = await res.json();
      setNote(
        json.ok
          ? t(`Working — read ${json.tweets} tweet(s).`, `काम कर रहा है — ${json.tweets} ट्वीट पढ़े।`)
          : json.error ?? "Failed"
      );
    } finally {
      setSaving(false);
    }
  }

  const shimDown = status && !status.shim.up;
  const noToken = status && !status.token.set;

  return (
    <div className="border border-[var(--border)] rounded-xl p-4 mb-5 bg-white">
      <div className="flex items-center gap-2 mb-2">
        <KeyRound size={15} className="text-[var(--purple)]" />
        <h3 className="text-[13px] font-semibold">{t("X connection", "एक्स कनेक्शन")}</h3>
        {status && (
          <span className="text-[11px] flex items-center gap-1 ml-1"
            style={{ color: shimDown || noToken ? "#991b1b" : "#166534" }}>
            {shimDown || noToken ? <AlertTriangle size={12} /> : <CheckCircle2 size={12} />}
            {shimDown
              ? t("Crawler offline", "क्रॉलर बंद है")
              : noToken
              ? t("No token set", "टोकन सेट नहीं")
              : t("Connected", "जुड़ा हुआ")}
          </span>
        )}
      </div>
      <p className="text-[11.5px] text-[var(--text-3)] leading-relaxed mb-2.5">
        {t(
          "Paste the auth_token cookie from a logged-in X session. Use a dedicated throwaway account, never Patrika's own. Cookies expire — if the feed goes quiet, paste a fresh one here.",
          "लॉग-इन एक्स सेशन से auth_token कुकी यहाँ डालें। इसके लिए अलग (throwaway) अकाउंट इस्तेमाल करें, पत्रिका का असली अकाउंट कभी नहीं। कुकी की अवधि समाप्त होती है — फ़ीड रुक जाए तो नई कुकी डालें।"
        )}
      </p>
      <div className="flex flex-wrap gap-2 items-center">
        <input
          type="password"
          value={token}
          onChange={(e) => setToken(e.target.value)}
          placeholder={status?.token.set ? "••••••••••  (replace)" : "auth_token"}
          className="flex-1 min-w-[220px] bg-white border border-[var(--border)] text-[13px] px-3 py-2 rounded-lg outline-none focus:border-[var(--purple)] font-mono"
        />
        <button onClick={save} disabled={saving || !token.trim()}
          className="text-[12px] font-medium px-3 py-2 rounded-lg text-white disabled:opacity-50"
          style={{ background: "var(--purple)" }}>
          {t("Save", "सहेजें")}
        </button>
        <button onClick={test} disabled={saving || !status?.token.set}
          className="text-[12px] font-medium px-3 py-2 rounded-lg border border-[var(--border)] disabled:opacity-50">
          {saving ? <Loader2 size={13} className="animate-spin" /> : t("Test", "जाँचें")}
        </button>
      </div>
      {note && <div className="text-[11.5px] text-[var(--text-2)] mt-2">{note}</div>}
      {status?.shim.error && (
        <div className="text-[11px] text-[#991b1b] mt-2">
          {t("Crawler:", "क्रॉलर:")} {status.shim.error}
        </div>
      )}
    </div>
  );
}

/* ── small presentational helpers ──────────────────────────────── */

function Field({ label, width, children }: { label: string; width: string; children: React.ReactNode }) {
  return (
    <div className={width}>
      <label className="block text-[11px] font-medium text-[var(--text-2)] mb-1">{label}</label>
      {children}
    </div>
  );
}

function Select({
  value, onChange, options, compact,
}: {
  value: string;
  onChange: (v: string) => void;
  options: Array<readonly [string, string]>;
  compact?: boolean;
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={`w-full bg-white border border-[var(--border)] rounded-lg outline-none focus:border-[var(--purple)] ${
        compact ? "text-[12px] px-2 py-1" : "text-[13px] px-3 py-2"
      }`}
    >
      {options.map(([v, label]) => (
        <option key={v} value={v}>{label}</option>
      ))}
    </select>
  );
}

function Th({ children }: { children: React.ReactNode }) {
  return <th className="px-3 py-2 text-left font-medium">{children}</th>;
}

function IconBtn({
  children, onClick, title, danger,
}: {
  children: React.ReactNode;
  onClick: () => void;
  title: string;
  danger?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      className={`p-1.5 rounded-lg hover:bg-[var(--surface-2)] ${
        danger ? "text-[#991b1b]" : "text-[var(--text-3)]"
      }`}
    >
      {children}
    </button>
  );
}

function Empty({ text }: { text: string }) {
  return (
    <div className="border border-dashed border-[var(--border)] rounded-xl py-12 text-center text-[13px] text-[var(--text-3)]">
      {text}
    </div>
  );
}
