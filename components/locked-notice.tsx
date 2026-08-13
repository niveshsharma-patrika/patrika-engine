"use client";

import Link from "next/link";
import { Lock, Wand2 } from "lucide-react";

import { useLang } from "@/lib/i18n/context";

/** Shown to a "print" user on any section other than the Content Generator. */
export function LockedNotice() {
  const { lang } = useLang();
  const t = (en: string, hi: string) => (lang === "hi" ? hi : en);
  return (
    <div className="flex flex-col items-center justify-center text-center py-24 px-6 max-w-[520px] mx-auto">
      <div className="w-14 h-14 rounded-full bg-[var(--surface-2)] flex items-center justify-center mb-4">
        <Lock size={24} className="text-[var(--text-3)]" />
      </div>
      <h1 className="text-[20px] font-semibold mb-2">{t("This section is locked", "यह सेक्शन लॉक है")}</h1>
      <p className="text-[14px] text-[var(--text-3)] leading-relaxed mb-6">
        {t("Your account has access to the Content Generator only. The rest of the newsroom isn't available for this login.",
           "आपके अकाउंट को केवल कंटेंट जनरेटर का एक्सेस है। बाकी न्यूज़रूम इस लॉगिन के लिए उपलब्ध नहीं है।")}
      </p>
      <Link href="/content-generator"
        className="inline-flex items-center gap-2 text-[13px] font-medium px-4 py-2.5 rounded-lg text-white"
        style={{ background: "var(--purple)" }}>
        <Wand2 size={15} /> {t("Go to Content Generator", "कंटेंट जनरेटर पर जाएँ")}
      </Link>
    </div>
  );
}
