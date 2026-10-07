"use client";

import { useEffect, useState } from "react";
import { uploadPresigned } from "@vercel/blob/client";

const MAX_FILES = 10;
const MAX_TOTAL = 50_000_000;
const MAX_SIDE = 2400;

/** Fichier joint : soit déjà envoyé dans Vercel Blob (pathname), soit encore sur l'appareil (file). */
export type PickerItem = { key: string; name: string; size: number; type: string; pathname?: string; file?: File };

/** Réduit une photo (max 2400 px, JPEG) pour accélérer l'envoi sur une connexion mobile. */
async function shrink(file: File): Promise<File> {
  if (!file.type.startsWith("image/") || file.type === "image/gif") return file;
  try {
    const bmp = await createImageBitmap(file);
    const scale = Math.min(1, MAX_SIDE / Math.max(bmp.width, bmp.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bmp.width * scale);
    canvas.height = Math.round(bmp.height * scale);
    canvas.getContext("2d")!.drawImage(bmp, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, "image/jpeg", 0.85));
    if (!blob || blob.size >= file.size) return file;
    return new File([blob], file.name.replace(/\.[^.]+$/, "") + ".jpg", { type: "image/jpeg" });
  } catch {
    return file; // format que le navigateur ne sait pas décoder : on envoie l'original
  }
}

const size = (n: number) => (n < 1e6 ? `${Math.max(1, Math.round(n / 1e3))} Ko` : `${(n / 1e6).toFixed(1)} Mo`);

/**
 * Les fichiers sont envoyés directement dans Vercel Blob dès leur sélection (barre de progression).
 * Sans connexion (allowLocal), ils restent sur l'appareil et partent avec la transaction à la synchronisation.
 */
export default function FilePicker({
  ledgerId,
  onBusy,
  onItems,
  allowLocal = false,
}: {
  ledgerId: number;
  onBusy: (busy: boolean) => void;
  onItems?: (items: PickerItem[]) => void;
  allowLocal?: boolean;
}) {
  const [items, setItems] = useState<PickerItem[]>([]);
  const [msg, setMsg] = useState("");
  const [progress, setProgress] = useState<string | null>(null);

  useEffect(() => {
    onItems?.(items);
  }, [items, onItems]);

  async function add(list: FileList | null, input: HTMLInputElement) {
    if (!list?.length) return;
    const picked = Array.from(list);
    input.value = "";
    setMsg("");
    onBusy(true);
    let current = items;
    try {
      for (const original of picked) {
        setProgress(`Préparation de ${original.name}…`);
        const file = await shrink(original);
        const total = current.reduce((s, i) => s + i.size, 0) + file.size;
        if (current.length >= MAX_FILES) throw new Error(`Maximum ${MAX_FILES} fichiers par envoi.`);
        if (total > MAX_TOTAL) throw new Error(`Trop lourd (${size(total)}). Maximum ${size(MAX_TOTAL)} par envoi.`);
        if (!file.type.startsWith("image/") && file.type !== "application/pdf")
          throw new Error(`« ${file.name} » : seuls les photos et les PDF sont acceptés.`);

        let pathname: string | undefined;
        if (!allowLocal || navigator.onLine) {
          try {
            const safe = file.name.replace(/[^\w.\- ]+/g, "_").slice(0, 80);
            const blob = await uploadPresigned(`l${ledgerId}/${Date.now()}-${crypto.randomUUID().slice(0, 8)}-${safe}`, file, {
              access: "private",
              handleUploadUrl: "/api/blob/upload",
              contentType: file.type,
              multipart: file.size > 10_000_000,
              onUploadProgress: ({ percentage }) => setProgress(`Envoi de ${file.name} : ${Math.round(percentage)} %`),
            });
            pathname = blob.pathname;
          } catch (err) {
            if (!allowLocal) throw err;
            // connexion perdue en cours d'envoi : le fichier reste sur l'appareil
          }
        }
        const item: PickerItem = { key: crypto.randomUUID(), name: file.name, size: file.size, type: file.type, ...(pathname ? { pathname } : { file }) };
        current = [...current, item];
        setItems(current);
      }
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Échec de l'envoi.");
    } finally {
      setProgress(null);
      onBusy(false);
    }
  }

  return (
    <div className="stack" style={{ gap: 8 }}>
      <span style={{ fontSize: "0.9rem", fontWeight: 500 }}>Pièces jointes (photo ou PDF)</span>
      <input
        type="hidden"
        name="uploads"
        value={JSON.stringify(items.filter((i) => i.pathname).map(({ pathname, name }) => ({ pathname, name })))}
      />
      <div className="row" style={{ gap: 8 }}>
        <label className="button-like">
          📷 Prendre une photo
          <input type="file" accept="image/*" capture="environment" hidden onChange={(e) => add(e.target.files, e.target)} />
        </label>
        <label className="button-like">
          📎 Choisir des fichiers
          <input type="file" multiple accept="image/*,application/pdf" hidden onChange={(e) => add(e.target.files, e.target)} />
        </label>
      </div>
      {progress && <span className="muted">{progress}</span>}
      {msg && <span className="error">{msg}</span>}
      {items.map((f, i) => (
        <div className="file-chip" key={f.key}>
          <span>
            {f.type === "application/pdf" ? "📄" : "🖼️"} {f.name} <span className="muted">({size(f.size)})</span>
            {f.file && <span className="muted"> · sur l&apos;appareil, envoyé à la synchronisation</span>}
          </span>
          <button type="button" className="link danger" onClick={() => setItems(items.filter((_, j) => j !== i))}>
            Retirer
          </button>
        </div>
      ))}
      <span className="muted">
        Maximum {MAX_FILES} fichiers, {size(MAX_TOTAL)} au total par envoi. Les photos sont réduites automatiquement.
      </span>
    </div>
  );
}
