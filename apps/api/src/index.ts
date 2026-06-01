import express from "express";
import cors from "cors";
import helmet from "helmet";
import cookieParser from "cookie-parser";
import http from "http";
import { initSocketServer } from "./lib/socket";

// Global BigInt JSON serialization override to prevent Express JSON serialization crashes
(BigInt.prototype as any).toJSON = function () {
  return this.toString();
};
import { env } from "./config/env";
import { errorHandler } from "./middleware/errorHandler";
import { apiLimiter, authLimiter } from "./middleware/rateLimiter";
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
app.use("/api/auth", authLimiter, authRoutes);
app.use("/api/guilds", guildRoutes);
app.use("/api/dashboard", dashboardRoutes);

// ─── Error Handler (must be last) ───────────────
app.use(errorHandler);

// Wrap Express app in HTTP server to enable WebSockets
const server = http.createServer(app);

// Initialize our real-time socket server
initSocketServer(server);

// ─── Start Server ───────────────────────────────
server.listen(env.PORT, () => {
  console.log(`
  Guild Management API (Real-Time Enabled)
  ────────────────────────
  Status:  Running
  Port:    ${env.PORT}
  Env:     ${env.NODE_ENV}
  CORS:    ${env.CORS_ORIGIN}
  ────────────────────────
  `);
});

export default app;
