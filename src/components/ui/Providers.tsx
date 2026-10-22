"use client";

import type { ReactNode } from "react";
import { ToastProvider } from "./Toaster";
import { ConfirmProvider } from "./ConfirmDialog";
import { OrgProvider, type OrgClientInfo } from "@/components/org/OrgProvider";

export default function Providers({ org, children }: { org: OrgClientInfo; children: ReactNode }) {
  return (
    <OrgProvider org={org}>
      <ToastProvider>
        <ConfirmProvider>{children}</ConfirmProvider>
      </ToastProvider>
    </OrgProvider>
  );
}
