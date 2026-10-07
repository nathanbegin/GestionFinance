import { getUser } from "@/lib/auth";
import { q } from "@/lib/db";

export const dynamic = "force-dynamic";

type Sub = { endpoint?: unknown; keys?: { p256dh?: unknown; auth?: unknown } };

function valid(s: Sub): s is { endpoint: string; keys: { p256dh: string; auth: string } } {
  return (
    typeof s.endpoint === "string" &&
    s.endpoint.startsWith("https://") &&
    s.endpoint.length < 1000 &&
    typeof s.keys?.p256dh === "string" &&
    typeof s.keys?.auth === "string"
  );
}

/** Enregistre l'appareil pour recevoir les notifications de l'utilisateur connecté. */
export async function POST(request: Request) {
  const user = await getUser();
  if (!user) return Response.json({ error: "Non autorisé" }, { status: 401 });
  const sub = (await request.json().catch(() => ({}))) as Sub;
  if (!valid(sub)) return Response.json({ error: "Abonnement invalide." }, { status: 400 });
  await q(
    `INSERT INTO push_subscriptions (endpoint, user_id, p256dh, auth) VALUES ($1, $2, $3, $4)
     ON CONFLICT (endpoint) DO UPDATE SET user_id = $2, p256dh = $3, auth = $4`,
    [sub.endpoint, user.id, sub.keys.p256dh, sub.keys.auth],
  );
  return Response.json({ ok: true });
}

/** Retire l'appareil (désactivation des notifications). */
export async function DELETE(request: Request) {
  const user = await getUser();
  if (!user) return Response.json({ error: "Non autorisé" }, { status: 401 });
  const { endpoint } = (await request.json().catch(() => ({}))) as { endpoint?: unknown };
  if (typeof endpoint === "string")
    await q("DELETE FROM push_subscriptions WHERE endpoint = $1 AND user_id = $2", [endpoint, user.id]);
  return Response.json({ ok: true });
}
