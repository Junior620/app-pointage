import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Pointages",
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
