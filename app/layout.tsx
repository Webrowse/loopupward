import type { Metadata, Viewport } from "next";
import { Crimson_Pro, Fraunces, Instrument_Sans, Lora, Playfair_Display, Source_Serif_4 } from "next/font/google";
import "./globals.css";
import { FONT_OPTIONS } from "@/lib/fonts";

// Display font options a person can choose between in Settings — see
// lib/fonts.ts for the shared list and app/(app)/you/page.tsx for the
// picker. Instrument Sans (the body/UI font) is never swappable: every
// screen's spacing was tuned around its metrics.
const fraunces = Fraunces({
  variable: "--font-fraunces",
  subsets: ["latin"],
  axes: ["SOFT", "WONK", "opsz"],
});
const lora = Lora({ variable: "--font-lora", subsets: ["latin"] });
const playfair = Playfair_Display({ variable: "--font-playfair", subsets: ["latin"] });
const crimson = Crimson_Pro({ variable: "--font-crimson", subsets: ["latin"] });
const sourceSerif = Source_Serif_4({ variable: "--font-source-serif", subsets: ["latin"] });

const instrument = Instrument_Sans({
  variable: "--font-instrument",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "LoopUpward: a place where you build yourself",
  description:
    "Capture the person you want to become, turn intentions into systems, act daily, and see your life move forward.",
  applicationName: "LoopUpward",
  appleWebApp: { capable: true, statusBarStyle: "default", title: "LoopUpward" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#faf7f1" },
    { media: "(prefers-color-scheme: dark)", color: "#151310" },
  ],
};

const themeInit = `(function(){try{var t=localStorage.getItem("lifeos-theme");if(t==="dark"||(!t&&matchMedia("(prefers-color-scheme: dark)").matches))document.documentElement.dataset.theme="dark"}catch(e){}})()`;

const fontIds = JSON.stringify(FONT_OPTIONS.map((f) => f.id));
const fontInit = `(function(){try{var f=localStorage.getItem("lifeos-font");if(f&&${fontIds}.indexOf(f)>-1)document.documentElement.dataset.font=f}catch(e){}})()`;

const fontVariables = `${fraunces.variable} ${lora.variable} ${playfair.variable} ${crimson.variable} ${sourceSerif.variable} ${instrument.variable}`;

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${fontVariables} h-full antialiased`} suppressHydrationWarning>
      <body className="min-h-full paper-grain">
        <script dangerouslySetInnerHTML={{ __html: themeInit }} />
        <script dangerouslySetInnerHTML={{ __html: fontInit }} />
        {children}
      </body>
    </html>
  );
}
