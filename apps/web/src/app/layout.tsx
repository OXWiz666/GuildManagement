import type { Metadata, Viewport } from "next";
import { Inter, Cinzel, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { ThemeProvider } from "@/lib/theme-context";
import { AuthProvider } from "@/lib/auth-context";
import { ToastProvider } from "@/components/ui/Toast";

// Self-hosted via next/font — non-render-blocking, no FOUC, no remote @import.
const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

const cinzel = Cinzel({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800", "900"],
  variable: "--font-cinzel",
  display: "swap",
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-jetbrains",
  display: "swap",
});

const SITE_URL = "https://forgekeep.io";
const SITE_TITLE = "ForgeKeep — Guild Command Center for MMORPG Guilds";
const SITE_DESCRIPTION =
  "Live boss spawn timers, tamper-proof attendance verification, and an audited guild treasury — the command center competitive MMORPG guilds run on. Track boss rotations, guild points, and DKP loot distribution in one place.";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: SITE_TITLE,
    template: "%s | ForgeKeep",
  },
  description: SITE_DESCRIPTION,
  keywords: [
    "guild management software",
    "MMORPG guild manager",
    "boss spawn timer tracker",
    "guild attendance tracker",
    "DKP loot distribution",
    "guild treasury ledger",
    "raid attendance verification",
    "Discord guild bot",
  ],
  applicationName: "ForgeKeep",
  authors: [{ name: "ForgeKeep" }],
  category: "Gaming",
  alternates: {
    canonical: "/",
  },
  robots: {
    index: true,
    follow: true,
    googleBot: { index: true, follow: true },
  },
  openGraph: {
    type: "website",
    url: SITE_URL,
    siteName: "ForgeKeep",
    title: SITE_TITLE,
    description: SITE_DESCRIPTION,
  },
  twitter: {
    card: "summary_large_image",
    title: SITE_TITLE,
    description: SITE_DESCRIPTION,
  },
  icons: {
    icon: "/icon.png",
  },
};

// Mobile viewport: device-width so phones render at true scale, and
// viewportFit "cover" so the app can pad around notches / home indicators via
// env(safe-area-inset-*). themeColor matches --obsidian-deep so the browser
// chrome blends with the app on mobile.
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#08080c",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      data-theme="dark"
      suppressHydrationWarning
      className={`${inter.variable} ${cinzel.variable} ${jetbrainsMono.variable}`}
    >
      <body className="antialiased min-h-screen">
        <ThemeProvider>
          <AuthProvider>
            <ToastProvider>{children}</ToastProvider>
          </AuthProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
