import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  serverExternalPackages: ["tesseract.js"],
  outputFileTracingExcludes: {
    "/*": [
      "./data/**/*",
      "./.cache/**/*",
      "./.npm-cache/**/*",
      "./src-tauri/**/*",
      "./desktop/**/*",
      "./release/**/*",
      "./.env*",
      "./.venv/**/*",
    ],
  },
  distDir: process.env.MOLOT_TEST_BUILD === "1" ? ".next-test" : ".next",
  turbopack: { root: process.cwd() },
  outputFileTracingRoot: process.cwd(),
  poweredByHeader: false,
  devIndicators: false,
  experimental: { cpus: 2 },
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "no-referrer" },
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
        ],
      },
    ];
  },
};
export default nextConfig;
