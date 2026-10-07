import { getUser } from "@/lib/auth";
import { q } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getUser();
  if (!user) return new Response("Non autorisé", { status: 401 });
  const id = Number((await params).id);
  if (!Number.isInteger(id)) return new Response("Introuvable", { status: 404 });

  const rows = await q<{ logo_type: string; b64: string }>(
    `SELECT logo_type, encode(logo_data, 'base64') AS b64
     FROM suppliers WHERE id = $1 AND ledger_id = $2 AND logo_data IS NOT NULL`,
    [id, user.ledger_id],
  );
  if (!rows.length) return new Response("Introuvable", { status: 404 });

  return new Response(Buffer.from(rows[0].b64, "base64"), {
    headers: {
      "Content-Type": rows[0].logo_type,
      "X-Content-Type-Options": "nosniff",
      // L'adresse contient une version (?v=) : le navigateur peut garder le logo longtemps.
      "Cache-Control": "private, max-age=31536000, immutable",
    },
  });
}
