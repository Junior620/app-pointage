import { ImageResponse } from "next/og";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

/** Icône d'écran d'accueil iOS, générée à partir du pictogramme (src/app/icon.svg). */
export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#2563eb",
        }}
      >
        <svg width="132" height="132" viewBox="0 0 64 64">
          <circle cx="30" cy="30" r="17" fill="none" stroke="#fff" strokeWidth="5" />
          <path d="M30 20v10l7 5" fill="none" stroke="#fff" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" />
          <circle cx="47" cy="47" r="8" fill="#22c55e" stroke="#fff" strokeWidth="3.5" />
        </svg>
      </div>
    ),
    size
  );
}
