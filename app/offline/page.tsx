import Logo from "@/components/Logo";

export const metadata = { title: "Hors ligne" };

/** Page de secours affichée quand le réseau est coupé et qu'aucune copie de la page demandée n'existe. */
export default function OfflinePage() {
  return (
    <main className="center stack" style={{ textAlign: "center" }}>
      <Logo size={72} />
      <h1>Vous êtes hors ligne</h1>
      <p className="muted">
        Cette page n&apos;est pas disponible sans connexion. Vous pouvez toujours ajouter une transaction : elle sera enregistrée sur
        l&apos;appareil et envoyée dès que la connexion reviendra.
      </p>
      <div className="stack">
        <a className="button" href="/nouvelle">
          Ajouter une transaction
        </a>
        <a className="button" href="/attente">
          Voir la liste d&apos;attente
        </a>
        <a className="button" href="/">
          Réessayer
        </a>
      </div>
    </main>
  );
}
