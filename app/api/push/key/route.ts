import { getUser } from "@/lib/auth";
import { vapidPublicKey } from "@/lib/push";

export const dynamic = "force-dynamic";

/** Clé publique nécessaire au navigateur pour s'abonner aux notifications. */
export async function GET() {
  if (!(await getUser())) return Response.json({ error: "Non autorisé" }, { status: 401 });
  return Response.json({ publicKey: vapidPublicKey() }, { headers: { "Cache-Control": "no-store" } });
}
