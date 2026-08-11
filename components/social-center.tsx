"use client";

import { TrendingUp } from "lucide-react";

import { useLang } from "@/lib/i18n/context";
import { SocialTrends } from "@/components/social-trends";

/**
 * Social command center — a single dashboard of what's trending on social
 * (Reddit + X), each item generating ready-to-post creatives. No tabs: the
 * trend feed IS the page, mirroring the news dashboard.
 *
 * (Competitor-page tracking was removed from the UI in favour of this. Its API
 * routes remain dormant on the backend and can be re-surfaced if ever needed.)
 */
export function SocialCenter() {
  const { lang } = useLang();
  const t = (en: string, hi: string) => (lang === "hi" ? hi : en);

  return (
    <div className="p-8 max-w-[1100px]">
      <h1 className="text-[22px] font-semibold flex items-center gap-2 mb-1">
        <TrendingUp size={20} className="text-[var(--purple)]" />
        {t("Social Center", "सोशल सेंटर")}
      </h1>
      <p className="text-[13px] text-[var(--text-3)] mb-5">
        {t("Turn confirmed news into ready-to-post packs, spin up engagement ideas for your audience, and save the best — each scored before you post.",
           "पुष्ट खबरों को पोस्ट-रेडी पैक बनाएँ, पाठकों के लिए एंगेजमेंट आइडिया तैयार करें, और बेहतरीन को सहेजें — हर एक पोस्ट से पहले स्कोर के साथ।")}
      </p>
      <SocialTrends />
    </div>
  );
}
