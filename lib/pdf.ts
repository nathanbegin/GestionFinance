import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFImage, type PDFPage } from "pdf-lib";
import type { Statement, StatementSupplier } from "./statement";
import { formatMoney } from "./money";

// A4 en paysage : plus de place pour les descriptions et les fournisseurs
const PAGE_W = 841.89;
const PAGE_H = 595.28;
const MARGIN = 40;
const LOGO = 12; // taille des miniatures (points)
const LOGO_GAP = 3;
const MAX_LOGOS = 3;

const INK = rgb(0.1, 0.12, 0.16);
const GREEN = rgb(0.07, 0.48, 0.25);
const RED = rgb(0.71, 0.14, 0.09);
const GRAY = rgb(0.4, 0.44, 0.5);

function hexColor(hex: string) {
  const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex);
  return m ? rgb(parseInt(m[1], 16) / 255, parseInt(m[2], 16) / 255, parseInt(m[3], 16) / 255) : rgb(0.14, 0.35, 0.84);
}

function initials(name: string): string {
  const words = name.split(/\s+/).filter(Boolean);
  return (words.length > 1 ? words.slice(0, 2).map((w) => w[0]) : [name.slice(0, 2)]).join("").toUpperCase();
}

export async function renderPdf(s: Statement): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const supported = new Set(font.getCharacterSet());

  // Remplace tout caractère que la police standard ne sait pas encoder
  const safe = (t: string) =>
    Array.from(t.replace(/[  ]/g, " "))
      .map((c) => (supported.has(c.codePointAt(0)!) ? c : "?"))
      .join("");

  const fit = (t: string, f: PDFFont, size: number, maxW: number) => {
    let out = safe(t);
    if (f.widthOfTextAtSize(out, size) <= maxW) return out;
    while (out.length > 1 && f.widthOfTextAtSize(out + "...", size) > maxW) out = out.slice(0, -1);
    return out + "...";
  };

  /** Découpe un texte en lignes qui tiennent dans maxW (aucune troncature). */
  const wrap = (t: string, f: PDFFont, size: number, maxW: number): string[] => {
    const out: string[] = [];
    let line = "";
    for (const word of safe(t).split(" ")) {
      let w = word;
      // mot plus long que la colonne : on le coupe
      while (f.widthOfTextAtSize(w, size) > maxW && w.length > 1) {
        let n = w.length - 1;
        while (n > 1 && f.widthOfTextAtSize(w.slice(0, n), size) > maxW) n--;
        if (line) {
          out.push(line);
          line = "";
        }
        out.push(w.slice(0, n));
        w = w.slice(n);
      }
      const next = line ? `${line} ${w}` : w;
      if (f.widthOfTextAtSize(next, size) <= maxW) line = next;
      else {
        out.push(line);
        line = w;
      }
    }
    if (line) out.push(line);
    return out.length ? out : [""];
  };

  // Logos : pdf-lib sait intégrer PNG et JPEG ; sinon (WebP, absent, illisible) on dessine une pastille.
  const images = new Map<number, PDFImage>();
  for (const sup of s.suppliers) {
    if (!sup.logo) continue;
    try {
      if (sup.logo.type === "image/png") images.set(sup.id, await doc.embedPng(sup.logo.bytes));
      else if (sup.logo.type === "image/jpeg") images.set(sup.id, await doc.embedJpg(sup.logo.bytes));
    } catch {
      /* image illisible : pastille de couleur */
    }
  }
  const supplierById = new Map(s.suppliers.map((x) => [x.id, x]));

  let page: PDFPage = doc.addPage([PAGE_W, PAGE_H]);
  let y = PAGE_H - MARGIN;

  const text = (t: string, x: number, size = 10, f: PDFFont = font, color = INK) =>
    page.drawText(safe(t), { x, y, size, font: f, color });
  const right = (t: string, xEnd: number, size = 9, f: PDFFont = font) => {
    const st = safe(t);
    page.drawText(st, { x: xEnd - f.widthOfTextAtSize(st, size), y, size, font: f, color: INK });
  };
  const rule = (yy: number) =>
    page.drawLine({
      start: { x: MARGIN, y: yy },
      end: { x: PAGE_W - MARGIN, y: yy },
      thickness: 0.5,
      color: rgb(0.8, 0.82, 0.85),
    });

  /** Miniature d'un fournisseur ; (x, bottom) = coin inférieur gauche. */
  const drawLogo = (sup: StatementSupplier, x: number, bottom: number, size = LOGO) => {
    const img = images.get(sup.id);
    if (img) {
      page.drawRectangle({
        x,
        y: bottom,
        width: size,
        height: size,
        color: rgb(1, 1, 1),
        borderColor: rgb(0.85, 0.87, 0.9),
        borderWidth: 0.4,
      });
      const inner = size - 2;
      const k = Math.min(inner / img.width, inner / img.height);
      const w = img.width * k;
      const h = img.height * k;
      page.drawImage(img, { x: x + (size - w) / 2, y: bottom + (size - h) / 2, width: w, height: h });
    } else {
      page.drawCircle({ x: x + size / 2, y: bottom + size / 2, size: size / 2, color: hexColor(sup.color) });
      const fs = size * 0.4;
      const label = safe(initials(sup.name));
      page.drawText(label, {
        x: x + size / 2 - bold.widthOfTextAtSize(label, fs) / 2,
        y: bottom + size / 2 - fs * 0.35,
        size: fs,
        font: bold,
        color: rgb(1, 1, 1),
      });
    }
  };

  const [a, b] = s.members;

  text("État des comptes", MARGIN, 20, bold);
  y -= 22;
  text(
    s.members.length === 2 ? `Entre ${a.name} et ${b.name}` : s.members.length > 2 ? `Groupe : ${s.members.map((m) => m.name).join(", ")}` : "Compte partagé",
    MARGIN,
    11,
  );
  y -= 15;
  text(`Généré le ${s.generatedAt} par ${s.generatedBy}`, MARGIN, 9, font, GRAY);
  y -= 28;

  // Résumé en une phrase (plusieurs lignes si besoin : un groupe peut avoir plusieurs règlements)
  const sLines = wrap(s.sentence, bold, 12, PAGE_W - 2 * MARGIN - 20);
  const barH = sLines.length * 16 + 14;
  page.drawRectangle({
    x: MARGIN,
    y: y + 20 - barH,
    width: PAGE_W - 2 * MARGIN,
    height: barH,
    color: rgb(0.93, 0.95, 0.99),
  });
  sLines.forEach((l, k) => page.drawText(l, { x: MARGIN + 10, y: y - k * 16, size: 12, font: bold, color: INK }));
  y -= barH + 16;

  // Solde de chacun : un encadré par personne (jusqu'à 3 par rangée)
  if (s.balances.length) {
    const gap = 12;
    const cols = Math.min(s.balances.length, 3);
    const rows = Math.ceil(s.balances.length / cols);
    const boxW = (PAGE_W - 2 * MARGIN - gap * (cols - 1)) / cols;
    const boxH = 62;
    const top0 = y + 14; // haut du premier encadré
    s.balances.forEach((bal, i) => {
      const x = MARGIN + (i % cols) * (boxW + gap);
      const top = top0 - Math.floor(i / cols) * (boxH + 8);
      const owed = bal.net > 0;
      const owes = bal.net < 0;
      const tone = owed ? GREEN : owes ? RED : GRAY;
      page.drawRectangle({
        x,
        y: top - boxH,
        width: boxW,
        height: boxH,
        color: owed ? rgb(0.92, 0.97, 0.94) : owes ? rgb(0.99, 0.93, 0.92) : rgb(0.95, 0.96, 0.97),
        borderColor: tone,
        borderWidth: 0.8,
      });
      page.drawText(fit(bal.member.name, bold, 11, boxW - 24), { x: x + 12, y: top - 17, size: 11, font: bold, color: INK });
      page.drawText(owed ? "On lui doit" : owes ? "Doit" : "Comptes à jour", {
        x: x + 12,
        y: top - 31,
        size: 9,
        font,
        color: tone,
      });
      page.drawText(safe(formatMoney(Math.abs(bal.net))), { x: x + 12, y: top - 53, size: 19, font: bold, color: tone });
    });
    y = top0 - rows * boxH - (rows - 1) * 8 - 18;
  }

  // Totaux par personne
  for (const t of s.totals) {
    text(
      `${t.member.name} : dépenses payées ${formatMoney(t.expensesPaid)}, remboursements versés ${formatMoney(t.repaid)}`,
      MARGIN,
      9,
    );
    y -= 13;
  }

  y -= 14;

  // Colonnes (les miniatures occupent la première, devant la date)
  const col = { logo: MARGIN, date: 88, desc: 142, sup: 410, type: 534, payer: 586, amount: 704, share: PAGE_W - MARGIN };
  const descW = col.sup - col.desc - 10;
  const supW = col.type - col.sup - 10;
  const LINE = 11;
  const header = () => {
    text("Date", col.date, 9, bold);
    text("Description", col.desc, 9, bold);
    text("Fournisseurs", col.sup, 9, bold);
    text("Type", col.type, 9, bold);
    text("Payé par", col.payer, 9, bold);
    right("Montant", col.amount, 9, bold);
    right("Dette générée", col.share, 9, bold);
    y -= 6;
    rule(y);
    y -= 16;
  };
  header();

  let rowIndex = 0;
  for (const t of s.txs) {
    const sups = t.supplier_ids.map((id) => supplierById.get(id)).filter((x): x is StatementSupplier => !!x);
    const descLines = wrap(t.description, font, 9, descW);
    const supLines = sups.length ? wrap(sups.map((x) => x.name).join(", "), font, 9, supW) : [];
    const payerLines = wrap(t.payer_name, font, 9, col.amount - col.payer - 50);
    const lines = Math.max(descLines.length, supLines.length, payerLines.length, 1);
    const rowH = lines * LINE + 7;
    if (y - (lines - 1) * LINE < MARGIN + 30) {
      page = doc.addPage([PAGE_W, PAGE_H]);
      y = PAGE_H - MARGIN;
      header();
    }
    // Fond alterné + fine ligne pâle entre les transactions, pour ne pas se tromper de ligne
    const rowTop = y + 11;
    if (rowIndex % 2 === 1)
      page.drawRectangle({
        x: MARGIN - 4,
        y: rowTop - rowH,
        width: PAGE_W - 2 * MARGIN + 8,
        height: rowH,
        color: rgb(0.945, 0.953, 0.965),
      });
    page.drawLine({
      start: { x: MARGIN - 4, y: rowTop - rowH },
      end: { x: PAGE_W - MARGIN + 4, y: rowTop - rowH },
      thickness: 0.4,
      color: rgb(0.84, 0.86, 0.89),
    });
    rowIndex++;
    sups.slice(0, MAX_LOGOS).forEach((sup, i) => drawLogo(sup, col.logo + i * (LOGO + LOGO_GAP), y - 3));
    text(t.occurred_on, col.date, 9);
    descLines.forEach((l, k) => page.drawText(l, { x: col.desc, y: y - k * LINE, size: 9, font, color: INK }));
    supLines.forEach((l, k) => page.drawText(l, { x: col.sup, y: y - k * LINE, size: 9, font, color: INK }));
    text(t.kind === "expense" ? "Dépense" : t.kind === "opening" ? "Solde" : "Remb.", col.type, 9);
    payerLines.forEach((l, k) => page.drawText(l, { x: col.payer, y: y - k * LINE, size: 9, font, color: INK }));
    right(formatMoney(t.amount_cents), col.amount);
    right(formatMoney(t.other_share_cents), col.share);
    y -= rowH;
  }
  if (s.txs.length === 0) text("Aucune transaction.", col.date, 9);

  // Pied de page numéroté
  const pages = doc.getPages();
  pages.forEach((p, i) => {
    const label = `Page ${i + 1} / ${pages.length}`;
    p.drawText(label, {
      x: PAGE_W / 2 - font.widthOfTextAtSize(label, 8) / 2,
      y: 28,
      size: 8,
      font,
      color: rgb(0.5, 0.53, 0.58),
    });
  });

  return doc.save();
}
