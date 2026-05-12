import { Suspense } from "react";
import type { Metadata } from "next";
import LeaveRequestNewForm from "./LeaveRequestNewForm";

export const metadata: Metadata = {
  title: "Demande d'autorisation d'absence | Pointage RH",
  robots: "noindex, nofollow",
};

export default function LeaveRequestNewPage() {
  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-100 to-slate-200 px-4 py-10">
      <Suspense
        fallback={
          <div className="flex min-h-[40vh] items-center justify-center text-slate-500 text-sm">
            Chargement…
          </div>
        }
      >
        <LeaveRequestNewForm />
      </Suspense>
    </div>
  );
}
