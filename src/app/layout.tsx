import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  applicationName: "Sextou Delivery",
  title: {
    default: "Sextou Delivery — delivery local em uma base operável",
    template: "%s | Sextou Delivery",
  },
  description:
    "Fundação do PWA Sextou Delivery para consumidores, estabelecimentos e administração do marketplace local.",
  keywords: [
    "Sextou Delivery",
    "delivery local",
    "PWA",
    "restaurantes",
    "marketplace",
  ],
  authors: [{ name: "Sextou Delivery" }],
  creator: "Sextou Delivery",
  openGraph: {
    title: "Sextou Delivery",
    description:
      "Base mobile-first para operar catálogo, estabelecimentos, pedidos e administração do delivery local.",
    locale: "pt_BR",
    siteName: "Sextou Delivery",
    type: "website",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#f97316",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="pt-BR"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full bg-background text-foreground">{children}</body>
    </html>
  );
}
