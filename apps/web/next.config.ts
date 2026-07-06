import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Keep the Prisma engine/runtime and the pg driver out of the bundler
  // (loaded at runtime; pg has dynamic requires that must not be bundled).
  serverExternalPackages: ["@prisma/client", "@prisma/adapter-pg", "pg"],
  // Workspace TS packages consumed by the server route handlers must be
  // transpiled (their entry points are TypeScript source). @guild/db also
  // carries the generated Prisma client.
  transpilePackages: ["@guild/core", "@guild/shared", "@guild/db"],
};

export default nextConfig;
