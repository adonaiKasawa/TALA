import Link from "next/link";
import { WebSearch } from "@/components/Space";
export default function SearchPage() {
  return (
    <main className="workspace-main">
      <p>
        <Link href="/">← Accueil</Link>
      </p>
      <WebSearch />
    </main>
  );
}
