import path from "path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Keep the Prisma engine/runtime and the pg driver out of the bundler
  // (loaded at runtime; pg has dynamic requires that must not be bundled).
  serverExternalPackages: ["@prisma/client", "@prisma/adapter-pg", "pg"],
  // Workspace TS packages consumed by the server route handlers must be
  // transpiled (their entry points are TypeScript source).
  transpilePackages: ["@guild/core", "@guild/shared", "@guild/db"],
  // pnpm monorepo: trace from the repo root so hoisted/symlinked workspace
  // deps get copied into the deployed serverless function bundle.
  outputFileTracingRoot: path.join(__dirname, "../../"),
  // The engine-less Prisma client loads its WASM query compiler at runtime
  // via a computed fs path that @vercel/nft can't statically follow, so it
  // never lands in the serverless bundle on its own (ENOENT for
  // query_compiler_bg.wasm at runtime). Explicitly trace the generated
  // .prisma/client assets into every route's bundle. Glob (not a fixed
  // path) because pnpm's virtual-store hash differs between machines/CI.
  outputFileTracingIncludes: {
    "/**/*": ["../../node_modules/.pnpm/@prisma+client@*/node_modules/.prisma/client/**"],
  },
};

export default nextConfig;
