import type { NextConfig } from "next";

const isDev = process.env.NODE_ENV === "development";

const securityHeaders = [
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
  { key: "X-Frame-Options", value: "SAMEORIGIN" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
  {
    key: "Content-Security-Policy",
    value: [
      "default-src 'self'",
      `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob:",
      "font-src 'self'",
      "connect-src 'self'",
      "frame-ancestors 'self'",
    ].join("; "),
  },
];

const nextConfig: NextConfig = {
  reactStrictMode: true,
  reactCompiler: true,
  serverExternalPackages: ["pino", "thread-stream"],
  async headers() {
    return [
      {
        source: "/:path*",
        headers: securityHeaders,
      },
    ];
  },
  async redirects() {
    return [
      /*
       * La revisión vive dentro del board desde 2026-08-01. El `redirect()` del
       * Server Component que hacía esto se prerenderizaba como un 200 con body
       * vacío (verificado en producción el 2026-08-06): para un crawler eso es
       * una página delgada indexable, no una mudanza. Un 308 de config sí lo es,
       * y además corre antes que la ruta del filesystem.
       */
      { source: "/revision", destination: "/board/revision", permanent: true },
    ];
  },
};

export default nextConfig;
