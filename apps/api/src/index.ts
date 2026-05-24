import express from "express";
import cors from "cors";
import helmet from "helmet";
import cookieParser from "cookie-parser";
import { env } from "./config/env";
import { errorHandler } from "./middleware/errorHandler";
import { apiLimiter } from "./middleware/rateLimiter";
import healthRoutes from "./routes/health.routes";
import authRoutes from "./routes/auth.routes";
import guildRoutes from "./routes/guild.routes";
import dashboardRoutes from "./routes/dashboard.routes";

const app: express.Express = express();

// ─── Security Middleware ────────────────────────
app.use(helmet());
app.use(
  cors({
    origin: env.CORS_ORIGIN,
    credentials: true,
  }),
);

// ─── Body Parsing ───────────────────────────────
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// ─── Global Rate Limiter ────────────────────────
app.use("/api", apiLimiter);

// ─── Routes ─────────────────────────────────────
app.use("/api/health", healthRoutes);
app.use("/api/auth", authRoutes);
app.use("/api/guilds", guildRoutes);
app.use("/api/dashboard", dashboardRoutes);

// ─── Error Handler (must be last) ───────────────
app.use(errorHandler);

// ─── Start Server ───────────────────────────────
app.listen(env.PORT, () => {
  console.log(`
  ⚔️  Guild Management API
  ────────────────────────
  Status:  Running
  Port:    ${env.PORT}
  Env:     ${env.NODE_ENV}
  CORS:    ${env.CORS_ORIGIN}
  ────────────────────────
  `);
});

export default app;
