"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { KeyRound, Loader2, Check, X } from "lucide-react";

export type ProviderKeyRow = {
  id: string;
  provider_key: string;
  display_name: string;
  dbKey: boolean;
  envKey: boolean;
  hasKey: boolean;
  modelCount: number;
};

const COLORS: Record<string, string> = {
  anthropic: "#c96342",
  openai: "#10a37f",
  google: "var(--blue)",
  groq: "var(--purple)",
};

export function ProviderKeys({ providers }: { providers: ProviderKeyRow[] }) {
  const router = useRouter();
  const [editing, setEditing] = useState<string | null>(null);
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  async function save(provider: string, key: string) {
    setBusy(provider);
    setErr(null);
    try {
      const res = await fetch("/api/admin/provider-key", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider, key }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) {
        setErr(j.error ?? "Could not save the key.");
      } else {
        setEditing(null);
        setValue("");
        router.refresh(); // re-read the server component so status/source update
      }
    } catch {
      setErr("Could not save the key.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="bg-white border border-[var(--border)] rounded-md overflow-hidden">
      <div className="grid grid-cols-[44px_1fr_170px_90px_92px_150px] gap-3.5 px-4 py-2.5 bg-[var(--surface-2)] text-[11px] uppercase tracking-wider text-[var(--text-3)] font-medium">
        <div />
        <div>Provider</div>
        <div>Key source</div>
        <div>Models</div>
        <div>Status</div>
        <div className="text-right">Key</div>
      </div>

      {providers.map((p) => {
        const isEditing = editing === p.provider_key;
        const saving = busy === p.provider_key;
        return (
          <div key={p.id} className="border-t border-[var(--border)]">
            <div className="grid grid-cols-[44px_1fr_170px_90px_92px_150px] gap-3.5 px-4 py-3 items-center">
              <div
                className="w-9 h-9 grid place-items-center rounded text-[14px] font-mono font-semibold text-white"
                style={{ background: COLORS[p.provider_key] ?? "var(--text)" }}
              >
                {p.provider_key[0].toUpperCase()}
              </div>
              <div>
                <div className="text-sm font-medium">{p.display_name}</div>
                <div className="text-[11px] text-[var(--text-3)] font-mono mt-0.5">{p.provider_key}</div>
              </div>
              <div className="font-mono text-[11px] text-[var(--text-2)]">
                {p.dbKey ? "DB (encrypted)" : p.envKey ? "Environment variable" : "not set"}
              </div>
              <div className="font-mono text-[12px] text-[var(--text-2)]">{p.modelCount} models</div>
              <div>
                <span
                  className={`inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-full ${
                    p.hasKey ? "bg-[var(--green-soft)] text-[var(--green)]" : "bg-[var(--surface-2)] text-[var(--text-3)]"
                  }`}
                >
                  <span className="w-1.5 h-1.5 rounded-full bg-current" />
                  {p.hasKey ? "Active" : "No key"}
                </span>
              </div>
              <div className="text-right">
                {!isEditing && (
                  <button
                    onClick={() => {
                      setEditing(p.provider_key);
                      setValue("");
                      setErr(null);
                    }}
                    className="inline-flex items-center gap-1.5 text-[12px] font-medium text-[var(--purple)] hover:underline"
                  >
                    <KeyRound size={13} />
                    {p.dbKey ? "Change key" : "Set key"}
                  </button>
                )}
              </div>
            </div>

            {isEditing && (
              <div className="px-4 pb-4 -mt-1">
                <div className="flex flex-wrap items-center gap-2">
                  <input
                    type="password"
                    autoComplete="off"
                    value={value}
                    onChange={(e) => setValue(e.target.value)}
                    placeholder={`Paste the ${p.display_name} API key…`}
                    className="flex-1 min-w-[240px] bg-white border border-[var(--border)] text-[13px] font-mono px-3 py-2 rounded-lg outline-none focus:border-[var(--purple)]"
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && value.trim()) save(p.provider_key, value);
                    }}
                  />
                  <button
                    onClick={() => save(p.provider_key, value)}
                    disabled={saving || !value.trim()}
                    className="inline-flex items-center gap-1.5 text-white text-[13px] font-medium px-3.5 py-2 rounded-lg disabled:opacity-50"
                    style={{ background: "var(--purple)" }}
                  >
                    {saving ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
                    Save
                  </button>
                  {p.dbKey && (
                    <button
                      onClick={() => save(p.provider_key, "")}
                      disabled={saving}
                      className="text-[13px] font-medium text-[var(--red)] px-2 py-2 hover:underline disabled:opacity-50"
                      title="Remove the stored key and fall back to the env var"
                    >
                      Clear
                    </button>
                  )}
                  <button
                    onClick={() => {
                      setEditing(null);
                      setValue("");
                      setErr(null);
                    }}
                    className="inline-flex items-center gap-1 text-[13px] text-[var(--text-3)] hover:text-[var(--text)] px-1 py-2"
                  >
                    <X size={14} />
                  </button>
                </div>
                {err && <div className="text-[12px] text-[var(--red)] mt-1.5">{err}</div>}
                <p className="text-[11px] text-[var(--text-3)] mt-1.5">
                  Stored encrypted (AES-256-GCM). It takes effect immediately and overrides the env var.
                </p>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
