import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Pointage géolocalisé",
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
