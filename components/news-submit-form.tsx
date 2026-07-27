"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ImagePlus, X, Send, Loader2, CheckCircle2, Newspaper } from "lucide-react";

import { useLang } from "@/lib/i18n/context";

type Cat =
  | "crime" | "politics" | "civic" | "business" | "sports"
  | "entertainment" | "health" | "education" | "other";

const CATEGORIES: Array<{ key: Cat; en: string; hi: string }> = [
  { key: "crime", en: "Crime", hi: "अपराध" },
  { key: "politics", en: "Politics", hi: "राजनीति" },
  { key: "civic", en: "Civic / Local", hi: "नागरिक / स्थानीय" },
  { key: "business", en: "Business", hi: "व्यापार" },
  { key: "sports", en: "Sports", hi: "खेल" },
  { key: "entertainment", en: "Entertainment", hi: "मनोरंजन" },
  { key: "health", en: "Health", hi: "स्वास्थ्य" },
  { key: "education", en: "Education", hi: "शिक्षा" },
  { key: "other", en: "Other", hi: "अन्य" },
];

const MAX_FILES = 6;
const MAX_BYTES = 2 * 1024 * 1024;
const RASTER_TYPES = ["image/png", "image/jpeg", "image/jpg", "image/gif", "image/webp"];

type Attachment = { name: string; type: string; data: string };

function readAsDataURL(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(r.error);
    r.readAsDataURL(file);
  });
}

export function NewsSubmitForm({ signedIn = true }: { signedIn?: boolean }) {
  const { lang } = useLang();
  const t = (en: string, hi: string) => (lang === "hi" ? hi : en);

  const [headline, setHeadline] = useState("");
  const [details, setDetails] = useState("");
  const [location, setLocation] = useState("");
  const [category, setCategory] = useState<Cat>("civic");
  const [name, setName] = useState("");
  const [contact, setContact] = useState("");
  const [website, setWebsite] = useState(""); // honeypot — stays empty for humans
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  // Captcha — only for logged-out (public) submitters.
  const [captchaQ, setCaptchaQ] = useState("");
  const [captchaToken, setCaptchaToken] = useState("");
  const [captchaAnswer, setCaptchaAnswer] = useState("");

  const loadCaptcha = useCallback(async () => {
    try {
      const res = await fetch("/api/news/captcha", { cache: "no-store" });
      if (res.ok) {
        const j = await res.json();
        setCaptchaQ(j.question ?? "");
        setCaptchaToken(j.token ?? "");
        setCaptchaAnswer("");
      }
    } catch { /* form still works; server re-checks anyway */ }
  }, []);

  useEffect(() => { if (!signedIn) loadCaptcha(); }, [signedIn, loadCaptcha]);

  async function addFiles(files: FileList | null) {
    if (!files) return;
    setError(null);
    const next: Attachment[] = [];
    for (const f of Array.from(files)) {
      if (attachments.length + next.length >= MAX_FILES) break;
      if (!RASTER_TYPES.includes(f.type.toLowerCase())) {
        setError(t("Only PNG/JPG/GIF/WebP images.", "केवल PNG/JPG/GIF/WebP इमेज।"));
        continue;
      }
      if (f.size > MAX_BYTES) {
        setError(t("Each image must be under 2 MB.", "हर इमेज 2 MB से कम होनी चाहिए।"));
        continue;
      }
      next.push({ name: f.name, type: f.type, data: await readAsDataURL(f) });
    }
    setAttachments((prev) => [...prev, ...next].slice(0, MAX_FILES));
    if (fileRef.current) fileRef.current.value = "";
  }

  async function submit() {
    if (headline.trim().length < 3) {
      setError(t("Add a short headline.", "एक छोटी हेडलाइन जोड़ें।"));
      return;
    }
    if (!signedIn && !name.trim()) {
      setError(t("Please add your name.", "कृपया अपना नाम जोड़ें।"));
      return;
    }
    if (!signedIn && !captchaAnswer.trim()) {
      setError(t("Please answer the captcha.", "कृपया कैप्चा का उत्तर दें।"));
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/news", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          headline, details, location: location || undefined, category, attachments,
          name: name || undefined, contact: contact || undefined, website,
          captcha_token: captchaToken, captcha_answer: captchaAnswer || undefined,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        if (json.captcha) loadCaptcha(); // stale/wrong — issue a fresh one
        throw new Error(json.error ?? "Failed");
      }
      setDone(true);
      setHeadline(""); setDetails(""); setLocation(""); setCategory("civic");
      setName(""); setContact(""); setAttachments([]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not submit");
    } finally {
      setSubmitting(false);
    }
  }

  if (done) {
    return (
      <div className="max-w-[620px] mx-auto py-16 text-center">
        <CheckCircle2 size={44} className="mx-auto text-[var(--green)] mb-4" />
        <h2 className="text-[18px] font-semibold mb-1">{t("Thank you — sent to the desk.", "धन्यवाद — डेस्क को भेज दिया गया।")}</h2>
        <p className="text-[13px] text-[var(--text-3)] mb-5">
          {t("An editor will review your news tip.", "एक संपादक आपकी ख़बर की समीक्षा करेगा।")}
        </p>
        <button onClick={() => setDone(false)}
          className="text-[13px] font-medium px-4 py-2 rounded-lg text-white" style={{ background: "var(--purple)" }}>
          {t("Submit another", "एक और भेजें")}
        </button>
      </div>
    );
  }

  return (
    <div className="max-w-[620px] mx-auto py-8 px-4">
      {/* Standalone masthead — this page renders with no app chrome, so it
          carries its own Patrika header for when the link is shared. */}
      <div className="flex items-center gap-2.5 mb-6">
        <span className="text-[19px] leading-none">
          <span className="font-medium text-[var(--text-2)]">{t("Patrika ", "पत्रिका ")}</span>
          <span className="font-bold text-[var(--red)]">{t("Kairos", "कैरोस")}</span>
        </span>
      </div>

      <h1 className="text-[22px] font-semibold flex items-center gap-2 mb-1">
        <Newspaper size={20} className="text-[var(--purple)]" />
        {t("Submit news", "ख़बर भेजें")}
      </h1>
      <p className="text-[13px] text-[var(--text-3)] mb-6">
        {t("Share a news tip with the Patrika desk — add photos if you have them.", "पत्रिका डेस्क को ख़बर भेजें — तस्वीरें हों तो जोड़ें।")}
      </p>

      {!signedIn && (
        <div className="grid grid-cols-2 gap-3 mb-4">
          <div>
            <label className="block text-[12px] font-medium text-[var(--text-2)] mb-1">
              {t("Your name", "आपका नाम")} <span className="text-[var(--red)]">*</span>
            </label>
            <input value={name} onChange={(e) => setName(e.target.value)}
              placeholder={t("Full name", "पूरा नाम")}
              className="w-full bg-white border border-[var(--border)] text-[14px] px-3 py-2.5 rounded-lg outline-none focus:border-[var(--purple)]" />
          </div>
          <div>
            <label className="block text-[12px] font-medium text-[var(--text-2)] mb-1">{t("Contact", "संपर्क")}</label>
            <input value={contact} onChange={(e) => setContact(e.target.value)}
              placeholder={t("Phone or email (optional)", "फ़ोन या ईमेल (वैकल्पिक)")}
              className="w-full bg-white border border-[var(--border)] text-[14px] px-3 py-2.5 rounded-lg outline-none focus:border-[var(--purple)]" />
          </div>
        </div>
      )}

      {/* Honeypot: off-screen, not tabbable. Bots fill it; humans never do. */}
      <input type="text" name="website" tabIndex={-1} autoComplete="off"
        value={website} onChange={(e) => setWebsite(e.target.value)}
        aria-hidden="true" className="absolute -left-[9999px] w-px h-px opacity-0" />

      <label className="block text-[12px] font-medium text-[var(--text-2)] mb-1">{t("Headline", "हेडलाइन")}</label>
      <input
        value={headline}
        onChange={(e) => setHeadline(e.target.value)}
        placeholder={t("What happened?", "क्या हुआ?")}
        className="w-full bg-white border border-[var(--border)] text-[14px] px-3 py-2.5 rounded-lg outline-none focus:border-[var(--purple)] mb-4"
      />

      <div className="grid grid-cols-2 gap-3 mb-4">
        <div>
          <label className="block text-[12px] font-medium text-[var(--text-2)] mb-1">{t("Category", "श्रेणी")}</label>
          <select value={category} onChange={(e) => setCategory(e.target.value as Cat)}
            className="w-full bg-white border border-[var(--border)] text-[14px] px-3 py-2.5 rounded-lg outline-none focus:border-[var(--purple)]">
            {CATEGORIES.map((c) => <option key={c.key} value={c.key}>{lang === "hi" ? c.hi : c.en}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-[12px] font-medium text-[var(--text-2)] mb-1">{t("Location", "स्थान")}</label>
          <input value={location} onChange={(e) => setLocation(e.target.value)}
            placeholder={t("City / area (optional)", "शहर / क्षेत्र (वैकल्पिक)")}
            className="w-full bg-white border border-[var(--border)] text-[14px] px-3 py-2.5 rounded-lg outline-none focus:border-[var(--purple)]" />
        </div>
      </div>

      <label className="block text-[12px] font-medium text-[var(--text-2)] mb-1">{t("Details", "विवरण")}</label>
      <textarea
        value={details}
        onChange={(e) => setDetails(e.target.value)}
        placeholder={t("Who, what, when, where…", "कौन, क्या, कब, कहाँ…")}
        className="w-full min-h-[160px] bg-white border border-[var(--border)] text-[14px] px-3 py-2.5 rounded-lg outline-none focus:border-[var(--purple)] resize-y mb-4"
      />

      {/* Photos */}
      <div className="mb-5">
        <label className="block text-[12px] font-medium text-[var(--text-2)] mb-1.5">
          {t("Photos", "तस्वीरें")} <span className="text-[var(--text-3)] font-normal">({attachments.length}/{MAX_FILES})</span>
        </label>
        <div className="flex flex-wrap gap-2">
          {attachments.map((a, i) => (
            // eslint-disable-next-line @next/next/no-img-element
            <div key={i} className="relative w-20 h-20 rounded-lg overflow-hidden border border-[var(--border)]">
              <img src={a.data} alt="" className="w-full h-full object-cover" />
              <button onClick={() => setAttachments((prev) => prev.filter((_, j) => j !== i))}
                className="absolute top-0.5 right-0.5 bg-black/60 rounded-full p-0.5 text-white">
                <X size={12} />
              </button>
            </div>
          ))}
          {attachments.length < MAX_FILES && (
            <button onClick={() => fileRef.current?.click()}
              className="w-20 h-20 rounded-lg border border-dashed border-[var(--border-2)] grid place-items-center text-[var(--text-3)] hover:border-[var(--purple)]">
              <ImagePlus size={20} />
            </button>
          )}
        </div>
        <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/gif,image/webp"
          multiple hidden onChange={(e) => addFiles(e.target.files)} />
      </div>

      {!signedIn && captchaQ && (
        <div className="mb-4">
          <label className="block text-[12px] font-medium text-[var(--text-2)] mb-1">
            {t("Quick check", "त्वरित जाँच")}
          </label>
          <div className="flex items-center gap-2">
            <span className="text-[15px] font-mono px-3 py-2 rounded-lg bg-[var(--surface-2)] select-none">{captchaQ}</span>
            <input
              value={captchaAnswer}
              onChange={(e) => setCaptchaAnswer(e.target.value)}
              inputMode="numeric"
              placeholder={t("Answer", "उत्तर")}
              className="w-[110px] bg-white border border-[var(--border)] text-[14px] px-3 py-2 rounded-lg outline-none focus:border-[var(--purple)]"
            />
            <button type="button" onClick={loadCaptcha}
              className="text-[11px] text-[var(--text-3)] hover:text-[var(--text)]">
              {t("New", "नया")}
            </button>
          </div>
        </div>
      )}

      {error && <div className="text-[12px] text-[var(--red)] mb-3">{error}</div>}

      <button onClick={submit} disabled={submitting}
        className="flex items-center gap-2 text-[14px] font-medium px-5 py-2.5 rounded-lg text-white disabled:opacity-60"
        style={{ background: "var(--purple)" }}>
        {submitting ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} />}
        {submitting ? t("Sending…", "भेज रहे हैं…") : t("Send to desk", "डेस्क को भेजें")}
      </button>
    </div>
  );
}
