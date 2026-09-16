import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Virtual Angadi | വെർച്വൽ അങ്ങാടി കച്ചവടം",
  description: "Real Kochi electronics shops, browse and compare in one place.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
