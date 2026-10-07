import { ImageResponse } from "next/og";

/** Icône de l'application (PNG), générée au besoin : ?size=192|512, &maskable=1 pour une icône pleine page. */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const size = Math.min(1024, Math.max(48, Number(url.searchParams.get("size")) || 192));
  const maskable = url.searchParams.get("maskable") === "1";
  // Icône « maskable » : l'image occupe tout le carré et le dessin reste dans la zone sûre centrale (80 %)
  const art = size * (maskable ? 0.56 : 0.72);

  return new ImageResponse(
    (
      <div
        style={{
          width: size,
          height: size,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#2459d6",
          borderRadius: maskable ? 0 : size * 0.22,
        }}
      >
        <div style={{ width: art, height: art, position: "relative", display: "flex" }}>
          {/* livre */}
          <div
            style={{
              position: "absolute",
              left: art * 0.12,
              top: 0,
              width: art * 0.62,
              height: art,
              background: "#ffffff",
              borderRadius: art * 0.08,
              display: "flex",
            }}
          />
          <div
            style={{
              position: "absolute",
              left: art * 0.12,
              top: 0,
              width: art * 0.1,
              height: art,
              background: "#c9d6f7",
              borderRadius: art * 0.05,
              display: "flex",
            }}
          />
          <div style={{ position: "absolute", left: art * 0.3, top: art * 0.2, width: art * 0.36, height: art * 0.05, background: "#9db3ee", borderRadius: art, display: "flex" }} />
          <div style={{ position: "absolute", left: art * 0.3, top: art * 0.32, width: art * 0.36, height: art * 0.05, background: "#9db3ee", borderRadius: art, display: "flex" }} />
          {/* pièce */}
          <div
            style={{
              position: "absolute",
              left: art * 0.5,
              top: art * 0.52,
              width: art * 0.46,
              height: art * 0.46,
              background: "#f5b83d",
              border: `${Math.max(2, art * 0.04)}px solid #ffffff`,
              borderRadius: art,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "#7a4e00",
              fontSize: art * 0.28,
              fontWeight: 700,
            }}
          >
            $
          </div>
        </div>
      </div>
    ),
    { width: size, height: size, headers: { "Cache-Control": "public, max-age=86400, stale-while-revalidate=604800" } },
  );
}
