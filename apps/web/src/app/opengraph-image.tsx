import { ImageResponse } from "next/og";

export const alt = "ForgeKeep — Guild Command Center for MMORPG Guilds";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          background: "linear-gradient(180deg, #0d0d14 0%, #08080c 100%)",
          fontFamily: "sans-serif",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 20,
          }}
        >
          <div
            style={{
              display: "flex",
              width: 84,
              height: 84,
              borderRadius: 20,
              background: "linear-gradient(135deg, #d4a853, #f5c542)",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 46,
            }}
          >
            ⚔
          </div>
          <div
            style={{
              display: "flex",
              fontSize: 84,
              fontWeight: 700,
              letterSpacing: -2,
              color: "#f4f0e6",
            }}
          >
            ForgeKeep
          </div>
        </div>
        <div
          style={{
            display: "flex",
            marginTop: 28,
            fontSize: 32,
            color: "#d4a853",
            letterSpacing: 1,
          }}
        >
          Forged in trust, kept in order.
        </div>
        <div
          style={{
            display: "flex",
            marginTop: 36,
            fontSize: 24,
            color: "rgba(244,240,230,0.55)",
            maxWidth: 820,
            textAlign: "center",
          }}
        >
          Boss timers, verified attendance, and an audited treasury for competitive MMORPG guilds.
        </div>
      </div>
    ),
    { ...size },
  );
}
