import { q } from "./db";

export const MAX_FILES = 5;
/** Taille totale par envoi : Vercel limite le corps d'une requête à 4,5 Mo. */
export const MAX_TOTAL_BYTES = 4_000_000;

export type Prepared = { filename: string; content_type: string; size: number; base64: string };

/** Détermine le vrai type d'après les premiers octets (le type annoncé par le navigateur n'est pas fiable). */
export function sniffType(b: Uint8Array): string | null {
  const ascii = (from: number, to: number) => String.fromCharCode(...b.slice(from, to));
  if (b.length < 12) return null;
  if (ascii(0, 5) === "%PDF-") return "application/pdf";
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "image/jpeg";
  if (b[0] === 0x89 && ascii(1, 4) === "PNG") return "image/png";
  if (ascii(0, 4) === "RIFF" && ascii(8, 12) === "WEBP") return "image/webp";
  if (ascii(0, 3) === "GIF") return "image/gif";
  if (ascii(4, 8) === "ftyp" && /^(heic|heix|hevc|mif1|msf1)/.test(ascii(8, 12))) return "image/heic";
  return null;
}

const EXT: Record<string, string> = {
  "application/pdf": "pdf",
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
  "image/heic": "heic",
};

function cleanName(name: string, type: string): string {
  const base = name.split(/[\\/]/).pop()!.replace(/[\u0000-\u001f\u007f<>:"|?*]/g, "").trim().slice(0, 120);
  return base || `fichier.${EXT[type]}`;
}

/** Valide les fichiers reçus ; retourne soit une erreur lisible, soit les fichiers prêts à insérer. */
export async function prepareFiles(files: File[]): Promise<{ error: string } | { prepared: Prepared[] }> {
  if (files.length > MAX_FILES) return { error: `Maximum ${MAX_FILES} fichiers par envoi.` };
  const total = files.reduce((s, f) => s + f.size, 0);
  if (total > MAX_TOTAL_BYTES)
    return { error: `Pièces jointes trop lourdes (${(total / 1e6).toFixed(1)} Mo ; maximum ${MAX_TOTAL_BYTES / 1e6} Mo par envoi).` };
  const prepared: Prepared[] = [];
  for (const f of files) {
    const buf = Buffer.from(await f.arrayBuffer());
    const type = sniffType(buf);
    if (!type) return { error: `« ${f.name} » : format non accepté (photo JPEG/PNG/WebP/HEIC ou PDF seulement).` };
    prepared.push({ filename: cleanName(f.name, type), content_type: type, size: buf.length, base64: buf.toString("base64") });
  }
  return { prepared };
}

export async function insertAttachments(ledgerId: number, txId: number, userId: number, items: Prepared[]) {
  for (const a of items) {
    await q(
      `INSERT INTO attachments (ledger_id, transaction_id, filename, content_type, size_bytes, data, created_by)
       VALUES ($1, $2, $3, $4, $5, decode($6, 'base64'), $7)`,
      [ledgerId, txId, a.filename, a.content_type, a.size, a.base64, userId],
    );
  }
}
