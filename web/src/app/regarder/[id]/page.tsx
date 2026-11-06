import { Brand } from "@/components/Brand";
import Link from "next/link";
import { WatchVideo } from "@/components/WatchVideo";
export const dynamic = "force-dynamic";
export default async function Watch({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <main className="public-profile">
      <header>
        <Link className="brand" href="/">
          <Brand />
        </Link>
        <Link href="/compte">Mon espace</Link>
      </header>
      <WatchVideo id={id} />
    </main>
  );
}
