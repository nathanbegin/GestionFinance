/**
 * File d'attente locale des transactions saisies sans connexion (IndexedDB).
 * Côté navigateur uniquement : à n'importer que depuis des composants clients.
 */
import { uploadPresigned } from "@vercel/blob/client";

export type QueueFields = {
  kind: string;
  description: string;
  amount: string;
  paid_by: number;
  occurred_on: string;
  share_pct: string;
  pcts: Record<number, string>;
  counterpart: number | null;
  invoice_number: string;
  suppliers: number[];
};

export type QueueItem = {
  /** Identifiant unique généré sur l'appareil (sert aussi à éviter les doublons côté serveur). */
  id: string;
  userId: number;
  ledgerId: number;
  ledgerLabel: string;
  createdAt: number;
  fields: QueueFields;
  /** Fichiers déjà envoyés dans Vercel Blob. */
  uploads: { pathname: string; name: string }[];
  /** Fichiers encore sur l'appareil : envoyés au moment de la synchronisation. */
  files: File[];
  status: "pending" | "error";
  error?: string;
  attempts: number;
};

const DB_NAME = "gestionfinance";
const STORE = "queue";
export const QUEUE_EVENT = "queue-changed";

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE, { keyPath: "id" });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function tx<T>(mode: IDBTransactionMode, fn: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await open();
  return new Promise<T>((resolve, reject) => {
    const t = db.transaction(STORE, mode);
    const r = fn(t.objectStore(STORE));
    t.oncomplete = () => {
      db.close();
      resolve(r.result);
    };
    t.onerror = () => {
      db.close();
      reject(t.error);
    };
    t.onabort = () => {
      db.close();
      reject(t.error);
    };
  });
}

function changed() {
  window.dispatchEvent(new Event(QUEUE_EVENT));
}

export async function addItem(item: QueueItem) {
  await tx("readwrite", (s) => s.put(item));
  changed();
}

export async function putItem(item: QueueItem) {
  await tx("readwrite", (s) => s.put(item));
  changed();
}

export async function deleteItem(id: string) {
  await tx("readwrite", (s) => s.delete(id));
  changed();
}

/** Éléments en attente de l'utilisateur donné, du plus ancien au plus récent. */
export async function listItems(userId: number): Promise<QueueItem[]> {
  const all = await tx<QueueItem[]>("readonly", (s) => s.getAll());
  return all.filter((i) => i.userId === userId).sort((a, b) => a.createdAt - b.createdAt);
}

export function newId(): string {
  return crypto.randomUUID();
}

export type FlushResult = {
  synced: number;
  failed: number;
  /** Réseau indisponible ou erreur temporaire : on réessaiera. */
  retry: boolean;
  /** Erreur de validation par élément (celui-ci ne sera pas renvoyé tel quel). */
  errors: Record<string, string>;
};

let running: Promise<FlushResult> | null = null;

/**
 * Envoie les éléments en attente au serveur, un par un. Plusieurs appels simultanés partagent le même envoi ;
 * le serveur reconnaît un élément déjà reçu grâce à son identifiant, donc aucun doublon n'est créé.
 */
export function flushQueue(userId: number, onlyId?: string): Promise<FlushResult> {
  if (running) return running;
  running = doFlush(userId, onlyId).finally(() => {
    running = null;
  });
  return running;
}

async function doFlush(userId: number, onlyId?: string): Promise<FlushResult> {
  const result: FlushResult = { synced: 0, failed: 0, retry: false, errors: {} };
  if (typeof navigator !== "undefined" && !navigator.onLine) return { ...result, retry: true };

  let items = await listItems(userId);
  if (onlyId) items = items.filter((i) => i.id === onlyId);
  else items = items.filter((i) => i.status === "pending");

  for (const item of items) {
    try {
      // 1) fichiers restés sur l'appareil → Vercel Blob
      for (const file of [...item.files]) {
        const safe = file.name.replace(/[^\w.\- ]+/g, "_").slice(0, 80);
        const blob = await uploadPresigned(`l${item.ledgerId}/${Date.now()}-${crypto.randomUUID().slice(0, 8)}-${safe}`, file, {
          access: "private",
          handleUploadUrl: "/api/blob/upload",
          contentType: file.type,
          multipart: file.size > 10_000_000,
        });
        item.uploads = [...item.uploads, { pathname: blob.pathname, name: file.name }];
        item.files = item.files.filter((f) => f !== file);
        await putItem(item); // on n'enverra jamais deux fois le même fichier
      }
      // 2) la transaction
      const res = await fetch("/api/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({
          clientId: item.id,
          ledgerId: item.ledgerId,
          ...item.fields,
          uploads: JSON.stringify(item.uploads),
        }),
      });
      if (res.ok) {
        await deleteItem(item.id);
        result.synced++;
        continue;
      }
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (res.status >= 500) {
        result.retry = true;
        break;
      }
      // 401 / 403 / 422 : l'élément ne passera pas tel quel
      item.status = "error";
      item.error = data.error || `Refusé par le serveur (${res.status}).`;
      item.attempts++;
      await putItem(item);
      result.failed++;
      result.errors[item.id] = item.error;
    } catch {
      // réseau coupé ou envoi interrompu : l'élément reste en attente
      result.retry = true;
      break;
    }
  }
  return result;
}
