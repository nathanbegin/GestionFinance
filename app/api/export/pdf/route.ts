import { getUser } from "@/lib/auth";
import { buildStatement } from "@/lib/statement";
import { renderPdf } from "@/lib/pdf";

export const dynamic = "force-dynamic";

export async function GET() {
  const user = await getUser();
  if (!user) return new Response("Non autorisé", { status: 401 });
  const bytes = await renderPdf(await buildStatement(user));
  const date = new Date().toLocaleDateString("en-CA", { timeZone: "America/Toronto" });
  return new Response(Buffer.from(bytes), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="etat-des-comptes-${date}.pdf"`,
      "Cache-Control": "no-store",
    },
  });
}
