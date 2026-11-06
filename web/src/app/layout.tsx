import type { Metadata } from "next";
import { NetworkStatus } from "@/components/NetworkStatus";
import "./styles.css";

export const metadata: Metadata = {
  title: "TALA — Chaque regard compte.",
  description:
    "Les voix, les histoires et les créateurs africains. Chaque regard compte.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="fr">
      <body>
        <NetworkStatus />
        {children}
      </body>
    </html>
  );
}
