import type { Metadata } from "next";
import "@fontsource-variable/archivo";
import "@fontsource-variable/azeret-mono";
import "@fontsource-variable/caveat";
import "./globals.css";

export const metadata: Metadata = {
  title: "Snappy Booth — CTRL OVERDRIVE",
  description: "A local-first party photo booth for CTRL OVERDRIVE.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
