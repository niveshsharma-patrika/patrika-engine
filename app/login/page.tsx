"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { KairosMark } from "@/components/kairos-logo";

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
        const next =
          new URLSearchParams(window.location.search).get("next") || "/";
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

  return (
    <div className="min-h-screen flex items-center justify-center bg-[var(--surface-2)] px-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-6">
          <div className="flex justify-center mb-3">
            <KairosMark size={52} />
          </div>
          <div className="text-2xl tracking-tight">
            <span className="font-medium text-[var(--text-2)]">Patrika </span>
            <span className="font-bold text-[var(--red)]">Kairos</span>
          </div>
          <div className="text-[10px] text-[var(--text-3)] mt-1 tracking-[0.2em] uppercase font-semibold">
            News Engine
          </div>
          <div className="text-[13px] text-[var(--text-3)] mt-3">
            Sign in to continue
          </div>
        </div>
        <form
          onSubmit={submit}
          className="bg-white border border-[var(--border)] rounded-2xl p-6 shadow-sm"
        >
          {error && (
            <div className="mb-4 text-[13px] text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
              {error}
            </div>
          )}
          <label className="block text-[12px] font-medium text-[var(--text-2)] mb-1">
            Email
          </label>
          <input
            type="email"
            autoFocus
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full mb-4 bg-white border border-[var(--border)] text-[14px] px-3 py-2.5 rounded-lg outline-none focus:border-[var(--purple)]"
            placeholder="you@in.patrika.com"
          />
          <label className="block text-[12px] font-medium text-[var(--text-2)] mb-1">
            Password
          </label>
          <input
            type="password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full mb-5 bg-white border border-[var(--border)] text-[14px] px-3 py-2.5 rounded-lg outline-none focus:border-[var(--purple)]"
            placeholder="••••••••"
          />
          <button
            type="submit"
            disabled={loading}
            className="w-full text-white text-[14px] font-medium py-2.5 rounded-lg disabled:opacity-60"
            style={{ background: "var(--purple)" }}
          >
            {loading ? "Signing in…" : "Sign in"}
          </button>
        </form>
        <div className="text-center text-[12px] text-[var(--text-3)] mt-4">
          Accounts are created by an administrator.
        </div>
      </div>
    </div>
  );
}
