/** Logo fictif : un grand livre avec un graphique et une pièce. */
export default function Logo({ size = 64 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" role="img" aria-label="Logo Gestion des finances">
      <rect width="64" height="64" rx="14" fill="var(--accent)" />
      <rect x="14" y="12" width="32" height="40" rx="4" fill="#fff" />
      <rect x="14" y="12" width="6" height="40" rx="3" fill="#c9d6f7" />
      <path d="M25 22h16M25 28h16" stroke="#9db3ee" strokeWidth="2.5" strokeLinecap="round" />
      <path d="M25 44l5-6 4 3 7-9" fill="none" stroke="#2459d6" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="46" cy="44" r="10" fill="#f5b83d" stroke="#fff" strokeWidth="2.5" />
      <text x="46" y="49" textAnchor="middle" fontSize="14" fontWeight="700" fill="#7a4e00" fontFamily="system-ui, sans-serif">
        $
      </text>
    </svg>
  );
}
