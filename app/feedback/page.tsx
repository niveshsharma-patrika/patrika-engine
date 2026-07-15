"use client";

import { useEffect, useRef, useState } from "react";
import { ImagePlus, X, Send, Loader2, CheckCircle2, Inbox } from "lucide-react";

import { useLang } from "@/lib/i18n/context";

type Cat = "bug" | "feature" | "content" | "ui" | "other";

const CATEGORIES: Array<{ key: Cat; en: string; hi: string; color: string }> = [
  { key: "bug", en: "Not working / Bug", hi: "काम नहीं कर रहा / बग", color: "var(--red)" },
  { key: "feature", en: "Idea / Feature request", hi: "सुझाव / नई सुविधा", color: "var(--purple)" },
  { key: "content", en: "Content or data issue", hi: "सामग्री या डेटा समस्या", color: "var(--amber)" },
  { key: "ui", en: "Design / UI", hi: "डिज़ाइन / यूआई", color: "var(--blue)" },
  { key: "other", en: "Something else", hi: "कुछ और", color: "var(--text-3)" },
];
const CAT_LABEL: Record<string, { en: string; hi: string; color: string }> = Object.fromEntries(
  CATEGORIES.map((c) => [c.key, { en: c.en, hi: c.hi, color: c.color }])
);

const MAX_FILES = 3;
const MAX_BYTES = 2 * 1024 * 1024; // 2 MB per image
// Raster only — no SVG (active content). Mirrors the server-side allowlist.
const RASTER_TYPES = ["image/png", "image/jpeg", "image/jpg", "image/gif", "image/webp"];

type Attachment = { name: string; type: string; data: string };

type FeedbackRow = {
  id: string;
  category: string;
  message: string;
  attachments: Attachment[];
  status: string;
  created_at: string;
  user_name: string | null;
  user_email: string | null;
  user_role: string | null;
};

function fmt(ms: string): string {
  try {
    return new Date(ms).toLocaleString("en-IN", {
      day: "numeric", month: "short", hour: "2-digit", minute: "2-digit",
    });
  } catch {
    return "";
  }
}

function readAsDataURL(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(r.error);
    r.readAsDataURL(file);
  });
}

export default function FeedbackPage() {
  const { lang } = useLang();
  const hi = lang === "hi";
  const T = (en: string, h: string) => (hi ? h : en);

  const [category, setCategory] = useState<Cat>("bug");
  const [message, setMessage] = useState("");
  const [files, setFiles] = useState<Attachment[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  // Admins get an inbox on the same page. We detect admin by GET /api/feedback:
  // 200 => admin (list), 403 => not admin (form only).
  const [inbox, setInbox] = useState<FeedbackRow[] | null>(null);
  const [inboxLoading, setInboxLoading] = useState(true);
  const [inboxError, setInboxError] = useState(false);

  async function loadInbox() {
    setInboxLoading(true);
    try {
      const res = await fetch("/api/feedback", { cache: "no-store" });
      if (res.ok) {
        const j = await res.json();
        setInbox(Array.isArray(j.feedback) ? j.feedback : []);
        setInboxError(false);
      } else if (res.status === 403) {
        setInbox(null); // genuinely not an admin — show the submit form only
        setInboxError(false);
      } else {
        // The route checks role BEFORE the DB, so a non-403 here means an admin
        // hit a transient error — surface it instead of masquerading as non-admin.
        setInboxError(true);
      }
    } catch {
      setInboxError(true);
    } finally {
      setInboxLoading(false);
    }
  }
  useEffect(() => {
    loadInbox();
  }, []);

  async function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    setErr(null);
    const picked = Array.from(e.target.files ?? []);
    if (fileInput.current) fileInput.current.value = ""; // allow re-picking the same file
    const room = MAX_FILES - files.length;
    if (room <= 0) {
      setErr(T(`You can attach up to ${MAX_FILES} images.`, `अधिकतम ${MAX_FILES} इमेज जोड़ सकते हैं।`));
      return;
    }
    const next: Attachment[] = [];
    const skipped: string[] = [];
    for (const f of picked.slice(0, room)) {
      if (!RASTER_TYPES.includes(f.type.toLowerCase())) {
        skipped.push(T(`"${f.name}" isn't a PNG/JPG/GIF/WebP`, `"${f.name}" PNG/JPG/GIF/WebP नहीं है`));
        continue;
      }
      if (f.size > MAX_BYTES) {
        skipped.push(T(`"${f.name}" is over 2 MB`, `"${f.name}" 2 एमबी से बड़ी है`));
        continue;
      }
      try {
        next.push({ name: f.name, type: f.type, data: await readAsDataURL(f) });
      } catch {
        skipped.push(T(`couldn't read "${f.name}"`, `"${f.name}" पढ़ी नहीं जा सकी`));
      }
    }
    // If the batch exceeded the remaining slots, say so rather than dropping silently.
    if (picked.length > room) {
      skipped.push(T(`only ${room} more allowed`, `केवल ${room} और जोड़ सकते हैं`));
    }
    if (next.length) setFiles((cur) => [...cur, ...next]);
    // Reflect what actually happened: clear the error on a fully clean pick.
    setErr(skipped.length ? skipped.join(" · ") : null);
  }

  function removeFile(i: number) {
    setFiles((cur) => cur.filter((_, idx) => idx !== i));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    if (!message.trim()) {
      setErr(T("Please describe your feedback.", "कृपया अपना फ़ीडबैक लिखें।"));
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch("/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ category, message, attachments: files }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) {
        setErr(j.error ?? T("Could not send feedback.", "फ़ीडबैक नहीं भेजा जा सका।"));
      } else {
        setDone(true);
        setMessage("");
        setFiles([]);
        setCategory("bug");
        if (inbox !== null || inboxError) loadInbox(); // refresh the admin's own view
      }
    } catch {
      setErr(T("Could not send feedback.", "फ़ीडबैक नहीं भेजा जा सका।"));
    } finally {
      setSubmitting(false);
    }
  }

  async function toggleStatus(row: FeedbackRow) {
    const prev = row.status;
    const status = prev === "reviewed" ? "open" : "reviewed";
    setInbox((cur) => (cur ? cur.map((r) => (r.id === row.id ? { ...r, status } : r)) : cur));
    try {
      const res = await fetch("/api/feedback", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: row.id, status }),
      });
      if (!res.ok) throw new Error();
    } catch {
      // Revert the optimistic change so the chip doesn't lie about the server.
      setInbox((cur) => (cur ? cur.map((r) => (r.id === row.id ? { ...r, status: prev } : r)) : cur));
      setErr(T("Couldn't update status — try again.", "स्थिति अपडेट नहीं हो सकी — पुनः प्रयास करें।"));
    }
  }

  const input =
    "w-full bg-white border border-[var(--border)] text-[14px] px-3 py-2 rounded-lg outline-none focus:border-[var(--purple)]";

  return (
    <div className="max-w-3xl">
      <div className="pb-4 mb-6 border-b border-[var(--border)]">
        <h1 className="text-2xl font-medium">{T("Feedback", "फ़ीडबैक")}</h1>
        <p className="text-[13px] text-[var(--text-3)] mt-1">
          {T(
            "Tell us what's working, what's broken, or what you'd like added. Attach screenshots if they help. Only admins see submissions.",
            "बताएँ क्या अच्छा है, क्या ख़राब है, या क्या जोड़ना चाहेंगे। स्क्रीनशॉट भी जोड़ सकते हैं। सबमिशन केवल एडमिन देखते हैं।"
          )}
        </p>
      </div>

      {/* ── Submit form ── */}
      {done ? (
        <div className="border border-[var(--border)] bg-white rounded-xl p-8 text-center">
          <CheckCircle2 size={40} className="mx-auto text-[var(--green)]" />
          <h2 className="text-lg font-medium mt-3">{T("Thanks — feedback sent", "धन्यवाद — फ़ीडबैक भेजा गया")}</h2>
          <p className="text-[13px] text-[var(--text-3)] mt-1">
            {T("The team will take a look.", "टीम इसे देखेगी।")}
          </p>
          <button
            onClick={() => setDone(false)}
            className="mt-5 text-[13px] font-medium text-[var(--purple)] hover:underline"
          >
            {T("Send more feedback", "और फ़ीडबैक भेजें")}
          </button>
        </div>
      ) : (
        <form onSubmit={submit} className="bg-white border border-[var(--border)] rounded-xl p-5 space-y-5">
          {/* Nature */}
          <div>
            <label className="block text-[12px] font-medium text-[var(--text-2)] mb-2">
              {T("Nature of feedback", "फ़ीडबैक का प्रकार")}
            </label>
            <div className="flex flex-wrap gap-2">
              {CATEGORIES.map((c) => {
                const active = category === c.key;
                return (
                  <button
                    key={c.key}
                    type="button"
                    onClick={() => setCategory(c.key)}
                    className={`flex items-center gap-2 text-[13px] px-3 py-1.5 rounded-full border transition-colors ${
                      active
                        ? "border-[var(--text)] bg-[var(--surface-2)] font-medium text-[var(--text)]"
                        : "border-[var(--border)] text-[var(--text-2)] hover:border-[var(--border-2)]"
                    }`}
                  >
                    <span className="w-2 h-2 rounded-full" style={{ background: c.color }} />
                    {hi ? c.hi : c.en}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Message */}
          <div>
            <label className="block text-[12px] font-medium text-[var(--text-2)] mb-2">
              {T("Your feedback", "आपका फ़ीडबैक")}
            </label>
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={6}
              maxLength={5000}
              placeholder={T("Describe it in as much detail as you like…", "जितना चाहें विस्तार से लिखें…")}
              className={`${input} resize-y leading-relaxed`}
            />
          </div>

          {/* Attachments */}
          <div>
            <label className="block text-[12px] font-medium text-[var(--text-2)] mb-2">
              {T("Screenshots (optional)", "स्क्रीनशॉट (वैकल्पिक)")}
            </label>
            <div className="flex flex-wrap items-center gap-3">
              {files.map((f, i) => (
                <div key={i} className="relative group">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={f.data}
                    alt={f.name}
                    className="w-20 h-20 object-cover rounded-lg border border-[var(--border)]"
                  />
                  <button
                    type="button"
                    onClick={() => removeFile(i)}
                    className="absolute -top-2 -right-2 bg-[var(--text)] text-white rounded-full p-0.5 shadow"
                    aria-label="Remove"
                  >
                    <X size={13} />
                  </button>
                </div>
              ))}
              {files.length < MAX_FILES && (
                <button
                  type="button"
                  onClick={() => fileInput.current?.click()}
                  className="w-20 h-20 flex flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-[var(--border)] text-[var(--text-3)] hover:border-[var(--purple)] hover:text-[var(--purple)]"
                >
                  <ImagePlus size={18} />
                  <span className="text-[10px]">{T("Add", "जोड़ें")}</span>
                </button>
              )}
              <input
                ref={fileInput}
                type="file"
                accept="image/png,image/jpeg,image/gif,image/webp"
                multiple
                onChange={onPick}
                className="hidden"
              />
            </div>
            <p className="text-[11px] text-[var(--text-3)] mt-1.5">
              {T(`Up to ${MAX_FILES} images, 2 MB each.`, `अधिकतम ${MAX_FILES} इमेज, प्रत्येक 2 एमबी।`)}
            </p>
          </div>

          {err && <div className="text-[12px] text-[var(--red)]">{err}</div>}

          <div className="flex justify-end">
            <button
              type="submit"
              disabled={submitting}
              className="flex items-center gap-2 text-white text-[14px] font-medium px-5 py-2.5 rounded-lg disabled:opacity-60"
              style={{ background: "var(--purple)" }}
            >
              {submitting ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} />}
              {submitting ? T("Sending…", "भेज रहे हैं…") : T("Send feedback", "फ़ीडबैक भेजें")}
            </button>
          </div>
        </form>
      )}

      {/* Admin whose inbox failed to load (a non-admin gets a clean 403 and never lands here) */}
      {!inboxLoading && inboxError && inbox === null && (
        <div className="mt-10 border border-[var(--border)] bg-white rounded-xl p-6 text-center">
          <p className="text-[13px] text-[var(--text-3)]">
            {T("Couldn't load the feedback inbox.", "फ़ीडबैक इनबॉक्स लोड नहीं हो सका।")}
          </p>
          <button onClick={loadInbox} className="mt-2 text-[13px] font-medium text-[var(--purple)] hover:underline">
            {T("Retry", "पुनः प्रयास")}
          </button>
        </div>
      )}

      {/* ── Admin inbox ── */}
      {!inboxLoading && inbox !== null && (
        <div className="mt-10">
          <div className="flex items-center gap-2 pb-3 mb-4 border-b border-[var(--border)]">
            <Inbox size={17} className="text-[var(--text-2)]" />
            <h2 className="text-[15px] font-semibold">{T("All feedback", "सभी फ़ीडबैक")}</h2>
            <span className="text-[12px] text-[var(--text-3)]">
              {inbox.length} {T(inbox.length === 1 ? "item" : "items", "आइटम")}
            </span>
          </div>

          {inbox.length === 0 ? (
            <div className="border border-dashed border-[var(--border)] rounded-lg p-10 text-center text-[13px] text-[var(--text-3)]">
              {T("No feedback yet.", "अभी कोई फ़ीडबैक नहीं।")}
            </div>
          ) : (
            <div className="space-y-3">
              {inbox.map((row) => {
                const cat = CAT_LABEL[row.category] ?? { en: row.category, hi: row.category, color: "var(--text-3)" };
                const reviewed = row.status === "reviewed";
                return (
                  <div
                    key={row.id}
                    className={`bg-white border rounded-xl p-4 ${reviewed ? "border-[var(--border)] opacity-70" : "border-[var(--border)]"}`}
                  >
                    <div className="flex items-center gap-2 flex-wrap mb-2">
                      <span
                        className="inline-flex items-center gap-1.5 text-[11px] font-medium px-2 py-0.5 rounded-full"
                        style={{ background: "var(--surface-2)", color: cat.color }}
                      >
                        <span className="w-2 h-2 rounded-full" style={{ background: cat.color }} />
                        {hi ? cat.hi : cat.en}
                      </span>
                      <span className="text-[12px] text-[var(--text-2)] font-medium">
                        {row.user_name ?? T("Unknown", "अज्ञात")}
                        {row.user_role ? <span className="text-[var(--text-3)] font-normal"> · {row.user_role}</span> : null}
                      </span>
                      <span className="text-[11px] text-[var(--text-3)]">{fmt(row.created_at)}</span>
                      <button
                        onClick={() => toggleStatus(row)}
                        className={`ml-auto text-[11px] px-2 py-0.5 rounded-full border ${
                          reviewed
                            ? "border-[var(--border)] text-[var(--text-3)]"
                            : "border-[var(--green)] text-[var(--green)]"
                        }`}
                      >
                        {reviewed ? T("Reviewed", "समीक्षित") : T("Mark reviewed", "समीक्षित करें")}
                      </button>
                    </div>
                    <p className="text-[14px] text-[var(--text)] whitespace-pre-wrap leading-relaxed">{row.message}</p>
                    {Array.isArray(row.attachments) && row.attachments.length > 0 && (
                      <div className="flex flex-wrap gap-2 mt-3">
                        {row.attachments.map((a, i) => (
                          // eslint-disable-next-line @next/next/no-img-element
                          <a key={i} href={a.data} target="_blank" rel="noreferrer">
                            <img
                              src={a.data}
                              alt={a.name}
                              className="w-24 h-24 object-cover rounded-lg border border-[var(--border)] hover:opacity-90"
                            />
                          </a>
                        ))}
                      </div>
                    )}
                    {row.user_email && (
                      <p className="text-[11px] text-[var(--text-3)] mt-2">{row.user_email}</p>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
