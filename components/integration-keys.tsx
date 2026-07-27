"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2 } from "lucide-react";

/**
 * Integration keys for the Social command center — YouTube Data API key + Meta
 * access token + your IG business account id. Lives in Admin alongside the AI
 * provider keys so ALL credentials are managed in one place.
 *
 * Stored AES-GCM encrypted (integration_secrets) via /api/social/settings.
 * Values are never sent back to the client — only whether each is set.
 */
export function IntegrationKeys() {
  const [status, setStatus] = useState<Record<string, boolean> | null>(null);
  const [yt, setYt] = useState("");
  const [meta, setMeta] = useState("");
  const [ig, setIg] = useState("");
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const r = await fetch("/api/social/settings");
      if (r.ok) setStatus(await r.json());
    } catch { /* panel is advisory */ }
  }, []);
  useEffect(() => { load(); }, [load]);

  async function save() {
    const body: Record<string, string> = {};
    if (yt.trim()) body.youtube_api_key = yt.trim();
    if (meta.trim()) body.meta_access_token = meta.trim();
    if (ig.trim()) body.meta_ig_user_id = ig.trim();
    if (Object.keys(body).length === 0) return;
    setSaving(true); setMsg(null);
    try {
      const r = await fetch("/api/social/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error ?? "Failed");
      setYt(""); setMeta(""); setIg("");
      setMsg("Saved.");
      load();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="bg-white border border-[var(--border)] rounded-md p-4">
      <p className="text-[12px] text-[var(--text-3)] leading-relaxed mb-3">
        YouTube needs a Data API v3 key. Instagram competitor data needs a Meta
        access token <b>plus your own IG business account id</b> (business
        discovery only reads business/creator accounts). X reuses the Twitter
        cookie (Twitter → Settings). Facebook has no free competitor API.
      </p>
      <div className="space-y-3">
        <Row label="YouTube API key" val={yt} set={setYt} ok={status?.youtube_api_key} />
        <Row label="Meta access token" val={meta} set={setMeta} ok={status?.meta_access_token} />
        <Row label="Your IG business account id" val={ig} set={setIg} ok={status?.meta_ig_user_id} mono />
      </div>
      <div className="flex items-center gap-3 mt-3">
        <button
          onClick={save}
          disabled={saving}
          className="bg-[var(--text)] hover:bg-black text-white text-[13px] font-medium px-3.5 py-1.5 rounded disabled:opacity-50 flex items-center gap-1.5"
        >
          {saving && <Loader2 size={13} className="animate-spin" />} Save
        </button>
        {msg && <span className="text-[12px] text-[var(--text-2)]">{msg}</span>}
      </div>
    </div>
  );
}

function Row({
  label, val, set, ok, mono,
}: {
  label: string; val: string; set: (v: string) => void; ok?: boolean; mono?: boolean;
}) {
  return (
    <div>
      <label className="block text-[12px] font-medium text-[var(--text-2)] mb-1">
        {label} {ok && <span className="text-[#166534]" title="set">✓</span>}
      </label>
      <input
        type={mono ? "text" : "password"}
        value={val}
        onChange={(e) => set(e.target.value)}
        placeholder={ok ? "•••••• (replace)" : ""}
        className={`w-full bg-white border border-[var(--border)] text-[13px] px-3 py-2 rounded outline-none focus:border-[var(--purple)] ${mono ? "font-mono" : ""}`}
      />
    </div>
  );
}
