"use client";

import { useCallback, useEffect, useState } from "react";
import { Bell, MessageCircle, Save, Users } from "lucide-react";
import { cn } from "@/lib/utils";

type MeProfile = {
  id: string;
  name: string;
  email: string;
  role: string;
  whatsappPhone: string | null;
};

type DashboardUser = {
  id: string;
  name: string;
  email: string;
  role: string;
  active: boolean;
  whatsappPhone: string | null;
};

const ROLE_LABELS: Record<string, string> = {
  ADMIN: "Administrateur",
  HR: "RH",
  DG: "Direction",
};

export default function NotificationsSettings() {
  const [me, setMe] = useState<MeProfile | null>(null);
  const [myPhone, setMyPhone] = useState("");
  const [savingMe, setSavingMe] = useState(false);
  const [meMessage, setMeMessage] = useState<string | null>(null);
  const [meError, setMeError] = useState<string | null>(null);

  const [allUsers, setAllUsers] = useState<DashboardUser[]>([]);
  const [edits, setEdits] = useState<Record<string, string>>({});
  const [savingUserId, setSavingUserId] = useState<string | null>(null);

  const load = useCallback(async () => {
    const meRes = await fetch("/api/me");
    if (!meRes.ok) return;
    const profile = (await meRes.json()) as MeProfile;
    setMe(profile);
    setMyPhone(profile.whatsappPhone ?? "");

    if (profile.role === "ADMIN") {
      const usersRes = await fetch("/api/users");
      if (usersRes.ok) {
        const json = await usersRes.json();
        const list = (json.data ?? []) as DashboardUser[];
        setAllUsers(list);
        const initial: Record<string, string> = {};
        for (const u of list) {
          initial[u.id] = u.whatsappPhone ?? "";
        }
        setEdits(initial);
      }
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const saveMyPhone = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingMe(true);
    setMeMessage(null);
    setMeError(null);
    try {
      const res = await fetch("/api/me", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          whatsappPhone: myPhone.trim() || null,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setMeError(typeof json.error === "string" ? json.error : "Enregistrement impossible.");
        return;
      }
      setMe(json as MeProfile);
      setMyPhone(json.whatsappPhone ?? "");
      setMeMessage("Numéro enregistré. Vous recevrez les alertes demandes employé sur WhatsApp.");
    } catch {
      setMeError("Erreur réseau.");
    } finally {
      setSavingMe(false);
    }
  };

  const saveUserPhone = async (userId: string) => {
    setSavingUserId(userId);
    try {
      const res = await fetch(`/api/users/${userId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          whatsappPhone: (edits[userId] ?? "").trim() || null,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        alert(typeof json.error === "string" ? json.error : "Erreur");
        return;
      }
      const updated = json.data as DashboardUser;
      setAllUsers((prev) => prev.map((u) => (u.id === userId ? { ...u, ...updated } : u)));
      setMeMessage(`Numéro mis à jour pour ${updated.name}.`);
    } catch {
      alert("Erreur réseau.");
    } finally {
      setSavingUserId(null);
    }
  };

  if (!me) {
    return (
      <div className="h-24 bg-slate-100 rounded-xl animate-pulse" />
    );
  }

  const isAdmin = me.role === "ADMIN";

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-base font-semibold text-slate-800 flex items-center gap-2">
          <Bell className="w-5 h-5 text-blue-600" />
          Alertes WhatsApp (mon compte)
        </h2>
        <p className="text-sm text-slate-500 mt-1">
          Lorsqu&apos;un employé envoie une demande d&apos;autorisation ou de mission, les comptes RH / Admin /
          DG avec un numéro renseigné sont notifiés sur WhatsApp.
        </p>
      </div>

      <form
        onSubmit={saveMyPhone}
        className="rounded-xl border border-slate-200 p-5 bg-slate-50/50 space-y-4 max-w-lg"
      >
        <div>
          <p className="text-sm font-medium text-slate-800">{me.name}</p>
          <p className="text-xs text-slate-500">
            {me.email} · {ROLE_LABELS[me.role] ?? me.role}
          </p>
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1 flex items-center gap-1.5">
            <MessageCircle className="w-4 h-4 text-emerald-600" />
            Mon numéro WhatsApp
          </label>
          <input
            type="tel"
            value={myPhone}
            onChange={(e) => setMyPhone(e.target.value)}
            placeholder="Ex. 237690000000 (sans +)"
            className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm bg-white"
          />
          <p className="text-xs text-slate-500 mt-1">
            Format international, chiffres uniquement. Même numéro que sur WhatsApp.
          </p>
        </div>
        {meError && <p className="text-sm text-red-600">{meError}</p>}
        {meMessage && <p className="text-sm text-emerald-700">{meMessage}</p>}
        <button
          type="submit"
          disabled={savingMe}
          className="inline-flex items-center gap-2 px-4 py-2.5 bg-blue-600 text-white rounded-xl text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
        >
          <Save className="w-4 h-4" />
          {savingMe ? "Enregistrement…" : "Enregistrer mon numéro"}
        </button>
      </form>

      {isAdmin && (
        <div className="space-y-4">
          <div>
            <h2 className="text-base font-semibold text-slate-800 flex items-center gap-2">
              <Users className="w-5 h-5 text-violet-600" />
              Comptes utilisateurs
            </h2>
            <p className="text-sm text-slate-500 mt-1">
              En tant qu&apos;administrateur, vous pouvez renseigner le WhatsApp de chaque compte RH / Admin / DG.
            </p>
          </div>

          <div className="overflow-x-auto rounded-xl border border-slate-200">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50">
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500">Utilisateur</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500">Rôle</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500">WhatsApp</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-slate-500">Action</th>
                </tr>
              </thead>
              <tbody>
                {allUsers.map((u) => (
                  <tr key={u.id} className="border-b border-slate-50">
                    <td className="px-4 py-3">
                      <p className="font-medium text-slate-800">{u.name}</p>
                      <p className="text-xs text-slate-500">{u.email}</p>
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={cn(
                          "text-xs font-medium px-2 py-0.5 rounded-full",
                          u.active ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-500"
                        )}
                      >
                        {ROLE_LABELS[u.role] ?? u.role}
                        {!u.active ? " (inactif)" : ""}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <input
                        type="tel"
                        value={edits[u.id] ?? ""}
                        onChange={(e) =>
                          setEdits((prev) => ({ ...prev, [u.id]: e.target.value }))
                        }
                        placeholder="237…"
                        className="w-full min-w-[140px] px-2 py-1.5 border border-slate-200 rounded-lg text-sm"
                      />
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        type="button"
                        disabled={savingUserId === u.id}
                        onClick={() => void saveUserPhone(u.id)}
                        className="text-sm font-medium text-blue-600 hover:text-blue-800 disabled:opacity-50"
                      >
                        {savingUserId === u.id ? "…" : "Enregistrer"}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
