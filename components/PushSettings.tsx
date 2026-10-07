"use client";

import { useEffect, useState } from "react";

function b64ToUint8(b64: string): Uint8Array<ArrayBuffer> {
  const pad = "=".repeat((4 - (b64.length % 4)) % 4);
  const raw = atob((b64 + pad).replace(/-/g, "+").replace(/_/g, "/"));
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

type Status = "loading" | "unsupported" | "needs-install" | "denied" | "off" | "on";

/** Active ou désactive les notifications push sur cet appareil. */
export default function PushSettings() {
  const [status, setStatus] = useState<Status>("loading");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const ios = /iphone|ipad|ipod/i.test(navigator.userAgent);
      const standalone = window.matchMedia("(display-mode: standalone)").matches || (navigator as { standalone?: boolean }).standalone;
      if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) {
        setStatus(ios && !standalone ? "needs-install" : "unsupported");
        return;
      }
      if (Notification.permission === "denied") return setStatus("denied");
      const reg = await navigator.serviceWorker.getRegistration();
      const sub = await reg?.pushManager.getSubscription();
      setStatus(sub ? "on" : "off");
    })().catch(() => setStatus("unsupported"));
  }, []);

  async function enable() {
    setBusy(true);
    setError(null);
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setStatus(permission === "denied" ? "denied" : "off");
        return;
      }
      const reg = (await navigator.serviceWorker.getRegistration()) ?? (await navigator.serviceWorker.register("/sw.js", { scope: "/" }));
      await navigator.serviceWorker.ready;
      const { publicKey } = (await (await fetch("/api/push/key", { cache: "no-store" })).json()) as { publicKey: string };
      const sub =
        (await reg.pushManager.getSubscription()) ??
        (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ToUint8(publicKey) }));
      const res = await fetch("/api/push/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(sub.toJSON()),
      });
      if (!res.ok) throw new Error("Le serveur a refusé l'abonnement.");
      setStatus("on");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Impossible d'activer les notifications.");
    } finally {
      setBusy(false);
    }
  }

  async function disable() {
    setBusy(true);
    setError(null);
    try {
      const reg = await navigator.serviceWorker.getRegistration();
      const sub = await reg?.pushManager.getSubscription();
      if (sub) {
        await fetch("/api/push/subscribe", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ endpoint: sub.endpoint }),
        });
        await sub.unsubscribe();
      }
      setStatus("off");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Impossible de désactiver les notifications.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card stack">
      <p className="muted" style={{ margin: 0 }}>
        Recevez une notification sur cet appareil quand une autre personne ajoute, modifie ou supprime une transaction dans l&apos;un
        de vos comptes. Le texte (description et montant) s&apos;affiche sur l&apos;écran verrouillé.
      </p>
      {status === "loading" && <span className="muted">Vérification…</span>}
      {status === "unsupported" && <span className="muted">Ce navigateur ne gère pas les notifications push.</span>}
      {status === "needs-install" && (
        <span className="muted">
          Sur iPhone et iPad, installez d&apos;abord l&apos;application : Partager → « Sur l&apos;écran d&apos;accueil », puis rouvrez-la
          depuis l&apos;icône et revenez ici.
        </span>
      )}
      {status === "denied" && (
        <span className="error">
          Les notifications sont bloquées pour ce site. Autorisez-les dans les réglages du navigateur, puis rechargez la page.
        </span>
      )}
      {status === "off" && (
        <button onClick={enable} disabled={busy}>
          🔔 Activer les notifications sur cet appareil
        </button>
      )}
      {status === "on" && (
        <>
          <span className="ok">🔔 Notifications activées sur cet appareil.</span>
          <button onClick={disable} disabled={busy} className="link danger" style={{ alignSelf: "flex-start" }}>
            Désactiver
          </button>
        </>
      )}
      {error && <span className="error">{error}</span>}
    </div>
  );
}
