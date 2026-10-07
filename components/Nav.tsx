import Link from "next/link";
import { logout } from "@/app/actions";
import LiveRefresh from "./LiveRefresh";

export default function Nav({ name }: { name: string }) {
  return (
    <>
    <LiveRefresh />
    <header className="nav">
      <strong>Comptes partagés</strong>
      <nav>
        <Link href="/">Accueil</Link>
        <Link href="/historique">Historique</Link>
        <Link href="/parametres">Paramètres</Link>
      </nav>
      <form action={logout}>
        <span className="muted">{name}</span>
        <button className="link">Déconnexion</button>
      </form>
    </header>
    </>
  );
}
