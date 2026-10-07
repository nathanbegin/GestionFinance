"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { flushQueue, listItems, QUEUE_EVENT } from "@/lib/offlineQueue";

const WARM_PAGES = ["/nouvelle", "/attente"];

/**
 * Pastille « hors ligne / en attente » dans la bande du haut, et synchronisation automatique :
 * au chargement, au retour du réseau, au retour sur l'application et toutes les 30 secondes.
 */
export default function QueueStatus({ userId }: { userId: number }) {
  const router = useRouter();
  const [count, setCount] = useState(0);
  const [errors, setErrors] = useState(0);
  const [online, setOnline] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const pendingRef = useRef(0);

  const refresh = useCallback(async () => {
    try {
      const items = await listItems(userId);
      pendingRef.current = items.filter((i) => i.status === "pending").length;
      setCount(items.length);
      setErrors(items.filter((i) => i.status === "error").length);
    } catch {
      /* IndexedDB indisponible (navigation privée…) : rien à afficher */
    }
  }, [userId]);

  const sync = useCallback(async () => {
    if (pendingRef.current === 0 || !navigator.onLine) return;
    setSyncing(true);
    try {
      const r = await flushQueue(userId);
      if (r.synced > 0) {
        setToast(`${r.synced} transaction${r.synced > 1 ? "s" : ""} synchronisée${r.synced > 1 ? "s" : ""} ✓`);
        setTimeout(() => setToast(null), 5000);
        router.refresh();
      }
    } finally {
      setSyncing(false);
      await refresh();
    }
  }, [userId, refresh, router]);

  useEffect(() => {
    setOnline(navigator.onLine);
    refresh().then(sync);
    const onOnline = () => {
      setOnline(true);
      sync();
    };
    const onOffline = () => setOnline(false);
    const onVisible = () => {
      if (!document.hidden) refresh().then(sync);
    };
    const onChange = () => {
      refresh();
    };
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    window.addEventListener(QUEUE_EVENT, onChange);
    document.addEventListener("visibilitychange", onVisible);
    const timer = setInterval(() => refresh().then(sync), 30_000);

    // Garde une copie des pages « Nouvelle transaction » et « Liste d'attente » pour les ouvrir sans réseau
    const warm = setTimeout(() => {
      if (!navigator.onLine) return;
      for (const p of WARM_PAGES) fetch(p, { headers: { accept: "text/html" }, credentials: "same-origin" }).catch(() => {});
    }, 3000);

    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
      window.removeEventListener(QUEUE_EVENT, onChange);
      document.removeEventListener("visibilitychange", onVisible);
      clearInterval(timer);
      clearTimeout(warm);
    };
  }, [refresh, sync]);

  if (online && count === 0 && !toast) return null;
  return (
    <>
      <Link href="/attente" className={`queue-chip${online ? "" : " off"}${errors ? " err" : ""}`}>
        {!online && "📴 Hors ligne"}
        {!online && count > 0 && " · "}
        {count > 0 && `${syncing ? "🔄" : errors ? "⚠️" : "⏳"} ${count} en attente`}
      </Link>
      {toast && (
        <div className="toast" role="status">
          {toast}
        </div>
      )}
    </>
  );
}
