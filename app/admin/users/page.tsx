"use client";

import { useEffect, useState } from "react";

type User = {
  id: string;
  email: string | null;
  fullName: string;
  role: string;
  edition: string;
  desk: string | null;
  isActive: boolean;
  createdAt: string | null;
};

const ROLES = ["admin", "desk_head", "sub_editor", "reporter"];
const ROLE_LABEL: Record<string, string> = {
  admin: "Admin",
  desk_head: "Desk head",
  sub_editor: "Sub editor",
  reporter: "Reporter",
};
const EDITIONS = ["digital", "print"];
const EDITION_LABEL: Record<string, string> = { digital: "Digital", print: "Print" };

export default function UsersPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [forbidden, setForbidden] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // add-user form
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("reporter");
  const [edition, setEdition] = useState("digital");
  const [password, setPassword] = useState("");
  const [adding, setAdding] = useState(false);

  async function load() {
    const res = await fetch("/api/admin/users", { cache: "no-store" });
    if (res.status === 403) {
      setForbidden(true);
      setLoading(false);
      return;
    }
    const json = await res.json();
    setUsers(json.users ?? []);
    setLoading(false);
  }
  useEffect(() => {
    load();
  }, []);

  async function addUser(e: React.FormEvent) {
    e.preventDefault();
    setAdding(true);
    setErr(null);
    try {
      const res = await fetch("/api/admin/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fullName, email, role, edition, password }),
      });
      const json = await res.json();
      if (!res.ok) {
        setErr(json.error ?? "Failed to add user");
      } else {
        setFullName("");
        setEmail("");
        setRole("reporter");
        setEdition("digital");
        setPassword("");
        await load();
      }
    } finally {
      setAdding(false);
    }
  }

  async function patch(id: string, body: Record<string, unknown>) {
    const res = await fetch(`/api/admin/users/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const j = await res.json();
      alert(j.error ?? "Update failed");
    }
    await load();
  }

  async function resetPassword(u: User) {
    const pw = prompt(`New password for ${u.fullName} (min 6 chars):`);
    if (!pw) return;
    if (pw.length < 6) return alert("Password must be at least 6 characters.");
    await patch(u.id, { password: pw });
    alert("Password updated.");
  }

  async function remove(u: User) {
    if (!confirm(`Delete ${u.fullName} (${u.email})? This cannot be undone.`)) return;
    const res = await fetch(`/api/admin/users/${u.id}`, { method: "DELETE" });
    if (!res.ok) {
      const j = await res.json();
      alert(j.error ?? "Delete failed");
    }
    await load();
  }

  if (forbidden) {
    return (
      <div className="p-8 text-[14px] text-[var(--text-2)]">
        <h1 className="text-lg font-semibold text-[var(--text-1)] mb-2">Users</h1>
        Admin access required — only administrators can manage users.
      </div>
    );
  }

  const input =
    "w-full bg-white border border-[var(--border)] text-[13px] px-3 py-2 rounded-lg outline-none focus:border-[var(--purple)]";

  return (
    <div className="p-6 max-w-5xl">
      <h1 className="text-lg font-semibold text-[var(--text-1)] mb-1">Users</h1>
      <p className="text-[13px] text-[var(--text-3)] mb-5">
        Add and manage who can sign in. New accounts are created here — there is no public sign-up.
      </p>

      {/* Add user */}
      <form
        onSubmit={addUser}
        className="bg-white border border-[var(--border)] rounded-xl p-4 mb-6 grid grid-cols-1 sm:grid-cols-6 gap-3 items-end"
      >
        <div className="sm:col-span-1">
          <label className="block text-[11px] font-medium text-[var(--text-2)] mb-1">Full name</label>
          <input className={input} value={fullName} onChange={(e) => setFullName(e.target.value)} required />
        </div>
        <div className="sm:col-span-1">
          <label className="block text-[11px] font-medium text-[var(--text-2)] mb-1">Email</label>
          <input className={input} type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        </div>
        <div className="sm:col-span-1">
          <label className="block text-[11px] font-medium text-[var(--text-2)] mb-1">Role</label>
          <select className={input} value={role} onChange={(e) => setRole(e.target.value)}>
            {ROLES.map((r) => (
              <option key={r} value={r}>{ROLE_LABEL[r]}</option>
            ))}
          </select>
        </div>
        <div className="sm:col-span-1">
          <label className="block text-[11px] font-medium text-[var(--text-2)] mb-1">Edition</label>
          <select className={input} value={edition} onChange={(e) => setEdition(e.target.value)}>
            {EDITIONS.map((ed) => (
              <option key={ed} value={ed}>{EDITION_LABEL[ed]}</option>
            ))}
          </select>
        </div>
        <div className="sm:col-span-1">
          <label className="block text-[11px] font-medium text-[var(--text-2)] mb-1">Initial password</label>
          <input className={input} type="text" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={6} />
        </div>
        <div className="sm:col-span-1">
          <button
            type="submit"
            disabled={adding}
            className="w-full text-white text-[13px] font-medium py-2 rounded-lg disabled:opacity-60"
            style={{ background: "var(--purple)" }}
          >
            {adding ? "Adding…" : "Add user"}
          </button>
        </div>
        {err && <div className="sm:col-span-6 text-[12px] text-red-600">{err}</div>}
      </form>

      {/* User list */}
      {loading ? (
        <div className="text-[13px] text-[var(--text-3)]">Loading…</div>
      ) : (
        <div className="bg-white border border-[var(--border)] rounded-xl overflow-hidden">
          <table className="w-full text-[13px]">
            <thead className="bg-[var(--surface-2)] text-[var(--text-3)] text-[11px] uppercase">
              <tr>
                <th className="text-left font-medium px-4 py-2.5">Name</th>
                <th className="text-left font-medium px-4 py-2.5">Email</th>
                <th className="text-left font-medium px-4 py-2.5">Role</th>
                <th className="text-left font-medium px-4 py-2.5">Edition</th>
                <th className="text-left font-medium px-4 py-2.5">Status</th>
                <th className="text-right font-medium px-4 py-2.5">Actions</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id} className="border-t border-[var(--border)]">
                  <td className="px-4 py-2.5 text-[var(--text-1)] font-medium">{u.fullName}</td>
                  <td className="px-4 py-2.5 text-[var(--text-2)]">{u.email}</td>
                  <td className="px-4 py-2.5">
                    <select
                      value={u.role}
                      onChange={(e) => patch(u.id, { role: e.target.value })}
                      className="bg-transparent border border-[var(--border)] rounded-md px-2 py-1 text-[12px]"
                    >
                      {ROLES.map((r) => (
                        <option key={r} value={r}>{ROLE_LABEL[r]}</option>
                      ))}
                    </select>
                  </td>
                  <td className="px-4 py-2.5">
                    <select
                      value={u.edition}
                      onChange={(e) => patch(u.id, { edition: e.target.value })}
                      className="bg-transparent border border-[var(--border)] rounded-md px-2 py-1 text-[12px]"
                    >
                      {EDITIONS.map((ed) => (
                        <option key={ed} value={ed}>{EDITION_LABEL[ed]}</option>
                      ))}
                    </select>
                  </td>
                  <td className="px-4 py-2.5">
                    <button
                      onClick={() => patch(u.id, { isActive: !u.isActive })}
                      className={`text-[12px] px-2 py-0.5 rounded-full ${u.isActive ? "bg-green-50 text-green-700" : "bg-gray-100 text-gray-500"}`}
                    >
                      {u.isActive ? "Active" : "Disabled"}
                    </button>
                  </td>
                  <td className="px-4 py-2.5 text-right whitespace-nowrap">
                    <button onClick={() => resetPassword(u)} className="text-[12px] text-[var(--purple)] mr-3 hover:underline">
                      Reset password
                    </button>
                    <button onClick={() => remove(u)} className="text-[12px] text-red-600 hover:underline">
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
