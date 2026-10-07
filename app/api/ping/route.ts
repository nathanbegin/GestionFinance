export const dynamic = "force-dynamic";

/** Test de connexion très léger (sans accès à la base) : utilisé par la page « hors ligne ». */
export function GET() {
  return new Response(null, { status: 204, headers: { "Cache-Control": "no-store" } });
}

export function HEAD() {
  return new Response(null, { status: 204, headers: { "Cache-Control": "no-store" } });
}
