import type { Metadata } from "next";
import { JetBrains_Mono, Inter, Just_Another_Hand } from "next/font/google";
import "./globals.css";

const sans = Inter({ variable: "--font-sans", subsets: ["latin"] });
const mono = JetBrains_Mono({ variable: "--font-mono", subsets: ["latin"] });
/** ISNT's hand-drawn wordmark and headline accents — identity only, never body or UI text */
const hand = Just_Another_Hand({ variable: "--font-hand", weight: "400", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "ISNT",
  description: "Hands-free chat interface controlled through head movement and facial expressions. All camera processing is local.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${sans.variable} ${mono.variable} ${hand.variable} h-full antialiased`}>
      <body className="min-h-full bg-lab-bg text-lab-fg" suppressHydrationWarning>{children}</body>
    </html>
  );
}
