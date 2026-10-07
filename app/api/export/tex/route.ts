import { getUser } from "@/lib/auth";
import { buildStatement } from "@/lib/statement";
import { renderTex } from "@/lib/tex";

export const dynamic = "force-dynamic";

export async function GET() {
  const user = await getUser();
  if (!user) return new Response("Non autorisé", { status: 401 });
  const tex = renderTex(await buildStatement(user));
  const date = new Date().toLocaleDateString("en-CA", { timeZone: "America/Toronto" });
  return new Response(tex, {
    headers: {
      "Content-Type": "application/x-tex; charset=utf-8",
      "Content-Disposition": `attachment; filename="etat-des-comptes-${date}.tex"`,
      "Cache-Control": "no-store",
    },
  });
}
