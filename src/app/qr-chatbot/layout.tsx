import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "QR code WhatsApp",
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
