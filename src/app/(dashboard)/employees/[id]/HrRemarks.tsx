"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import {
  Plus,
  Trash2,
  MessageSquare,
  X,
  AlertTriangle,
  ShieldAlert,
  Scale,
  Ban,
  ChevronRight,
} from "lucide-react";

interface Remark {
  id: string;
  category: string;
  level: number | null;
  content: string;
  createdAt: string;
  author: { id: string; name: string; role: string };
}

const CATEGORIES: Record<
  string,
  { label: string; color: string; icon?: string }
> = {
  avertissement: {
    label: "Avertissement",
    color: "bg-red-100 text-red-700",
  },
  mise_a_pied: {
    label: "Mise à pied",
    color: "bg-red-200 text-red-800",
  },
  convocation: {
    label: "Convocation",
    color: "bg-purple-100 text-purple-700",
  },
  licenciement: {
    label: "Licenciement",
    color: "bg-red-300 text-red-900",
  },
  retard_repete: {
    label: "Retard répété",
    color: "bg-orange-100 text-orange-700",
  },
  absence_injustifiee: {
    label: "Absence injustifiée",
    color: "bg-amber-100 text-amber-700",
  },
  observation: {
    label: "Observation",
    color: "bg-blue-100 text-blue-700",
  },
};

const DISCIPLINARY_CATEGORIES = [
  "avertissement",
  "mise_a_pied",
  "convocation",
  "licenciement",
];

const LEVEL_LABELS: Record<number, { label: string; color: string }> = {
  1: { label: "1er avertissement (verbal)", color: "text-yellow-600" },
  2: { label: "2e avertissement (écrit)", color: "text-orange-600" },
  3: { label: "3e avertissement", color: "text-red-500" },
  4: { label: "Mise à pied disciplinaire", color: "text-red-600" },
  5: { label: "Convocation au conseil", color: "text-purple-600" },
  6: { label: "Licenciement", color: "text-red-800" },
};

export default function HrRemarks({
  employeeId,
  userRole,
}: {
  employeeId: string;
  userRole: string;
}) {
  const [remarks, setRemarks] = useState<Remark[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [category, setCategory] = useState("observation");
  const [level, setLevel] = useState<number | null>(null);
  const [content, setContent] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [activeTab, setActiveTab] = useState<"all" | "disciplinary">("all");

  const canAdd = userRole === "ADMIN" || userRole === "HR";
  const canDelete = userRole === "ADMIN";

  const isDisciplinaryCategory = DISCIPLINARY_CATEGORIES.includes(category);

  useEffect(() => {
    fetch(`/api/employees/${employeeId}/remarks`)
      .then((r) => r.json())
      .then((json) => setRemarks(json.data ?? []))
      .catch(() => setRemarks([]))
      .finally(() => setLoading(false));
  }, [employeeId]);

  const handleAdd = async () => {
    if (!content.trim()) return;
    setSubmitting(true);
    try {
      const res = await fetch(`/api/employees/${employeeId}/remarks`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          category,
          level: isDisciplinaryCategory ? level : null,
          content: content.trim(),
        }),
      });
      if (res.ok) {
        const json = await res.json();
        setRemarks((prev) => [json.data, ...prev]);
        setContent("");
        setLevel(null);
        setShowForm(false);
      }
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (remarkId: string) => {
    const res = await fetch(
      `/api/employees/${employeeId}/remarks?remarkId=${remarkId}`,
      { method: "DELETE" }
    );
    if (res.ok) {
      setRemarks((prev) => prev.filter((r) => r.id !== remarkId));
    }
  };

  const disciplinaryRemarks = remarks
    .filter((r) => DISCIPLINARY_CATEGORIES.includes(r.category))
    .sort(
      (a, b) =>
        new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
    );

  const maxLevel = disciplinaryRemarks.reduce(
    (max, r) => Math.max(max, r.level ?? 0),
    0
  );

  const filteredRemarks =
    activeTab === "disciplinary"
      ? remarks.filter((r) => DISCIPLINARY_CATEGORIES.includes(r.category))
      : remarks;

  return (
    <div className="space-y-4">
      {disciplinaryRemarks.length > 0 && (
        <div className="bg-white rounded-xl border border-red-200 p-6">
          <h3 className="text-base font-semibold text-slate-800 flex items-center gap-2 mb-4">
            <ShieldAlert className="w-4 h-4 text-red-600" />
            Suivi disciplinaire
          </h3>

          <div className="flex items-center gap-1 mb-4 overflow-x-auto pb-2">
            {[1, 2, 3, 4, 5, 6].map((lvl) => {
              const info = LEVEL_LABELS[lvl];
              const reached = maxLevel >= lvl;
              const hasRemark = disciplinaryRemarks.some(
                (r) => r.level === lvl
              );
              return (
                <div key={lvl} className="flex items-center">
                  <div
                    className={cn(
                      "flex flex-col items-center px-2 py-1.5 rounded-lg min-w-[100px] text-center transition-all",
                      reached
                        ? "bg-red-50 border border-red-200"
                        : "bg-slate-50 border border-slate-200 opacity-50"
                    )}
                  >
                    <div
                      className={cn(
                        "w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold mb-1",
                        reached
                          ? "bg-red-600 text-white"
                          : "bg-slate-300 text-white"
                      )}
                    >
                      {lvl}
                    </div>
                    <span
                      className={cn(
                        "text-[10px] leading-tight font-medium",
                        reached ? info.color : "text-slate-400"
                      )}
                    >
                      {info.label}
                    </span>
                    {hasRemark && (
                      <span className="text-[9px] text-red-500 mt-0.5">
                        {
                          disciplinaryRemarks.find((r) => r.level === lvl)
                            ?.createdAt
                            ? new Date(
                                disciplinaryRemarks.find(
                                  (r) => r.level === lvl
                                )!.createdAt
                              ).toLocaleDateString("fr-FR", {
                                day: "2-digit",
                                month: "short",
                              })
                            : ""
                        }
                      </span>
                    )}
                  </div>
                  {lvl < 6 && (
                    <ChevronRight
                      className={cn(
                        "w-3 h-3 mx-0.5 shrink-0",
                        maxLevel > lvl ? "text-red-400" : "text-slate-300"
                      )}
                    />
                  )}
                </div>
              );
            })}
          </div>

          <div className="flex items-center gap-2 text-sm">
            {maxLevel === 0 && (
              <span className="text-slate-500">
                Aucun niveau disciplinaire atteint
              </span>
            )}
            {maxLevel > 0 && maxLevel < 4 && (
              <span className="flex items-center gap-1 text-orange-600">
                <AlertTriangle className="w-3.5 h-3.5" />
                Niveau actuel : {LEVEL_LABELS[maxLevel].label}
              </span>
            )}
            {maxLevel >= 4 && maxLevel < 6 && (
              <span className="flex items-center gap-1 text-red-600 font-medium">
                <Scale className="w-3.5 h-3.5" />
                Niveau critique : {LEVEL_LABELS[maxLevel].label}
              </span>
            )}
            {maxLevel >= 6 && (
              <span className="flex items-center gap-1 text-red-800 font-bold">
                <Ban className="w-3.5 h-3.5" />
                {LEVEL_LABELS[6].label}
              </span>
            )}
            <span className="text-slate-400 text-xs ml-auto">
              {disciplinaryRemarks.length} action(s) disciplinaire(s)
            </span>
          </div>
        </div>
      )}

      <div className="bg-white rounded-xl border border-slate-200 p-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-4">
            <h3 className="text-base font-semibold text-slate-800 flex items-center gap-2">
              <MessageSquare className="w-4 h-4" />
              Observations RH
            </h3>
            <div className="flex rounded-lg border border-slate-200 overflow-hidden text-xs">
              <button
                onClick={() => setActiveTab("all")}
                className={cn(
                  "px-3 py-1.5 transition-colors",
                  activeTab === "all"
                    ? "bg-blue-50 text-blue-600 font-medium"
                    : "text-slate-500 hover:bg-slate-50"
                )}
              >
                Toutes ({remarks.length})
              </button>
              <button
                onClick={() => setActiveTab("disciplinary")}
                className={cn(
                  "px-3 py-1.5 transition-colors border-l border-slate-200",
                  activeTab === "disciplinary"
                    ? "bg-red-50 text-red-600 font-medium"
                    : "text-slate-500 hover:bg-slate-50"
                )}
              >
                Disciplinaire (
                {
                  remarks.filter((r) =>
                    DISCIPLINARY_CATEGORIES.includes(r.category)
                  ).length
                }
                )
              </button>
            </div>
          </div>
          {canAdd && (
            <button
              onClick={() => setShowForm(!showForm)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
            >
              {showForm ? (
                <X className="w-4 h-4" />
              ) : (
                <Plus className="w-4 h-4" />
              )}
              {showForm ? "Annuler" : "Ajouter"}
            </button>
          )}
        </div>

        {showForm && (
          <div className="mb-4 p-4 bg-slate-50 rounded-xl border border-slate-200 space-y-3">
            <select
              value={category}
              onChange={(e) => {
                setCategory(e.target.value);
                if (!DISCIPLINARY_CATEGORIES.includes(e.target.value))
                  setLevel(null);
              }}
              className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              {Object.entries(CATEGORIES).map(([key, { label }]) => (
                <option key={key} value={key}>
                  {label}
                </option>
              ))}
            </select>

            {isDisciplinaryCategory && (
              <select
                value={level ?? ""}
                onChange={(e) =>
                  setLevel(e.target.value ? parseInt(e.target.value) : null)
                }
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-red-500"
              >
                <option value="">-- Niveau disciplinaire --</option>
                {Object.entries(LEVEL_LABELS).map(([val, { label }]) => (
                  <option key={val} value={val}>
                    Niveau {val} – {label}
                  </option>
                ))}
              </select>
            )}

            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="Décrivez la situation, les faits, la décision prise..."
              rows={3}
              className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
            />
            <div className="flex justify-end">
              <button
                onClick={handleAdd}
                disabled={submitting || !content.trim()}
                className="px-4 py-2 text-sm font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
              >
                {submitting ? "Enregistrement..." : "Enregistrer"}
              </button>
            </div>
          </div>
        )}

        {loading ? (
          <div className="space-y-3">
            {[1, 2].map((i) => (
              <div
                key={i}
                className="h-16 bg-slate-100 rounded-lg animate-pulse"
              />
            ))}
          </div>
        ) : filteredRemarks.length === 0 ? (
          <p className="text-sm text-slate-400 text-center py-6">
            {activeTab === "disciplinary"
              ? "Aucune action disciplinaire."
              : "Aucune observation pour cet employé."}
          </p>
        ) : (
          <div className="space-y-3">
            {filteredRemarks.map((r) => {
              const cat = CATEGORIES[r.category] || CATEGORIES.observation;
              const levelInfo = r.level ? LEVEL_LABELS[r.level] : null;
              return (
                <div
                  key={r.id}
                  className={cn(
                    "flex items-start gap-3 p-3 rounded-lg border transition-colors",
                    DISCIPLINARY_CATEGORIES.includes(r.category)
                      ? "border-red-100 hover:bg-red-50/50"
                      : "border-slate-100 hover:bg-slate-50"
                  )}
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <span
                        className={cn(
                          "inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium",
                          cat.color
                        )}
                      >
                        {cat.label}
                      </span>
                      {levelInfo && (
                        <span
                          className={cn(
                            "inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-slate-100",
                            levelInfo.color
                          )}
                        >
                          Niv. {r.level}
                        </span>
                      )}
                      <span className="text-xs text-slate-400">
                        {new Date(r.createdAt).toLocaleDateString("fr-FR", {
                          day: "2-digit",
                          month: "short",
                          year: "numeric",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </span>
                    </div>
                    <p className="text-sm text-slate-700">{r.content}</p>
                    <p className="text-xs text-slate-400 mt-1">
                      Par {r.author.name} ({r.author.role})
                    </p>
                  </div>
                  {canDelete && (
                    <button
                      onClick={() => handleDelete(r.id)}
                      className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors shrink-0"
                      title="Supprimer"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
