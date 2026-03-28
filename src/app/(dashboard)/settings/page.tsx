"use client";

import { useEffect, useState, useCallback } from "react";
import {
  Plus,
  Pencil,
  Trash2,
  X,
  MapPin,
  Clock,
  Calendar,
  Globe,
  Shield,
  RefreshCw,
  Link2,
  CheckCircle2,
} from "lucide-react";
import { cn } from "@/lib/utils";

type Tab = "sites" | "schedules" | "holidays";

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

export default function SettingsPage() {
  const [tab, setTab] = useState<Tab>("sites");
  const [sites, setSites] = useState<Site[]>([]);
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [holidays, setHolidays] = useState<Holiday[]>([]);
  const [loading, setLoading] = useState(true);

  const [siteModal, setSiteModal] = useState(false);
  const [editingSite, setEditingSite] = useState<Site | null>(null);
  const [siteForm, setSiteForm] = useState({ name: "", centerLat: "", centerLng: "", radiusM: "" });

  const [scheduleModal, setScheduleModal] = useState(false);
  const [editingSchedule, setEditingSchedule] = useState<Schedule | null>(null);
  const [scheduleForm, setScheduleForm] = useState({ siteId: "", startTime: "", endTime: "", closureTime: "", lateGraceMin: "0" });

  const [holidayModal, setHolidayModal] = useState(false);
  const [holidayForm, setHolidayForm] = useState({ name: "", date: "", recurring: false });

  const [submitting, setSubmitting] = useState(false);
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
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

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
    if (!value.trim()) { setMapsLinkStatus("idle"); return; }

    const localCoords = parseGoogleMapsLink(value);
    if (localCoords) {
      setSiteForm((prev) => ({ ...prev, centerLat: String(localCoords.lat), centerLng: String(localCoords.lng) }));
      setMapsLinkStatus("success");
      return;
    }

    if (isShortMapsLink(value)) {
      setMapsLinkStatus("loading" as typeof mapsLinkStatus);
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
    setSiteModal(true);
  };
  const openSiteEdit = (site: Site) => {
    setEditingSite(site);
    setSiteForm({ name: site.name, centerLat: String(site.centerLat), centerLng: String(site.centerLng), radiusM: String(site.radiusM) });
    setMapsLink("");
    setMapsLinkStatus("idle");
    setSiteModal(true);
  };
  const handleSiteSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    const data = { name: siteForm.name, centerLat: parseFloat(siteForm.centerLat), centerLng: parseFloat(siteForm.centerLng), radiusM: parseInt(siteForm.radiusM) };
    try {
      if (editingSite) {
        await fetch("/api/settings", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ type: "site", data: { id: editingSite.id, ...data } }) });
      } else {
        await fetch("/api/settings", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ type: "site", data }) });
      }
      setSiteModal(false);
      fetchAll();
    } catch (e) { console.error(e); } finally { setSubmitting(false); }
  };

  // Schedule
  const openScheduleCreate = () => {
    setEditingSchedule(null);
    setScheduleForm({ siteId: sites[0]?.id ?? "", startTime: "08:00", endTime: "17:30", closureTime: "18:00", lateGraceMin: "30" });
    setScheduleModal(true);
  };
  const openScheduleEdit = (sch: Schedule) => {
    setEditingSchedule(sch);
    setScheduleForm({ siteId: sch.siteId, startTime: sch.startTime, endTime: sch.endTime, closureTime: sch.closureTime, lateGraceMin: String(sch.lateGraceMin) });
    setScheduleModal(true);
  };
  const handleScheduleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    const data = { siteId: scheduleForm.siteId, startTime: scheduleForm.startTime, endTime: scheduleForm.endTime, closureTime: scheduleForm.closureTime, lateGraceMin: parseInt(scheduleForm.lateGraceMin) };
    try {
      if (editingSchedule) {
        await fetch("/api/settings", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ type: "schedule", data: { id: editingSchedule.id, ...data } }) });
      } else {
        await fetch("/api/settings", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ type: "schedule", data }) });
      }
      setScheduleModal(false);
      fetchAll();
    } catch (e) { console.error(e); } finally { setSubmitting(false); }
  };

  // Holiday
  const openHolidayCreate = () => {
    setHolidayForm({ name: "", date: "", recurring: false });
    setHolidayModal(true);
  };
  const handleHolidaySubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      await fetch("/api/settings", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ type: "holiday", data: holidayForm }) });
      setHolidayModal(false);
      fetchAll();
    } catch (e) { console.error(e); } finally { setSubmitting(false); }
  };
  const deleteHoliday = async (id: string) => {
    try {
      await fetch(`/api/settings?type=holiday&id=${id}`, { method: "DELETE" });
      fetchAll();
    } catch (e) { console.error(e); }
  };

  const tabs: { key: Tab; label: string; icon: typeof MapPin; count: number }[] = [
    { key: "sites", label: "Sites", icon: MapPin, count: sites.length },
    { key: "schedules", label: "Horaires", icon: Clock, count: schedules.length },
    { key: "holidays", label: "Jours fériés", icon: Calendar, count: holidays.length },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-slate-900">Paramètres</h1>
        <p className="mt-1 text-sm text-slate-500">
          Configuration des sites, horaires de travail et jours fériés
        </p>
      </div>

      {/* Main card */}
      <div className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
        {/* Tabs */}
        <div className="border-b border-slate-200 px-6">
          <nav className="flex gap-1">
            {tabs.map((t) => {
              const Icon = t.icon;
              return (
                <button
                  key={t.key}
                  onClick={() => setTab(t.key)}
                  className={cn(
                    "flex items-center gap-2 px-4 py-3.5 text-sm font-medium border-b-2 transition-colors",
                    tab === t.key
                      ? "border-blue-600 text-blue-600"
                      : "border-transparent text-slate-500 hover:text-slate-700"
                  )}
                >
                  <Icon className="w-4 h-4" />
                  {t.label}
                  <span className={cn(
                    "ml-1 inline-flex items-center justify-center w-5 h-5 rounded-full text-[10px] font-semibold",
                    tab === t.key ? "bg-blue-100 text-blue-600" : "bg-slate-100 text-slate-500"
                  )}>
                    {t.count}
                  </span>
                </button>
              );
            })}
          </nav>
        </div>

        <div className="p-6">
          {loading ? (
            <div className="space-y-3">
              {[...Array(3)].map((_, i) => (
                <div key={i} className="h-16 bg-slate-100 rounded-xl animate-pulse" />
              ))}
            </div>
          ) : (
            <>
              {/* ========== SITES ========== */}
              {tab === "sites" && (
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <h2 className="text-base font-semibold text-slate-800">Sites de pointage</h2>
                      <p className="text-sm text-slate-500">Définissez les zones GPS autorisées pour le pointage</p>
                    </div>
                    <button onClick={openSiteCreate} className="inline-flex items-center gap-2 px-4 py-2.5 bg-blue-600 text-white rounded-xl hover:bg-blue-700 transition-colors text-sm font-medium shadow-sm">
                      <Plus className="w-4 h-4" />
                      Ajouter un site
                    </button>
                  </div>

                  {sites.length === 0 ? (
                    <EmptyState
                      icon={MapPin}
                      title="Aucun site configuré"
                      description="Ajoutez un site avec ses coordonnées GPS pour activer le géofencing."
                      actionLabel="Ajouter un site"
                      onAction={openSiteCreate}
                    />
                  ) : (
                    <div className="grid gap-4">
                      {sites.map((site) => (
                        <div key={site.id} className="rounded-xl border border-slate-200 p-4 hover:border-slate-300 transition-colors">
                          <div className="flex items-start justify-between">
                            <div className="flex items-start gap-3">
                              <div className={cn(
                                "h-10 w-10 rounded-xl flex items-center justify-center shrink-0",
                                site.active ? "bg-emerald-50 text-emerald-600" : "bg-slate-100 text-slate-400"
                              )}>
                                <MapPin className="h-5 w-5" />
                              </div>
                              <div>
                                <div className="flex items-center gap-2">
                                  <p className="font-semibold text-slate-800">{site.name}</p>
                                  <span className={cn(
                                    "inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium",
                                    site.active ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-500"
                                  )}>
                                    {site.active ? "Actif" : "Inactif"}
                                  </span>
                                </div>
                                <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-slate-500">
                                  <span className="flex items-center gap-1">
                                    <Globe className="w-3.5 h-3.5" />
                                    {site.centerLat.toFixed(4)}, {site.centerLng.toFixed(4)}
                                  </span>
                                  <span className="flex items-center gap-1">
                                    <Shield className="w-3.5 h-3.5" />
                                    Zone : {site.radiusM}m
                                  </span>
                                </div>
                              </div>
                            </div>
                            <button
                              onClick={() => openSiteEdit(site)}
                              className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-xl transition-colors"
                              title="Modifier"
                            >
                              <Pencil className="w-4 h-4" />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* ========== SCHEDULES ========== */}
              {tab === "schedules" && (
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <h2 className="text-base font-semibold text-slate-800">Horaires de travail</h2>
                      <p className="text-sm text-slate-500">Configurez les heures d&apos;arrivée, de départ et la tolérance retard</p>
                    </div>
                    <button onClick={openScheduleCreate} className="inline-flex items-center gap-2 px-4 py-2.5 bg-blue-600 text-white rounded-xl hover:bg-blue-700 transition-colors text-sm font-medium shadow-sm">
                      <Plus className="w-4 h-4" />
                      Ajouter un horaire
                    </button>
                  </div>

                  {schedules.length === 0 ? (
                    <EmptyState
                      icon={Clock}
                      title="Aucun horaire configuré"
                      description="Définissez les horaires de travail pour vos sites de pointage."
                      actionLabel="Ajouter un horaire"
                      onAction={openScheduleCreate}
                    />
                  ) : (
                    <div className="grid gap-4">
                      {schedules.map((sch) => (
                        <div key={sch.id} className="rounded-xl border border-slate-200 p-4 hover:border-slate-300 transition-colors">
                          <div className="flex items-start justify-between">
                            <div className="flex items-start gap-3">
                              <div className="h-10 w-10 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center shrink-0">
                                <Clock className="h-5 w-5" />
                              </div>
                              <div>
                                <p className="font-semibold text-slate-800">{sch.site.name}</p>
                                <div className="mt-2 grid grid-cols-2 sm:grid-cols-4 gap-3">
                                  <InfoChip label="Arrivée" value={sch.startTime} />
                                  <InfoChip label="Départ" value={sch.endTime} />
                                  <InfoChip label="Clôture auto" value={sch.closureTime} />
                                  <InfoChip label="Tolérance" value={`${sch.lateGraceMin} min`} highlight />
                                </div>
                              </div>
                            </div>
                            <button
                              onClick={() => openScheduleEdit(sch)}
                              className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-xl transition-colors"
                              title="Modifier"
                            >
                              <Pencil className="w-4 h-4" />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* ========== HOLIDAYS ========== */}
              {tab === "holidays" && (
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <h2 className="text-base font-semibold text-slate-800">Jours fériés</h2>
                      <p className="text-sm text-slate-500">Les employés ne seront pas marqués absents ces jours-là</p>
                    </div>
                    <button onClick={openHolidayCreate} className="inline-flex items-center gap-2 px-4 py-2.5 bg-blue-600 text-white rounded-xl hover:bg-blue-700 transition-colors text-sm font-medium shadow-sm">
                      <Plus className="w-4 h-4" />
                      Ajouter un jour férié
                    </button>
                  </div>

                  {holidays.length === 0 ? (
                    <EmptyState
                      icon={Calendar}
                      title="Aucun jour férié"
                      description="Ajoutez les jours fériés pour éviter les faux marquages d'absence."
                      actionLabel="Ajouter un jour férié"
                      onAction={openHolidayCreate}
                    />
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b border-slate-100">
                            <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">Nom</th>
                            <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">Date</th>
                            <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">Récurrence</th>
                            <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-slate-500">Actions</th>
                          </tr>
                        </thead>
                        <tbody>
                          {holidays.map((h) => (
                            <tr key={h.id} className="border-b border-slate-50 hover:bg-slate-50/50 transition-colors">
                              <td className="px-4 py-3">
                                <div className="flex items-center gap-3">
                                  <div className="h-8 w-8 rounded-lg bg-violet-50 text-violet-600 flex items-center justify-center shrink-0">
                                    <Calendar className="h-4 w-4" />
                                  </div>
                                  <span className="font-medium text-slate-800">{h.name}</span>
                                </div>
                              </td>
                              <td className="px-4 py-3 text-slate-700">
                                {new Date(h.date).toLocaleDateString("fr-FR", { weekday: "short", day: "numeric", month: "long" })}
                              </td>
                              <td className="px-4 py-3">
                                {h.recurring ? (
                                  <span className="inline-flex items-center gap-1 rounded-full bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-700">
                                    <RefreshCw className="w-3 h-3" />
                                    Chaque année
                                  </span>
                                ) : (
                                  <span className="text-xs text-slate-400">Unique</span>
                                )}
                              </td>
                              <td className="px-4 py-3 text-right">
                                <button
                                  onClick={() => deleteHoliday(h.id)}
                                  className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-xl transition-colors"
                                  title="Supprimer"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* ===== Site Modal ===== */}
      {siteModal && (
        <Modal title={editingSite ? "Modifier le site" : "Nouveau site"} subtitle="Configurez la zone GPS autorisée pour le pointage" onClose={() => setSiteModal(false)}>
          <form onSubmit={handleSiteSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Nom du site</label>
              <input value={siteForm.name} onChange={(e) => setSiteForm({ ...siteForm, name: e.target.value })} required placeholder="Ex : Bureau Douala, Agence Yaoundé…" className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white placeholder:text-slate-400" />
            </div>

            {/* Google Maps link */}
            <div className={cn(
              "rounded-xl border p-4 space-y-2",
              mapsLinkStatus === "success" ? "border-emerald-300 bg-emerald-50/50" : mapsLinkStatus === "error" ? "border-red-300 bg-red-50/50" : mapsLinkStatus === "loading" ? "border-blue-300 bg-blue-50/50" : "border-slate-200 bg-slate-50"
            )}>
              <label className="flex items-center gap-2 text-sm font-medium text-slate-700">
                <Link2 className="w-4 h-4 text-slate-400" />
                Lien Google Maps
                <span className="text-xs font-normal text-slate-400">(optionnel — liens courts supportés)</span>
              </label>
              <input
                value={mapsLink}
                onChange={(e) => handleMapsLinkPaste(e.target.value)}
                placeholder="Collez un lien Google Maps (ex: maps.app.goo.gl/...)"
                className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white placeholder:text-slate-400"
                disabled={mapsLinkStatus === "loading"}
              />
              {mapsLinkStatus === "loading" && (
                <p className="text-xs text-blue-600 flex items-center gap-1">
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  Résolution du lien en cours…
                </p>
              )}
              {mapsLinkStatus === "success" && (
                <p className="text-xs text-emerald-600 flex items-center gap-1">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  Coordonnées extraites : {siteForm.centerLat}, {siteForm.centerLng}
                </p>
              )}
              {mapsLinkStatus === "error" && (
                <p className="text-xs text-red-600">
                  Impossible d&apos;extraire les coordonnées. Vérifiez le lien ou saisissez manuellement.
                </p>
              )}
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Latitude</label>
                <input type="number" step="any" value={siteForm.centerLat} onChange={(e) => setSiteForm({ ...siteForm, centerLat: e.target.value })} required placeholder="Ex : 4.0511" className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white placeholder:text-slate-400" />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Longitude</label>
                <input type="number" step="any" value={siteForm.centerLng} onChange={(e) => setSiteForm({ ...siteForm, centerLng: e.target.value })} required placeholder="Ex : 9.7679" className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white placeholder:text-slate-400" />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Rayon de la zone (mètres)</label>
              <input type="number" value={siteForm.radiusM} onChange={(e) => setSiteForm({ ...siteForm, radiusM: e.target.value })} required className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white" />
              <p className="mt-1 text-xs text-slate-500">
                Les employés devront être à moins de {siteForm.radiusM || "…"} mètres du site pour pointer
              </p>
            </div>
            <ModalActions onCancel={() => setSiteModal(false)} submitting={submitting} label={editingSite ? "Modifier" : "Créer"} />
          </form>
        </Modal>
      )}

      {/* ===== Schedule Modal ===== */}
      {scheduleModal && (
        <Modal title={editingSchedule ? "Modifier l'horaire" : "Nouvel horaire"} subtitle="Définissez les heures de travail et la tolérance retard" onClose={() => setScheduleModal(false)}>
          <form onSubmit={handleScheduleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Site</label>
              <select value={scheduleForm.siteId} onChange={(e) => setScheduleForm({ ...scheduleForm, siteId: e.target.value })} required className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white">
                <option value="">Sélectionner un site</option>
                {sites.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Heure arrivée</label>
                <input type="time" value={scheduleForm.startTime} onChange={(e) => setScheduleForm({ ...scheduleForm, startTime: e.target.value })} required className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white" />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Heure départ</label>
                <input type="time" value={scheduleForm.endTime} onChange={(e) => setScheduleForm({ ...scheduleForm, endTime: e.target.value })} required className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white" />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Clôture auto</label>
                <input type="time" value={scheduleForm.closureTime} onChange={(e) => setScheduleForm({ ...scheduleForm, closureTime: e.target.value })} required className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white" />
                <p className="mt-1 text-xs text-slate-500">Heure de checkout automatique</p>
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Tolérance retard (minutes)</label>
              <input type="number" value={scheduleForm.lateGraceMin} onChange={(e) => setScheduleForm({ ...scheduleForm, lateGraceMin: e.target.value })} className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white" />
              <p className="mt-1 text-xs text-slate-500">
                Un employé arrivant dans les {scheduleForm.lateGraceMin || "0"} premières minutes sera marqué « À l&apos;heure »
              </p>
            </div>
            <ModalActions onCancel={() => setScheduleModal(false)} submitting={submitting} label={editingSchedule ? "Modifier" : "Créer"} />
          </form>
        </Modal>
      )}

      {/* ===== Holiday Modal ===== */}
      {holidayModal && (
        <Modal title="Nouveau jour férié" subtitle="Ce jour sera exclu du calcul des absences" onClose={() => setHolidayModal(false)}>
          <form onSubmit={handleHolidaySubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Nom</label>
              <input value={holidayForm.name} onChange={(e) => setHolidayForm({ ...holidayForm, name: e.target.value })} required placeholder="Ex : Fête nationale, Noël…" className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white placeholder:text-slate-400" />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Date</label>
              <input type="date" value={holidayForm.date} onChange={(e) => setHolidayForm({ ...holidayForm, date: e.target.value })} required className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white" />
            </div>
            <div className="flex items-center gap-3 p-3 rounded-xl bg-slate-50 border border-slate-200">
              <input type="checkbox" id="recurring" checked={holidayForm.recurring} onChange={(e) => setHolidayForm({ ...holidayForm, recurring: e.target.checked })} className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500" />
              <div>
                <label htmlFor="recurring" className="text-sm font-medium text-slate-700 cursor-pointer">Récurrent chaque année</label>
                <p className="text-xs text-slate-500">Ce jour férié sera automatiquement appliqué chaque année</p>
              </div>
            </div>
            <ModalActions onCancel={() => setHolidayModal(false)} submitting={submitting} label="Créer" />
          </form>
        </Modal>
      )}
    </div>
  );
}

function Modal({ title, subtitle, onClose, children }: { title: string; subtitle: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="fixed inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-xl w-full max-w-lg p-6 z-10">
        <div className="flex items-start justify-between mb-6">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">{title}</h2>
            <p className="text-sm text-slate-500">{subtitle}</p>
          </div>
          <button onClick={onClose} className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-xl transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

function ModalActions({ onCancel, submitting, label }: { onCancel: () => void; submitting: boolean; label: string }) {
  return (
    <div className="flex justify-end gap-3 pt-2">
      <button type="button" onClick={onCancel} className="px-4 py-2.5 text-sm font-medium text-slate-600 hover:bg-slate-100 rounded-xl transition-colors">Annuler</button>
      <button type="submit" disabled={submitting} className="px-4 py-2.5 text-sm font-medium bg-blue-600 text-white rounded-xl hover:bg-blue-700 disabled:opacity-50 transition-colors">
        {submitting ? "Enregistrement…" : label}
      </button>
    </div>
  );
}

function EmptyState({ icon: Icon, title, description, actionLabel, onAction }: { icon: React.ComponentType<{ className?: string }>; title: string; description: string; actionLabel: string; onAction: () => void }) {
  return (
    <div className="text-center py-12">
      <div className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-100 mb-4">
        <Icon className="h-6 w-6 text-slate-400" />
      </div>
      <p className="text-base font-semibold text-slate-700">{title}</p>
      <p className="mt-1 text-sm text-slate-500">{description}</p>
      <button onClick={onAction} className="mt-4 inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-xl text-sm font-medium hover:bg-blue-700 transition-colors">
        <Plus className="w-4 h-4" />
        {actionLabel}
      </button>
    </div>
  );
}

function InfoChip({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className={cn(
      "rounded-lg px-3 py-2 text-center",
      highlight ? "bg-amber-50 border border-amber-200" : "bg-slate-50"
    )}>
      <p className="text-[10px] uppercase tracking-wider text-slate-500 font-medium">{label}</p>
      <p className={cn("text-sm font-semibold", highlight ? "text-amber-700" : "text-slate-800")}>{value}</p>
    </div>
  );
}
