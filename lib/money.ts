/** "12,50" | "12.5" | "1 234,56" -> cents, ou null si invalide */
export function parseAmount(input: string): number | null {
  const s = input.replace(/[\s\u00a0\u202f$]/g, "").replace(",", ".");
  if (!/^\d+(\.\d{1,2})?$/.test(s)) return null;
  const [whole, frac = ""] = s.split(".");
  const cents = Number(whole) * 100 + Number((frac + "00").slice(0, 2));
  if (!Number.isSafeInteger(cents) || cents <= 0 || cents > 2_000_000_000) return null;
  return cents;
}

/** cents -> "1 234,56 $" (espaces ordinaires, sûr pour PDF) */
export function formatMoney(cents: number): string {
  const sign = cents < 0 ? "-" : "";
  const abs = Math.abs(cents);
  const whole = Math.floor(abs / 100)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, "\u00a0");
  const frac = (abs % 100).toString().padStart(2, "0");
  return `${sign}${whole},${frac}\u00a0$`;
}

/** cents -> "1234,56" pour champ de formulaire */
export function toInput(cents: number): string {
  return `${Math.floor(cents / 100)},${(cents % 100).toString().padStart(2, "0")}`;
}
