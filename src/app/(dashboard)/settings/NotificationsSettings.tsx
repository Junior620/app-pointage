"use client";

import { useCallback, useEffect, useState } from "react";
import { Bell, MessageCircle, Save } from "lucide-react";
import Link from "next/link";
import { roleLabel } from "@/lib/navigation";
import { Button } from "@/components/ui/Button";
import { Field, Input } from "@/components/ui/Field";
import { Skeleton } from "@/components/ui/EmptyState";

type MeProfile = {
  id: string;
  name: string;
  email: string;
  role: string;
  whatsappPhone: string | null;
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
      setMeMessage(
        json.whatsappPhone
          ? "Numéro enregistré. Vous recevrez les alertes des demandes employé sur WhatsApp."
          : "Numéro retiré : vous ne recevrez plus d'alertes WhatsApp."
      );
    } catch {
      setMeError("Erreur réseau.");
    } finally {
      setSavingMe(false);
    }
  };

  if (!me) {
    return <Skeleton className="h-24 rounded-xl" />;
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="flex items-center gap-2 text-base font-semibold text-slate-800">
          <Bell className="h-5 w-5 text-brand-600" />
          Alertes WhatsApp (mon compte)
        </h2>
        <p className="mt-1 text-sm text-slate-500">
          Quand un employé envoie une demande d&apos;autorisation ou de mission, les comptes RH, Admin et DG qui ont
          renseigné un numéro sont prévenus sur WhatsApp.
        </p>
      </div>

      {me.role === "ADMIN" && (
        <p className="rounded-xl border border-brand-100 bg-brand-50/50 px-4 py-3 text-sm text-slate-600">
          Pour <strong>créer des comptes</strong> RH ou administrateurs et gérer leurs numéros, ouvrez{" "}
          <Link href="/users" className="font-medium text-brand-600 hover:underline">
            Utilisateurs
          </Link>
          .
        </p>
      )}

      <form onSubmit={saveMyPhone} className="max-w-lg space-y-4 rounded-xl border border-slate-200 bg-slate-50/50 p-5">
        <div>
          <p className="text-sm font-medium text-slate-800">{me.name}</p>
          <p className="text-xs text-slate-500">
            {me.email} · {roleLabel(me.role)}
          </p>
        </div>
        <Field
          label={
            <span className="flex items-center gap-1.5">
              <MessageCircle className="h-4 w-4 text-emerald-600" />
              Mon numéro WhatsApp
            </span>
          }
          hint="Format international, chiffres uniquement (ex. 237690000000). Laissez vide pour ne plus recevoir d'alertes."
          error={meError}
        >
          {(id) => (
            <Input id={id} type="tel" inputMode="tel" value={myPhone} onChange={(e) => setMyPhone(e.target.value)} placeholder="237690000000" aria-invalid={Boolean(meError)} />
          )}
        </Field>
        {meMessage && <p className="text-sm text-emerald-700">{meMessage}</p>}
        <Button type="submit" loading={savingMe} icon={<Save className="h-4 w-4" />}>
          Enregistrer mon numéro
        </Button>
      </form>
    </div>
  );
}
