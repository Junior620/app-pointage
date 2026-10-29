"use client";

import { useRouter } from "next/navigation";
import { GraduationCap } from "lucide-react";
import { fmtDayFr, fmtDayLongFr } from "@/lib/export-format";
import {
  INTERN_STATUS_LABELS,
  fmtFcfa,
  internshipCountdownLabel,
  internshipPhase,
  internshipProgress,
  schoolLine,
  type InternStatus,
} from "@/lib/interns";
import { Card } from "@/components/ui/Card";
import { Badge, type BadgeTone } from "@/components/ui/Badge";
import { InternActions, type InternTarget } from "@/components/interns/InternActions";
import { InternCertificateButtons } from "@/components/interns/InternCertificateButtons";

export type InternshipCardData = InternTarget & {
  internship: InternTarget["internship"] & {
    school: string;
    fieldOfStudy: string | null;
    level: string | null;
    monthlyAllowance: number | null;
    supervisorName: string | null;
  };
};

const STATUS_TONE: Record<InternStatus, BadgeTone> = { ongoing: "success", upcoming: "info", ended: "neutral", hired: "violet" };

/** Fiche de stage d'un stagiaire (ou d'un ancien stagiaire embauché). */
export default function InternshipCard({ intern, today }: { intern: InternshipCardData; today: string }) {
  const router = useRouter();
  const i = intern.internship;
  const phase = internshipPhase(i, today);
  const status: InternStatus = intern.kind === "EMPLOYEE" ? "hired" : !intern.active || phase === "ended" ? "ended" : phase;
  const progress = Math.round(internshipProgress(i, today) * 100);

  return (
    <Card className="p-5 sm:p-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <p className="flex items-center gap-2 text-sm font-semibold text-slate-900">
            <GraduationCap className="h-4 w-4 text-sky-600" />
            {status === "hired" ? "Ancien stage" : "Stage"}
            <Badge tone={STATUS_TONE[status]}>{INTERN_STATUS_LABELS[status]}</Badge>
            {status === "ongoing" && <span className="text-xs font-medium text-slate-500">{internshipCountdownLabel(i, today)}</span>}
          </p>
          <p className="mt-1 text-sm text-slate-600">{schoolLine(i)}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <InternCertificateButtons employeeId={intern.id} />
          <InternActions intern={intern} onDone={() => router.refresh()} />
        </div>
      </div>

      <div className="mt-4">
        <div className="flex justify-between text-xs text-slate-500">
          <span>Du {fmtDayLongFr(i.startDate)}</span>
          <span>au {fmtDayLongFr(i.endDate)}</span>
        </div>
        <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-slate-100" role="progressbar" aria-valuenow={progress} aria-valuemin={0} aria-valuemax={100} aria-label="Avancement du stage">
          <div className="h-full rounded-full bg-sky-500" style={{ width: `${progress}%` }} />
        </div>
      </div>

      <dl className="mt-4 grid grid-cols-1 gap-x-6 gap-y-2 text-sm sm:grid-cols-3">
        <div>
          <dt className="text-xs text-slate-500">Encadrant</dt>
          <dd className="font-medium text-slate-800">{i.supervisorName ?? "—"}</dd>
        </div>
        <div>
          <dt className="text-xs text-slate-500">Gratification mensuelle</dt>
          <dd className="font-medium text-slate-800">{fmtFcfa(i.monthlyAllowance)}</dd>
        </div>
        <div>
          <dt className="text-xs text-slate-500">Durée</dt>
          <dd className="font-medium text-slate-800">
            {fmtDayFr(i.startDate)} – {fmtDayFr(i.endDate)}
          </dd>
        </div>
      </dl>
    </Card>
  );
}
