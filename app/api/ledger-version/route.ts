import { getUser } from "@/lib/auth";
import { q } from "@/lib/db";

export const dynamic = "force-dynamic";

/** Dernier événement du journal : sert de « numéro de version » pour la mise à jour en direct. */
export async function GET() {
  const user = await getUser();
  if (!user) return Response.json({ error: "unauthorized" }, { status: 401 });
  const rows = await q<{ id: number; action: string; user_id: number; name: string }>(
    `SELECT a.id, a.action, a.user_id, u.name FROM audit_log a JOIN users u ON u.id = a.user_id
     WHERE a.ledger_id = $1 ORDER BY a.id DESC LIMIT 1`,
    [user.ledger_id],
  );
  const last = rows[0];
  return Response.json(
    { id: last?.id ?? 0, action: last?.action ?? null, by: last?.name ?? null, mine: last?.user_id === user.id },
    { headers: { "Cache-Control": "no-store" } },
  );
}
