"use client";

import { Suspense, useEffect, useRef, useState, useCallback } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  Plus,
  Search,
  Eye,
  Pencil,
  Ban,
  Trash2,
  Users,
  UserCheck,
  UserX,
  Smartphone,
  CheckCircle2,
  XCircle,
  Download,
  UserMinus,
  PenLine,
  FileSpreadsheet,
  FileText,
  RotateCcw,
  GraduationCap,
} from "lucide-react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { z } from "zod";
import { departureReasonLabel } from "@/lib/departure-labels";
import { fetchAllEmployees as fetchAllEmployeePages } from "@/lib/fetch-all-employees";
import { downloadBlob } from "@/lib/documents/download";
import { finishSheet } from "@/lib/excel-format";
import { fileDateStamp, generatedAtLabel } from "@/lib/export-format";
import { PDF_TABLE, addPdfHeader, createPdf, savePdf } from "@/lib/pdf-kit";
import { STRUCTURE_BRANDS, STRUCTURE_CODES, type StructureCode } from "@/lib/brand";
import { DEFAULT_SERVICES, matriculeServiceCode, normalizeService } from "@/lib/services";
import { INTERN_MATRICULE_CODE, employeeKindLabel } from "@/lib/interns";
import { fmtDayFr } from "@/lib/export-format";
import { useOrg } from "@/components/org/OrgProvider";
import StructureOptions from "@/components/org/StructureOptions";
import { useDebouncedCommit, useUrlFilters } from "@/lib/use-url-filters";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { StructureBadge } from "@/components/ui/StatusBadge";
import { Button, buttonClasses } from "@/components/ui/Button";
import { Field, Input, Select, Textarea } from "@/components/ui/Field";
import { FilterBar, FilterField } from "@/components/ui/FilterBar";
import { Table, THead, Th, Tr, Td, TableSkeletonRows, TableMessageRow } from "@/components/ui/Table";
import { EmptyState } from "@/components/ui/EmptyState";
import { Pagination } from "@/components/ui/Pagination";
import { StatTile } from "@/components/ui/StatTile";
import { Modal } from "@/components/ui/Modal";
import { useToast } from "@/components/ui/Toaster";
import { useConfirm } from "@/components/ui/ConfirmDialog";
import EmployeesAttendanceExport from "./EmployeesAttendanceExport";

type DepartureReasonCode =
  | "RESIGNATION"
  | "END_OF_CONTRACT"
  | "DISMISSAL"
  | "ABANDONMENT"
  | "INTERNSHIP_END";

type EmployeeKind = "EMPLOYEE" | "INTERN";

interface InternshipInfo {
  startDate: string;
  endDate: string;
  school: string;
  fieldOfStudy: string | null;
  level: string | null;
  supervisorId: string | null;
  supervisor?: { id: string; firstName: string; lastName: string } | null;
  monthlyAllowance: number | null;
}

interface Employee {
  id: string;
  matricule: string;
  firstName: string;
  lastName: string;
  service: string;
  structure: StructureCode;
  kind?: EmployeeKind;
  internship?: InternshipInfo | null;
  whatsappPhone: string | null;
  whatsappPhones?: { phone: string; sortOrder: number }[];
  active: boolean;
  siteId?: string | null;
  site?: { id: string; name: string } | null;
  checkoutSiteId?: string | null;
  checkoutSite?: { id: string; name: string } | null;
  departureDate?: string | null;
  departureReason?: DepartureReasonCode | null;
  departureNote?: string | null;
}

type EmployeeStats = { active: number; inactive: number; whatsapp: number; interns?: number };

/** Valeur de l'option « Ajouter un service… » du formulaire (jamais enregistrée). */
const NEW_SERVICE_OPTION = "__nouveau_service__";

function todayInputDate(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function formatDepartureDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("fr-FR", { day: "2-digit", month: "short", year: "numeric" });
}

function phonesOf(emp: Employee): string[] {
  return emp.whatsappPhones?.map((p) => p.phone) ?? (emp.whatsappPhone ? [emp.whatsappPhone] : []);
}

const employeeSchema = z
  .object({
    matricule: z.string().optional(),
    firstName: z.string().min(1, "Le prénom est requis"),
    lastName: z.string().min(1, "Le nom est requis"),
    service: z.string().min(1, "Le service est requis"),
    structure: z.enum(STRUCTURE_CODES),
    kind: z.enum(["EMPLOYEE", "INTERN"]),
    whatsappPhone: z.string().optional(),
    whatsappPhone2: z.string().optional(),
    siteId: z.string().optional(),
    checkoutSiteId: z.string().optional(),
    // Fiche de stage (stagiaires uniquement)
    internStart: z.string(),
    internEnd: z.string(),
    school: z.string(),
    fieldOfStudy: z.string(),
    level: z.string(),
    supervisorId: z.string(),
    allowance: z.string(),
  })
  .superRefine((d, ctx) => {
    if (d.kind !== "INTERN") return;
    if (!d.internStart) ctx.addIssue({ code: "custom", path: ["internStart"], message: "Date de début requise" });
    if (!d.internEnd) ctx.addIssue({ code: "custom", path: ["internEnd"], message: "Date de fin requise" });
    if (d.internStart && d.internEnd && d.internEnd < d.internStart) {
      ctx.addIssue({ code: "custom", path: ["internEnd"], message: "La fin doit être après le début" });
    }
    if (!d.school.trim()) ctx.addIssue({ code: "custom", path: ["school"], message: "L'école est requise" });
    if (d.allowance.trim() && !/^\d+$/.test(d.allowance.replace(/\s/g, ""))) {
      ctx.addIssue({ code: "custom", path: ["allowance"], message: "Montant en FCFA, sans décimales" });
    }
  });

type EmployeeForm = z.infer<typeof employeeSchema>;

/** Corps envoyé à l'API : la fiche de stage n'accompagne qu'un stagiaire. */
function employeePayload(values: EmployeeForm, editing: boolean) {
  const { internStart, internEnd, school, fieldOfStudy, level, supervisorId, allowance, matricule, ...base } = values;
  const allowanceDigits = allowance.replace(/\s/g, "");
  return {
    ...base,
    ...(editing ? { matricule } : {}),
    ...(values.kind === "INTERN" && {
      internship: {
        startDate: internStart,
        endDate: internEnd,
        school: school.trim(),
        fieldOfStudy: fieldOfStudy.trim() || null,
        level: level.trim() || null,
        supervisorId: supervisorId || null,
        monthlyAllowance: allowanceDigits ? Number(allowanceDigits) : null,
      },
    }),
  };
}

const EMPTY_FORM: EmployeeForm = {
  matricule: "",
  firstName: "",
  lastName: "",
  service: "",
  // Remplacée à l'ouverture du formulaire par la première structure de l'entreprise.
  structure: "SCPB",
  kind: "EMPLOYEE",
  whatsappPhone: "",
  whatsappPhone2: "",
  siteId: "",
  checkoutSiteId: "",
  internStart: "",
  internEnd: "",
  school: "",
  fieldOfStudy: "",
  level: "",
  supervisorId: "",
  allowance: "",
};

export default function EmployeesPage() {
  return (
    <Suspense fallback={null}>
      <EmployeesContent />
    </Suspense>
  );
}

function EmployeesContent() {
  const toast = useToast();
  const confirm = useConfirm();
  const { structures: orgStructures } = useOrg();
  const [filters, setFilters] = useUrlFilters({ q: "", service: "", structure: "", kind: "", status: "all", page: "1" });
  const kindFilter = (["EMPLOYEE", "INTERN"].includes(filters.kind) ? filters.kind : "") as EmployeeKind | "";
  const search = filters.q;
  const serviceFilter = filters.service;
  const structureFilter = filters.structure;
  const statusFilter = (["all", "active", "inactive"].includes(filters.status) ? filters.status : "all") as
    | "all"
    | "active"
    | "inactive";
  const page = Math.max(1, parseInt(filters.page, 10) || 1);

  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchInput, setSearchInput] = useState(search);
  const [total, setTotal] = useState(0);
  const [stats, setStats] = useState<EmployeeStats | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<EmployeeForm>(EMPTY_FORM);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  // Services par défaut + ceux déjà utilisés dans l'entreprise (renvoyés par GET /api/employees).
  const [services, setServices] = useState<string[]>(DEFAULT_SERVICES);
  const [addingService, setAddingService] = useState(false);
  const [newService, setNewService] = useState("");
  const [sites, setSites] = useState<{ id: string; name: string }[]>([]);
  // Encadrants proposés pour un stagiaire (employés actifs), chargés à la première ouverture.
  const [supervisors, setSupervisors] = useState<Employee[] | null>(null);
  const [userRole, setUserRole] = useState<string>("");
  const [employeeToDelete, setEmployeeToDelete] = useState<Employee | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [departureModal, setDepartureModal] = useState<Employee | null>(null);
  const [departureDate, setDepartureDate] = useState("");
  const [departureReason, setDepartureReason] = useState<DepartureReasonCode | "">("");
  const [departureNote, setDepartureNote] = useState("");
  const [departureSubmitting, setDepartureSubmitting] = useState(false);
  const [departureError, setDepartureError] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [attendanceExportOpen, setAttendanceExportOpen] = useState(false);
  const [exporting, setExporting] = useState<"excel" | "pdf" | null>(null);
  const perPage = 15;

  const commitSearch = useDebouncedCommit((q) => setFilters({ q, page: "1" }));

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const toggleSelectAll = () => {
    if (selectedIds.length === employees.length) {
      setSelectedIds([]);
    } else {
      setSelectedIds(employees.map((e) => e.id));
    }
  };

  const listFilters = useCallback((): Record<string, string> => {
    const f: Record<string, string> = {};
    if (search) f.q = search;
    if (serviceFilter) f.service = serviceFilter;
    if (structureFilter) f.structure = structureFilter;
    if (kindFilter) f.kind = kindFilter;
    if (statusFilter !== "all") f.active = statusFilter === "active" ? "true" : "false";
    return f;
  }, [search, serviceFilter, structureFilter, kindFilter, statusFilter]);

  const fetchEmployees = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams({ page: String(page), limit: String(perPage), ...listFilters() });
    try {
      const res = await fetch(`/api/employees?${params}`);
      const json = await res.json();
      setEmployees(json.data ?? []);
      setTotal(json.pagination?.total ?? json.total ?? 0);
      setStats(json.stats ?? null);
      if (json.services) setServices(json.services);
      if (!json.services && json.data) {
        const svcSet = new Set<string>();
        (json.data as Employee[]).forEach((e) => svcSet.add(e.service));
        setServices((prev) => Array.from(new Set([...prev, ...svcSet])).sort());
      }
    } catch (e) {
      console.error(e);
      toast.error("Impossible de charger les employés.");
    } finally {
      setLoading(false);
    }
  }, [page, listFilters, toast]);

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

  const fetchAllEmployees = () => fetchAllEmployeePages<Employee>(listFilters());

  const runExport = async (kind: "excel" | "pdf") => {
    setExporting(kind);
    try {
      if (kind === "excel") await exportExcel();
      else await exportPdf();
    } catch (e) {
      console.error(e);
      toast.error("L'export n'a pas pu être généré.");
    } finally {
      setExporting(null);
    }
  };

  const exportExcel = async () => {
    const ExcelJS = (await import("exceljs")).default;
    const all = await fetchAllEmployees();
    const workbook = new ExcelJS.Workbook();

    const addSheet = (name: string, data: Employee[]) => {
      const ws = workbook.addWorksheet(name);
      ws.columns = [
        { header: "Matricule", key: "matricule", width: 18 },
        { header: "Nom", key: "lastName", width: 18 },
        { header: "Prénom", key: "firstName", width: 18 },
        { header: "Type", key: "kind", width: 11 },
        { header: "Service", key: "service", width: 14 },
        { header: "Structure", key: "structure", width: 12 },
        { header: "Site", key: "site", width: 20 },
        { header: "WhatsApp", key: "whatsapp", width: 18 },
        { header: "Statut", key: "status", width: 12 },
        { header: "Date départ", key: "departureDate", width: 14 },
        { header: "Motif départ", key: "departureReason", width: 22 },
      ];

      data.forEach((emp) => {
        ws.addRow({
          matricule: emp.matricule,
          lastName: emp.lastName,
          firstName: emp.firstName,
          kind: employeeKindLabel(emp.kind),
          service: emp.service,
          structure: emp.structure,
          site: emp.site?.name ?? "Non assigné",
          whatsapp: phonesOf(emp).join(" / ") || "—",
          status: emp.active ? "Actif" : "Parti / inactif",
          departureDate: emp.departureDate ? formatDepartureDate(emp.departureDate) : "—",
          departureReason: emp.departureReason ? departureReasonLabel(emp.departureReason) : "—",
        });
      });
      finishSheet(ws);
    };

    addSheet("Tous", all);
    if (orgStructures.length > 1) {
      for (const code of orgStructures) {
        const rows = all.filter((e) => e.structure === code);
        if (rows.length > 0) addSheet(STRUCTURE_BRANDS[code].name, rows);
      }
    }

    const buffer = await workbook.xlsx.writeBuffer();
    downloadBlob(
      new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }),
      `employes_${fileDateStamp()}.xlsx`
    );
    toast.success(`${all.length} employé${all.length > 1 ? "s" : ""} exporté${all.length > 1 ? "s" : ""} (Excel).`);
  };

  const exportPdf = async () => {
    const { autoTable } = await import("jspdf-autotable");
    const all = await fetchAllEmployees();

    const doc = await createPdf({ orientation: "landscape", unit: "mm", format: "a4" });

    const generatePage = async (title: string, data: Employee[], startNew: boolean, structures: string[] = orgStructures) => {
      if (startNew) doc.addPage("a4", "landscape");
      const active = data.filter((e) => e.active).length;
      const inactive = data.length - active;
      const whatsapp = data.filter((e) => phonesOf(e).length > 0).length;
      const startY = await addPdfHeader(doc, {
        title,
        structures,
        subtitle: [
          `${data.length} employé${data.length > 1 ? "s" : ""} · généré le ${generatedAtLabel()}`,
          `Actifs : ${active}   ·   Partis / inactifs : ${inactive}   ·   Joignables sur WhatsApp : ${whatsapp}`,
        ],
      });

      autoTable(doc, {
        ...PDF_TABLE,
        startY,
        head: [["Matricule", "Nom", "Prénom", "Type", "Service", "Structure", "Site", "WhatsApp", "Statut", "Date départ", "Motif"]],
        body: data.map((emp) => [
          emp.matricule,
          emp.lastName,
          emp.firstName,
          employeeKindLabel(emp.kind),
          emp.service,
          emp.structure,
          emp.site?.name ?? "Non assigné",
          phonesOf(emp).join(" / ") || "—",
          emp.active ? "Actif" : "Parti / inactif",
          emp.departureDate ? formatDepartureDate(emp.departureDate) : "—",
          emp.departureReason ? departureReasonLabel(emp.departureReason) : "—",
        ]),
      });
    };

    await generatePage("Liste des employés", all, false);

    if (orgStructures.length > 1) {
      for (const code of orgStructures) {
        const rows = all.filter((e) => e.structure === code);
        if (rows.length > 0) await generatePage(`Employés — ${STRUCTURE_BRANDS[code].name}`, rows, true, [code]);
      }
    }

    savePdf(doc, `employes_${fileDateStamp()}.pdf`);
    toast.success(`${all.length} employé${all.length > 1 ? "s" : ""} exporté${all.length > 1 ? "s" : ""} (PDF).`);
  };

  const loadSupervisors = useCallback(() => {
    if (supervisors) return;
    fetchAllEmployeePages<Employee>({ active: "true", kind: "EMPLOYEE" })
      .then(setSupervisors)
      .catch(() => setSupervisors([]));
  }, [supervisors]);

  const openCreate = useCallback(
    (kind: EmployeeKind = "EMPLOYEE") => {
      setEditingId(null);
      setForm({ ...EMPTY_FORM, kind, structure: orgStructures[0] ?? EMPTY_FORM.structure });
      setErrors({});
      setAddingService(false);
      setModalOpen(true);
      if (kind === "INTERN") loadSupervisors();
    },
    [orgStructures, loadSupervisors]
  );

  // « Nouveau stagiaire » depuis la rubrique Stagiaires : /employees?nouveau=stagiaire
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const presetHandled = useRef(false);
  useEffect(() => {
    if (presetHandled.current || searchParams.get("nouveau") !== "stagiaire") return;
    presetHandled.current = true;
    openCreate("INTERN");
    const rest = new URLSearchParams(window.location.search);
    rest.delete("nouveau");
    router.replace(rest.size ? `${pathname}?${rest}` : pathname, { scroll: false });
  }, [searchParams, openCreate, router, pathname]);

  /** Valide le service saisi à la main ; il rejoint la liste dès l'enregistrement de l'employé. */
  const confirmNewService = (): string | null => {
    const name = normalizeService(newService, services);
    if (!name) {
      setErrors((prev) => ({ ...prev, service: "Saisissez le nom du service." }));
      return null;
    }
    if (!services.includes(name)) setServices((prev) => [...prev, name]);
    setForm((prev) => ({ ...prev, service: name }));
    setErrors((prev) => ({ ...prev, service: "" }));
    setAddingService(false);
    setNewService("");
    return name;
  };

  const openEdit = (emp: Employee) => {
    setEditingId(emp.id);
    setForm({
      matricule: emp.matricule,
      firstName: emp.firstName,
      lastName: emp.lastName,
      service: emp.service,
      structure: emp.structure ?? orgStructures[0] ?? EMPTY_FORM.structure,
      whatsappPhone: emp.whatsappPhones?.[0]?.phone ?? emp.whatsappPhone ?? "",
      whatsappPhone2: emp.whatsappPhones?.[1]?.phone ?? "",
      siteId: emp.siteId ?? emp.site?.id ?? "",
      checkoutSiteId: emp.checkoutSiteId ?? emp.checkoutSite?.id ?? "",
      kind: emp.kind ?? "EMPLOYEE",
      internStart: emp.internship?.startDate.slice(0, 10) ?? "",
      internEnd: emp.internship?.endDate.slice(0, 10) ?? "",
      school: emp.internship?.school ?? "",
      fieldOfStudy: emp.internship?.fieldOfStudy ?? "",
      level: emp.internship?.level ?? "",
      supervisorId: emp.internship?.supervisorId ?? "",
      allowance: emp.internship?.monthlyAllowance != null ? String(emp.internship.monthlyAllowance) : "",
    });
    setErrors({});
    setAddingService(false);
    setModalOpen(true);
    if (emp.kind === "INTERN") loadSupervisors();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    // Nouveau service saisi sans appuyer sur « Ajouter » : on le prend tel quel.
    let values = form;
    if (addingService) {
      const service = confirmNewService();
      if (!service) return;
      values = { ...form, service };
    }
    const result = employeeSchema.safeParse(values);
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
      const payload = employeePayload(result.data, Boolean(editingId)); // à la création, matricule généré côté serveur
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = await res.json().catch(() => ({}));
      if (res.ok) {
        setModalOpen(false);
        toast.success(
          editingId
            ? `${form.firstName} ${form.lastName} : fiche mise à jour.`
            : `${form.firstName} ${form.lastName} ajouté${json.data?.matricule ? ` (matricule ${json.data.matricule})` : ""}.${json.welcomeSent ? "\nMessage de bienvenue envoyé sur WhatsApp." : ""}`
        );
        fetchEmployees();
      } else {
        setErrors({
          whatsappPhone: typeof json.error === "string" ? json.error : "Enregistrement impossible.",
        });
      }
    } catch (e) {
      console.error(e);
      toast.error("Erreur réseau : l'employé n'a pas été enregistré.");
    } finally {
      setSubmitting(false);
    }
  };

  const reactivateEmployee = async (emp: Employee) => {
    const ok = await confirm({
      title: "Réactiver l'employé",
      message: `${emp.firstName} ${emp.lastName} pourra de nouveau pointer et apparaîtra dans les listes de présence.`,
      confirmLabel: "Réactiver",
      tone: "primary",
    });
    if (!ok) return;
    const res = await fetch(`/api/employees/${emp.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ active: true }),
    }).catch(() => null);
    if (res?.ok) toast.success(`${emp.firstName} ${emp.lastName} est de nouveau actif.`);
    else toast.error("La réactivation a échoué.");
    fetchEmployees();
  };

  const openDepartureModal = (emp: Employee) => {
    if (!emp.active) {
      void reactivateEmployee(emp);
      return;
    }
    setDepartureModal(emp);
    setDepartureDate(todayInputDate());
    setDepartureReason("");
    setDepartureNote(emp.departureNote ?? "");
    setDepartureError(null);
  };

  const openCompleteDepartureModal = (emp: Employee) => {
    setDepartureModal(emp);
    setDepartureDate(emp.departureDate ? emp.departureDate.slice(0, 10) : todayInputDate());
    setDepartureReason((emp.departureReason as DepartureReasonCode) ?? "");
    setDepartureNote(emp.departureNote ?? "");
    setDepartureError(null);
  };

  const submitDeparture = async () => {
    if (!departureModal) return;
    if (!departureDate.trim()) {
      setDepartureError("La date de départ est obligatoire.");
      return;
    }
    if (!departureReason) {
      setDepartureError("Choisissez un motif de départ.");
      return;
    }
    setDepartureSubmitting(true);
    setDepartureError(null);
    try {
      const payload: Record<string, unknown> = {
        departureDate: departureDate.trim(),
        departureReason,
        departureNote: departureNote.trim() || null,
      };
      if (departureModal.active) {
        payload.active = false;
      }
      const res = await fetch(`/api/employees/${departureModal.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setDepartureError(typeof json.error === "string" ? json.error : "Erreur lors de l’enregistrement.");
        return;
      }
      toast.success(`Départ enregistré pour ${departureModal.firstName} ${departureModal.lastName}.`);
      setDepartureModal(null);
      fetchEmployees();
    } catch {
      setDepartureError("Erreur réseau.");
    } finally {
      setDepartureSubmitting(false);
    }
  };

  const handleConfirmDelete = async () => {
    if (!employeeToDelete) return;
    const idToDelete = employeeToDelete.id;
    const name = `${employeeToDelete.firstName} ${employeeToDelete.lastName}`;
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
        setSelectedIds((prev) => prev.filter((x) => x !== idToDelete));
        toast.success(`${name} a été supprimé définitivement.`);
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

  const toggleStatus = (value: "active" | "inactive") =>
    setFilters({ status: statusFilter === value ? "all" : value, page: "1" });
  const hasActiveFilters = Boolean(search || serviceFilter || structureFilter || kindFilter || statusFilter !== "all");
  const statsTotal = stats ? stats.active + stats.inactive : total;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Employés"
        description="Collaborateurs, numéros WhatsApp, zones de pointage et départs."
        actions={
          <>
            {selectedIds.length > 0 && (
              <Button variant="secondary" icon={<Download className="h-4 w-4" />} onClick={() => setAttendanceExportOpen(true)}>
                Pointages ({selectedIds.length})
              </Button>
            )}
            <Button
              variant="secondary"
              onClick={() => void runExport("excel")}
              loading={exporting === "excel"}
              disabled={exporting !== null}
              icon={<FileSpreadsheet className="h-4 w-4 text-emerald-600" />}
            >
              <span className="hidden sm:inline">Excel</span>
            </Button>
            <Button
              variant="secondary"
              onClick={() => void runExport("pdf")}
              loading={exporting === "pdf"}
              disabled={exporting !== null}
              icon={<FileText className="h-4 w-4 text-red-600" />}
            >
              <span className="hidden sm:inline">PDF</span>
            </Button>
            <Button onClick={() => openCreate()} icon={<Plus className="h-4 w-4" />}>
              Ajouter
            </Button>
          </>
        }
      />

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-5">
        <StatTile icon={Users} label="Total" value={statsTotal} tone="brand" onClick={() => setFilters({ status: "all", page: "1" })} active={statusFilter === "all" && hasActiveFilters === false} />
        <StatTile icon={UserCheck} label="Actifs" value={stats?.active ?? "–"} tone="success" onClick={() => toggleStatus("active")} active={statusFilter === "active"} />
        <StatTile icon={UserX} label="Partis / inactifs" value={stats?.inactive ?? "–"} tone="danger" onClick={() => toggleStatus("inactive")} active={statusFilter === "inactive"} />
        <StatTile
          icon={Smartphone}
          label="WhatsApp connectés"
          value={stats?.whatsapp ?? "–"}
          tone="violet"
          sub={stats && stats.active > 0 ? `${Math.round((stats.whatsapp / stats.active) * 100)} % des actifs` : ""}
        />
        <StatTile
          icon={GraduationCap}
          label="Stagiaires actifs"
          value={stats?.interns ?? "–"}
          tone="info"
          onClick={() => setFilters({ kind: kindFilter === "INTERN" ? "" : "INTERN", page: "1" })}
          active={kindFilter === "INTERN"}
        />
      </div>

      <FilterBar
        actions={
          hasActiveFilters ? (
            <Button
              variant="ghost"
              size="sm"
              icon={<RotateCcw className="h-3.5 w-3.5" />}
              onClick={() => {
                setSearchInput("");
                setFilters({ q: "", service: "", structure: "", kind: "", status: "all", page: "1" });
              }}
            >
              Réinitialiser
            </Button>
          ) : undefined
        }
      >
        <FilterField label="Recherche" className="sm:col-span-2 lg:min-w-[260px] lg:flex-1">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <Input
              type="search"
              placeholder="Nom ou matricule…"
              value={searchInput}
              onChange={(e) => {
                setSearchInput(e.target.value);
                commitSearch(e.target.value);
              }}
              className="pl-9"
            />
          </div>
        </FilterField>
        <FilterField label="Service">
          <Select value={serviceFilter} onChange={(e) => setFilters({ service: e.target.value, page: "1" })}>
            <option value="">Tous les services</option>
            {services.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </Select>
        </FilterField>
        {orgStructures.length > 1 && (
          <FilterField label="Structure">
            <Select value={structureFilter} onChange={(e) => setFilters({ structure: e.target.value, page: "1" })}>
              <option value="">Toutes les structures</option>
              <StructureOptions />
            </Select>
          </FilterField>
        )}
        <FilterField label="Type">
          <Select value={kindFilter} onChange={(e) => setFilters({ kind: e.target.value, page: "1" })}>
            <option value="">Employés et stagiaires</option>
            <option value="EMPLOYEE">Employés</option>
            <option value="INTERN">Stagiaires</option>
          </Select>
        </FilterField>
        <FilterField label="Statut">
          <Select value={statusFilter} onChange={(e) => setFilters({ status: e.target.value, page: "1" })}>
            <option value="all">Tous les statuts</option>
            <option value="active">Actif</option>
            <option value="inactive">Parti / inactif</option>
          </Select>
        </FilterField>
      </FilterBar>

      <Card className="overflow-hidden">
        {selectedIds.length > 0 && (
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-brand-100 bg-brand-50/60 px-5 py-2.5 text-sm sm:px-6">
            <span className="font-medium text-brand-800">
              {selectedIds.length} employé{selectedIds.length > 1 ? "s" : ""} sélectionné{selectedIds.length > 1 ? "s" : ""}
            </span>
            <div className="flex gap-2">
              <Button size="sm" variant="secondary" icon={<Download className="h-3.5 w-3.5" />} onClick={() => setAttendanceExportOpen(true)}>
                Exporter leurs pointages
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setSelectedIds([])}>
                Désélectionner
              </Button>
            </div>
          </div>
        )}
        <Table>
          <THead>
            <tr>
              <Th className="w-10 pr-0">
                <input
                  type="checkbox"
                  checked={employees.length > 0 && selectedIds.length === employees.length}
                  onChange={toggleSelectAll}
                  className="rounded border-slate-300 text-brand-600 focus:ring-brand-500"
                  aria-label="Tout sélectionner"
                />
              </Th>
              <Th>Employé</Th>
              <Th>Matricule</Th>
              <Th>Service</Th>
              <Th>Structure</Th>
              <Th>WhatsApp</Th>
              <Th>Statut</Th>
              <Th>Départ</Th>
              <Th align="right">
                <span className="sr-only">Actions</span>
              </Th>
            </tr>
          </THead>
          <tbody>
            {loading ? (
              <TableSkeletonRows cols={9} />
            ) : employees.length === 0 ? (
              <TableMessageRow cols={9}>
                <EmptyState
                  icon={Users}
                  title="Aucun employé trouvé"
                  description={hasActiveFilters ? "Essayez d'autres filtres ou un autre terme de recherche." : "Commencez par ajouter votre premier collaborateur."}
                  action={
                    !hasActiveFilters ? (
                      <Button onClick={() => openCreate()} icon={<Plus className="h-4 w-4" />}>
                        Ajouter un employé
                      </Button>
                    ) : undefined
                  }
                />
              </TableMessageRow>
            ) : (
              employees.map((emp) => {
                const phones = phonesOf(emp);
                return (
                  <Tr key={emp.id} className={cn(selectedIds.includes(emp.id) && "bg-brand-50/40")}>
                    <Td className="w-10 pr-0">
                      <input
                        type="checkbox"
                        checked={selectedIds.includes(emp.id)}
                        onChange={() => toggleSelect(emp.id)}
                        className="rounded border-slate-300 text-brand-600 focus:ring-brand-500"
                        aria-label={`Sélectionner ${emp.firstName} ${emp.lastName}`}
                      />
                    </Td>
                    <Td>
                      <Link href={`/employees/${emp.id}`} className="group flex items-center gap-3">
                        <span
                          className={cn(
                            "flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-semibold",
                            emp.active ? "bg-brand-50 text-brand-700" : "bg-slate-100 text-slate-500"
                          )}
                        >
                          {emp.firstName[0]}
                          {emp.lastName[0]}
                        </span>
                        <span className="min-w-0">
                          <span className="flex items-center gap-1.5">
                            <span className="truncate font-medium text-slate-800 group-hover:text-brand-700">
                              {emp.firstName} {emp.lastName}
                            </span>
                            {emp.kind === "INTERN" && <Badge tone="info">Stagiaire</Badge>}
                          </span>
                          <span className="block truncate text-xs text-slate-500">
                            {emp.kind === "INTERN" && emp.internship
                              ? `Stage jusqu'au ${fmtDayFr(emp.internship.endDate)}`
                              : [emp.site?.name ?? "Zone non assignée", emp.checkoutSite?.name].filter(Boolean).join(" · ")}
                          </span>
                        </span>
                      </Link>
                    </Td>
                    <Td>
                      <span className="rounded bg-slate-100 px-2 py-0.5 font-mono text-xs text-slate-600">{emp.matricule}</span>
                    </Td>
                    <Td>{emp.service}</Td>
                    <Td>
                      <StructureBadge value={emp.structure} />
                    </Td>
                    <Td>
                      {phones.length > 0 ? (
                        <span className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-700" title={phones.join(" · ")}>
                          <CheckCircle2 className="h-3.5 w-3.5" />
                          {phones.length} numéro{phones.length > 1 ? "s" : ""}
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-400">
                          <XCircle className="h-3.5 w-3.5" />
                          Non connecté
                        </span>
                      )}
                    </Td>
                    <Td>
                      <Badge tone={emp.active ? "success" : "danger"} dot>
                        {emp.active ? "Actif" : "Parti / inactif"}
                      </Badge>
                    </Td>
                    <Td className="max-w-[200px]">
                      {emp.departureDate || emp.departureReason ? (
                        <>
                          <span className="block whitespace-nowrap">{formatDepartureDate(emp.departureDate)}</span>
                          <span className="block truncate text-xs text-slate-500">
                            {emp.departureReason ? departureReasonLabel(emp.departureReason) : ""}
                          </span>
                        </>
                      ) : !emp.active ? (
                        <span className="text-xs font-medium text-amber-700">Motif non renseigné</span>
                      ) : (
                        <span className="text-slate-400">—</span>
                      )}
                    </Td>
                    <Td align="right">
                      <div className="flex items-center justify-end gap-0.5">
                        <Link
                          href={`/employees/${emp.id}`}
                          className={buttonClasses({ variant: "ghost", size: "icon-sm" })}
                          title="Voir la fiche"
                          aria-label={`Voir la fiche de ${emp.firstName} ${emp.lastName}`}
                        >
                          <Eye className="h-4 w-4" />
                        </Link>
                        <Button variant="ghost" size="icon-sm" onClick={() => openEdit(emp)} title="Modifier" aria-label={`Modifier ${emp.firstName} ${emp.lastName}`}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                        {!emp.active && (
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            onClick={() => openCompleteDepartureModal(emp)}
                            title={emp.departureReason ? "Modifier la date ou le motif de départ" : "Renseigner le départ"}
                            aria-label={emp.departureReason ? "Modifier le départ" : "Renseigner le départ"}
                            className={cn(!emp.departureReason && "text-amber-600 hover:bg-amber-50 hover:text-amber-700")}
                          >
                            {emp.departureReason ? <PenLine className="h-4 w-4" /> : <UserMinus className="h-4 w-4" />}
                          </Button>
                        )}
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          onClick={() => openDepartureModal(emp)}
                          className={emp.active ? "hover:bg-red-50 hover:text-red-600" : "hover:bg-emerald-50 hover:text-emerald-600"}
                          title={emp.active ? "Enregistrer un départ (démission, fin de contrat…)" : "Réactiver l’employé"}
                          aria-label={emp.active ? "Enregistrer un départ" : "Réactiver"}
                        >
                          {emp.active ? <Ban className="h-4 w-4" /> : <RotateCcw className="h-4 w-4" />}
                        </Button>
                        {userRole === "ADMIN" && (
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            onClick={() => {
                              setEmployeeToDelete(emp);
                              setDeleteError(null);
                            }}
                            className="hover:bg-red-50 hover:text-red-600"
                            title="Supprimer l'employé"
                            aria-label={`Supprimer ${emp.firstName} ${emp.lastName}`}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        )}
                      </div>
                    </Td>
                  </Tr>
                );
              })
            )}
          </tbody>
        </Table>
        <Pagination
          page={page}
          totalPages={totalPages}
          total={total}
          pageSize={perPage}
          itemLabel={["employé", "employés"]}
          onPageChange={(p) => setFilters({ page: String(p) })}
        />
      </Card>

      {/* Création / modification */}
      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        dismissible={!submitting}
        title={editingId ? (form.kind === "INTERN" ? "Modifier le stagiaire" : "Modifier l'employé") : form.kind === "INTERN" ? "Nouveau stagiaire" : "Nouvel employé"}
        description={
          editingId
            ? "Modifiez les informations du collaborateur."
            : form.kind === "INTERN"
              ? "Le stagiaire pointe comme un employé, sans heures sup. Il sort automatiquement le lendemain de la fin du stage."
              : "Ajoutez un collaborateur. Avec un numéro WhatsApp, il reçoit un message de bienvenue."
        }
        size="lg"
        footer={
          <>
            <Button variant="secondary" onClick={() => setModalOpen(false)} disabled={submitting}>
              Annuler
            </Button>
            <Button type="submit" form="employee-form" loading={submitting}>
              {editingId ? "Enregistrer" : form.kind === "INTERN" ? "Créer le stagiaire" : "Créer l'employé"}
            </Button>
          </>
        }
      >
        <form id="employee-form" onSubmit={handleSubmit} className="space-y-5" noValidate>
          <div role="radiogroup" aria-label="Type de collaborateur" className="grid grid-cols-2 gap-2 rounded-xl bg-slate-100 p-1">
            {(["EMPLOYEE", "INTERN"] as const).map((k) => (
              <button
                key={k}
                type="button"
                role="radio"
                aria-checked={form.kind === k}
                onClick={() => {
                  setForm({ ...form, kind: k });
                  if (k === "INTERN") loadSupervisors();
                }}
                className={cn(
                  "flex items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                  form.kind === k ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700"
                )}
              >
                {k === "INTERN" ? <GraduationCap className="h-4 w-4" /> : <Users className="h-4 w-4" />}
                {employeeKindLabel(k)}
              </button>
            ))}
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Prénom" required error={errors.firstName}>
              {(id) => (
                <Input id={id} value={form.firstName} onChange={(e) => setForm({ ...form, firstName: e.target.value })} placeholder="Jean" aria-invalid={Boolean(errors.firstName)} autoComplete="off" />
              )}
            </Field>
            <Field label="Nom" required error={errors.lastName}>
              {(id) => (
                <Input id={id} value={form.lastName} onChange={(e) => setForm({ ...form, lastName: e.target.value })} placeholder="Kouadio" aria-invalid={Boolean(errors.lastName)} autoComplete="off" />
              )}
            </Field>
            <Field label="Structure" required>
              {(id) => (
                <Select id={id} value={form.structure} onChange={(e) => setForm({ ...form, structure: e.target.value as StructureCode })}>
                  <StructureOptions />
                </Select>
              )}
            </Field>
            <Field
              label="Service"
              required
              error={errors.service}
              hint={addingService ? "Le service sera proposé dans la liste dès l'enregistrement de l'employé." : undefined}
            >
              {(id) =>
                addingService ? (
                  <div className="flex gap-2">
                    <Input
                      id={id}
                      value={newService}
                      onChange={(e) => setNewService(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          confirmNewService();
                        } else if (e.key === "Escape") {
                          e.preventDefault();
                          setAddingService(false);
                        }
                      }}
                      placeholder="Nom du nouveau service"
                      maxLength={40}
                      autoFocus
                      autoComplete="off"
                      aria-invalid={Boolean(errors.service)}
                    />
                    <Button type="button" size="md" onClick={() => confirmNewService()}>
                      Ajouter
                    </Button>
                    <Button type="button" size="md" variant="ghost" onClick={() => setAddingService(false)}>
                      Annuler
                    </Button>
                  </div>
                ) : (
                  <Select
                    id={id}
                    value={form.service}
                    onChange={(e) => {
                      if (e.target.value === NEW_SERVICE_OPTION) {
                        setNewService("");
                        setAddingService(true);
                      } else {
                        setForm({ ...form, service: e.target.value });
                      }
                    }}
                    aria-invalid={Boolean(errors.service)}
                  >
                    <option value="">Sélectionner un service</option>
                    {services.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                    {form.service && !services.includes(form.service) && <option value={form.service}>{form.service}</option>}
                    <option value={NEW_SERVICE_OPTION}>+ Ajouter un service…</option>
                  </Select>
                )
              }
            </Field>
            <div className="sm:col-span-2">
              {editingId ? (
                <Field label="Matricule" error={errors.matricule}>
                  {(id) => (
                    <Input id={id} value={form.matricule} onChange={(e) => setForm({ ...form, matricule: e.target.value })} placeholder={`${orgStructures[0] ? STRUCTURE_BRANDS[orgStructures[0]].matriculePrefix : "MAT"}-IT-4829`} className="font-mono" />
                  )}
                </Field>
              ) : (
                <p className="rounded-xl border border-dashed border-slate-300 bg-slate-50 px-3 py-2.5 text-sm text-slate-500">
                  Matricule généré à l&apos;enregistrement :{" "}
                  <span className="font-mono text-slate-700">
                    {STRUCTURE_BRANDS[form.structure].matriculePrefix}-
                    {form.kind === "INTERN" ? INTERN_MATRICULE_CODE : form.service ? matriculeServiceCode(form.service) : "SERVICE"}-XXXX
                  </span>{" "}
                  (4 chiffres aléatoires et uniques).
                </p>
              )}
            </div>
          </div>

          {form.kind === "INTERN" && (
            <fieldset className="space-y-3 rounded-xl border border-sky-100 bg-sky-50/50 p-4">
              <legend className="sr-only">Stage</legend>
              <div>
                <p className="flex items-center gap-1.5 text-sm font-semibold text-sky-900">
                  <GraduationCap className="h-4 w-4" /> Stage
                </p>
                <p className="mt-0.5 text-xs text-sky-800/80">
                  Pointage possible du premier au dernier jour du stage. Les RH sont prévenus 7 jours avant la fin.
                </p>
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <Field label="Début du stage" required error={errors.internStart}>
                  {(id) => <Input id={id} type="date" value={form.internStart} onChange={(e) => setForm({ ...form, internStart: e.target.value })} aria-invalid={Boolean(errors.internStart)} />}
                </Field>
                <Field label="Fin du stage" required error={errors.internEnd}>
                  {(id) => <Input id={id} type="date" value={form.internEnd} min={form.internStart || undefined} onChange={(e) => setForm({ ...form, internEnd: e.target.value })} aria-invalid={Boolean(errors.internEnd)} />}
                </Field>
                <Field label="École / université" required error={errors.school} className="sm:col-span-2">
                  {(id) => <Input id={id} value={form.school} onChange={(e) => setForm({ ...form, school: e.target.value })} placeholder="Université de Douala" maxLength={160} aria-invalid={Boolean(errors.school)} />}
                </Field>
                <Field label="Filière">
                  {(id) => <Input id={id} value={form.fieldOfStudy} onChange={(e) => setForm({ ...form, fieldOfStudy: e.target.value })} placeholder="Comptabilité et gestion" maxLength={160} />}
                </Field>
                <Field label="Niveau">
                  {(id) => <Input id={id} value={form.level} onChange={(e) => setForm({ ...form, level: e.target.value })} placeholder="BTS 2, Licence 3, Master 1…" maxLength={80} />}
                </Field>
                <Field label="Encadrant (maître de stage)">
                  {(id) => (
                    <Select id={id} value={form.supervisorId} onChange={(e) => setForm({ ...form, supervisorId: e.target.value })}>
                      <option value="">{supervisors ? "— Aucun —" : "Chargement…"}</option>
                      {(supervisors ?? [])
                        .filter((s) => s.id !== editingId)
                        .map((s) => (
                          <option key={s.id} value={s.id}>
                            {s.lastName} {s.firstName} — {s.service}
                          </option>
                        ))}
                    </Select>
                  )}
                </Field>
                <Field label="Gratification mensuelle (FCFA)" error={errors.allowance} hint="Optionnel. Sert au récapitulatif mensuel.">
                  {(id) => <Input id={id} value={form.allowance} onChange={(e) => setForm({ ...form, allowance: e.target.value })} placeholder="50000" inputMode="numeric" aria-invalid={Boolean(errors.allowance)} />}
                </Field>
              </div>
            </fieldset>
          )}

          <fieldset className="space-y-3 rounded-xl border border-brand-100 bg-brand-50/50 p-4">
            <legend className="sr-only">Zones de pointage</legend>
            <div>
              <p className="text-sm font-semibold text-brand-900">Zones de pointage (jusqu&apos;à 2)</p>
              <p className="mt-0.5 text-xs text-brand-800/80">
                Le pointage (arrivée, pause, départ) est accepté dans l&apos;une ou l&apos;autre zone : bureau, usine…
              </p>
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Field label="Zone 1 — ex. siège / bureau">
                {(id) => (
                  <Select
                    id={id}
                    value={form.siteId}
                    onChange={(e) =>
                      setForm({
                        ...form,
                        siteId: e.target.value,
                        checkoutSiteId: e.target.value === form.checkoutSiteId ? "" : form.checkoutSiteId,
                      })
                    }
                  >
                    <option value="">— Choisir un site —</option>
                    {sites.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </Select>
                )}
              </Field>
              <Field label="Zone 2 — ex. usine (optionnel)">
                {(id) => (
                  <Select id={id} value={form.checkoutSiteId} onChange={(e) => setForm({ ...form, checkoutSiteId: e.target.value })} disabled={!form.siteId}>
                    <option value="">Pas de 2e zone</option>
                    {sites
                      .filter((s) => s.id !== form.siteId)
                      .map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.name}
                        </option>
                      ))}
                  </Select>
                )}
              </Field>
            </div>
            {sites.length < 2 && (
              <p className="rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-1.5 text-xs text-amber-800">
                Créez au moins 2 sites dans Paramètres → Sites pour activer la 2e zone.
              </p>
            )}
          </fieldset>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="WhatsApp principal" error={errors.whatsappPhone} hint="Format international sans +, ex. 2376XXXXXXXX">
              {(id) => (
                <Input id={id} value={form.whatsappPhone} onChange={(e) => setForm({ ...form, whatsappPhone: e.target.value })} placeholder="2376XXXXXXXX" inputMode="tel" aria-invalid={Boolean(errors.whatsappPhone)} />
              )}
            </Field>
            <Field label="WhatsApp secondaire (optionnel)" hint="Peut aussi pointer et reçoit les mêmes notifications.">
              {(id) => (
                <Input id={id} value={form.whatsappPhone2} onChange={(e) => setForm({ ...form, whatsappPhone2: e.target.value })} placeholder="2376XXXXXXXX" inputMode="tel" />
              )}
            </Field>
          </div>
        </form>
      </Modal>

      {/* Départ */}
      <Modal
        open={departureModal !== null}
        onClose={() => setDepartureModal(null)}
        dismissible={!departureSubmitting}
        title={departureModal?.active ? "Enregistrer un départ" : "Motif et date de départ"}
        description={
          departureModal ? (
            <>
              {departureModal.firstName} {departureModal.lastName}{" "}
              <span className="font-mono text-xs text-slate-400">({departureModal.matricule})</span>
            </>
          ) : undefined
        }
        footer={
          <>
            <Button variant="secondary" onClick={() => setDepartureModal(null)} disabled={departureSubmitting}>
              Annuler
            </Button>
            <Button variant={departureModal?.active ? "danger" : "primary"} onClick={() => void submitDeparture()} loading={departureSubmitting}>
              {departureModal?.active ? "Enregistrer le départ" : "Valider"}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          {departureModal?.active && (
            <p className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
              L&apos;employé passera en « Parti / inactif » : il ne pourra plus pointer.
            </p>
          )}
          <Field label="Date du départ" required>
            {(id) => <Input id={id} type="date" value={departureDate} onChange={(e) => setDepartureDate(e.target.value)} />}
          </Field>
          <Field label="Motif" required>
            {(id) => (
              <Select id={id} value={departureReason} onChange={(e) => setDepartureReason(e.target.value as DepartureReasonCode | "")}>
                <option value="">— Choisir —</option>
                <option value="RESIGNATION">Démission</option>
                <option value="END_OF_CONTRACT">Fin de contrat</option>
                <option value="DISMISSAL">Licenciement</option>
                <option value="ABANDONMENT">Abandon de poste</option>
                <option value="INTERNSHIP_END">Fin de stage</option>
              </Select>
            )}
          </Field>
          <Field label="Commentaire (optionnel)">
            {(id) => (
              <Textarea id={id} value={departureNote} onChange={(e) => setDepartureNote(e.target.value)} rows={3} placeholder="Précisions pour le dossier RH…" />
            )}
          </Field>
          {departureError && <p className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">{departureError}</p>}
        </div>
      </Modal>

      {/* Suppression (ADMIN) */}
      <Modal
        open={employeeToDelete !== null}
        onClose={() => {
          setEmployeeToDelete(null);
          setDeleteError(null);
        }}
        dismissible={!deleting}
        size="sm"
        title="Supprimer l'employé"
        footer={
          <>
            <Button
              variant="secondary"
              data-autofocus
              onClick={() => {
                setEmployeeToDelete(null);
                setDeleteError(null);
              }}
              disabled={deleting}
            >
              Annuler
            </Button>
            <Button variant="danger" onClick={handleConfirmDelete} loading={deleting} icon={<Trash2 className="h-4 w-4" />}>
              Supprimer définitivement
            </Button>
          </>
        }
      >
        {employeeToDelete && (
          <div className="space-y-3 text-sm text-slate-600">
            <p>
              Supprimer{" "}
              <strong className="text-slate-900">
                {employeeToDelete.firstName} {employeeToDelete.lastName}
              </strong>{" "}
              ({employeeToDelete.matricule}) ?
            </p>
            <p className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-red-800">
              Action irréversible : ses pointages, autorisations d&apos;absence et missions seront aussi supprimés. Pour un
              départ, préférez « Enregistrer un départ ».
            </p>
            {deleteError && <p className="rounded-xl bg-red-50 px-3 py-2 text-red-700">{deleteError}</p>}
          </div>
        )}
      </Modal>

      {attendanceExportOpen && (
        <EmployeesAttendanceExport selectedIds={selectedIds} onClose={() => setAttendanceExportOpen(false)} />
      )}
    </div>
  );
}
