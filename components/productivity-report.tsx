"use client";

import { Fragment, useCallback, useEffect, useState } from "react";
import { Loader2, Users, FileText, CheckCircle2, Clock, ChevronDown, Sparkles } from "lucide-react";

import { useLang } from "@/lib/i18n/context";

type UserRow = {
  id: string;
  full_name: string;
  role: string;
  desk: string | null;
  total: number;
  generated: number;
  published: number;
  approved: number;
  in_review: number;
  in_progress: number;
  rejected: number;
  words: number;
  last_activity: string | null;
};

type Totals = { stories: number; generated: number; published: number; in_review: number; words: number };

type Story = {
  id: string;
  title: string;
  status: string;
  word_count: number;
  desk: string | null;
  created_at: string;
  updated_at: string;
  published_at: string | null;
};

const RANGES = [
  { days: "7", en: "7 days", hi: "7 दिन" },
  { days: "30", en: "30 days", hi: "30 दिन" },
  { days: "90", en: "90 days", hi: "90 दिन" },
  { days: "all", en: "All time", hi: "सभी" },
];

const STATUS_LABEL: Record<string, { en: string; hi: string; color: string }> = {
  published:   { en: "Published",  hi: "प्रकाशित",   color: "#166534" },
  approved:    { en: "Approved",   hi: "स्वीकृत",     color: "#166534" },
  awaiting_review:   { en: "In review", hi: "समीक्षा में", color: "#92400e" },
  awaiting_approval: { en: "Awaiting approval", hi: "स्वीकृति प्रतीक्षित", color: "#92400e" },
  in_progress: { en: "Draft",      hi: "ड्राफ़्ट",     color: "#6b7280" },
  rejected:    { en: "Rejected",   hi: "अस्वीकृत",    color: "#991b1b" },
};

function fmtDate(iso: string | null, lang: string): string {
  if (!iso) return lang === "hi" ? "—" : "—";
  const d = new Date(iso);
  return d.toLocaleDateString(lang === "hi" ? "hi-IN" : "en-IN", {
    day: "numeric", month: "short", year: "numeric",
  });
}

export function ProductivityReport() {
  const { lang } = useLang();
  const t = (en: string, hi: string) => (lang === "hi" ? hi : en);

  const [days, setDays] = useState("30");
  const [users, setUsers] = useState<UserRow[]>([]);
  const [totals, setTotals] = useState<Totals>({ stories: 0, generated: 0, published: 0, in_review: 0, words: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [openUser, setOpenUser] = useState<string | null>(null);
  const [stories, setStories] = useState<Record<string, Story[]>>({});
  const [loadingStories, setLoadingStories] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/productivity?days=${days}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? `Failed (${res.status})`);
      setUsers(json.users ?? []);
      setTotals(json.totals ?? { stories: 0, generated: 0, published: 0, in_review: 0, words: 0 });
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, [days]);

  useEffect(() => { load(); }, [load]);

  async function toggleUser(id: string) {
    if (openUser === id) { setOpenUser(null); return; }
    setOpenUser(id);
    if (!stories[id]) {
      setLoadingStories(id);
      try {
        const res = await fetch(`/api/admin/productivity/${id}?days=${days}`);
        const json = await res.json();
        setStories((prev) => ({ ...prev, [id]: json.stories ?? [] }));
      } finally {
        setLoadingStories(null);
      }
    }
  }

  // Reset cached drill-downs when the range changes.
  useEffect(() => { setStories({}); setOpenUser(null); }, [days]);

  return (
    <div className="max-w-[1000px]">
      <div className="flex items-end justify-between gap-6 pb-4 mb-6 border-b border-[var(--border)]">
        <div>
          <h1 className="text-2xl font-medium">{t("Productivity", "उत्पादकता")}</h1>
          <p className="text-[13px] text-[var(--text-3)] mt-1">
            {t("Who created which stories, by review stage.", "किसने कौन-सी ख़बरें बनाईं, चरण के अनुसार।")}
          </p>
        </div>
        <div className="flex gap-1 bg-[var(--surface-2)] rounded-lg p-0.5">
          {RANGES.map((r) => (
            <button
              key={r.days}
              onClick={() => setDays(r.days)}
              className={`text-[12px] px-3 py-1.5 rounded-md ${
                days === r.days ? "bg-white shadow-sm font-medium" : "text-[var(--text-3)]"
              }`}
            >
              {lang === "hi" ? r.hi : r.en}
            </button>
          ))}
        </div>
      </div>

      {error && (
        <div className="mb-4 text-[12px] px-3 py-2 rounded-lg bg-[#fee2e2] text-[#991b1b]">{error}</div>
      )}

      {/* Team totals */}
      <div className="grid grid-cols-5 gap-3 mb-6">
        <Stat icon={<Sparkles size={15} />} value={totals.generated} label={t("Generated", "जेनरेट")} />
        <Stat icon={<FileText size={15} />} value={totals.stories} label={t("Saved", "सहेजे")} />
        <Stat icon={<CheckCircle2 size={15} />} value={totals.published} label={t("Published", "प्रकाशित")} />
        <Stat icon={<Clock size={15} />} value={totals.in_review} label={t("In review", "समीक्षा में")} />
        <Stat icon={<Users size={15} />} value={users.filter((u) => u.generated > 0 || u.total > 0).length} label={t("Active", "सक्रिय")} />
      </div>

      {loading ? (
        <div className="flex items-center gap-2 text-[13px] text-[var(--text-3)] py-10">
          <Loader2 size={15} className="animate-spin" /> {t("Loading…", "लोड हो रहा है…")}
        </div>
      ) : (
        <div className="bg-white border border-[var(--border)] rounded-xl overflow-hidden">
          <table className="w-full text-[13px]">
            <thead className="bg-[var(--surface-2)] text-[var(--text-3)] text-[11px] uppercase">
              <tr>
                <th className="px-3 py-2 text-left font-medium">{t("Writer", "लेखक")}</th>
                <th className="px-2 py-2 text-right font-medium">{t("Generated", "जेनरेट")}</th>
                <th className="px-2 py-2 text-right font-medium">{t("Saved", "सहेजे")}</th>
                <th className="px-2 py-2 text-right font-medium">{t("Published", "प्रकाशित")}</th>
                <th className="px-2 py-2 text-right font-medium">{t("In review", "समीक्षा")}</th>
                <th className="px-2 py-2 text-right font-medium">{t("Words", "शब्द")}</th>
                <th className="px-3 py-2 text-right font-medium">{t("Last active", "आख़िरी")}</th>
                <th className="w-8"></th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <Fragment key={u.id}>
                  <tr
                    onClick={() => u.total > 0 && toggleUser(u.id)}
                    className={`border-t border-[var(--border)] ${u.total > 0 ? "cursor-pointer hover:bg-[var(--surface-2)]" : (u.generated > 0 ? "" : "opacity-60")}`}
                  >
                    <td className="px-3 py-2.5">
                      <div className="font-medium">{u.full_name}</div>
                      <div className="text-[11px] text-[var(--text-3)]">
                        {u.role}{u.desk ? ` · ${u.desk}` : ""}
                      </div>
                    </td>
                    <td className="px-2 py-2.5 text-right font-semibold text-[var(--purple)]">{u.generated || "—"}</td>
                    <td className="px-2 py-2.5 text-right font-medium">{u.total || "—"}</td>
                    <td className="px-2 py-2.5 text-right text-[#166534]">{u.published || "—"}</td>
                    <td className="px-2 py-2.5 text-right text-[#92400e]">{u.in_review || "—"}</td>
                    <td className="px-2 py-2.5 text-right text-[var(--text-2)]">{u.words.toLocaleString()}</td>
                    <td className="px-3 py-2.5 text-right text-[11px] text-[var(--text-3)]">{fmtDate(u.last_activity, lang)}</td>
                    <td className="px-2 text-[var(--text-3)]">
                      {u.total > 0 && (
                        <ChevronDown size={14} className={`transition-transform ${openUser === u.id ? "rotate-180" : ""}`} />
                      )}
                    </td>
                  </tr>
                  {openUser === u.id && (
                    <tr className="border-t border-[var(--border)] bg-[var(--surface-2)]">
                      <td colSpan={8} className="px-3 py-2">
                        {loadingStories === u.id ? (
                          <div className="flex items-center gap-2 text-[12px] text-[var(--text-3)] py-2">
                            <Loader2 size={13} className="animate-spin" /> {t("Loading stories…", "ख़बरें लोड हो रही हैं…")}
                          </div>
                        ) : (
                          <div className="space-y-1 py-1">
                            {(stories[u.id] ?? []).map((s) => {
                              const st = STATUS_LABEL[s.status] ?? STATUS_LABEL.in_progress;
                              return (
                                <div key={s.id} className="flex items-center gap-3 text-[12px] py-1">
                                  <span className="px-1.5 py-0.5 rounded text-[10px] font-medium shrink-0"
                                    style={{ color: st.color, background: `${st.color}18` }}>
                                    {lang === "hi" ? st.hi : st.en}
                                  </span>
                                  <span className="flex-1 truncate">{s.title}</span>
                                  <span className="text-[var(--text-3)] shrink-0">{s.word_count} {t("w", "श")}</span>
                                  <span className="text-[var(--text-3)] shrink-0 w-[90px] text-right">{fmtDate(s.updated_at, lang)}</span>
                                </div>
                              );
                            })}
                            {(stories[u.id]?.length ?? 0) === 0 && (
                              <div className="text-[12px] text-[var(--text-3)] py-1">{t("No stories in this range.", "इस अवधि में कोई ख़बर नहीं।")}</div>
                            )}
                          </div>
                        )}
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function Stat({ icon, value, label }: { icon: React.ReactNode; value: number; label: string }) {
  return (
    <div className="bg-white border border-[var(--border)] rounded-xl p-4">
      <div className="flex items-center gap-1.5 text-[var(--text-3)] mb-1">{icon}</div>
      <div className="text-[22px] font-semibold leading-none">{value.toLocaleString()}</div>
      <div className="text-[11px] text-[var(--text-3)] mt-1.5">{label}</div>
    </div>
  );
}
