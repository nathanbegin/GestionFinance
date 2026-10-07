import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { getMembers, getTransaction, listAttachments } from "@/lib/ledger";
import AttachmentList from "@/components/AttachmentList";
import { toInput } from "@/lib/money";
import Nav from "@/components/Nav";
import TransactionForm from "@/components/TransactionForm";

export default async function EditPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { id } = await params;
  const txId = Number(id);
  if (!Number.isInteger(txId)) notFound();
  const [tx, members, atts] = await Promise.all([
    getTransaction(user.ledger_id, txId),
    getMembers(user.ledger_id),
    listAttachments(user.ledger_id),
  ]);
  if (!tx) notFound();

  const pct =
    tx.kind === "expense" && tx.amount_cents > 0 ? Math.round((tx.other_share_cents / tx.amount_cents) * 100) : 50;

  return (
    <>
      <Nav name={user.name} />
      <main>
        <h1>Modifier la transaction</h1>
        <TransactionForm
          members={members}
          submitLabel="Enregistrer les modifications"
          ledgerId={user.ledger_id}
          initial={{
            id: tx.id,
            kind: tx.kind,
            description: tx.description,
            amount: toInput(tx.amount_cents),
            paid_by: tx.paid_by,
            share_pct: pct,
            occurred_on: tx.occurred_on,
            invoice_number: tx.invoice_number ?? "",
          }}
        />
        <h2>Pièces jointes</h2>
        <AttachmentList items={atts.get(tx.id) ?? []} userId={user.id} />
        <p>
          <Link href="/">← Retour</Link>
        </p>
      </main>
    </>
  );
}
