import Link from "next/link";
import { logout } from "@/app/actions";

export default function Nav({ name }: { name: string }) {
  return (
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
  );
}
