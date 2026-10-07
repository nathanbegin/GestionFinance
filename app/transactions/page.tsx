import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { getMembers, listAttachments, listTransactions } from "@/lib/ledger";
import Nav from "@/components/Nav";
import TxList from "@/components/TxList";

export default async function TransactionsPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const user = await requireUser();
  const query = ((await searchParams).q ?? "").trim();
  const [members, all, attachments] = await Promise.all([
    getMembers(user.ledger_id),
    listTransactions(user.ledger_id),
    listAttachments(user.ledger_id),
  ]);
  const needle = query.toLowerCase();
  const txs = needle
    ? all.filter((t) => `${t.description} ${t.invoice_number ?? ""} ${t.occurred_on}`.toLowerCase().includes(needle))
    : all;
  const other = members.find((m) => m.id !== user.id);

  return (
    <>
      <Nav name={user.name} />
      <main>
        <h1>Transactions ({txs.length})</h1>
        <form className="search" method="get">
          <input name="q" type="search" placeholder="Rechercher (description, n° de facture, date)" defaultValue={query} />
          <button>Chercher</button>
          {query && (
            <Link href="/transactions" className="button">
              Effacer
            </Link>
          )}
        </form>
        <TxList
          txs={txs}
          userId={user.id}
          other={other}
          attachments={attachments}
          empty={query ? "Aucun résultat." : "Aucune transaction pour l'instant."}
        />
      </main>
    </>
  );
}
