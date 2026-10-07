"use client";

import { useCallback, useEffect, useState } from "react";

const GUARD_KEY = "offline-auto-reloads";

/** Évite une boucle de rechargements si la connexion répond mais que la page ne s'ouvre toujours pas. */
function canAutoReload(): boolean {
  try {
    const now = Date.now();
    const recent = (JSON.parse(sessionStorage.getItem(GUARD_KEY) || "[]") as number[]).filter((t) => now - t < 60_000);
    if (recent.length >= 3) return false;
    sessionStorage.setItem(GUARD_KEY, JSON.stringify([...recent, now]));
  } catch {
    /* stockage indisponible : on laisse faire */
  }
  return true;
}

/**
 * Bouton « Réessayer » : vérifie d'abord qu'une vraie connexion existe, puis recharge la page demandée.
 * La vérification est aussi automatique au retour du réseau et toutes les 4 secondes.
 */
export default function OfflineRetry() {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const go = useCallback(() => {
    // La page de secours est servie à l'adresse demandée : recharger rouvre donc la bonne page.
    if (window.location.pathname === "/offline") window.location.replace("/");
    else window.location.reload();
  }, []);

  const probe = useCallback(
    async (manual: boolean) => {
      if (manual) {
        setBusy(true);
        setMessage(null);
      }
      try {
        const res = await fetch(`/api/ping?t=${Date.now()}`, { cache: "no-store" });
        if (res.ok) {
          if (manual || canAutoReload()) return go();
          setMessage("La connexion est revenue, mais la page ne s'ouvre pas encore. Appuyez sur « Réessayer ».");
          return;
        }
      } catch {
        /* pas de réseau */
      }
      if (manual) setMessage("Toujours pas de connexion. Patientez quelques secondes puis réessayez.");
      setBusy(false);
    },
    [go],
  );

  useEffect(() => {
    const onOnline = () => probe(false);
    window.addEventListener("online", onOnline);
    const timer = setInterval(() => probe(false), 4000);
    return () => {
      window.removeEventListener("online", onOnline);
      clearInterval(timer);
    };
  }, [probe]);

  return (
    <div className="stack">
      <button onClick={() => probe(true)} disabled={busy}>
        {busy ? "Vérification de la connexion…" : "Réessayer"}
      </button>
      {message && <p className="muted" style={{ margin: 0 }}>{message}</p>}
      <p className="muted" style={{ margin: 0 }}>La page se rouvrira toute seule dès que la connexion sera rétablie.</p>
    </div>
  );
}
