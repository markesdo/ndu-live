import type { Metadata, Viewport } from "next";
import { Bricolage_Grotesque, Instrument_Sans, JetBrains_Mono } from "next/font/google";
import "./globals.css";

// Dieselben Schriften wie die Kurs-Website. next/font lädt sie beim Build und liefert sie selbst aus –
// kein Aufruf bei Google im Hörsaal.
const display = Bricolage_Grotesque({ subsets: ["latin", "latin-ext"], variable: "--nf-display", display: "swap" });
const sans = Instrument_Sans({ subsets: ["latin", "latin-ext"], variable: "--nf-body", display: "swap" });
const mono = JetBrains_Mono({ subsets: ["latin", "latin-ext"], variable: "--nf-code", display: "swap" });

export const metadata: Metadata = {
  title: "NDU Live",
  description: "Live-Mitmach-App für den Kurs „Programmieren mit AI“ – NDU 2026",
};

// Kein maximumScale: Zoomen sperren schadet der Barrierefreiheit. Gegen das Auto-Zoom von iOS
// haben alle Eingabefelder mindestens 16 px Schrift.
// resizes-content: Die Tastatur verkleinert das Layout, statt den Button zu verdecken.
export const viewport: Viewport = {
  themeColor: "#121216",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  interactiveWidget: "resizes-content",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="de" className={`h-full antialiased ${display.variable} ${sans.variable} ${mono.variable}`}>
      <body className="min-h-full">{children}</body>
    </html>
  );
}
