"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Loader2, RefreshCw, Plus, Trash2, MonitorPlay, Camera, Globe, AtSign,
  TrendingUp, Sparkles, AlertTriangle, KeyRound, Flame, Heart, MessageCircle,
  Repeat2, Eye, Pause, Play,
} from "lucide-react";

// lucide-react dropped brand glyphs, so platforms use neutral stand-ins:
// YouTube → MonitorPlay, Instagram → Camera, Facebook → Globe, X → AtSign.

import { useLang } from "@/lib/i18n/context";

type Platform = "youtube" | "x" | "instagram" | "facebook";

type Account = {
  id: string;
  platform: Platform;
  handle: string;
  display_name: string | null;
  kind: string;
  is_active: boolean;
  followers: number | null;
  last_synced_at: string | null;
  last_error: string | null;
  post_count?: number;
  avg_virality?: number | null;
};

type Post = {
  id: string;
  platform: Platform;
  url: string | null;
  content: string;
  media_url: string | null;
  posted_at: string | null;
  likes: number; comments: number; shares: number; views: number;
  engagement: number; engagement_rate: number; virality_score: number;
  handle: string; display_name: string | null; kind: string;
};

type PlatformStat = { platform: Platform; posts: number; avg_virality: number; engagement: string };

type Suggestion = { platform: Platform; idea: string; format: string; why: string; caption: string };

const PLATFORMS: Array<{ key: Platform; label: string; icon: React.ReactNode; note?: string }> = [
  { key: "youtube", label: "YouTube", icon: <MonitorPlay size={14} /> },
  { key: "x", label: "X", icon: <AtSign size={14} /> },
  { key: "instagram", label: "Instagram", icon: <Camera size={14} /> },
  { key: "facebook", label: "Facebook", icon: <Globe size={14} /> },
];
const PICON: Record<Platform, React.ReactNode> = {
  youtube: <MonitorPlay size={13} className="text-[#ff0000]" />,
  x: <AtSign size={13} />,
  instagram: <Camera size={13} className="text-[#c13584]" />,
  facebook: <Globe size={13} className="text-[#1877f2]" />,
};

function num(n: number | null | undefined): string {
  if (n == null) return "—";
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + "M";
  if (n >= 1_000) return (n / 1_000).toFixed(1) + "K";
  return String(n);
}
function ago(iso: string | null, lang: string): string {
  if (!iso) return lang === "hi" ? "कभी नहीं" : "never";
  const m = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (m < 1) return lang === "hi" ? "अभी" : "now";
  if (m < 60) return `${m}m`;
  if (m < 1440) return `${Math.floor(m / 60)}h`;
  return `${Math.floor(m / 1440)}d`;
}
function viralColor(v: number): string {
  if (v >= 66) return "#dc2626";
  if (v >= 33) return "#ea580c";
  return "#6b7280";
}

export function SocialCenter({ isAdmin }: { isAdmin: boolean }) {
  const { lang } = useLang();
  const t = (en: string, hi: string) => (lang === "hi" ? hi : en);

  const [tab, setTab] = useState<"dashboard" | "accounts" | "suggestions">("dashboard");
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [posts, setPosts] = useState<Post[]>([]);
  const [byPlatform, setByPlatform] = useState<PlatformStat[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [days, setDays] = useState(7);
  const [platformFilter, setPlatformFilter] = useState<Platform | "">("");

  // add form
  const [addPlatform, setAddPlatform] = useState<Platform>("youtube");
  const [addHandle, setAddHandle] = useState("");
  const [addKind, setAddKind] = useState("competitor");
  const [adding, setAdding] = useState(false);

  // suggestions
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [suggBasedOn, setSuggBasedOn] = useState(0);
  const [suggesting, setSuggesting] = useState(false);

  const loadAccounts = useCallback(async () => {
    try {
      const res = await fetch("/api/social/accounts");
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Failed");
      setAccounts(json.accounts ?? []);
      setError(null);
    } catch (e) { setError(e instanceof Error ? e.message : "Failed to load"); }
    finally { setLoading(false); }
  }, []);

  const loadPosts = useCallback(async () => {
    try {
      const q = new URLSearchParams({ days: String(days) });
      if (platformFilter) q.set("platform", platformFilter);
      const res = await fetch(`/api/social/posts?${q}`);
      const json = await res.json();
      if (res.ok) { setPosts(json.posts ?? []); setByPlatform(json.byPlatform ?? []); }
    } catch { /* secondary */ }
  }, [days, platformFilter]);

  useEffect(() => { loadAccounts(); }, [loadAccounts]);
  useEffect(() => { loadPosts(); }, [loadPosts]);

  async function addAccount() {
    if (!addHandle.trim()) return;
    setAdding(true); setError(null);
    try {
      const res = await fetch("/api/social/accounts", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ platform: addPlatform, handle: addHandle, kind: addKind }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Failed");
      setAccounts((p) => [...p, json.account]);
      setAddHandle("");
    } catch (e) { setError(e instanceof Error ? e.message : "Could not add"); }
    finally { setAdding(false); }
  }

  async function patchAccount(id: string, patch: Partial<Account>) {
    const res = await fetch(`/api/social/accounts/${id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(patch),
    });
    const json = await res.json();
    if (res.ok) setAccounts((p) => p.map((a) => (a.id === id ? { ...a, ...json.account } : a)));
  }

  async function removeAccount(id: string, h: string) {
    if (!confirm(t(`Stop tracking ${h}?`, `${h} को हटाएँ?`))) return;
    const res = await fetch(`/api/social/accounts/${id}`, { method: "DELETE" });
    if (res.ok) { setAccounts((p) => p.filter((a) => a.id !== id)); loadPosts(); }
  }

  async function syncNow(id?: string) {
    setSyncing(true); setNote(null); setError(null);
    try {
      const res = await fetch("/api/social/sync", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(id ? { id } : {}),
      });
      const json = await res.json();
      if (!res.ok || json.ok === false) throw new Error(json.error ?? "Sync failed");
      setNote(t(
        `Synced ${json.accounts_ok}/${json.accounts} · ${json.posts_upserted} posts · ${json.accounts_failed} failed`,
        `${json.accounts} में से ${json.accounts_ok} सिंक · ${json.posts_upserted} पोस्ट · ${json.accounts_failed} विफल`
      ));
      await Promise.all([loadAccounts(), loadPosts()]);
    } catch (e) { setError(e instanceof Error ? e.message : "Sync failed"); }
    finally { setSyncing(false); }
  }

  async function getSuggestions() {
    setSuggesting(true); setError(null);
    try {
      const res = await fetch("/api/social/suggest", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ days, lang }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Failed");
      setSuggestions(json.suggestions ?? []);
      setSuggBasedOn(json.basedOn ?? 0);
      if (json.error) setError(json.error);
    } catch (e) { setError(e instanceof Error ? e.message : "Failed"); }
    finally { setSuggesting(false); }
  }

  return (
    <div className="p-8 max-w-[1100px]">
      <div className="flex items-start justify-between gap-4 mb-1">
        <h1 className="text-[22px] font-semibold flex items-center gap-2">
          <TrendingUp size={20} className="text-[var(--purple)]" />
          {t("Social command center", "सोशल कमांड सेंटर")}
        </h1>
        <button onClick={() => syncNow()} disabled={syncing}
          className="flex items-center gap-1.5 text-[12px] font-medium px-3 py-2 rounded-lg text-white disabled:opacity-60"
          style={{ background: "var(--purple)" }}>
          {syncing ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />}
          {syncing ? t("Syncing…", "सिंक हो रहा है…") : t("Sync now", "अभी सिंक करें")}
        </button>
      </div>
      <p className="text-[13px] text-[var(--text-3)] mb-5">
        {t("Track competitor & agency pages, spot what's going viral, and get post ideas.",
           "प्रतिस्पर्धी और एजेंसी पेज ट्रैक करें, वायरल पोस्ट पहचानें, और पोस्ट आइडिया पाएँ।")}
      </p>

      {note && <div className="mb-4 text-[12px] px-3 py-2 rounded-lg bg-[var(--surface-2)] text-[var(--text-2)]">{note}</div>}
      {error && <div className="mb-4 text-[12px] px-3 py-2 rounded-lg bg-[#fee2e2] text-[#991b1b] flex items-start gap-2"><AlertTriangle size={14} className="mt-0.5 shrink-0" />{error}</div>}

      {isAdmin && (
        <div className="mb-5 text-[11.5px] text-[var(--text-3)] flex items-center gap-1.5">
          <KeyRound size={12} />
          {t("Platform keys (YouTube, Meta) are managed in ", "प्लेटफ़ॉर्म कीज़ (YouTube, Meta) यहाँ प्रबंधित होती हैं: ")}
          <a href="/admin" className="text-[var(--purple)] font-medium hover:underline">
            {t("Admin → Integration keys", "एडमिन → इंटीग्रेशन कीज़")}
          </a>
        </div>
      )}

      <div className="flex gap-1 border-b border-[var(--border)] mb-5">
        {([
          ["dashboard", t("Dashboard", "डैशबोर्ड")],
          ["accounts", t("Accounts", "अकाउंट्स")],
          ["suggestions", t("Suggestions", "सुझाव")],
        ] as const).map(([k, label]) => (
          <button key={k} onClick={() => setTab(k)}
            className={`text-[13px] px-3.5 py-2 -mb-px border-b-2 ${tab === k ? "border-[var(--purple)] text-[var(--text)] font-medium" : "border-transparent text-[var(--text-3)]"}`}>
            {label}
          </button>
        ))}
      </div>

      {/* range + platform filter (dashboard + suggestions) */}
      {tab !== "accounts" && (
        <div className="flex flex-wrap items-center gap-2 mb-4">
          <div className="flex gap-1 bg-[var(--surface-2)] rounded-lg p-0.5">
            {[7, 30, 90].map((d) => (
              <button key={d} onClick={() => setDays(d)}
                className={`text-[12px] px-2.5 py-1 rounded-md ${days === d ? "bg-white shadow-sm font-medium" : "text-[var(--text-3)]"}`}>
                {d}{t("d", "दि")}
              </button>
            ))}
          </div>
          {tab === "dashboard" && (
            <div className="flex gap-1">
              <button onClick={() => setPlatformFilter("")}
                className={`text-[11px] px-2 py-1 rounded-md border ${platformFilter === "" ? "border-[var(--purple)]" : "border-[var(--border)] text-[var(--text-3)]"}`}>
                {t("All", "सभी")}
              </button>
              {PLATFORMS.map((p) => (
                <button key={p.key} onClick={() => setPlatformFilter(p.key)}
                  className={`text-[11px] px-2 py-1 rounded-md border flex items-center gap-1 ${platformFilter === p.key ? "border-[var(--purple)]" : "border-[var(--border)] text-[var(--text-3)]"}`}>
                  {p.icon}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {loading ? (
        <div className="flex items-center gap-2 text-[13px] text-[var(--text-3)] py-10">
          <Loader2 size={15} className="animate-spin" /> {t("Loading…", "लोड हो रहा है…")}
        </div>
      ) : tab === "dashboard" ? (
        <Dashboard posts={posts} byPlatform={byPlatform} t={t} lang={lang} />
      ) : tab === "accounts" ? (
        <Accounts
          accounts={accounts} t={t} lang={lang}
          addPlatform={addPlatform} setAddPlatform={setAddPlatform}
          addHandle={addHandle} setAddHandle={setAddHandle}
          addKind={addKind} setAddKind={setAddKind}
          adding={adding} addAccount={addAccount}
          patchAccount={patchAccount} removeAccount={removeAccount}
          syncNow={syncNow} syncing={syncing}
        />
      ) : (
        <Suggestions
          suggestions={suggestions} basedOn={suggBasedOn} suggesting={suggesting}
          getSuggestions={getSuggestions} t={t}
        />
      )}
    </div>
  );
}

function Dashboard({ posts, byPlatform, t, lang }: {
  posts: Post[]; byPlatform: PlatformStat[];
  t: (e: string, h: string) => string; lang: string;
}) {
  return (
    <>
      {byPlatform.length > 0 && (
        <div className="grid grid-cols-4 gap-3 mb-5">
          {PLATFORMS.map((p) => {
            const s = byPlatform.find((b) => b.platform === p.key);
            return (
              <div key={p.key} className="bg-white border border-[var(--border)] rounded-xl p-3">
                <div className="flex items-center gap-1.5 text-[12px] font-medium mb-2">{p.icon} {p.label}</div>
                <div className="text-[18px] font-semibold leading-none">{s?.posts ?? 0}</div>
                <div className="text-[10px] text-[var(--text-3)] mt-1">
                  {t("posts", "पोस्ट")} · {t("avg viral", "औसत वायरल")} {s?.avg_virality ?? 0}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {posts.length === 0 ? (
        <Empty text={t("No posts yet. Add accounts, then Sync now.", "अभी कोई पोस्ट नहीं। अकाउंट जोड़ें, फिर सिंक करें।")} />
      ) : (
        <div className="space-y-2.5">
          {posts.map((p) => (
            <div key={p.id} className="border border-[var(--border)] rounded-xl bg-white p-3.5 flex gap-3">
              {p.media_url && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={p.media_url} alt="" className="w-20 h-20 object-cover rounded-lg border border-[var(--border)] shrink-0"
                  onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }} />
              )}
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 text-[11px] text-[var(--text-3)] mb-1">
                  {PICON[p.platform]}
                  <span className="font-medium text-[var(--text-2)]">{p.display_name ?? p.handle}</span>
                  <span>{ago(p.posted_at, lang)}</span>
                  {p.url && <a href={p.url} target="_blank" rel="noopener noreferrer" className="hover:text-[var(--text)]">↗</a>}
                </div>
                <p className="text-[13px] leading-snug line-clamp-2 mb-2">{p.content || t("(no caption)", "(कोई कैप्शन नहीं)")}</p>
                <div className="flex items-center gap-3 text-[11px] text-[var(--text-3)]">
                  <span className="flex items-center gap-0.5"><Heart size={11} /> {num(p.likes)}</span>
                  <span className="flex items-center gap-0.5"><MessageCircle size={11} /> {num(p.comments)}</span>
                  {p.shares > 0 && <span className="flex items-center gap-0.5"><Repeat2 size={11} /> {num(p.shares)}</span>}
                  {p.views > 0 && <span className="flex items-center gap-0.5"><Eye size={11} /> {num(p.views)}</span>}
                </div>
              </div>
              <div className="shrink-0 text-center">
                <div className="flex items-center gap-1 justify-center font-semibold text-[16px]" style={{ color: viralColor(p.virality_score) }}>
                  <Flame size={14} /> {p.virality_score}
                </div>
                <div className="text-[9px] text-[var(--text-3)] uppercase tracking-wide">{t("virality", "वायरलता")}</div>
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  );
}

/* eslint-disable @typescript-eslint/no-explicit-any */
function Accounts(props: any) {
  const {
    accounts, t, lang, addPlatform, setAddPlatform, addHandle, setAddHandle,
    addKind, setAddKind, adding, addAccount, patchAccount, removeAccount, syncNow, syncing,
  } = props;
  return (
    <>
      <div className="border border-[var(--border)] rounded-xl p-4 mb-5 bg-white flex flex-wrap gap-2.5 items-end">
        <div className="w-[140px]">
          <label className="block text-[11px] font-medium text-[var(--text-2)] mb-1">{t("Platform", "प्लेटफ़ॉर्म")}</label>
          <select value={addPlatform} onChange={(e) => setAddPlatform(e.target.value)}
            className="w-full bg-white border border-[var(--border)] text-[13px] px-3 py-2 rounded-lg outline-none focus:border-[var(--purple)]">
            {PLATFORMS.map((p) => <option key={p.key} value={p.key}>{p.label}</option>)}
          </select>
        </div>
        <div className="flex-1 min-w-[200px]">
          <label className="block text-[11px] font-medium text-[var(--text-2)] mb-1">{t("Handle or URL", "हैंडल या URL")}</label>
          <input value={addHandle} onChange={(e) => setAddHandle(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && addAccount()}
            placeholder={addPlatform === "youtube" ? "@channel or URL" : "@handle"}
            className="w-full bg-white border border-[var(--border)] text-[13px] px-3 py-2 rounded-lg outline-none focus:border-[var(--purple)]" />
        </div>
        <div className="w-[130px]">
          <label className="block text-[11px] font-medium text-[var(--text-2)] mb-1">{t("Type", "प्रकार")}</label>
          <select value={addKind} onChange={(e) => setAddKind(e.target.value)}
            className="w-full bg-white border border-[var(--border)] text-[13px] px-3 py-2 rounded-lg outline-none focus:border-[var(--purple)]">
            <option value="competitor">{t("Competitor", "प्रतिस्पर्धी")}</option>
            <option value="agency">{t("Agency", "एजेंसी")}</option>
            <option value="own">{t("Own", "अपना")}</option>
          </select>
        </div>
        <button onClick={addAccount} disabled={adding || !addHandle.trim()}
          className="flex items-center gap-1.5 text-[13px] font-medium px-4 py-2 rounded-lg text-white disabled:opacity-50"
          style={{ background: "var(--purple)" }}>
          {adding ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />} {t("Add", "जोड़ें")}
        </button>
      </div>

      {props.accounts.length === 0 ? (
        <Empty text={t("No accounts tracked yet.", "अभी कोई अकाउंट नहीं।")} />
      ) : (
        <div className="space-y-2">
          {accounts.map((a: Account) => (
            <div key={a.id} className="border border-[var(--border)] rounded-xl bg-white p-3 flex items-center gap-3">
              <div className="shrink-0">{PICON[a.platform]}</div>
              <div className="min-w-0 flex-1">
                <div className={`text-[13px] font-medium ${a.is_active ? "" : "text-[var(--text-3)]"}`}>
                  {a.display_name ?? a.handle}
                </div>
                <div className="text-[11px] text-[var(--text-3)] flex items-center gap-2">
                  <span>{a.kind}</span>
                  <span>· {num(a.followers)} {t("followers", "फ़ॉलोअर")}</span>
                  <span>· {a.post_count ?? 0} {t("posts", "पोस्ट")}</span>
                  {a.avg_virality != null && <span>· {t("viral", "वायरल")} {a.avg_virality}</span>}
                  <span>· {ago(a.last_synced_at, lang)}</span>
                </div>
                {a.last_error && (
                  <div className="text-[11px] text-[#991b1b] mt-0.5 flex items-center gap-1 leading-snug">
                    <AlertTriangle size={11} className="shrink-0" /> {a.last_error}
                  </div>
                )}
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <button onClick={() => syncNow(a.id)} disabled={syncing} title={t("Sync", "सिंक")}
                  className="p-1.5 rounded-lg hover:bg-[var(--surface-2)] text-[var(--text-3)]">
                  <RefreshCw size={14} />
                </button>
                <button onClick={() => patchAccount(a.id, { is_active: !a.is_active })}
                  title={a.is_active ? t("Pause", "रोकें") : t("Resume", "चालू")}
                  className="p-1.5 rounded-lg hover:bg-[var(--surface-2)] text-[var(--text-3)]">
                  {a.is_active ? <Pause size={14} /> : <Play size={14} />}
                </button>
                <button onClick={() => removeAccount(a.id, a.handle)} title={t("Remove", "हटाएँ")}
                  className="p-1.5 rounded-lg hover:bg-[var(--surface-2)] text-[#991b1b]">
                  <Trash2 size={14} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  );
}

function Suggestions({ suggestions, basedOn, suggesting, getSuggestions, t }: any) {
  return (
    <>
      <div className="flex items-center justify-between gap-3 mb-4">
        <p className="text-[12px] text-[var(--text-3)]">
          {basedOn > 0
            ? t(`Based on the top ${basedOn} competitor posts.`, `शीर्ष ${basedOn} प्रतिस्पर्धी पोस्ट के आधार पर।`)
            : t("Ideas grounded in what's working for your competitors.", "प्रतिस्पर्धियों के लिए जो काम कर रहा है, उस पर आधारित।")}
        </p>
        <button onClick={getSuggestions} disabled={suggesting}
          className="flex items-center gap-1.5 text-[12px] font-medium px-3 py-2 rounded-lg text-white disabled:opacity-60"
          style={{ background: "var(--purple)" }}>
          {suggesting ? <Loader2 size={13} className="animate-spin" /> : <Sparkles size={13} />}
          {suggesting ? t("Thinking…", "सोच रहे हैं…") : t("Get ideas", "आइडिया पाएँ")}
        </button>
      </div>
      {suggestions.length === 0 ? (
        <Empty text={t("Press 'Get ideas' for post suggestions.", "पोस्ट सुझावों के लिए 'आइडिया पाएँ' दबाएँ।")} />
      ) : (
        <div className="space-y-3">
          {suggestions.map((s: Suggestion, i: number) => (
            <div key={i} className="border border-[var(--border)] rounded-xl bg-white p-4">
              <div className="flex items-center gap-2 mb-1.5">
                {PICON[s.platform]}
                <span className="text-[10px] uppercase tracking-wide text-[var(--text-3)] font-medium">{s.format}</span>
              </div>
              <h3 className="text-[14px] font-semibold mb-1">{s.idea}</h3>
              <p className="text-[12px] text-[var(--text-3)] mb-2 leading-snug">{s.why}</p>
              <div className="text-[12px] bg-[var(--surface-2)] rounded-lg px-3 py-2 italic">“{s.caption}”</div>
            </div>
          ))}
        </div>
      )}
    </>
  );
}

function Empty({ text }: { text: string }) {
  return (
    <div className="border border-dashed border-[var(--border)] rounded-xl py-12 text-center text-[13px] text-[var(--text-3)]">
      {text}
    </div>
  );
}
