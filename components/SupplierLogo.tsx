import type { Supplier } from "@/lib/suppliers";

function initials(name: string): string {
  const words = name.split(/\s+/).filter(Boolean);
  const letters = words.length > 1 ? words.slice(0, 2).map((w) => w[0]) : [name.slice(0, 2)];
  return letters.join("").toUpperCase();
}

/** Logo d'un fournisseur ; à défaut d'image, une pastille de couleur avec ses initiales. */
export default function SupplierLogo({ s, size = 28 }: { s: Supplier; size?: number }) {
  if (s.has_logo)
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        className="slogo"
        src={`/api/suppliers/${s.id}/logo?v=${s.v}`}
        alt={s.name}
        title={s.name}
        width={size}
        height={size}
        loading="lazy"
      />
    );
  return (
    <span
      className="slogo mono"
      role="img"
      aria-label={s.name}
      title={s.name}
      style={{ background: s.color, width: size, height: size, fontSize: Math.round(size * 0.38) }}
    >
      {initials(s.name)}
    </span>
  );
}
