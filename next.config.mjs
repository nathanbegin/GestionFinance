/** @type {import('next').NextConfig} */
const nextConfig = {
  // Pièces jointes : Vercel limite de toute façon le corps d'une requête à 4,5 Mo.
  experimental: { serverActions: { bodySizeLimit: "4.5mb" } },
};

export default nextConfig;
