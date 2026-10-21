"use client";

import { useCallback, useEffect, useState } from "react";
import { Plus, Shield, Save, Eye, EyeOff, UserCog } from "lucide-react";
import Link from "next/link";
import { roleLabel } from "@/lib/navigation";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Field, Input, Select } from "@/components/ui/Field";
import { Table, THead, Th, Tr, Td, TableSkeletonRows, TableMessageRow } from "@/components/ui/Table";
import { EmptyState } from "@/components/ui/EmptyState";
import { Modal } from "@/components/ui/Modal";
import { useToast } from "@/components/ui/Toaster";
import { useConfirm } from "@/components/ui/ConfirmDialog";

type DashboardUser = {
  id: string;
  name: string;
  email: string;
  role: string;
  active: boolean;
  whatsappPhone: string | null;
  createdAt: string;
};

const emptyForm = {
  name: "",
  email: "",
  password: "",
  role: "HR" as "HR" | "ADMIN" | "DG",
  whatsappPhone: "",
};

export default function UsersAdminClient({ currentUserId }: { currentUserId: string }) {
  const toast = useToast();
  const confirm = useConfirm();
  const [users, setUsers] = useState<DashboardUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
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
      } else {
        toast.error(typeof json.error === "string" ? json.error : "Impossible de charger les utilisateurs.");
      }
    } catch {
      toast.error("Erreur réseau : utilisateurs non chargés.");
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    void load();
  }, [load]);

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
      toast.success(`Compte créé pour ${form.name}. Communiquez-lui son mot de passe initial de façon sécurisée.`);
      setForm(emptyForm);
      await load();
    } catch {
      setFormError("Erreur réseau.");
    } finally {
      setSubmitting(false);
    }
  };

  const savePhone = async (user: DashboardUser) => {
    setSavingId(user.id);
    try {
      const res = await fetch(`/api/users/${user.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ whatsappPhone: (phoneEdits[user.id] ?? "").trim() || null }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(typeof json.error === "string" ? json.error : "Numéro non enregistré.");
        return;
      }
      toast.success(`Numéro WhatsApp de ${user.name} enregistré.`);
      await load();
    } catch {
      toast.error("Erreur réseau : numéro non enregistré.");
    } finally {
      setSavingId(null);
    }
  };

  const toggleActive = async (user: DashboardUser) => {
    const next = !user.active;
    const ok = await confirm({
      title: next ? "Réactiver le compte" : "Désactiver le compte",
      message: next
        ? `${user.name} (${user.email}) pourra de nouveau se connecter au tableau de bord.`
        : `${user.name} (${user.email}) ne pourra plus se connecter. Son historique est conservé.`,
      confirmLabel: next ? "Réactiver" : "Désactiver",
      tone: next ? "primary" : "danger",
    });
    if (!ok) return;

    const res = await fetch(`/api/users/${user.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ active: next }),
    }).catch(() => null);
    const json = res ? await res.json().catch(() => ({})) : {};
    if (!res?.ok) {
      toast.error(typeof json.error === "string" ? json.error : "Modification impossible.");
      return;
    }
    toast.success(next ? "Compte réactivé." : "Compte désactivé.");
    await load();
  };

  const openCreate = () => {
    setForm(emptyForm);
    setFormError(null);
    setShowPassword(false);
    setModalOpen(true);
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Utilisateurs"
        description={
          <>
            Comptes RH, administrateurs et direction. Les alertes WhatsApp utilisent les numéros renseignés (voir{" "}
            <Link href="/settings?tab=notifications" className="text-brand-600 hover:underline">
              Paramètres → Alertes
            </Link>
            ).
          </>
        }
        actions={
          <Button onClick={openCreate} icon={<Plus className="h-4 w-4" />}>
            Nouvel utilisateur
          </Button>
        }
      />

      <Card className="overflow-hidden">
        <Table>
          <THead>
            <tr>
              <Th>Utilisateur</Th>
              <Th>Rôle</Th>
              <Th>WhatsApp (alertes)</Th>
              <Th>Statut</Th>
              <Th align="right">
                <span className="sr-only">Actions</span>
              </Th>
            </tr>
          </THead>
          <tbody>
            {loading ? (
              <TableSkeletonRows cols={5} rows={3} />
            ) : users.length === 0 ? (
              <TableMessageRow cols={5}>
                <EmptyState icon={UserCog} title="Aucun utilisateur" />
              </TableMessageRow>
            ) : (
              users.map((u) => {
                const dirty = (phoneEdits[u.id] ?? "") !== (u.whatsappPhone ?? "");
                return (
                  <Tr key={u.id}>
                    <Td>
                      <p className="font-medium text-slate-800">
                        {u.name}
                        {u.id === currentUserId && <span className="ml-1.5 text-xs font-medium text-brand-600">(vous)</span>}
                      </p>
                      <p className="text-xs text-slate-500">{u.email}</p>
                    </Td>
                    <Td>
                      <Badge tone={u.role === "ADMIN" ? "violet" : u.role === "HR" ? "brand" : "neutral"}>
                        {u.role === "ADMIN" && <Shield className="h-3 w-3" />}
                        {roleLabel(u.role)}
                      </Badge>
                    </Td>
                    <Td>
                      <div className="flex max-w-xs gap-1.5">
                        <Input
                          type="tel"
                          inputMode="tel"
                          value={phoneEdits[u.id] ?? ""}
                          onChange={(e) => setPhoneEdits((prev) => ({ ...prev, [u.id]: e.target.value }))}
                          placeholder="237…"
                          className="h-9 min-w-0 flex-1"
                          aria-label={`Numéro WhatsApp de ${u.name}`}
                        />
                        <Button
                          variant={dirty ? "primary" : "ghost"}
                          size="icon-sm"
                          className="h-9 w-9"
                          disabled={!dirty}
                          loading={savingId === u.id}
                          onClick={() => void savePhone(u)}
                          title="Enregistrer le numéro"
                          aria-label={`Enregistrer le numéro de ${u.name}`}
                        >
                          {savingId === u.id ? null : <Save className="h-4 w-4" />}
                        </Button>
                      </div>
                    </Td>
                    <Td>
                      <Badge tone={u.active ? "success" : "danger"} dot>
                        {u.active ? "Actif" : "Inactif"}
                      </Badge>
                    </Td>
                    <Td align="right">
                      {u.id !== currentUserId && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => void toggleActive(u)}
                          className={u.active ? "hover:bg-red-50 hover:text-red-700" : "hover:bg-emerald-50 hover:text-emerald-700"}
                        >
                          {u.active ? "Désactiver" : "Réactiver"}
                        </Button>
                      )}
                    </Td>
                  </Tr>
                );
              })
            )}
          </tbody>
        </Table>
      </Card>

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        dismissible={!submitting}
        title="Nouvel utilisateur"
        description="Accès au tableau de bord RH."
        footer={
          <>
            <Button variant="secondary" onClick={() => setModalOpen(false)} disabled={submitting}>
              Annuler
            </Button>
            <Button type="submit" form="user-form" loading={submitting}>
              Créer le compte
            </Button>
          </>
        }
      >
        <form id="user-form" onSubmit={handleCreate} className="space-y-4">
          {formError && <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{formError}</div>}
          <Field label="Nom complet" required>
            {(id) => <Input id={id} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required autoComplete="off" />}
          </Field>
          <Field label="E-mail" required>
            {(id) => <Input id={id} type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required autoComplete="off" />}
          </Field>
          <Field label="Mot de passe initial" required hint="8 caractères minimum. À changer par l'utilisateur.">
            {(id) => (
              <div className="relative">
                <Input
                  id={id}
                  type={showPassword ? "text" : "password"}
                  value={form.password}
                  onChange={(e) => setForm({ ...form, password: e.target.value })}
                  required
                  minLength={8}
                  autoComplete="new-password"
                  className="pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
                  aria-label={showPassword ? "Masquer le mot de passe" : "Afficher le mot de passe"}
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            )}
          </Field>
          <Field label="Rôle" required hint={form.role === "DG" ? "Consultation : le DG ne modifie pas les paramètres." : undefined}>
            {(id) => (
              <Select id={id} value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value as typeof form.role })}>
                <option value="HR">Ressources humaines</option>
                <option value="ADMIN">Administrateur</option>
                <option value="DG">Direction générale</option>
              </Select>
            )}
          </Field>
          <Field label="WhatsApp (optionnel)" hint="Pour recevoir les alertes des demandes employé.">
            {(id) => <Input id={id} type="tel" inputMode="tel" value={form.whatsappPhone} onChange={(e) => setForm({ ...form, whatsappPhone: e.target.value })} placeholder="237690000000" />}
          </Field>
        </form>
      </Modal>
    </div>
  );
}
