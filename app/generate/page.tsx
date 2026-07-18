"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { Editor } from "@/app/page";
import { useLang } from "@/lib/i18n/context";
import type { Trend } from "@/lib/data/trends";

/**
 * Content Generator — the article generator (with all its side filters) as its
 * own page. Opened blank from the sidebar, or with a trend's context when you
 * hit "Generate" on a story (the dashboard stashes it in sessionStorage).
 */
export default function GeneratePage() {
  const router = useRouter();
  const { lang } = useLang();
  const [title, setTitle] = useState("");
  const [trend, setTrend] = useState<Trend | null>(null);

  useEffect(() => {
    try {
      const raw = sessionStorage.getItem("patrika.generateTrend");
      if (raw) {
        const tr = JSON.parse(raw) as Trend;
        setTrend(tr);
        setTitle(lang === "hi" && tr.title_hi ? tr.title_hi : tr.title);
        sessionStorage.removeItem("patrika.generateTrend");
      }
    } catch {
      /* no/invalid stash — open blank */
    }
    // Run once on mount; lang at mount is fine for the initial title seed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <Editor
      asPage
      trend={trend}
      title={title}
      setTitle={setTitle}
      onClose={() => router.push("/")}
    />
  );
}
