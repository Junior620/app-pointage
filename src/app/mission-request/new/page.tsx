import { Suspense } from "react";
import type { Metadata } from "next";
import { PublicFormLoading } from "@/components/layout/PublicFormStates";
import MissionRequestNewForm from "./MissionRequestNewForm";

export const metadata: Metadata = {
  title: "Demande d'ordre de mission",
};

export default function MissionRequestNewPage() {
  return (
    <Suspense fallback={<PublicFormLoading />}>
      <MissionRequestNewForm />
    </Suspense>
  );
}
