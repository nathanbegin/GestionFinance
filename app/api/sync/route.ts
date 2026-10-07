import { revalidatePath } from "next/cache";
import { getUser } from "@/lib/auth";
import { saveTransactionCore } from "@/lib/transactions";

export const dynamic = "force-dynamic";

const str = (v: unknown) => (typeof v === "string" ? v : v == null ? "" : String(v));

/** Reçoit une transaction saisie hors ligne. Idempotent grâce à `clientId` (rejouable sans doublon). */
export async function POST(request: Request) {
  const user = await getUser();
  if (!user) return Response.json({ error: "Session expirée : reconnectez-vous." }, { status: 401 });

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Requête illisible." }, { status: 400 });
  }

  const clientId = str(body.clientId);
  if (!/^[0-9a-fA-F-]{16,64}$/.test(clientId)) return Response.json({ error: "Identifiant invalide." }, { status: 400 });
  const ledgerId = Number(body.ledgerId);
  if (!Number.isInteger(ledgerId) || !user.ledgers.includes(ledgerId))
    return Response.json({ error: "Vous n'avez plus accès à ce compte de dépenses." }, { status: 403 });

  const pcts: Record<number, string> = {};
  if (body.pcts && typeof body.pcts === "object")
    for (const [k, v] of Object.entries(body.pcts as Record<string, unknown>)) pcts[Number(k)] = str(v);

  const res = await saveTransactionCore(user, ledgerId, {
    clientId,
    kind: str(body.kind),
    description: str(body.description),
    amount: str(body.amount),
    paid_by: Number(body.paid_by),
    occurred_on: str(body.occurred_on),
    share_pct: str(body.share_pct),
    pcts,
    counterpart: Number(body.counterpart) || null,
    invoice_number: str(body.invoice_number),
    suppliers: Array.isArray(body.suppliers) ? body.suppliers.map((x) => Number(x)).filter(Number.isInteger) : [],
    uploads: str(body.uploads),
  });
  if ("error" in res) return Response.json({ error: res.error }, { status: 422 });

  revalidatePath("/", "layout");
  return Response.json({ ok: true, id: res.id, duplicate: !!res.duplicate });
}
