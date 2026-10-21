"use client";

import { Suspense, useEffect, useState, useCallback } from "react";
import {
  Plus,
  Pencil,
  Trash2,
  MapPin,
  Clock,
  Calendar,
  Globe,
  Shield,
  RefreshCw,
  Link2,
  CheckCircle2,
  Bell,
  ExternalLink,
  Eye,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useUrlFilters } from "@/lib/use-url-filters";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Field, Input, Select } from "@/components/ui/Field";
import { Table, THead, Th, Tr, Td } from "@/components/ui/Table";
import { EmptyState, Skeleton } from "@/components/ui/EmptyState";
import { Modal } from "@/components/ui/Modal";
import { useToast } from "@/components/ui/Toaster";
import { useConfirm } from "@/components/ui/ConfirmDialog";
import NotificationsSettings from "./NotificationsSettings";

type Tab = "sites" | "schedules" | "holidays" | "notifications";

interface Site {
  id: string;
  name: string;
  centerLat: number;
  centerLng: number;
  radiusM: number;
  active: boolean;
}

interface Schedule {
  id: string;
  siteId: string;
  site: { name: string };
  startTime: string;
  endTime: string;
  closureTime: string;
  lateGraceMin: number;
}

interface Holiday {
  id: string;
  name: string;
  date: string;
  recurring: boolean;
}

const TABS: Tab[] = ["sites", "schedules", "holidays", "notifications"];

export default function SettingsPage() {
  return (
    <Suspense fallback={null}>
      <SettingsContent />
    </Suspense>
  );
}

function SettingsContent() {
  const toast = useToast();
  const confirm = useConfirm();
  const [filters, setFilters] = useUrlFilters({ tab: "sites" });
  const tab: Tab = TABS.includes(filters.tab as Tab) ? (filters.tab as Tab) : "sites";

  const [sites, setSites] = useState<Site[]>([]);
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [holidays, setHolidays] = useState<Holiday[]>([]);
  const [loading, setLoading] = useState(true);
  const [role, setRole] = useState("");
  const canEdit = role === "HR" || role === "ADMIN";

  const [siteModal, setSiteModal] = useState(false);
  const [editingSite, setEditingSite] = useState<Site | null>(null);
  const [siteForm, setSiteForm] = useState({ name: "", centerLat: "", centerLng: "", radiusM: "" });

  const [scheduleModal, setScheduleModal] = useState(false);
  const [editingSchedule, setEditingSchedule] = useState<Schedule | null>(null);
  const [scheduleForm, setScheduleForm] = useState({ siteId: "", startTime: "", endTime: "", closureTime: "", lateGraceMin: "0" });

  const [holidayModal, setHolidayModal] = useState(false);
  const [holidayForm, setHolidayForm] = useState({ name: "", date: "", recurring: false });

  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [mapsLink, setMapsLink] = useState("");
  const [mapsLinkStatus, setMapsLinkStatus] = useState<"idle" | "success" | "error" | "loading">("idle");

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/settings");
      const json = await res.json();
      const d = json.data ?? {};
      setSites(d.sites ?? []);
      setSchedules(d.schedules ?? []);
      setHolidays(d.holidays ?? []);
    } catch (e) {
      console.error(e);
      toast.error("Impossible de charger les paramètres.");
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  useEffect(() => {
    fetch("/api/me")
      .then((r) => r.json())
      .then((json) => setRole(json.role ?? ""))
      .catch(() => setRole(""));
  }, []);

  /** Enregistre via /api/settings ; renvoie true si l'API a accepté. */
  const save = async (method: "POST" | "PUT", body: unknown, successMessage: string): Promise<boolean> => {
    setSubmitting(true);
    setFormError(null);
    try {
      const res = await fetch("/api/settings", { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        setFormError(typeof json.error === "string" ? json.error : "Enregistrement impossible.");
        return false;
      }
      toast.success(successMessage);
      fetchAll();
      return true;
    } catch (e) {
      console.error(e);
      setFormError("Erreur réseau. Réessayez.");
      return false;
    } finally {
      setSubmitting(false);
    }
  };

  const parseGoogleMapsLink = (url: string): { lat: number; lng: number } | null => {
    // !3d...!4d... = coordonnées exactes du marqueur (prioritaire)
    const ftidMatch = url.match(/!3d(-?\d+\.?\d*)!4d(-?\d+\.?\d*)/);
    if (ftidMatch) return { lat: parseFloat(ftidMatch[1]), lng: parseFloat(ftidMatch[2]) };
    const atMatch = url.match(/@(-?\d+\.?\d*),(-?\d+\.?\d*)/);
    if (atMatch) return { lat: parseFloat(atMatch[1]), lng: parseFloat(atMatch[2]) };
    const qMatch = url.match(/[?&](?:q|ll|query)=(-?\d+\.?\d*),(-?\d+\.?\d*)/);
    if (qMatch) return { lat: parseFloat(qMatch[1]), lng: parseFloat(qMatch[2]) };
    const placeMatch = url.match(/place\/[^/]+\/(-?\d+\.?\d*),(-?\d+\.?\d*)/);
    if (placeMatch) return { lat: parseFloat(placeMatch[1]), lng: parseFloat(placeMatch[2]) };
    return null;
  };

  const isShortMapsLink = (url: string) => /goo\.gl|maps\.app/.test(url);

  const handleMapsLinkPaste = async (value: string) => {
    setMapsLink(value);
    if (!value.trim()) {
      setMapsLinkStatus("idle");
      return;
    }

    const localCoords = parseGoogleMapsLink(value);
    if (localCoords) {
      setSiteForm((prev) => ({ ...prev, centerLat: String(localCoords.lat), centerLng: String(localCoords.lng) }));
      setMapsLinkStatus("success");
      return;
    }

    if (isShortMapsLink(value)) {
      setMapsLinkStatus("loading");
      try {
        const res = await fetch("/api/settings/resolve-maps", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ url: value }),
        });
        const json = await res.json();
        if (res.ok && json.data) {
          setSiteForm((prev) => ({ ...prev, centerLat: String(json.data.lat), centerLng: String(json.data.lng) }));
          setMapsLinkStatus("success");
        } else {
          setMapsLinkStatus("error");
        }
      } catch {
        setMapsLinkStatus("error");
      }
      return;
    }

    setMapsLinkStatus("error");
  };

  // Site
  const openSiteCreate = () => {
    setEditingSite(null);
    setSiteForm({ name: "", centerLat: "", centerLng: "", radiusM: "100" });
    setMapsLink("");
    setMapsLinkStatus("idle");
    setFormError(null);
    setSiteModal(true);
  };
  const openSiteEdit = (site: Site) => {
    setEditingSite(site);
    setSiteForm({ name: site.name, centerLat: String(site.centerLat), centerLng: String(site.centerLng), radiusM: String(site.radiusM) });
    setMapsLink("");
    setMapsLinkStatus("idle");
    setFormError(null);
    setSiteModal(true);
  };
  const handleSiteSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const data = {
      name: siteForm.name,
      centerLat: parseFloat(siteForm.centerLat),
      centerLng: parseFloat(siteForm.centerLng),
      radiusM: parseInt(siteForm.radiusM),
    };
    const ok = editingSite
      ? await save("PUT", { type: "site", data: { id: editingSite.id, ...data } }, `Site « ${data.name} » mis à jour.`)
      : await save("POST", { type: "site", data }, `Site « ${data.name} » créé.`);
    if (ok) setSiteModal(false);
  };

  // Schedule
  const openScheduleCreate = () => {
    setEditingSchedule(null);
    setScheduleForm({ siteId: sites[0]?.id ?? "", startTime: "08:30", endTime: "17:30", closureTime: "18:00", lateGraceMin: "15" });
    setFormError(null);
    setScheduleModal(true);
  };
  const openScheduleEdit = (sch: Schedule) => {
    setEditingSchedule(sch);
    setScheduleForm({ siteId: sch.siteId, startTime: sch.startTime, endTime: sch.endTime, closureTime: sch.closureTime, lateGraceMin: String(sch.lateGraceMin) });
    setFormError(null);
    setScheduleModal(true);
  };
  const handleScheduleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (scheduleForm.endTime <= scheduleForm.startTime) {
      setFormError("L'heure de départ doit être après l'heure d'arrivée.");
      return;
    }
    const data = {
      siteId: scheduleForm.siteId,
      startTime: scheduleForm.startTime,
      endTime: scheduleForm.endTime,
      closureTime: scheduleForm.closureTime,
      lateGraceMin: parseInt(scheduleForm.lateGraceMin) || 0,
    };
    const ok = editingSchedule
      ? await save("PUT", { type: "schedule", data: { id: editingSchedule.id, ...data } }, "Horaire mis à jour.")
      : await save("POST", { type: "schedule", data }, "Horaire créé.");
    if (ok) setScheduleModal(false);
  };

  // Holiday
  const openHolidayCreate = () => {
    setHolidayForm({ name: "", date: "", recurring: false });
    setFormError(null);
    setHolidayModal(true);
  };
  const handleHolidaySubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const ok = await save("POST", { type: "holiday", data: holidayForm }, `Jour férié « ${holidayForm.name} » ajouté.`);
    if (ok) setHolidayModal(false);
  };
  const deleteHoliday = async (h: Holiday) => {
    const ok = await confirm({
      title: "Supprimer ce jour férié ?",
      message: `« ${h.name} » (${new Date(h.date).toLocaleDateString("fr-FR", { day: "numeric", month: "long" })}) sera de nouveau compté comme un jour ouvré : les absences pourront y être marquées.`,
      confirmLabel: "Supprimer",
    });
    if (!ok) return;
    try {
      const res = await fetch(`/api/settings?type=holiday&id=${h.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error();
      toast.success("Jour férié supprimé.");
      fetchAll();
    } catch {
      toast.error("La suppression a échoué.");
    }
  };

  const tabs: { key: Tab; label: string; icon: typeof MapPin; count?: number }[] = [
    { key: "sites", label: "Sites", icon: MapPin, count: sites.length },
    { key: "schedules", label: "Horaires", icon: Clock, count: schedules.length },
    { key: "holidays", label: "Jours fériés", icon: Calendar, count: holidays.length },
    { key: "notifications", label: "Alertes WhatsApp", icon: Bell },
  ];

  const sectionHeader = (title: string, description: string, action?: React.ReactNode) => (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <h2 className="text-base font-semibold text-slate-800">{title}</h2>
        <p className="text-sm text-slate-500">{description}</p>
      </div>
      {canEdit && action}
    </div>
  );

  const formErrorBox = formError ? (
    <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{formError}</div>
  ) : null;

  return (
    <div className="space-y-6">
      <PageHeader title="Paramètres" description="Sites de pointage, horaires de travail, jours fériés et alertes." />

      {role === "DG" && (
        <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-600 shadow-sm">
          <Eye className="h-4 w-4 text-slate-400" />
          Consultation seule : la modification des paramètres est réservée aux RH et administrateurs.
        </div>
      )}

      <Card className="overflow-hidden">
        <div className="border-b border-slate-200 px-2 sm:px-4">
          <nav className="-mb-px flex gap-1 overflow-x-auto" role="tablist" aria-label="Sections des paramètres">
            {tabs.map((t) => {
              const Icon = t.icon;
              const active = tab === t.key;
              return (
                <button
                  key={t.key}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  onClick={() => setFilters({ tab: t.key })}
                  className={cn(
                    "flex shrink-0 items-center gap-2 border-b-2 px-3 py-3.5 text-sm font-medium transition-colors sm:px-4",
                    active ? "border-brand-600 text-brand-700" : "border-transparent text-slate-500 hover:text-slate-700"
                  )}
                >
                  <Icon className="h-4 w-4" />
                  {t.label}
                  {t.count !== undefined && (
                    <span
                      className={cn(
                        "ml-0.5 inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1 text-[10px] font-semibold",
                        active ? "bg-brand-100 text-brand-700" : "bg-slate-100 text-slate-500"
                      )}
                    >
                      {t.count}
                    </span>
                  )}
                </button>
              );
            })}
          </nav>
        </div>

        <div className="p-5 sm:p-6" role="tabpanel">
          {loading && tab !== "notifications" ? (
            <div className="space-y-3">
              {[...Array(3)].map((_, i) => (
                <Skeleton key={i} className="h-16 rounded-xl" />
              ))}
            </div>
          ) : (
            <>
              {tab === "sites" && (
                <div className="space-y-4">
                  {sectionHeader(
                    "Sites de pointage",
                    "Zones GPS dans lesquelles le pointage est accepté.",
                    <Button onClick={openSiteCreate} icon={<Plus className="h-4 w-4" />}>
                      Ajouter un site
                    </Button>
                  )}
                  {sites.length === 0 ? (
                    <EmptyState
                      icon={MapPin}
                      title="Aucun site configuré"
                      description="Ajoutez un site avec ses coordonnées GPS pour activer le contrôle de zone."
                      action={
                        canEdit ? (
                          <Button onClick={openSiteCreate} icon={<Plus className="h-4 w-4" />}>
                            Ajouter un site
                          </Button>
                        ) : undefined
                      }
                    />
                  ) : (
                    <div className="grid gap-3 lg:grid-cols-2">
                      {sites.map((site) => (
                        <div key={site.id} className="rounded-xl border border-slate-200 p-4 transition-colors hover:border-slate-300">
                          <div className="flex items-start justify-between gap-3">
                            <div className="flex min-w-0 items-start gap-3">
                              <span
                                className={cn(
                                  "flex h-10 w-10 shrink-0 items-center justify-center rounded-xl",
                                  site.active ? "bg-emerald-50 text-emerald-600" : "bg-slate-100 text-slate-400"
                                )}
                              >
                                <MapPin className="h-5 w-5" />
                              </span>
                              <div className="min-w-0">
                                <div className="flex flex-wrap items-center gap-2">
                                  <p className="truncate font-semibold text-slate-800">{site.name}</p>
                                  <Badge tone={site.active ? "success" : "neutral"}>{site.active ? "Actif" : "Inactif"}</Badge>
                                </div>
                                <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-slate-500">
                                  <span className="flex items-center gap-1 tabular-nums">
                                    <Globe className="h-3.5 w-3.5" />
                                    {site.centerLat.toFixed(4)}, {site.centerLng.toFixed(4)}
                                  </span>
                                  <span className="flex items-center gap-1">
                                    <Shield className="h-3.5 w-3.5" />
                                    Rayon {site.radiusM} m
                                  </span>
                                  <a
                                    href={`https://www.google.com/maps?q=${site.centerLat},${site.centerLng}`}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="flex items-center gap-1 font-medium text-brand-600 hover:underline"
                                  >
                                    <ExternalLink className="h-3.5 w-3.5" />
                                    Voir sur la carte
                                  </a>
                                </div>
                              </div>
                            </div>
                            {canEdit && (
                              <Button variant="ghost" size="icon-sm" onClick={() => openSiteEdit(site)} title="Modifier" aria-label={`Modifier le site ${site.name}`}>
                                <Pencil className="h-4 w-4" />
                              </Button>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {tab === "schedules" && (
                <div className="space-y-4">
                  {sectionHeader(
                    "Horaires de travail",
                    "Heures d'arrivée et de départ, clôture automatique et tolérance de retard.",
                    <Button onClick={openScheduleCreate} disabled={sites.length === 0} icon={<Plus className="h-4 w-4" />}>
                      Ajouter un horaire
                    </Button>
                  )}
                  {schedules.length === 0 ? (
                    <EmptyState
                      icon={Clock}
                      title="Aucun horaire configuré"
                      description={sites.length === 0 ? "Créez d'abord un site, puis ses horaires." : "Définissez les horaires de travail de vos sites."}
                      action={
                        canEdit && sites.length > 0 ? (
                          <Button onClick={openScheduleCreate} icon={<Plus className="h-4 w-4" />}>
                            Ajouter un horaire
                          </Button>
                        ) : undefined
                      }
                    />
                  ) : (
                    <div className="grid gap-3">
                      {schedules.map((sch) => (
                        <div key={sch.id} className="rounded-xl border border-slate-200 p-4 transition-colors hover:border-slate-300">
                          <div className="flex items-start justify-between gap-3">
                            <div className="flex min-w-0 flex-1 items-start gap-3">
                              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-600">
                                <Clock className="h-5 w-5" />
                              </span>
                              <div className="min-w-0 flex-1">
                                <p className="font-semibold text-slate-800">{sch.site.name}</p>
                                <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
                                  <InfoChip label="Arrivée" value={sch.startTime} />
                                  <InfoChip label="Départ" value={sch.endTime} />
                                  <InfoChip label="Clôture auto" value={sch.closureTime} />
                                  <InfoChip label="Tolérance" value={`${sch.lateGraceMin} min`} highlight />
                                </div>
                              </div>
                            </div>
                            {canEdit && (
                              <Button variant="ghost" size="icon-sm" onClick={() => openScheduleEdit(sch)} title="Modifier" aria-label={`Modifier l'horaire de ${sch.site.name}`}>
                                <Pencil className="h-4 w-4" />
                              </Button>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {tab === "notifications" && <NotificationsSettings />}

              {tab === "holidays" && (
                <div className="space-y-4">
                  {sectionHeader(
                    "Jours fériés",
                    "Aucune absence n'est marquée ces jours-là.",
                    <Button onClick={openHolidayCreate} icon={<Plus className="h-4 w-4" />}>
                      Ajouter un jour férié
                    </Button>
                  )}
                  {holidays.length === 0 ? (
                    <EmptyState
                      icon={Calendar}
                      title="Aucun jour férié"
                      description="Ajoutez les jours fériés pour éviter les faux marquages d'absence."
                      action={
                        canEdit ? (
                          <Button onClick={openHolidayCreate} icon={<Plus className="h-4 w-4" />}>
                            Ajouter un jour férié
                          </Button>
                        ) : undefined
                      }
                    />
                  ) : (
                    <div className="overflow-hidden rounded-xl border border-slate-200">
                      <Table>
                        <THead>
                          <tr>
                            <Th>Nom</Th>
                            <Th>Date</Th>
                            <Th>Récurrence</Th>
                            {canEdit && (
                              <Th align="right">
                                <span className="sr-only">Actions</span>
                              </Th>
                            )}
                          </tr>
                        </THead>
                        <tbody>
                          {holidays.map((h) => (
                            <Tr key={h.id}>
                              <Td>
                                <div className="flex items-center gap-3">
                                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-violet-50 text-violet-600">
                                    <Calendar className="h-4 w-4" />
                                  </span>
                                  <span className="font-medium text-slate-800">{h.name}</span>
                                </div>
                              </Td>
                              <Td>{new Date(h.date).toLocaleDateString("fr-FR", { weekday: "short", day: "numeric", month: "long", year: h.recurring ? undefined : "numeric" })}</Td>
                              <Td>
                                {h.recurring ? (
                                  <Badge tone="brand">
                                    <RefreshCw className="h-3 w-3" />
                                    Chaque année
                                  </Badge>
                                ) : (
                                  <span className="text-xs text-slate-500">Une seule fois</span>
                                )}
                              </Td>
                              {canEdit && (
                                <Td align="right">
                                  <Button
                                    variant="ghost"
                                    size="icon-sm"
                                    onClick={() => void deleteHoliday(h)}
                                    className="hover:bg-red-50 hover:text-red-600"
                                    title="Supprimer"
                                    aria-label={`Supprimer ${h.name}`}
                                  >
                                    <Trash2 className="h-4 w-4" />
                                  </Button>
                                </Td>
                              )}
                            </Tr>
                          ))}
                        </tbody>
                      </Table>
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      </Card>

      {/* Site */}
      <Modal
        open={siteModal}
        onClose={() => setSiteModal(false)}
        dismissible={!submitting}
        title={editingSite ? "Modifier le site" : "Nouveau site"}
        description="Zone GPS dans laquelle le pointage est accepté."
        footer={
          <>
            <Button variant="secondary" onClick={() => setSiteModal(false)} disabled={submitting}>
              Annuler
            </Button>
            <Button type="submit" form="site-form" loading={submitting}>
              {editingSite ? "Enregistrer" : "Créer le site"}
            </Button>
          </>
        }
      >
        <form id="site-form" onSubmit={handleSiteSubmit} className="space-y-4">
          {formErrorBox}
          <Field label="Nom du site" required>
            {(id) => (
              <Input id={id} value={siteForm.name} onChange={(e) => setSiteForm({ ...siteForm, name: e.target.value })} required placeholder="Ex. : Bureau Douala, Usine…" />
            )}
          </Field>

          <div
            className={cn(
              "space-y-2 rounded-xl border p-4",
              mapsLinkStatus === "success"
                ? "border-emerald-300 bg-emerald-50/50"
                : mapsLinkStatus === "error"
                  ? "border-red-300 bg-red-50/50"
                  : mapsLinkStatus === "loading"
                    ? "border-brand-300 bg-brand-50/50"
                    : "border-slate-200 bg-slate-50"
            )}
          >
            <label htmlFor="maps-link" className="flex items-center gap-2 text-sm font-medium text-slate-700">
              <Link2 className="h-4 w-4 text-slate-400" />
              Lien Google Maps
              <span className="text-xs font-normal text-slate-500">(optionnel, liens courts acceptés)</span>
            </label>
            <Input
              id="maps-link"
              value={mapsLink}
              onChange={(e) => void handleMapsLinkPaste(e.target.value)}
              placeholder="Collez un lien (ex. maps.app.goo.gl/…)"
              disabled={mapsLinkStatus === "loading"}
            />
            {mapsLinkStatus === "loading" && (
              <p className="flex items-center gap-1 text-xs text-brand-700">
                <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                Lecture du lien…
              </p>
            )}
            {mapsLinkStatus === "success" && (
              <p className="flex items-center gap-1 text-xs text-emerald-700">
                <CheckCircle2 className="h-3.5 w-3.5" />
                Coordonnées extraites : {siteForm.centerLat}, {siteForm.centerLng}
              </p>
            )}
            {mapsLinkStatus === "error" && (
              <p className="text-xs text-red-600">Impossible d&apos;extraire les coordonnées. Vérifiez le lien ou saisissez-les ci-dessous.</p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <Field label="Latitude" required>
              {(id) => (
                <Input id={id} type="number" step="any" value={siteForm.centerLat} onChange={(e) => setSiteForm({ ...siteForm, centerLat: e.target.value })} required placeholder="4.0511" />
              )}
            </Field>
            <Field label="Longitude" required>
              {(id) => (
                <Input id={id} type="number" step="any" value={siteForm.centerLng} onChange={(e) => setSiteForm({ ...siteForm, centerLng: e.target.value })} required placeholder="9.7679" />
              )}
            </Field>
          </div>
          <Field label="Rayon de la zone (mètres)" required hint={`Les employés devront être à moins de ${siteForm.radiusM || "…"} m du site pour pointer.`}>
            {(id) => <Input id={id} type="number" min={10} value={siteForm.radiusM} onChange={(e) => setSiteForm({ ...siteForm, radiusM: e.target.value })} required />}
          </Field>
        </form>
      </Modal>

      {/* Horaire */}
      <Modal
        open={scheduleModal}
        onClose={() => setScheduleModal(false)}
        dismissible={!submitting}
        title={editingSchedule ? "Modifier l'horaire" : "Nouvel horaire"}
        description="Heures de travail et tolérance de retard."
        footer={
          <>
            <Button variant="secondary" onClick={() => setScheduleModal(false)} disabled={submitting}>
              Annuler
            </Button>
            <Button type="submit" form="schedule-form" loading={submitting}>
              {editingSchedule ? "Enregistrer" : "Créer l'horaire"}
            </Button>
          </>
        }
      >
        <form id="schedule-form" onSubmit={handleScheduleSubmit} className="space-y-4">
          {formErrorBox}
          <Field label="Site" required>
            {(id) => (
              <Select id={id} value={scheduleForm.siteId} onChange={(e) => setScheduleForm({ ...scheduleForm, siteId: e.target.value })} required>
                <option value="">Sélectionner un site</option>
                {sites.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <Field label="Arrivée" required>
              {(id) => <Input id={id} type="time" value={scheduleForm.startTime} onChange={(e) => setScheduleForm({ ...scheduleForm, startTime: e.target.value })} required />}
            </Field>
            <Field label="Départ" required>
              {(id) => <Input id={id} type="time" value={scheduleForm.endTime} onChange={(e) => setScheduleForm({ ...scheduleForm, endTime: e.target.value })} required />}
            </Field>
            <Field label="Clôture auto" required hint="Départ automatique si non pointé">
              {(id) => <Input id={id} type="time" value={scheduleForm.closureTime} onChange={(e) => setScheduleForm({ ...scheduleForm, closureTime: e.target.value })} required />}
            </Field>
          </div>
          <Field
            label="Tolérance de retard (minutes)"
            hint={`Une arrivée dans les ${scheduleForm.lateGraceMin || "0"} premières minutes est comptée « À l'heure ».`}
          >
            {(id) => <Input id={id} type="number" min={0} value={scheduleForm.lateGraceMin} onChange={(e) => setScheduleForm({ ...scheduleForm, lateGraceMin: e.target.value })} />}
          </Field>
        </form>
      </Modal>

      {/* Jour férié */}
      <Modal
        open={holidayModal}
        onClose={() => setHolidayModal(false)}
        dismissible={!submitting}
        title="Nouveau jour férié"
        description="Ce jour sera exclu du calcul des absences."
        footer={
          <>
            <Button variant="secondary" onClick={() => setHolidayModal(false)} disabled={submitting}>
              Annuler
            </Button>
            <Button type="submit" form="holiday-form" loading={submitting}>
              Ajouter
            </Button>
          </>
        }
      >
        <form id="holiday-form" onSubmit={handleHolidaySubmit} className="space-y-4">
          {formErrorBox}
          <Field label="Nom" required>
            {(id) => <Input id={id} value={holidayForm.name} onChange={(e) => setHolidayForm({ ...holidayForm, name: e.target.value })} required placeholder="Ex. : Fête nationale, Noël…" />}
          </Field>
          <Field label="Date" required>
            {(id) => <Input id={id} type="date" value={holidayForm.date} onChange={(e) => setHolidayForm({ ...holidayForm, date: e.target.value })} required />}
          </Field>
          <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-slate-200 bg-slate-50 p-3">
            <input
              type="checkbox"
              checked={holidayForm.recurring}
              onChange={(e) => setHolidayForm({ ...holidayForm, recurring: e.target.checked })}
              className="mt-0.5 h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500"
            />
            <span>
              <span className="block text-sm font-medium text-slate-700">Récurrent chaque année</span>
              <span className="block text-xs text-slate-500">Appliqué automatiquement à la même date chaque année.</span>
            </span>
          </label>
        </form>
      </Modal>
    </div>
  );
}

function InfoChip({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className={cn("rounded-lg px-3 py-2 text-center", highlight ? "border border-amber-200 bg-amber-50" : "bg-slate-50")}>
      <p className="text-[10px] font-medium uppercase tracking-wider text-slate-500">{label}</p>
      <p className={cn("text-sm font-semibold tabular-nums", highlight ? "text-amber-700" : "text-slate-800")}>{value}</p>
    </div>
  );
}
