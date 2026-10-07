import { getUser } from "@/lib/auth";
import { q } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getUser();
  if (!user) return new Response("Non autorisé", { status: 401 });
  const id = Number((await params).id);
  if (!Number.isInteger(id)) return new Response("Introuvable", { status: 404 });

  const rows = await q<{ filename: string; content_type: string; b64: string }>(
    `SELECT filename, content_type, encode(data, 'base64') AS b64
     FROM attachments WHERE id = $1 AND ledger_id = $2 AND deleted_at IS NULL`,
    [id, user.ledger_id],
  );
  if (!rows.length) return new Response("Introuvable", { status: 404 });
  const { filename, content_type, b64 } = rows[0];

  return new Response(Buffer.from(b64, "base64"), {
    headers: {
      "Content-Type": content_type, // type déterminé à l'envoi d'après le contenu réel
      "Content-Disposition": `inline; filename*=UTF-8''${encodeURIComponent(filename)}`,
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "private, no-store",
    },
  });
}
