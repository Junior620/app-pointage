"use client";

import { useEffect, useState, useCallback } from "react";
import {
  Plus,
  Search,
  Eye,
  Pencil,
  Ban,
  Trash2,
  ChevronLeft,
  ChevronRight,
  X,
  Users,
  UserCheck,
  UserX,
  Smartphone,
  CheckCircle2,
  XCircle,
  Download,
} from "lucide-react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { z } from "zod";

interface Employee {
  id: string;
  matricule: string;
  firstName: string;
  lastName: string;
  service: string;
  whatsappPhone: string | null;
  active: boolean;
  siteId?: string | null;
  site?: { id: string; name: string } | null;
}

const employeeSchema = z.object({
  matricule: z.string().min(1, "Le matricule est requis"),
  firstName: z.string().min(1, "Le prénom est requis"),
  lastName: z.string().min(1, "Le nom est requis"),
  service: z.string().min(1, "Le service est requis"),
  whatsappPhone: z.string().optional(),
  siteId: z.string().optional(),
});

type EmployeeForm = z.infer<typeof employeeSchema>;

export default function EmployeesPage() {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [serviceFilter, setServiceFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "inactive">("all");
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<EmployeeForm>({
    matricule: "",
    firstName: "",
    lastName: "",
    service: "",
    whatsappPhone: "",
    siteId: "",
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [services, setServices] = useState<string[]>([]);
  const [sites, setSites] = useState<{ id: string; name: string }[]>([]);
  const [userRole, setUserRole] = useState<string>("");
  const [employeeToDelete, setEmployeeToDelete] = useState<Employee | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [deleteSuccess, setDeleteSuccess] = useState(false);
  const perPage = 15;

  const fetchEmployees = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams({
      page: String(page),
      limit: String(perPage),
      ...(search && { q: search }),
      ...(serviceFilter && { service: serviceFilter }),
      ...(statusFilter !== "all" && { active: statusFilter === "active" ? "true" : "false" }),
    });
    try {
      const res = await fetch(`/api/employees?${params}`);
      const json = await res.json();
      setEmployees(json.data ?? []);
      setTotal(json.pagination?.total ?? json.total ?? 0);
      if (json.services) setServices(json.services);
      // Extract unique services from results if API doesn't return them separately
      if (!json.services && json.data) {
        const svcSet = new Set<string>();
        (json.data as Employee[]).forEach((e) => svcSet.add(e.service));
        setServices((prev) => {
          const combined = new Set([...prev, ...svcSet]);
          return Array.from(combined).sort();
        });
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [page, search, serviceFilter, statusFilter]);

  useEffect(() => {
    fetchEmployees();
  }, [fetchEmployees]);

  useEffect(() => {
    fetch("/api/settings")
      .then((r) => r.json())
      .then((json) => setSites(json.data?.sites ?? []))
      .catch(() => setSites([]));
  }, []);

  useEffect(() => {
    fetch("/api/me")
      .then((r) => r.json())
      .then((json) => setUserRole(json.role ?? ""))
      .catch(() => setUserRole(""));
  }, []);

  const totalPages = Math.ceil(total / perPage);

  // KPI calculations
  const totalEmployees = total;
  const activeCount = employees.filter((e) => e.active).length;
  const inactiveCount = employees.filter((e) => !e.active).length;
  const whatsappCount = employees.filter((e) => e.whatsappPhone).length;

  const openCreate = () => {
    setEditingId(null);
    setForm({ matricule: "", firstName: "", lastName: "", service: "", whatsappPhone: "", siteId: "" });
    setErrors({});
    setModalOpen(true);
  };

  const openEdit = (emp: Employee) => {
    setEditingId(emp.id);
    setForm({
      matricule: emp.matricule,
      firstName: emp.firstName,
      lastName: emp.lastName,
      service: emp.service,
      whatsappPhone: emp.whatsappPhone ?? "",
      siteId: emp.siteId ?? emp.site?.id ?? "",
    });
    setErrors({});
    setModalOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const result = employeeSchema.safeParse(form);
    if (!result.success) {
      const fieldErrors: Record<string, string> = {};
      result.error.issues.forEach((i) => {
        if (i.path[0]) fieldErrors[String(i.path[0])] = i.message;
      });
      setErrors(fieldErrors);
      return;
    }
    setSubmitting(true);
    try {
      const url = editingId ? `/api/employees/${editingId}` : "/api/employees";
      const method = editingId ? "PUT" : "POST";
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(result.data),
      });
      if (res.ok) {
        setModalOpen(false);
        fetchEmployees();
      }
    } catch (e) {
      console.error(e);
    } finally {
      setSubmitting(false);
    }
  };

  const toggleActive = async (id: string, active: boolean) => {
    await fetch(`/api/employees/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ active: !active }),
    });
    fetchEmployees();
  };

  const handleConfirmDelete = async () => {
    if (!employeeToDelete) return;
    const idToDelete = employeeToDelete.id;
    setDeleting(true);
    setDeleteError(null);
    try {
      const res = await fetch(`/api/employees/${idToDelete}`, {
        method: "DELETE",
        credentials: "include",
      });
      const json = await res.json().catch(() => ({}));
      if (res.ok) {
        setEmployeeToDelete(null);
        setEmployees((prev) => prev.filter((e) => e.id !== idToDelete));
        setTotal((t) => Math.max(0, t - 1));
        setDeleteSuccess(true);
        setTimeout(() => setDeleteSuccess(false), 3000);
      } else {
        setDeleteError(json.error || `Erreur ${res.status}`);
      }
    } catch (e) {
      console.error(e);
      setDeleteError("Erreur réseau. Réessayez.");
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="space-y-6">
      {deleteSuccess && (
        <div className="rounded-xl bg-emerald-50 border border-emerald-200 px-4 py-3 text-sm font-medium text-emerald-800">
          Employé supprimé définitivement de la base de données.
        </div>
      )}
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-slate-900">
            Employés
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Gestion des collaborateurs et de leur statut de présence.
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button className="inline-flex items-center gap-2 h-10 rounded-xl px-4 border border-slate-300 bg-white text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors">
            <Download className="h-4 w-4" />
            <span className="hidden sm:inline">Exporter</span>
          </button>
          <button
            onClick={openCreate}
            className="inline-flex items-center gap-2 h-10 rounded-xl px-4 bg-blue-600 text-sm font-medium text-white hover:bg-blue-700 transition-colors"
          >
            <Plus className="h-4 w-4" />
            Ajouter
          </button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <MiniKPI
          icon={Users}
          label="Total"
          value={totalEmployees}
          color="blue"
        />
        <MiniKPI
          icon={UserCheck}
          label="Actifs"
          value={activeCount}
          color="green"
        />
        <MiniKPI
          icon={UserX}
          label="Inactifs"
          value={inactiveCount}
          color="red"
        />
        <MiniKPI
          icon={Smartphone}
          label="WhatsApp connectés"
          value={whatsappCount}
          color="purple"
        />
      </div>

      {/* Table Card */}
      <div className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
        {/* Filters */}
        <div className="p-4 border-b border-slate-100">
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                type="text"
                placeholder="Rechercher un employé (nom, matricule, service)..."
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setPage(1);
                }}
                className="w-full pl-10 pr-4 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-slate-50 placeholder:text-slate-400"
              />
            </div>
            <select
              value={serviceFilter}
              onChange={(e) => {
                setServiceFilter(e.target.value);
                setPage(1);
              }}
              className="px-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white text-slate-900"
            >
              <option value="">Tous les services</option>
              {services.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
            <select
              value={statusFilter}
              onChange={(e) => {
                setStatusFilter(e.target.value as typeof statusFilter);
                setPage(1);
              }}
              className="px-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white text-slate-900"
            >
              <option value="all">Tous les statuts</option>
              <option value="active">Actif</option>
              <option value="inactive">Inactif</option>
            </select>
          </div>
        </div>

        {/* Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100">
                <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Employé
                </th>
                <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Matricule
                </th>
                <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Service
                </th>
                <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                  WhatsApp
                </th>
                <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Statut
                </th>
                <th className="px-6 py-3 text-right text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                [...Array(5)].map((_, i) => (
                  <tr key={i} className="border-b border-slate-50">
                    <td colSpan={6} className="px-6 py-4">
                      <div className="h-5 bg-slate-100 rounded-lg animate-pulse" />
                    </td>
                  </tr>
                ))
              ) : employees.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-6 py-16 text-center">
                    <Users className="h-10 w-10 mx-auto mb-3 text-slate-300" />
                    <p className="text-base font-semibold text-slate-700">
                      Aucun employé trouvé
                    </p>
                    <p className="mt-1 text-sm text-slate-500">
                      {search
                        ? "Essayez un autre terme de recherche."
                        : "Commencez par ajouter votre premier collaborateur."}
                    </p>
                    {!search && (
                      <button
                        onClick={openCreate}
                        className="mt-4 inline-flex items-center gap-2 h-9 rounded-xl px-4 bg-blue-600 text-sm font-medium text-white hover:bg-blue-700 transition-colors"
                      >
                        <Plus className="h-4 w-4" />
                        Ajouter un employé
                      </button>
                    )}
                  </td>
                </tr>
              ) : (
                employees.map((emp) => (
                  <tr
                    key={emp.id}
                    className="border-b border-slate-50 hover:bg-slate-50/50 transition-colors"
                  >
                    {/* Employé with avatar */}
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div
                          className={cn(
                            "h-9 w-9 rounded-full flex items-center justify-center text-xs font-semibold shrink-0",
                            emp.active
                              ? "bg-blue-100 text-blue-700"
                              : "bg-slate-100 text-slate-500"
                          )}
                        >
                          {emp.firstName[0]}
                          {emp.lastName[0]}
                        </div>
                        <div>
                          <p className="font-medium text-slate-800">
                            {emp.firstName} {emp.lastName}
                          </p>
                          <p className="text-xs text-slate-400">
                            {emp.site?.name ?? "Non assigné"}
                          </p>
                        </div>
                      </div>
                    </td>
                    {/* Matricule */}
                    <td className="px-6 py-4">
                      <span className="font-mono text-slate-600 bg-slate-100 px-2 py-0.5 rounded text-xs">
                        {emp.matricule}
                      </span>
                    </td>
                    {/* Service */}
                    <td className="px-6 py-4 text-slate-600">{emp.service}</td>
                    {/* WhatsApp */}
                    <td className="px-6 py-4">
                      {emp.whatsappPhone ? (
                        <span className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-700">
                          <CheckCircle2 className="h-3.5 w-3.5" />
                          Connecté
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-400">
                          <XCircle className="h-3.5 w-3.5" />
                          Non connecté
                        </span>
                      )}
                    </td>
                    {/* Statut */}
                    <td className="px-6 py-4">
                      <span
                        className={cn(
                          "inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium",
                          emp.active
                            ? "bg-emerald-50 text-emerald-700"
                            : "bg-red-50 text-red-700"
                        )}
                      >
                        {emp.active ? "Actif" : "Inactif"}
                      </span>
                    </td>
                    {/* Actions */}
                    <td className="px-6 py-4 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Link
                          href={`/employees/${emp.id}`}
                          className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-xl transition-colors"
                          title="Voir le profil"
                        >
                          <Eye className="w-4 h-4" />
                        </Link>
                        <button
                          onClick={() => openEdit(emp)}
                          className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-xl transition-colors"
                          title="Modifier"
                        >
                          <Pencil className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => toggleActive(emp.id, emp.active)}
                          className={cn(
                            "p-2 rounded-xl transition-colors",
                            emp.active
                              ? "text-slate-400 hover:text-red-600 hover:bg-red-50"
                              : "text-slate-400 hover:text-emerald-600 hover:bg-emerald-50"
                          )}
                          title={emp.active ? "Désactiver" : "Activer"}
                        >
                          <Ban className="w-4 h-4" />
                        </button>
                        {userRole === "ADMIN" && (
                          <button
                            onClick={() => {
                              setEmployeeToDelete(emp);
                              setDeleteError(null);
                            }}
                            className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-xl transition-colors"
                            title="Supprimer l'employé"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {totalPages > 0 && (
          <div className="flex items-center justify-between px-6 py-4 border-t border-slate-100">
            <p className="text-sm text-slate-500">
              {employees.length > 0 ? (
                <>
                  <span className="font-medium text-slate-700">
                    {(page - 1) * perPage + 1}–
                    {Math.min(page * perPage, total)}
                  </span>{" "}
                  sur{" "}
                  <span className="font-medium text-slate-700">{total}</span>{" "}
                  employé{total > 1 ? "s" : ""}
                </>
              ) : (
                "Aucun résultat"
              )}
            </p>
            {totalPages > 1 && (
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page === 1}
                  className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-sm font-medium text-slate-600 hover:bg-slate-100 disabled:opacity-40 disabled:hover:bg-transparent transition-colors"
                >
                  <ChevronLeft className="w-4 h-4" />
                  Précédent
                </button>
                <div className="flex items-center gap-0.5 mx-2">
                  {Array.from({ length: Math.min(totalPages, 5) }, (_, i) => {
                    const pageNum = i + 1;
                    return (
                      <button
                        key={pageNum}
                        onClick={() => setPage(pageNum)}
                        className={cn(
                          "w-8 h-8 rounded-lg text-sm font-medium transition-colors",
                          page === pageNum
                            ? "bg-blue-600 text-white"
                            : "text-slate-600 hover:bg-slate-100"
                        )}
                      >
                        {pageNum}
                      </button>
                    );
                  })}
                </div>
                <button
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={page === totalPages}
                  className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-sm font-medium text-slate-600 hover:bg-slate-100 disabled:opacity-40 disabled:hover:bg-transparent transition-colors"
                >
                  Suivant
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Modal Create/Edit */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="fixed inset-0 bg-black/50 backdrop-blur-sm"
            onClick={() => setModalOpen(false)}
          />
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-lg p-6 z-10">
            <div className="flex items-center justify-between mb-6">
              <div>
                <h2 className="text-lg font-semibold text-slate-900">
                  {editingId ? "Modifier l'employé" : "Nouvel employé"}
                </h2>
                <p className="text-sm text-slate-500 mt-0.5">
                  {editingId
                    ? "Modifiez les informations du collaborateur."
                    : "Ajoutez un nouveau collaborateur au système."}
                </p>
              </div>
              <button
                onClick={() => setModalOpen(false)}
                className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-xl transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">
                    Matricule
                  </label>
                  <input
                    value={form.matricule}
                    onChange={(e) =>
                      setForm({ ...form, matricule: e.target.value })
                    }
                    placeholder="EMP001"
                    className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white text-slate-900 placeholder:text-slate-400"
                  />
                  {errors.matricule && (
                    <p className="text-xs text-red-500 mt-1">
                      {errors.matricule}
                    </p>
                  )}
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">
                    Service
                  </label>
                  <input
                    value={form.service}
                    onChange={(e) =>
                      setForm({ ...form, service: e.target.value })
                    }
                    placeholder="IT, Finance, RH..."
                    className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white text-slate-900 placeholder:text-slate-400"
                  />
                  {errors.service && (
                    <p className="text-xs text-red-500 mt-1">
                      {errors.service}
                    </p>
                  )}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">
                    Prénom
                  </label>
                  <input
                    value={form.firstName}
                    onChange={(e) =>
                      setForm({ ...form, firstName: e.target.value })
                    }
                    placeholder="Jean"
                    className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white text-slate-900 placeholder:text-slate-400"
                  />
                  {errors.firstName && (
                    <p className="text-xs text-red-500 mt-1">
                      {errors.firstName}
                    </p>
                  )}
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">
                    Nom
                  </label>
                  <input
                    value={form.lastName}
                    onChange={(e) =>
                      setForm({ ...form, lastName: e.target.value })
                    }
                    placeholder="Kouadio"
                    className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white text-slate-900 placeholder:text-slate-400"
                  />
                  {errors.lastName && (
                    <p className="text-xs text-red-500 mt-1">
                      {errors.lastName}
                    </p>
                  )}
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">
                  Zone de travail (site)
                </label>
                <select
                  value={form.siteId}
                  onChange={(e) =>
                    setForm({ ...form, siteId: e.target.value })
                  }
                  className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white text-slate-900"
                >
                  <option value="">Aucun site</option>
                  {sites.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
                <p className="text-xs text-slate-400 mt-1">
                  Requis pour valider le pointage par géolocalisation.
                </p>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">
                  Téléphone WhatsApp
                </label>
                <input
                  value={form.whatsappPhone}
                  onChange={(e) =>
                    setForm({ ...form, whatsappPhone: e.target.value })
                  }
                  placeholder="+225XXXXXXXXXX"
                  className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white text-slate-900 placeholder:text-slate-400"
                />
                <p className="text-xs text-slate-400 mt-1">
                  Optionnel. L&apos;employé pourra aussi lier son numéro via l&apos;onboarding QR.
                </p>
              </div>
              <div className="flex justify-end gap-3 pt-4 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  className="h-10 px-4 text-sm font-medium text-slate-600 hover:bg-slate-100 rounded-xl transition-colors"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="h-10 px-5 text-sm font-medium bg-blue-600 text-white rounded-xl hover:bg-blue-700 disabled:opacity-50 transition-colors"
                >
                  {submitting
                    ? "Enregistrement..."
                    : editingId
                      ? "Enregistrer"
                      : "Créer l'employé"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal confirmation suppression (ADMIN) */}
      {employeeToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="fixed inset-0 bg-black/50 backdrop-blur-sm"
            onClick={() => {
              if (!deleting) {
                setEmployeeToDelete(null);
                setDeleteError(null);
              }
            }}
          />
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md p-6 z-10">
            <div className="flex items-center gap-3 text-red-600 mb-4">
              <div className="h-10 w-10 rounded-full bg-red-50 flex items-center justify-center">
                <Trash2 className="w-5 h-5" />
              </div>
              <h2 className="text-lg font-semibold text-slate-900">Supprimer l&apos;employé</h2>
            </div>
            <p className="text-sm text-slate-600 mb-6">
              Voulez-vous supprimer <strong>{employeeToDelete.firstName} {employeeToDelete.lastName}</strong> ({employeeToDelete.matricule}) ? L&apos;employé sera supprimé définitivement de la base de données (pointages, absences et missions liés seront aussi supprimés).
            </p>
            {deleteError && (
              <p className="text-sm text-red-600 bg-red-50 rounded-xl px-4 py-2 mb-4">
                {deleteError}
              </p>
            )}
            <div className="flex justify-end gap-3">
              <button
                type="button"
                onClick={() => {
                  if (!deleting) {
                    setEmployeeToDelete(null);
                    setDeleteError(null);
                  }
                }}
                disabled={deleting}
                className="h-10 px-4 text-sm font-medium text-slate-600 hover:bg-slate-100 rounded-xl transition-colors disabled:opacity-50"
              >
                Annuler
              </button>
              <button
                type="button"
                onClick={handleConfirmDelete}
                disabled={deleting}
                className="h-10 px-5 text-sm font-medium bg-red-600 text-white rounded-xl hover:bg-red-700 disabled:opacity-50 transition-colors"
              >
                {deleting ? "Suppression…" : "Supprimer"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function MiniKPI({
  icon: Icon,
  label,
  value,
  color,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: number;
  color: "blue" | "green" | "red" | "purple";
}) {
  const colorMap = {
    blue: { bg: "bg-blue-50", text: "text-blue-600", value: "text-blue-700" },
    green: { bg: "bg-emerald-50", text: "text-emerald-600", value: "text-emerald-700" },
    red: { bg: "bg-red-50", text: "text-red-600", value: "text-red-700" },
    purple: { bg: "bg-violet-50", text: "text-violet-600", value: "text-violet-700" },
  };
  const c = colorMap[color];

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-center gap-3">
        <div className={cn("h-10 w-10 rounded-xl flex items-center justify-center", c.bg, c.text)}>
          <Icon className="h-5 w-5" />
        </div>
        <div>
          <p className="text-xs font-medium text-slate-500">{label}</p>
          <p className={cn("text-2xl font-bold tracking-tight", c.value)}>
            {value}
          </p>
        </div>
      </div>
    </div>
  );
}
