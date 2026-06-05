"use client";

import { createContext, useContext, useEffect, useState } from "react";
import { type DictKey, type Lang, t as tFn } from "./dict";

type Ctx = {
  lang: Lang;
  setLang: (l: Lang) => void;
  t: (key: DictKey) => string;
};

const LangContext = createContext<Ctx | null>(null);

export function LangProvider({ children }: { children: React.ReactNode }) {
  const [lang, setLangState] = useState<Lang>("en");

  // Hydrate from localStorage on mount. We intentionally render "en" on the
  // server, then sync to the stored language on the client — the canonical
  // localStorage-hydration pattern, so the set-state-in-effect rule is opted
  // out here rather than risking an SSR hydration mismatch.
  useEffect(() => {
    const stored = (typeof window !== "undefined"
      ? window.localStorage.getItem("patrika.lang")
      : null) as Lang | null;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (stored === "en" || stored === "hi") setLangState(stored);
  }, []);

  function setLang(l: Lang) {
    setLangState(l);
    if (typeof window !== "undefined") {
      window.localStorage.setItem("patrika.lang", l);
    }
  }

  return (
    <LangContext.Provider value={{ lang, setLang, t: (k) => tFn(k, lang) }}>
      {children}
    </LangContext.Provider>
  );
}

export function useLang() {
  const ctx = useContext(LangContext);
  if (!ctx) {
    throw new Error("useLang must be used within <LangProvider>");
  }
  return ctx;
}
