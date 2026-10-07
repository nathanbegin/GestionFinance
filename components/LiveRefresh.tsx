"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

const INTERVAL_MS = 4000;
const VERBS: Record<string, string> = {
  "transaction.create": "a ajouté une transaction",
  "transaction.update": "a modifié une transaction",
  "transaction.delete": "a supprimé une transaction",
};

/** Interroge le serveur et rafraîchit la page dès que l'autre personne modifie quelque chose. */
export default function LiveRefresh() {
  const router = useRouter();
  const last = useRef<number | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    let stopped = false;
    let timer: ReturnType<typeof setTimeout>;

    async function check() {
      if (stopped || document.hidden) return schedule();
      try {
        const res = await fetch("/api/ledger-version", { cache: "no-store" });
        if (res.ok) {
          const v: { id: number; action: string | null; by: string | null; mine: boolean } = await res.json();
          if (last.current !== null && v.id !== last.current) {
            router.refresh();
            if (!v.mine && v.action && VERBS[v.action]) {
              setNotice(`${v.by} ${VERBS[v.action]}.`);
              setTimeout(() => setNotice(null), 6000);
            }
          }
          last.current = v.id;
        }
      } catch {
        /* réseau indisponible : on réessaie au prochain tour */
      }
      schedule();
    }
    function schedule() {
      if (!stopped) timer = setTimeout(check, INTERVAL_MS);
    }
    function onVisible() {
      if (!document.hidden) {
        clearTimeout(timer);
        check();
      }
    }

    check();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      stopped = true;
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [router]);

  if (!notice) return null;
  return (
    <div className="toast" role="status">
      {notice}
    </div>
  );
}
