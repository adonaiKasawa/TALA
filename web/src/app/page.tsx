import { Feed } from "@/components/feed/Feed";
export const dynamic = "force-dynamic";
export default async function Home({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const query = await searchParams;
  return <Feed key={JSON.stringify(query)} query={query} />;
}
