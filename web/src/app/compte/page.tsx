import { Account } from "@/components/Account";
export const dynamic = "force-dynamic";
export default async function AccountPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const query = await searchParams;
  return (
    <Account
      initialTab={
        ["videos", "messages", "security"].includes(query.onglet || "")
          ? query.onglet
          : "profile"
      }
    />
  );
}
