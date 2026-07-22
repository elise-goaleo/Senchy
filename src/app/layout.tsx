import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { SessionProvider } from "@/components/providers/SessionProvider";
import { ToastProvider } from "@/components/ui/toast";
import { Toaster } from "@/components/ui/toaster";
import { auth } from "@/lib/auth";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
});

export const metadata: Metadata = {
  title: {
    default: "Senchy — Bike Trip Planner",
    template: "%s | Senchy",
  },
  description:
    "Plan your perfect bike trip. Manage GPX routes, track elevation, find points of interest, and prepare for any adventure.",
  keywords: ["bike", "cycling", "trip planner", "GPX", "route planning"],
  applicationName: "Senchy",
  manifest: "/manifest.webmanifest",
  icons: {
    icon: "/icon-192.png",
    apple: "/apple-touch-icon.png",
  },
  // Permet l'ajout à l'écran d'accueil iOS en mode plein écran
  appleWebApp: {
    capable: true,
    title: "Senchy",
    statusBarStyle: "default",
  },
};

export const viewport: Viewport = {
  themeColor: "#9AAB92",
  width: "device-width",
  initialScale: 1,
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();

  return (
    <html lang="en" className={inter.variable}>
      <body className="min-h-screen bg-slate-50 font-sans">
        <SessionProvider session={session}>
          <ToastProvider>
            {children}
            <Toaster />
          </ToastProvider>
        </SessionProvider>
      </body>
    </html>
  );
}
