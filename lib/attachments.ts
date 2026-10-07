import { del, get } from "@vercel/blob";
import { q } from "./db";

export const MAX_FILES = 10;
/** Taille totale par envoi (les fichiers vont directement dans Vercel Blob, sans passer par le serveur). */
export const MAX_TOTAL_BYTES = 50_000_000;

export type Prepared = { filename: string; content_type: string; size: number; pathname: string };

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

async function firstBytes(stream: ReadableStream<Uint8Array>, n = 16): Promise<Uint8Array> {
  const reader = stream.getReader();
  const out = new Uint8Array(n);
  let got = 0;
  while (got < n) {
    const { done, value } = await reader.read();
    if (done || !value) break;
    const take = Math.min(value.length, n - got);
    out.set(value.subarray(0, take), got);
    got += take;
  }
  await reader.cancel().catch(() => {});
  return out.subarray(0, got);
}

async function discard(paths: string[]) {
  try {
    if (paths.length) await del(paths);
  } catch {
    /* nettoyage au mieux : un fichier orphelin n'est visible de personne */
  }
}

/**
 * Valide les fichiers déjà envoyés dans Vercel Blob : appartiennent bien à ce compte, pas déjà utilisés,
 * taille totale respectée, contenu réel = photo ou PDF. Sinon ils sont supprimés.
 */
export async function prepareUploads(ledgerId: number, raw: string): Promise<{ error: string } | { prepared: Prepared[] }> {
  if (!raw) return { prepared: [] };
  let items: { pathname?: unknown; name?: unknown }[];
  try {
    items = JSON.parse(raw);
  } catch {
    return { error: "Pièces jointes invalides." };
  }
  if (!Array.isArray(items)) return { error: "Pièces jointes invalides." };
  if (items.length === 0) return { prepared: [] };
  const paths = items.map((i) => (typeof i.pathname === "string" ? i.pathname : ""));
  const prefix = `l${ledgerId}/`;
  if (
    items.length > MAX_FILES ||
    new Set(paths).size !== paths.length ||
    paths.some((p) => !p.startsWith(prefix) || p.includes(".."))
  )
    return { error: `Pièces jointes invalides (maximum ${MAX_FILES} fichiers).` };

  const used = await q("SELECT 1 FROM attachments WHERE blob_pathname = ANY($1::text[])", [paths]);
  if (used.length) return { error: "Un de ces fichiers est déjà joint à une transaction." };

  const prepared: Prepared[] = [];
  let total = 0;
  for (let i = 0; i < items.length; i++) {
    const name = typeof items[i].name === "string" ? (items[i].name as string) : "fichier";
    const res = await get(paths[i], { access: "private" });
    if (!res || res.statusCode !== 200) {
      await discard(paths);
      return { error: `« ${name} » : envoi incomplet, réessayez.` };
    }
    const type = sniffType(await firstBytes(res.stream));
    if (!type) {
      await discard(paths);
      return { error: `« ${name} » : format non accepté (photo JPEG/PNG/WebP/HEIC ou PDF seulement).` };
    }
    total += res.blob.size;
    prepared.push({ filename: cleanName(name, type), content_type: type, size: res.blob.size, pathname: paths[i] });
  }
  if (total > MAX_TOTAL_BYTES) {
    await discard(paths);
    return { error: `Pièces jointes trop lourdes (${(total / 1e6).toFixed(1)} Mo ; maximum ${MAX_TOTAL_BYTES / 1e6} Mo par envoi).` };
  }
  return { prepared };
}

export async function insertAttachments(ledgerId: number, txId: number, userId: number, items: Prepared[]) {
  for (const a of items) {
    await q(
      `INSERT INTO attachments (ledger_id, transaction_id, filename, content_type, size_bytes, blob_pathname, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [ledgerId, txId, a.filename, a.content_type, a.size, a.pathname, userId],
    );
  }
}
