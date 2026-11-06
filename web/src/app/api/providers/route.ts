import { config } from "@/lib/config";
import { json } from "@/lib/http";
export async function GET() {
  try {
    const response = await fetch(`${config().issuer}/federation/providers`, {
      cache: "no-store",
      signal: AbortSignal.timeout(5000),
    });
    return json(await response.json(), response.status);
  } catch {
    return json({ message: "Fournisseurs indisponibles." }, 503);
  }
}
