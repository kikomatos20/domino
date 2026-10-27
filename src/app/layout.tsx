import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import { LOOK_BOOT_SCRIPT } from "@/lib/look";
import "./globals.css";

// Figtree (SIL Open Font License, see fonts/Figtree-OFL.txt), checked into the
// repo: no font service is called at build time or in the browser.
const figtree = localFont({
  src: "./fonts/figtree-latin-wght.woff2",
  weight: "300 900",
  display: "swap",
  variable: "--font-figtree",
});

export const metadata: Metadata = {
  title: "Domino — Partner Dominoes",
  description: "Double-six partner dominoes. First team to 100 wins.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#0f1f18",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    // data-theme is set before paint from the saved look, so React may see a
    // different value than it rendered.
    <html lang="en" data-theme="a" className={figtree.variable} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: LOOK_BOOT_SCRIPT }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
