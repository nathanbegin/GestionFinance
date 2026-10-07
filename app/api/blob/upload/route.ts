import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { getUser } from "@/lib/auth";
import { MAX_TOTAL_BYTES } from "@/lib/attachments";

/** Délivre un jeton d'envoi : le navigateur envoie ensuite le fichier directement dans Vercel Blob. */
export async function POST(request: Request) {
  const body = (await request.json()) as HandleUploadBody;
  try {
    const json = await handleUpload({
      body,
      request,
      onBeforeGenerateToken: async (pathname) => {
        const user = await getUser();
        if (!user) throw new Error("Non autorisé");
        if (!pathname.startsWith(`l${user.ledger_id}/`) || pathname.includes("..")) throw new Error("Chemin invalide");
        return {
          allowedContentTypes: ["image/*", "application/pdf"],
          maximumSizeInBytes: MAX_TOTAL_BYTES,
          addRandomSuffix: true,
        };
      },
      onUploadCompleted: async () => {},
    });
    return Response.json(json);
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 400 });
  }
}
