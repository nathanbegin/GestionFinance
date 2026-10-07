import { requireUser } from "@/lib/auth";
import { getMembers } from "@/lib/ledger";
import Nav from "@/components/Nav";
import ImportForm from "@/components/ImportForm";
import { MAX_ROWS } from "@/lib/importXlsx";

export default async function ImportPage() {
  const user = await requireUser();
  const members = await getMembers(user.ledger_id);
  return (
    <>
      <Nav name={user.name} />
      <main>
        <h1>Importer des dépenses</h1>
        <div className="card stack">
          <strong>1. Téléchargez le modèle</strong>
          <p className="muted" style={{ margin: 0 }}>
            Une ligne par transaction (date, description, montant, payé par, part de l&apos;autre, type). La feuille
            « Instructions » détaille chaque colonne.
          </p>
          <div>
            <a className="button" href="/api/import/template">
              Télécharger le modèle Excel
            </a>
          </div>
        </div>

        <h2>2. Importez le fichier rempli</h2>
        {members.length === 2 ? (
          <ImportForm />
        ) : (
          <div className="card muted">Le deuxième participant doit d&apos;abord rejoindre le compte.</div>
        )}
        <p className="muted">
          Maximum {MAX_ROWS} lignes. Si une ligne est invalide, rien n&apos;est importé et les erreurs sont listées.
          Chaque transaction importée apparaît dans l&apos;historique.
        </p>
      </main>
    </>
  );
}
