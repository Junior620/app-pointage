"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, UserCog, X, Shield, Save } from "lucide-react";
import { cn } from "@/lib/utils";
import Link from "next/link";

type DashboardUser = {
  id: string;
  name: string;
  email: string;
  role: string;
  active: boolean;
  whatsappPhone: string | null;
  createdAt: string;
};

const ROLE_LABELS: Record<string, string> = {
  ADMIN: "Administrateur",
  HR: "RH",
  DG: "Direction",
};

const emptyForm = {
  name: "",
  email: "",
  password: "",
  role: "HR" as "HR" | "ADMIN" | "DG",
  whatsappPhone: "",
};

export default function UsersAdminClient({ currentUserId }: { currentUserId: string }) {
  const router = useRouter();
  const [accessOk, setAccessOk] = useState(false);
  const [users, setUsers] = useState<DashboardUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [phoneEdits, setPhoneEdits] = useState<Record<string, string>>({});
  const [savingId, setSavingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/users");
      const json = await res.json();
      if (res.ok) {
        const list = (json.data ?? []) as DashboardUser[];
        setUsers(list);
        const phones: Record<string, string> = {};
        for (const u of list) phones[u.id] = u.whatsappPhone ?? "";
        setPhoneEdits(phones);
      }
    } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => {
    if (!accessOk) return;
    void load();
  }, [accessOk, load]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setFormError(null);
    try {
      const res = await fetch("/api/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.name,
          email: form.email,
          password: form.password,
          role: form.role,
          whatsappPhone: form.whatsappPhone.trim() || null,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setFormError(typeof json.error === "string" ? json.error : "Création impossible.");
        return;
      }
      setModalOpen(false);
      setForm(emptyForm);
      await load();
    } catch {
      setFormError("Erreur réseau.");
    } finally {
      setSubmitting(false);
    }
  };

  const savePhone = async (userId: string) => {
    setSavingId(userId);
    try {
      const res = await fetch(`/api/users/${userId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ whatsappPhone: (phoneEdits[userId] ?? "").trim() || null }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        alert(typeof json.error === "string" ? json.error : "Erreur");
        return;
      }
      await load();
    } finally {
      setSavingId(null);
    }
  };

  const toggleActive = async (user: DashboardUser) => {
    const next = !user.active;
    const label = next ? "réactiver" : "désactiver";
    if (!confirm(`${label.charAt(0).toUpperCase()}${label.slice(1)} le compte ${user.email} ?`)) return;

    const res = await fetch(`/api/users/${user.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ active: next }),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      alert(typeof json.error === "string" ? json.error : "Erreur");
      return;
    }
    await load();
  };

  if (!accessOk) {
    return (
      <div className="flex items-center justify-center py-24 text-slate-500 text-sm">
        Vérification des droits…
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-slate-900 flex items-center gap-2">
            <UserCog className="w-8 h-8 text-violet-600" />
            Utilisateurs
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Créez les comptes RH, administrateurs et direction. Les alertes WhatsApp utilisent les
            numéros renseignés (
            <Link href="/settings" className="text-blue-600 hover:underline">
              Paramètres → Alertes
            </Link>
            ).
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            setForm(emptyForm);
            setFormError(null);
            setModalOpen(true);
          }}
          className="inline-flex items-center gap-2 px-4 py-2.5 bg-blue-600 text-white rounded-xl hover:bg-blue-700 text-sm font-medium shadow-sm"
        >
          <Plus className="w-4 h-4" />
          Nouvel utilisateur
        </button>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
        {loading ? (
          <div className="p-8 space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-14 bg-slate-100 rounded-xl animate-pulse" />
            ))}
          </div>
        ) : users.length === 0 ? (
          <p className="p-8 text-center text-slate-500">Aucun utilisateur.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50">
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500">Nom</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500">Rôle</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500">WhatsApp</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500">Statut</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-slate-500">Actions</th>
                </tr>
              </thead>
              <tbody>
                {users.map((u) => (
                  <tr key={u.id} className="border-b border-slate-50 hover:bg-slate-50/50">
                    <td className="px-4 py-3">
                      <p className="font-medium text-slate-800">{u.name}</p>
                      <p className="text-xs text-slate-500">{u.email}</p>
                      {u.id === currentUserId && (
                        <span className="text-[10px] text-blue-600 font-medium">(vous)</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={cn(
                          "inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full",
                          u.role === "ADMIN"
                            ? "bg-violet-50 text-violet-700"
                            : u.role === "HR"
                              ? "bg-blue-50 text-blue-700"
                              : "bg-slate-100 text-slate-600"
                        )}
                      >
                        {u.role === "ADMIN" && <Shield className="w-3 h-3" />}
                        {ROLE_LABELS[u.role] ?? u.role}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex gap-1 max-w-xs">
                        <input
                          type="tel"
                          value={phoneEdits[u.id] ?? ""}
                          onChange={(e) =>
                            setPhoneEdits((prev) => ({ ...prev, [u.id]: e.target.value }))
                          }
                          placeholder="237…"
                          className="flex-1 min-w-0 px-2 py-1.5 border border-slate-200 rounded-lg text-sm"
                        />
                        <button
                          type="button"
                          disabled={savingId === u.id}
                          onClick={() => void savePhone(u.id)}
                          className="p-1.5 text-blue-600 hover:bg-blue-50 rounded-lg disabled:opacity-50"
                          title="Enregistrer le numéro"
                        >
                          <Save className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={cn(
                          "text-xs font-medium px-2 py-0.5 rounded-full",
                          u.active ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700"
                        )}
                      >
                        {u.active ? "Actif" : "Inactif"}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      {u.id !== currentUserId && (
                        <button
                          type="button"
                          onClick={() => void toggleActive(u)}
                          className="text-sm font-medium text-slate-600 hover:text-slate-900"
                        >
                          {u.active ? "Désactiver" : "Réactiver"}
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-black/50" onClick={() => setModalOpen(false)} />
          <div className="relative bg-white rounded-2xl shadow-xl w-full max-w-md p-6 z-10">
            <div className="flex items-start justify-between mb-4">
              <h2 className="text-lg font-semibold text-slate-900">Nouvel utilisateur</h2>
              <button type="button" onClick={() => setModalOpen(false)} className="text-slate-400">
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleCreate} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Nom complet</label>
                <input
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  required
                  className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Email</label>
                <input
                  type="email"
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                  required
                  className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Mot de passe initial
                </label>
                <input
                  type="password"
                  value={form.password}
                  onChange={(e) => setForm({ ...form, password: e.target.value })}
                  required
                  minLength={8}
                  className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm"
                />
                <p className="text-xs text-slate-500 mt-1">Minimum 8 caractères.</p>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Rôle</label>
                <select
                  value={form.role}
                  onChange={(e) =>
                    setForm({ ...form, role: e.target.value as typeof form.role })
                  }
                  className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm bg-white"
                >
                  <option value="HR">RH</option>
                  <option value="ADMIN">Administrateur</option>
                  <option value="DG">Direction (DG)</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  WhatsApp (optionnel)
                </label>
                <input
                  type="tel"
                  value={form.whatsappPhone}
                  onChange={(e) => setForm({ ...form, whatsappPhone: e.target.value })}
                  placeholder="237690000000"
                  className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm"
                />
              </div>
              {formError && <p className="text-sm text-red-600">{formError}</p>}
              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  className="px-4 py-2.5 text-sm text-slate-600 hover:bg-slate-100 rounded-xl"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-4 py-2.5 text-sm font-medium bg-blue-600 text-white rounded-xl hover:bg-blue-700 disabled:opacity-50"
                >
                  {submitting ? "Création…" : "Créer le compte"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
