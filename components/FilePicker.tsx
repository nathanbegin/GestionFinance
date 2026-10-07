"use client";

import { useRef, useState } from "react";

const MAX_FILES = 5;
const MAX_TOTAL = 4_000_000;
const MAX_SIDE = 1600;

/** Réduit une photo (max 1600 px, JPEG) pour qu'elle passe sur une connexion mobile. */
async function shrink(file: File): Promise<File> {
  if (!file.type.startsWith("image/") || file.type === "image/gif") return file;
  try {
    const bmp = await createImageBitmap(file);
    const scale = Math.min(1, MAX_SIDE / Math.max(bmp.width, bmp.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bmp.width * scale);
    canvas.height = Math.round(bmp.height * scale);
    canvas.getContext("2d")!.drawImage(bmp, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, "image/jpeg", 0.82));
    if (!blob || blob.size >= file.size) return file;
    return new File([blob], file.name.replace(/\.[^.]+$/, "") + ".jpg", { type: "image/jpeg" });
  } catch {
    return file; // format que le navigateur ne sait pas décoder : on envoie l'original
  }
}

const size = (n: number) => (n < 1e6 ? `${Math.max(1, Math.round(n / 1e3))} Ko` : `${(n / 1e6).toFixed(1)} Mo`);

export default function FilePicker() {
  const real = useRef<HTMLInputElement>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);

  function sync(next: File[]) {
    const dt = new DataTransfer();
    next.forEach((f) => dt.items.add(f));
    if (real.current) real.current.files = dt.files;
    setFiles(next);
  }

  async function add(list: FileList | null, input: HTMLInputElement) {
    if (!list?.length) return;
    setBusy(true);
    setMsg("");
    const added = await Promise.all(Array.from(list).map(shrink));
    input.value = "";
    const next = [...files, ...added];
    const total = next.reduce((s, f) => s + f.size, 0);
    if (next.length > MAX_FILES) setMsg(`Maximum ${MAX_FILES} fichiers par envoi.`);
    else if (total > MAX_TOTAL) setMsg(`Trop lourd (${size(total)}). Maximum ${size(MAX_TOTAL)} par envoi.`);
    else sync(next);
    setBusy(false);
  }

  return (
    <div className="stack" style={{ gap: 8 }}>
      <span style={{ fontSize: "0.9rem", fontWeight: 500 }}>Pièces jointes (photo ou PDF)</span>
      {/* Champ réel envoyé avec le formulaire ; rempli par les deux boutons ci-dessous */}
      <input ref={real} name="files" type="file" multiple hidden />
      <div className="row" style={{ gap: 8 }}>
        <label className="button-like">
          📷 Prendre une photo
          <input type="file" accept="image/*" capture="environment" hidden onChange={(e) => add(e.target.files, e.target)} />
        </label>
        <label className="button-like">
          📎 Choisir des fichiers
          <input
            type="file"
            multiple
            accept="image/*,application/pdf"
            hidden
            onChange={(e) => add(e.target.files, e.target)}
          />
        </label>
      </div>
      {busy && <span className="muted">Préparation…</span>}
      {msg && <span className="error">{msg}</span>}
      {files.map((f, i) => (
        <div className="file-chip" key={`${f.name}-${i}`}>
          <span>
            {f.type === "application/pdf" ? "📄" : "🖼️"} {f.name} <span className="muted">({size(f.size)})</span>
          </span>
          <button type="button" className="link danger" onClick={() => sync(files.filter((_, j) => j !== i))}>
            Retirer
          </button>
        </div>
      ))}
      <span className="muted">Les photos sont réduites automatiquement. Maximum {MAX_FILES} fichiers, {size(MAX_TOTAL)} au total par envoi.</span>
    </div>
  );
}
