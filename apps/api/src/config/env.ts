import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z
    .enum(["development", "production", "test"])
    .default("development"),
  PORT: z.coerce.number().default(4000),
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  JWT_ACCESS_SECRET: z.string().min(32, "JWT_ACCESS_SECRET must be at least 32 chars"),
  JWT_REFRESH_SECRET: z.string().min(32, "JWT_REFRESH_SECRET must be at least 32 chars"),
  JWT_ACCESS_EXPIRY: z.string().default("15m"),
  JWT_REFRESH_EXPIRY: z.string().default("7d"),
  BCRYPT_ROUNDS: z.coerce.number().min(10).max(15).default(12),
  CORS_ORIGIN: z.string().default("http://localhost:3000"),
});

function validateEnv() {
  const result = envSchema.safeParse(process.env);

  if (!result.success) {
<<<<<<< HEAD
    console.error("Invalid environment variables:");
=======
    console.error("❌ Invalid environment variables:");
>>>>>>> 4ca53ae77e7e08144101dc0e85266ff4e8db7288
    console.error(result.error.format());
    process.exit(1);
  }

  return result.data;
}

export const env = validateEnv();
export type Env = z.infer<typeof envSchema>;
