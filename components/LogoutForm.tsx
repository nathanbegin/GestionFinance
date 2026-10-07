"use client";

import { logout } from "@/app/actions";

/** Déconnexion : efface aussi les copies de pages gardées pour le mode hors ligne. */
export default function LogoutForm({ name }: { name: string }) {
  return (
    <form
      action={logout}
      className="user"
      onSubmit={() => {
        if ("caches" in window)
          caches.keys().then((keys) => keys.filter((k) => k.startsWith("pages-")).forEach((k) => caches.delete(k)));
      }}
    >
      <span className="muted">{name}</span>
      <button className="link">Déconnexion</button>
    </form>
  );
}
