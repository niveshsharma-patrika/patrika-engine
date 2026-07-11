"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const json = await res.json();
      if (res.ok) {
        const next = new URLSearchParams(window.location.search).get("next") || "/";
        router.replace(next.startsWith("/") ? next : "/");
        router.refresh();
      } else {
        setError(json.error ?? "Login failed");
      }
    } catch {
      setError("Network error — please try again.");
    } finally {
      setLoading(false);
    }
  }

  const labelCls =
    "block text-[11px] font-semibold tracking-[0.13em] uppercase text-[var(--text-2)] mb-2";
  const inputCls =
    "w-full bg-white border border-[var(--border)] text-[15px] px-4 py-3 rounded-xl outline-none focus:border-[var(--purple)]";

  return (
    <div className="min-h-screen flex items-center justify-center bg-[var(--surface-2)] px-4">
      <div className="w-full max-w-md">
        {/* Wordmark: पत्रिका | KAIROS */}
        <div className="flex items-center justify-center gap-4 mb-4">
          <span className="text-[40px] font-bold text-[var(--text)] leading-none">पत्रिका</span>
          <span className="w-px h-9" style={{ background: "var(--text-3)", opacity: 0.35 }} />
          <span
            className="text-[40px] font-extrabold tracking-[0.06em] leading-none"
            style={{
              backgroundImage: "linear-gradient(95deg, var(--red), #7c3aed)",
              WebkitBackgroundClip: "text",
              backgroundClip: "text",
              color: "transparent",
            }}
          >
            KAIROS
          </span>
        </div>
        <p className="text-center text-[15px] text-[var(--text-2)] mb-8">
          Sign in with the team credentials to continue.
        </p>

        <form
          onSubmit={submit}
          className="bg-white border border-[var(--border)] rounded-2xl p-7 shadow-sm"
        >
          {error && (
            <div className="mb-5 text-[13px] text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
              {error}
            </div>
          )}
          <label className={labelCls}>Email</label>
          <input
            type="email"
            autoFocus
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className={`${inputCls} mb-5`}
            placeholder="you@in.patrika.com"
          />
          <label className={labelCls}>Password</label>
          <input
            type="password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className={`${inputCls} mb-6`}
            placeholder="••••••••"
          />
          <button
            type="submit"
            disabled={loading}
            className="w-full text-white text-[15px] font-medium py-3.5 rounded-xl disabled:opacity-60 bg-[var(--text)] hover:bg-black transition-colors"
          >
            {loading ? "Signing in…" : "Sign in"}
          </button>
        </form>
        <div className="text-center text-[12px] text-[var(--text-3)] mt-5">
          If you don&apos;t have credentials, ask your editorial lead.
        </div>
      </div>
    </div>
  );
}
