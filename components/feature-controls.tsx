"use client";

import { useCallback, useEffect, useState } from "react";
import { ToggleLeft, Loader2, Lock } from "lucide-react";

import { useLang } from "@/lib/i18n/context";

type Feature = {
  key: string;
  href: string;
  defaultRoles: string[];
  defaultEditions: string[];
  locked: boolean; // Features page + dashboard — always reachable, not editable
};
type Flag = { enabled: boolean; roles: string[]; editions: string[] };

const ROLE_LABEL: Record<string, { en: string; hi: string }> = {
  admin: { en: "Admin", hi: "एडमिन" },
  editor: { en: "Editor", hi: "एडिटर" },
  writer: { en: "Writer", hi: "राइटर" },
};
const EDITION_LABEL: Record<string, { en: string; hi: string }> = {
  digital: { en: "Digital", hi: "डिजिटल" },
  print: { en: "Print", hi: "प्रिंट" },
};

export function FeatureControls() {
  const { lang, t } = useLang();
  const hi = lang === "hi";

  const [features, setFeatures] = useState<Feature[]>([]);
  const [flags, setFlags] = useState<Record<string, Flag>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const load = useCallback(async () => {
    try {
      const r = await fetch("/api/admin/features", { cache: "no-store" });
      if (r.ok) {
        const j = await r.json();
        setFeatures(j.features ?? []);
        setFlags(j.flags ?? {});
      }
    } catch {
      /* advisory */
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => { load(); }, [load]);

  const flagOf = (k: string): Flag => flags[k] ?? { enabled: true, roles: [], editions: [] };

  function setEnabled(k: string, enabled: boolean) {
    setFlags((p) => ({ ...p, [k]: { ...flagOf(k), enabled } }));
  }
  function toggleIn(k: string, field: "roles" | "editions", value: string) {
    setFlags((p) => {
      const cur = p[k] ?? flagOf(k);
      const set = new Set(cur[field]);
      if (set.has(value)) set.delete(value); else set.add(value);
      return { ...p, [k]: { ...cur, [field]: [...set] } };
    });
  }

  async function save() {
    setSaving(true); setMsg(null);
    try {
      const r = await fetch("/api/admin/features", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ flags }),
      });
      const j = await r.json();
      if (!r.ok) setMsg({ ok: false, text: j.error ?? "Failed" });
      else setMsg({ ok: true, text: hi ? "सेव हो गया। बदलाव तुरंत लागू।" : "Saved. Changes apply immediately." });
    } catch {
      setMsg({ ok: false, text: hi ? "नेटवर्क त्रुटि" : "Network error" });
    } finally {
      setSaving(false);
    }
  }

  const Chip = ({ active, disabled, onClick, children }: { active: boolean; disabled?: boolean; onClick: () => void; children: React.ReactNode }) => (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={`text-[11.5px] px-2 py-0.5 rounded-full border transition-colors ${
        active
          ? "bg-[var(--purple)] border-[var(--purple)] text-white"
          : "bg-white border-[var(--border)] text-[var(--text-3)]"
      } ${disabled ? "opacity-50 cursor-not-allowed" : active ? "" : "hover:border-[var(--purple)]"}`}
    >
      {children}
    </button>
  );

  return (
    <div className="p-6 max-w-4xl">
      <div className="flex items-center gap-2.5 mb-1">
        <ToggleLeft size={20} className="text-[var(--purple)]" />
        <h1 className="text-[20px] font-semibold text-[var(--text)]">{hi ? "फ़ीचर कंट्रोल" : "Features"}</h1>
      </div>
      <p className="text-[13px] text-[var(--text-3)] mb-5">
        {hi
          ? "हर सेक्शन को चालू/बंद करें और तय करें कि कौन-सी भूमिका (role) और एडिशन उसे देख सके। बंद/छिपा फ़ीचर मेन्यू से हटता है और सीधे URL खोलने पर भी ब्लॉक रहता है। आप सिर्फ़ डिफ़ॉल्ट के भीतर सीमित कर सकते हैं।"
          : "Turn each section on/off and choose which roles and editions can see it. A disabled/hidden feature is removed from the menu and blocked on direct URL access. You can only narrow within each feature's defaults."}
      </p>

      {loading ? (
        <div className="flex items-center gap-2 text-[13px] text-[var(--text-3)] py-10"><Loader2 size={16} className="animate-spin" /> {hi ? "लोड हो रहा है…" : "Loading…"}</div>
      ) : (
        <>
          <div className="bg-white border border-[var(--border)] rounded-xl overflow-hidden">
            <table className="w-full text-[13px]">
              <thead className="bg-[var(--surface-2)] text-[var(--text-3)] text-[11px] uppercase">
                <tr>
                  <th className="text-left font-medium px-4 py-2.5">{hi ? "फ़ीचर" : "Feature"}</th>
                  <th className="text-left font-medium px-4 py-2.5 w-[70px]">{hi ? "चालू" : "On"}</th>
                  <th className="text-left font-medium px-4 py-2.5">{hi ? "भूमिकाएँ" : "Roles"}</th>
                  <th className="text-left font-medium px-4 py-2.5">{hi ? "एडिशन" : "Editions"}</th>
                </tr>
              </thead>
              <tbody>
                {features.map((f) => {
                  const fl = flagOf(f.key);
                  return (
                    <tr key={f.key} className="border-t border-[var(--border)]">
                      <td className="px-4 py-2.5 text-[var(--text-1)] font-medium">
                        {t(f.key as Parameters<typeof t>[0])}
                        {f.locked && (
                          <span className="ml-2 inline-flex items-center gap-1 text-[10px] text-[var(--text-3)]"><Lock size={10} /> {hi ? "हमेशा चालू" : "always on"}</span>
                        )}
                        <div className="text-[10px] text-[var(--text-3)] font-mono mt-0.5">{f.href}</div>
                      </td>
                      <td className="px-4 py-2.5">
                        <button
                          type="button"
                          disabled={f.locked}
                          onClick={() => setEnabled(f.key, !fl.enabled)}
                          className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${fl.enabled ? "bg-[var(--green)]" : "bg-[var(--border-2,#cbd5e1)]"} ${f.locked ? "opacity-50 cursor-not-allowed" : ""}`}
                          aria-pressed={fl.enabled}
                        >
                          <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${fl.enabled ? "translate-x-4" : "translate-x-0.5"}`} />
                        </button>
                      </td>
                      <td className="px-4 py-2.5">
                        <div className="flex flex-wrap gap-1.5">
                          {f.defaultRoles.map((role) => (
                            <Chip key={role} active={fl.roles.includes(role)} disabled={!fl.enabled || f.locked} onClick={() => toggleIn(f.key, "roles", role)}>
                              {hi ? ROLE_LABEL[role]?.hi ?? role : ROLE_LABEL[role]?.en ?? role}
                            </Chip>
                          ))}
                        </div>
                      </td>
                      <td className="px-4 py-2.5">
                        <div className="flex flex-wrap gap-1.5">
                          {f.defaultEditions.map((ed) => (
                            <Chip key={ed} active={fl.editions.includes(ed)} disabled={!fl.enabled || f.locked} onClick={() => toggleIn(f.key, "editions", ed)}>
                              {hi ? EDITION_LABEL[ed]?.hi ?? ed : EDITION_LABEL[ed]?.en ?? ed}
                            </Chip>
                          ))}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="flex items-center gap-3 mt-4">
            <button onClick={save} disabled={saving}
              className="bg-[var(--text)] hover:bg-black text-white text-[13px] font-medium px-4 py-1.5 rounded disabled:opacity-50 flex items-center gap-1.5">
              {saving && <Loader2 size={13} className="animate-spin" />} {hi ? "सेव करें" : "Save"}
            </button>
            {msg && <span className={`text-[12px] ${msg.ok ? "text-[var(--green)]" : "text-[var(--red)]"}`}>{msg.text}</span>}
          </div>
        </>
      )}
    </div>
  );
}
