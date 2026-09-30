/** @type {import('next').NextConfig} */
const nextConfig = {
  // The installer build (BUILD_STANDALONE=1, see .github/workflows/release.yml) makes a
  // self-contained server in .next/standalone that ships with its own Node.js.
  // Normal builds stay regular so `npm run start` keeps working from the project folder.
  output: process.env.BUILD_STANDALONE ? "standalone" : undefined,
  // The release build passes the version from the git tag (like 1.1.0) so the app can
  // tell when a newer release exists. Empty when running from the project folder.
  env: {
    DASHBOARD_VERSION: process.env.DASHBOARD_VERSION || "",
  },
  // Personal files must never end up in the installer, even if something traces the whole project.
  outputFileTracingExcludes: {
    "/**": ["./.env*", "./dashboard-*.json", "./launcher/*.log"],
  },
  // Browser protections on every response (proxy.js handles who may send requests):
  // no framing by other sites (clickjacking, e.g. a hidden Uninstall click), no other site
  // loading our files, no guessing file types, and no localhost addresses sent to Canvas.
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Content-Security-Policy", value: "frame-ancestors 'none'" },
          { key: "Cross-Origin-Resource-Policy", value: "same-origin" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "no-referrer" },
        ],
      },
    ];
  },
};

export default nextConfig;
