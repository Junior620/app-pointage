"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { Plus, Trash2, MessageSquare, X } from "lucide-react";

interface Remark {
  id: string;
  category: string;
  content: string;
  createdAt: string;
  author: { id: string; name: string; role: string };
}

const CATEGORIES: Record<string, { label: string; color: string }> = {
  avertissement: { label: "Avertissement", color: "bg-red-100 text-red-700" },
  retard_repete: { label: "Retard répété", color: "bg-orange-100 text-orange-700" },
  absence_injustifiee: { label: "Absence injustifiée", color: "bg-amber-100 text-amber-700" },
  observation: { label: "Observation", color: "bg-blue-100 text-blue-700" },
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
  const [content, setContent] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const canAdd = userRole === "ADMIN" || userRole === "HR";
  const canDelete = userRole === "ADMIN";

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
        body: JSON.stringify({ category, content: content.trim() }),
      });
      if (res.ok) {
        const json = await res.json();
        setRemarks((prev) => [json.data, ...prev]);
        setContent("");
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

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-base font-semibold text-slate-800 flex items-center gap-2">
          <MessageSquare className="w-4 h-4" />
          Observations RH
        </h3>
        {canAdd && (
          <button
            onClick={() => setShowForm(!showForm)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
          >
            {showForm ? <X className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
            {showForm ? "Annuler" : "Ajouter"}
          </button>
        )}
      </div>

      {showForm && (
        <div className="mb-4 p-4 bg-slate-50 rounded-xl border border-slate-200 space-y-3">
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            {Object.entries(CATEGORIES).map(([key, { label }]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </select>
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder="Saisissez votre observation..."
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
            <div key={i} className="h-16 bg-slate-100 rounded-lg animate-pulse" />
          ))}
        </div>
      ) : remarks.length === 0 ? (
        <p className="text-sm text-slate-400 text-center py-6">
          Aucune observation pour cet employé.
        </p>
      ) : (
        <div className="space-y-3">
          {remarks.map((r) => {
            const cat = CATEGORIES[r.category] || CATEGORIES.observation;
            return (
              <div
                key={r.id}
                className="flex items-start gap-3 p-3 rounded-lg border border-slate-100 hover:bg-slate-50 transition-colors"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span
                      className={cn(
                        "inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium",
                        cat.color
                      )}
                    >
                      {cat.label}
                    </span>
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
  );
}
