import { PrismaClient } from "./generated/client";

// Singleton pattern — prevents multiple PrismaClient instances
// during Next.js hot-reload in development
const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log:
      process.env['NODE_ENV'] === "development"
        ? ["query", "error", "warn"]
        : ["error"],
  });

if (process.env['NODE_ENV'] !== "production") {
  globalForPrisma.prisma = prisma;
}
