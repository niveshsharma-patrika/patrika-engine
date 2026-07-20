"use client";

import { useEffect, useState } from "react";
import { Loader2, Check, FileText, ImageIcon } from "lucide-react";

type Model = { key: string; name: string };
type Provider = { key: string; name: string; models: Model[] };
type Sel = { provider: string; model: string };

export function AiRouting() {
  const [content, setContent] = useState<Sel | null>(null);
  const [image, setImage] = useState<Sel | null>(null);
  const [contentProviders, setContentProviders] = useState<Provider[]>([]);
  const [imageProviders, setImageProviders] = useState<Provider[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const r = await fetch("/api/admin/ai-routing", { cache: "no-store" });
        const j = await r.json();
        setContent({ provider: j.content.provider, model: j.content.model ?? "" });
        setImage({ provider: j.image.provider, model: j.image.model ?? "" });
        setContentProviders(j.contentProviders ?? []);
        setImageProviders(j.imageProviders ?? []);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  async function save(purpose: "content" | "image", provider: string, model: string) {
    setSaving(purpose);
    setErr(null);
    try {
      const r = await fetch("/api/admin/ai-routing", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ purpose, provider, model }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) setErr(j.error ?? "Save failed");
      else {
        setSaved(purpose);
        setTimeout(() => setSaved((s) => (s === purpose ? null : s)), 2000);
      }
    } catch {
      setErr("Save failed");
    } finally {
      setSaving(null);
    }
  }

  const sel = "bg-white border border-[var(--border)] text-[13px] px-3 py-2 rounded-lg outline-none focus:border-[var(--purple)]";

  function Row({
    purpose,
    icon,
    title,
    hint,
    state,
    setState,
    providers,
  }: {
    purpose: "content" | "image";
    icon: React.ReactNode;
    title: string;
    hint: string;
    state: Sel;
    setState: (s: Sel) => void;
    providers: Provider[];
  }) {
    const prov = providers.find((p) => p.key === state.provider) ?? providers[0];
    const models = prov?.models ?? [];
    const model = models.some((m) => m.key === state.model) ? state.model : models[0]?.key ?? "";
    return (
      <div className="grid grid-cols-[1fr_180px_220px_24px] gap-3 items-center px-4 py-3 border-t border-[var(--border)]">
        <div>
          <div className="text-sm font-medium flex items-center gap-1.5">{icon} {title}</div>
          <div className="text-[11px] text-[var(--text-3)] mt-0.5">{hint}</div>
        </div>
        <select
          className={sel}
          value={state.provider}
          onChange={(e) => {
            const provider = e.target.value;
            const first = providers.find((p) => p.key === provider)?.models[0]?.key ?? "";
            const next = { provider, model: first };
            setState(next);
            save(purpose, provider, first);
          }}
        >
          {providers.map((p) => (
            <option key={p.key} value={p.key}>{p.name}</option>
          ))}
        </select>
        <select
          className={sel}
          value={model}
          onChange={(e) => {
            const next = { provider: state.provider, model: e.target.value };
            setState(next);
            save(purpose, state.provider, e.target.value);
          }}
        >
          {models.map((m) => (
            <option key={m.key} value={m.key}>{m.name}</option>
          ))}
        </select>
        <div className="w-6 grid place-items-center">
          {saving === purpose && <Loader2 size={14} className="animate-spin text-[var(--text-3)]" />}
          {saved === purpose && <Check size={15} className="text-[var(--green)]" />}
        </div>
      </div>
    );
  }

  if (loading || !content || !image) {
    return <div className="bg-white border border-[var(--border)] rounded-md p-4 text-[13px] text-[var(--text-3)]">Loading…</div>;
  }

  return (
    <div className="bg-white border border-[var(--border)] rounded-md overflow-hidden">
      <div className="grid grid-cols-[1fr_180px_220px_24px] gap-3 px-4 py-2.5 bg-[var(--surface-2)] text-[11px] uppercase tracking-wider text-[var(--text-3)] font-medium">
        <div>Generates</div>
        <div>Provider</div>
        <div>Model</div>
        <div />
      </div>
      <Row
        purpose="content"
        icon={<FileText size={14} className="text-[var(--blue)]" />}
        title="Content"
        hint="Drafts, angles, widgets, magazines"
        state={content}
        setState={setContent}
        providers={contentProviders}
      />
      <Row
        purpose="image"
        icon={<ImageIcon size={14} className="text-[var(--purple)]" />}
        title="Images"
        hint="Hero images — OpenAI or Google only"
        state={image}
        setState={setImage}
        providers={imageProviders}
      />
      {err && <div className="px-4 py-2 text-[12px] text-[var(--red)]">{err}</div>}
      <p className="px-4 py-2.5 text-[11px] text-[var(--text-3)] border-t border-[var(--border)]">
        Each provider&apos;s key is set in <b>API Keys</b> above. Changes take effect immediately.
        Anthropic and Groq can&apos;t generate images.
      </p>
    </div>
  );
}
