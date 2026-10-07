import { issueSignedToken } from "@vercel/blob";
import { handleUploadPresigned, type HandleUploadPresignedBody } from "@vercel/blob/client";
import { getUser } from "@/lib/auth";
import { MAX_TOTAL_BYTES } from "@/lib/attachments";

/** Délivre une URL d'envoi pré-signée : le navigateur envoie ensuite le fichier directement dans Vercel Blob. */
export async function POST(request: Request) {
  const body = (await request.json()) as HandleUploadPresignedBody;
  try {
    const json = await handleUploadPresigned({
      body,
      request,
      getSignedToken: async (pathname) => {
        const user = await getUser();
        if (!user) throw new Error("Non autorisé");
        if (!pathname.startsWith(`l${user.ledger_id}/`) || pathname.includes("..")) throw new Error("Chemin invalide");
        const token = await issueSignedToken({
          pathname,
          operations: ["put"],
          allowedContentTypes: ["image/*", "application/pdf"],
          maximumSizeInBytes: MAX_TOTAL_BYTES,
          validUntil: Date.now() + 60 * 60 * 1000,
        });
        return { token };
      },
    });
    return Response.json(json);
  } catch (e) {
    console.error("blob upload token:", e);
    return Response.json({ error: (e as Error).message }, { status: 400 });
  }
}
