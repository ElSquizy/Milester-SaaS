import type { Metadata } from "next";
import { Inter, Geist_Mono } from "next/font/google";
import "./globals.css";
import AppChrome from "@/components/AppChrome";

const inter = Inter({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Milester",
  description: "Gestión de catálogos para Tienda Nube",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es" className={`${inter.variable} ${geistMono.variable}`} suppressHydrationWarning>
      <body style={{ display: "flex", minHeight: "100dvh" }}>
        <AppChrome />
        <div className="app-main" style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", overflow: "hidden" }}>
          {children}
        </div>
      </body>
    </html>
  );
}
