/** @type {import('next').NextConfig} */
const nextConfig = {
  // The installer build (BUILD_STANDALONE=1, see .github/workflows/release.yml) makes a
  // self-contained server in .next/standalone that ships with its own Node.js.
  // Normal builds stay regular so `npm run start` keeps working from the project folder.
  output: process.env.BUILD_STANDALONE ? "standalone" : undefined,
  // Personal files must never end up in the installer, even if something traces the whole project.
  outputFileTracingExcludes: {
    "/**": ["./.env*", "./dashboard-*.json", "./launcher/*.log"],
  },
};

export default nextConfig;
