import type { Metadata, Viewport } from "next";
import "./globals.css";
import PwaRegister from "@/components/PwaRegister";

export const metadata: Metadata = {
  title: "Comptes partagés",
  description: "Suivi des dépenses et remboursements entre deux personnes",
  applicationName: "Gestion des finances",
  appleWebApp: { capable: true, title: "Finances", statusBarStyle: "default" },
  icons: { icon: "/pwa-icon?size=192", apple: "/pwa-icon?size=180" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#2459d6" },
    { media: "(prefers-color-scheme: dark)", color: "#12161c" },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr-CA">
      <body>
        {children}
        <PwaRegister />
      </body>
    </html>
  );
}
