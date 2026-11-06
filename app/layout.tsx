import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { LangProvider } from "./_components/lang";
import { PrefsProvider } from "./_components/prefs";
import "./globals.css";

export const metadata: Metadata = {
  title: "RiverCrew",
  description: "Free Texas Hold'em table for groups of friends. Play chips only, no real value. 18+.",
  // Friends-only: keep the site out of search engines.
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#0e1719",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <LangProvider>
          <PrefsProvider>{children}</PrefsProvider>
        </LangProvider>
      </body>
    </html>
  );
}
