"use client";

import { useCallback, useEffect, useState } from "react";
import { Bell, MessageCircle, Save } from "lucide-react";
import Link from "next/link";

type MeProfile = {
  id: string;
  name: string;
  email: string;
  role: string;
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

  const load = useCallback(async () => {
    const meRes = await fetch("/api/me");
    if (!meRes.ok) return;
    const profile = (await meRes.json()) as MeProfile;
    setMe(profile);
    setMyPhone(profile.whatsappPhone ?? "");
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

  if (!me) {
    return <div className="h-24 bg-slate-100 rounded-xl animate-pulse" />;
  }

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

      {me.role === "ADMIN" && (
        <p className="text-sm text-slate-600 rounded-xl border border-blue-100 bg-blue-50/50 px-4 py-3">
          Pour <strong>créer des comptes</strong> RH ou administrateurs, utilisez le menu{" "}
          <Link href="/users" className="text-blue-600 font-medium hover:underline">
            Utilisateurs
          </Link>
          . Vous pourrez y gérer aussi les numéros WhatsApp de chaque compte.
        </p>
      )}

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
    </div>
  );
}
