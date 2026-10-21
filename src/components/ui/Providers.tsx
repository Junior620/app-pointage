"use client";

import type { ReactNode } from "react";
import { ToastProvider } from "./Toaster";
import { ConfirmProvider } from "./ConfirmDialog";

export default function Providers({ children }: { children: ReactNode }) {
  return (
    <ToastProvider>
      <ConfirmProvider>{children}</ConfirmProvider>
    </ToastProvider>
  );
}
