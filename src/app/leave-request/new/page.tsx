import { Suspense } from "react";
import type { Metadata } from "next";
import { PublicFormLoading } from "@/components/layout/PublicFormStates";
import LeaveRequestNewForm from "./LeaveRequestNewForm";

export const metadata: Metadata = {
  title: "Demande d'autorisation d'absence",
};

export default function LeaveRequestNewPage() {
  return (
    <Suspense fallback={<PublicFormLoading />}>
      <LeaveRequestNewForm />
    </Suspense>
  );
}
