import path from "path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Keep the Prisma engine/runtime and the pg driver out of the bundler
  // (loaded at runtime; pg has dynamic requires that must not be bundled).
  serverExternalPackages: ["@prisma/client", "@prisma/adapter-pg", "pg"],
  // Workspace TS packages consumed by the server route handlers must be
  // transpiled (their entry points are TypeScript source). @guild/db also
  // carries the generated Prisma client.
  transpilePackages: ["@guild/core", "@guild/shared", "@guild/db"],
  // Output file tracing defaults to this app's own directory as its root, so
  // the Prisma client generated in ../../packages/db/src/generated/client
  // (outside apps/web) is invisible to it by default. Point tracing at the
  // monorepo root so the generated client — including its native query
  // engine binary — actually gets copied into the deployed function bundle.
  outputFileTracingRoot: path.join(__dirname, "../../"),
  outputFileTracingIncludes: {
    "/*": ["../../packages/db/src/generated/client/**/*"],
  },
};

export default nextConfig;
