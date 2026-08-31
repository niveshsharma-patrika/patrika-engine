"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2 } from "lucide-react";

/**
 * Social & platform credentials, grouped by platform. Lives in Admin alongside
 * the AI provider keys so ALL credentials are managed in one place.
 *
 * Stored AES-GCM encrypted (integration_secrets) via /api/social/settings.
 * Values are never sent back to the client — only whether each is set.
 */
export function IntegrationKeys() {
  const [status, setStatus] = useState<Record<string, boolean> | null>(null);
  const [v, setV] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const set = (k: string, val: string) => setV((prev) => ({ ...prev, [k]: val }));

  const load = useCallback(async () => {
    try {
      const r = await fetch("/api/social/settings");
      if (r.ok) setStatus(await r.json());
    } catch { /* panel is advisory */ }
  }, []);
  useEffect(() => { load(); }, [load]);

  async function save() {
    const body: Record<string, string> = {};
    for (const [k, val] of Object.entries(v)) if (val.trim()) body[k] = val.trim();
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
      setV({});
      setMsg("Saved.");
      load();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-3">
      <Group
        title="Reddit"
        tag="Social Trends"
        help={<>Required for Social Trends — Reddit blocks server IPs without OAuth. Create a free <b>&ldquo;script&rdquo; app</b> at <a href="https://www.reddit.com/prefs/apps" target="_blank" rel="noopener noreferrer" className="text-[var(--purple)] underline">reddit.com/prefs/apps</a>.</>}
      >
        <Row label="Client id" k="reddit_client_id" v={v} set={set} ok={status?.reddit_client_id} mono />
        <Row label="Client secret" k="reddit_client_secret" v={v} set={set} ok={status?.reddit_client_secret} />
      </Group>

      <Group
        title="X (Twitter)"
        tag="Twitter · Social Trends"
        help={<>The <code className="font-mono text-[11px]">auth_token</code> cookie from a logged-in (throwaway) X session. Powers the Twitter feature and X trends.</>}
      >
        <Row label="auth_token cookie" k="x_auth_token" v={v} set={set} ok={status?.x_auth_token} />
      </Group>

      <Group
        title="YouTube"
        tag="Competitors"
        help={<>Data API v3 key. Feeds the (hidden) competitor tracking.</>}
      >
        <Row label="API key" k="youtube_api_key" v={v} set={set} ok={status?.youtube_api_key} />
      </Group>

      <Group
        title="Meta / Instagram"
        tag="Competitors"
        help={<>A Meta access token <b>plus your own IG business account id</b> (business discovery reads only business/creator accounts). Facebook has no free competitor API.</>}
      >
        <Row label="Access token" k="meta_access_token" v={v} set={set} ok={status?.meta_access_token} />
        <Row label="Your IG business account id" k="meta_ig_user_id" v={v} set={set} ok={status?.meta_ig_user_id} mono />
      </Group>

      <Group
        title="WordPress (Patrika+)"
        tag="Save to WordPress"
        help={<>Save Patrika+ articles to WordPress as drafts. Paste the <b>API key</b> from the WordPress plugin&rsquo;s settings page (sent as the <code className="font-mono text-[11px]">X-Kairos-API-Key</code> header) and the <b>endpoint URL</b> (ends in <code className="font-mono text-[11px]">/wp-json/kairos/v1/posts</code>).</>}
      >
        <Row label="API key" k="wordpress_api_key" v={v} set={set} ok={status?.wordpress_api_key} />
        <Row label="Endpoint URL" k="wordpress_endpoint" v={v} set={set} ok={status?.wordpress_endpoint} mono />
      </Group>

      <div className="flex items-center gap-3 pt-1">
        <button onClick={save} disabled={saving}
          className="bg-[var(--text)] hover:bg-black text-white text-[13px] font-medium px-3.5 py-1.5 rounded disabled:opacity-50 flex items-center gap-1.5">
          {saving && <Loader2 size={13} className="animate-spin" />} Save
        </button>
        {msg && <span className="text-[12px] text-[var(--text-2)]">{msg}</span>}
      </div>
    </div>
  );
}

function Group({
  title, tag, help, children,
}: { title: string; tag: string; help: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="bg-white border border-[var(--border)] rounded-md p-4">
      <div className="flex items-center gap-2 mb-1">
        <h3 className="text-[13px] font-semibold">{title}</h3>
        <span className="text-[10px] uppercase tracking-wide text-[var(--text-3)] bg-[var(--surface-2)] px-1.5 py-0.5 rounded">{tag}</span>
      </div>
      <p className="text-[11.5px] text-[var(--text-3)] leading-relaxed mb-3">{help}</p>
      <div className="space-y-2.5">{children}</div>
    </div>
  );
}

function Row({
  label, k, v, set, ok, mono,
}: {
  label: string; k: string; v: Record<string, string>; set: (k: string, val: string) => void;
  ok?: boolean; mono?: boolean;
}) {
  return (
    <div>
      <label className="block text-[12px] font-medium text-[var(--text-2)] mb-1">
        {label} {ok && <span className="text-[#166534]" title="set">✓</span>}
      </label>
      <input
        type={mono ? "text" : "password"}
        value={v[k] ?? ""}
        onChange={(e) => set(k, e.target.value)}
        placeholder={ok ? "•••••• (replace)" : ""}
        className={`w-full bg-white border border-[var(--border)] text-[13px] px-3 py-2 rounded outline-none focus:border-[var(--purple)] ${mono ? "font-mono" : ""}`}
      />
    </div>
  );
}
