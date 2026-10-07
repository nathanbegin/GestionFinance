import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import type { Statement } from "./statement";
import { formatMoney } from "./money";

const PAGE_W = 595.28;
const PAGE_H = 841.89;
const MARGIN = 50;

export async function renderPdf(s: Statement): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const supported = new Set(font.getCharacterSet());

  // Remplace tout caractère que la police standard ne sait pas encoder
  const safe = (t: string) =>
    Array.from(t.replace(/[  ]/g, " "))
      .map((c) => (supported.has(c.codePointAt(0)!) ? c : "?"))
      .join("");

  const fit = (t: string, f: PDFFont, size: number, maxW: number) => {
    let out = safe(t);
    if (f.widthOfTextAtSize(out, size) <= maxW) return out;
    while (out.length > 1 && f.widthOfTextAtSize(out + "...", size) > maxW) out = out.slice(0, -1);
    return out + "...";
  };

  let page: PDFPage = doc.addPage([PAGE_W, PAGE_H]);
  let y = PAGE_H - MARGIN;

  const text = (t: string, x: number, size = 10, f: PDFFont = font, color = rgb(0.1, 0.12, 0.16)) =>
    page.drawText(safe(t), { x, y, size, font: f, color });
  const right = (t: string, xEnd: number, size = 9, f: PDFFont = font) => {
    const st = safe(t);
    page.drawText(st, { x: xEnd - f.widthOfTextAtSize(st, size), y, size, font: f, color: rgb(0.1, 0.12, 0.16) });
  };
  const rule = (yy: number) =>
    page.drawLine({
      start: { x: MARGIN, y: yy },
      end: { x: PAGE_W - MARGIN, y: yy },
      thickness: 0.5,
      color: rgb(0.8, 0.82, 0.85),
    });

  const [a, b] = s.members;

  text("État des comptes", MARGIN, 20, bold);
  y -= 22;
  text(s.members.length === 2 ? `Entre ${a.name} et ${b.name}` : "Compte partagé", MARGIN, 11);
  y -= 15;
  text(`Généré le ${s.generatedAt} par ${s.generatedBy}`, MARGIN, 9, font, rgb(0.4, 0.44, 0.5));
  y -= 28;

  // Solde final
  page.drawRectangle({
    x: MARGIN,
    y: y - 10,
    width: PAGE_W - 2 * MARGIN,
    height: 30,
    color: rgb(0.93, 0.95, 0.99),
  });
  text(fit(s.sentence, bold, 12, PAGE_W - 2 * MARGIN - 20), MARGIN + 10, 12, bold);
  y -= 40;

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

  // Colonnes
  const col = { date: MARGIN, desc: 108, type: 285, payer: 340, amount: 462, share: PAGE_W - MARGIN };
  const header = () => {
    text("Date", col.date, 9, bold);
    text("Description", col.desc, 9, bold);
    text("Type", col.type, 9, bold);
    text("Payé par", col.payer, 9, bold);
    right("Montant", col.amount, 9, bold);
    right("Dette générée", col.share, 9, bold);
    y -= 6;
    rule(y);
    y -= 14;
  };
  header();

  for (const t of s.txs) {
    if (y < MARGIN + 30) {
      page = doc.addPage([PAGE_W, PAGE_H]);
      y = PAGE_H - MARGIN;
      header();
    }
    text(t.occurred_on, col.date, 9);
    text(fit(t.description, font, 9, col.type - col.desc - 8), col.desc, 9);
    text(t.kind === "expense" ? "Dépense" : "Remb.", col.type, 9);
    text(fit(t.payer_name, font, 9, col.amount - col.payer - 55), col.payer, 9);
    right(formatMoney(t.amount_cents), col.amount);
    right(formatMoney(t.other_share_cents), col.share);
    y -= 15;
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
