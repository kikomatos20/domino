import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Domino — Partner Dominoes",
  description: "Double-six partner dominoes. First team to 100 wins.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
