import { get } from "@vercel/blob";
import { getUser } from "@/lib/auth";
import { q } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getUser();
  if (!user) return new Response("Non autorisé", { status: 401 });
  const id = Number((await params).id);
  if (!Number.isInteger(id)) return new Response("Introuvable", { status: 404 });

  // Les anciennes pièces jointes sont stockées dans la base (data) ; les nouvelles dans Vercel Blob.
  const rows = await q<{ filename: string; content_type: string; size_bytes: number; blob_pathname: string | null; b64: string | null }>(
    `SELECT filename, content_type, size_bytes, blob_pathname,
            CASE WHEN blob_pathname IS NULL THEN encode(data, 'base64') END AS b64
     FROM attachments WHERE id = $1 AND ledger_id = $2 AND deleted_at IS NULL`,
    [id, user.ledger_id],
  );
  if (!rows.length) return new Response("Introuvable", { status: 404 });
  const { filename, content_type, size_bytes, blob_pathname, b64 } = rows[0];

  let body: BodyInit;
  if (blob_pathname) {
    const res = await get(blob_pathname, { access: "private" });
    if (!res || res.statusCode !== 200) return new Response("Introuvable", { status: 404 });
    body = res.stream; // diffusé en continu : pas de limite de 4,5 Mo
  } else if (b64) {
    body = Buffer.from(b64, "base64");
  } else {
    return new Response("Introuvable", { status: 404 });
  }

  return new Response(body, {
    headers: {
      "Content-Type": content_type, // type déterminé à l'envoi d'après le contenu réel
      "Content-Length": String(size_bytes),
      "Content-Disposition": `inline; filename*=UTF-8''${encodeURIComponent(filename)}`,
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "private, no-store",
    },
  });
}
