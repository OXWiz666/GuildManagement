import type { Server as HTTPServer } from "http";
import { Server, Socket } from "socket.io";
import { createAdapter } from "@socket.io/redis-adapter";
import Redis from "ioredis";
import { RateLimiterRedis, RateLimiterMemory } from "rate-limiter-flexible";
import cookie from "cookie";
import { env } from "../config/env";
import { verifyAccessToken } from "../utils/jwt";
import * as guildService from "../services/guild.service";
import type { JwtPayload } from "@guild/shared";

// Extend Socket type to store authenticated user data
interface AuthenticatedSocket extends Socket {
  data: {
    user?: JwtPayload;
  };
}

let io: Server | null = null;
let redisClient: Redis | null = null;
let rateLimiter: RateLimiterRedis | RateLimiterMemory | null = null;

/**
 * Get active Redis client or return null if not configured
 */
export function getRedisClient(): Redis | null {
  if (redisClient) return redisClient;

  if (env.REDIS_URL) {
    try {
      redisClient = new Redis(env.REDIS_URL, {
        maxRetriesPerRequest: null,
        enableReadyCheck: true,
      });
      redisClient.on("error", (err) => console.error("[Redis Error]:", err));
      redisClient.on("connect", () => console.log("[Redis]: Connected successfully"));
      return redisClient;
    } catch (e) {
      console.error("[Redis Connection Failed]: falling back to memory.", e);
    }
  }
  return null;
}

/**
 * Initialize Socket.IO Server with horizontal scaling, authentication, and rate limiting
 */
export function initSocketServer(httpServer: HTTPServer): Server {
  const clientOrigin = env.CORS_ORIGIN || "http://localhost:3000";

  io = new Server(httpServer, {
    cors: {
      origin: clientOrigin,
      methods: ["GET", "POST", "PATCH", "DELETE", "PUT"],
      credentials: true,
    },
    // Set 25s pingInterval to prevent Cloudflare from dropping idle connections (100s timeout)
    pingInterval: 25000,
    pingTimeout: 20000,
    transports: ["websocket", "polling"],
  });

  const redis = getRedisClient();

  // 1. Horizontal Scale Pub/Sub Adapter (Redis)
  if (redis) {
    console.log("[Socket.io]: Attaching Redis Pub/Sub adapter for horizontal scaling");
    const pubClient = redis;
    const subClient = redis.duplicate();
    io.adapter(createAdapter(pubClient, subClient));
  } else {
    console.log("[Socket.io]: No Redis URL found. Using in-memory adapter (single-instance mode)");
  }

  // 2. Setup Rate Limiter (Redis-backed with Memory fallback)
  if (redis) {
    rateLimiter = new RateLimiterRedis({
      storeClient: redis,
      keyPrefix: "ws_rate_limit",
      points: 5, // 5 connections
      duration: 10, // per 10 seconds per IP
    });
  } else {
    rateLimiter = new RateLimiterMemory({
      points: 5,
      duration: 10,
    });
  }

  // 3. JWT Handshake Authentication Middleware
  io.use((socket, next) => {
    try {
      const token = socket.handshake.auth['token'] || socket.handshake.headers.authorization?.split(" ")[1];
      
      let finalToken = token;
      
      // If auth token wasn't sent in payload, check Cookies (Next.js cookies)
      if (!finalToken && socket.handshake.headers.cookie) {
        const parsedCookies = cookie.parse(socket.handshake.headers.cookie);
        finalToken = parsedCookies['accessToken'];
      }

      if (!finalToken) {
        return next(new Error("Authentication error: Token missing"));
      }

      const decoded = verifyAccessToken(finalToken);
      socket.data.user = decoded; // Store decodified user details in socket context
      next();
    } catch (err) {
      console.error("[Socket.io Auth Failed]:", err);
      return next(new Error("Authentication error: Invalid or expired token"));
    }
  });

  // 4. IP-Based Connection Rate Limiting Middleware
  io.use(async (socket, next) => {
    // Cloudflare trusts proxy headers, check CF IP or fallbacks
    const ip = (socket.handshake.headers["cf-connecting-ip"] as string) || 
               (socket.handshake.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() || 
               socket.handshake.address;

    if (rateLimiter) {
      try {
        await rateLimiter.consume(ip);
        next();
      } catch (rateLimiterRes) {
        console.warn(`[Socket.io Rate Limit Blocked]: IP ${ip} exceeded WebSocket connection threshold.`);
        return next(new Error("Rate limit exceeded: Too many connection attempts."));
      }
    } else {
      next();
    }
  });

  // 5. Connection Routines
  io.on("connection", (socket: Socket) => {
    const user = socket.data.user;
    const ip = (socket.handshake.headers["cf-connecting-ip"] as string) || socket.handshake.address;
    
    console.log(`[Socket.io Connected]: ID: ${socket.id} | User: ${user?.email} | IP: ${ip}`);

    // Create an event rate limiter for this specific socket instance (max 40 messages per minute)
    const socketEventLimiter = new RateLimiterMemory({
      points: 40,
      duration: 60,
    });

    // Middleware to check rate limits on all incoming client events
    socket.use(async ([event, ...args], next) => {
      try {
        await socketEventLimiter.consume(socket.id);
        next();
      } catch (err) {
        console.warn(`[Socket.io Event Abused]: Client ${socket.id} hit message limit. Disconnecting client.`);
        socket.emit("error", { code: "RATE_LIMIT_EXCEEDED", message: "Too many messages sent." });
        socket.disconnect(true);
      }
    });

    // Room join subscription logic (Join Guild Room)
    socket.on("join_guild", async (guildId: string) => {
      if (!guildId || typeof guildId !== "string") {
        socket.emit("error", { code: "VALIDATION_ERROR", message: "Invalid Guild ID format" });
        return;
      }

      // LIVE Database Check: verify user actually belongs to this guild right now
      // (JWT guilds claim can be stale for up to 15 min after kick/role change)
      try {
        const membership = await guildService.getGuildMemberByUser(user?.userId || "", guildId);
        if (!membership || !membership.isActive) {
          console.warn(`[Socket.io Access Denied]: User ${user?.email} attempted to subscribe to unauthorized guild: ${guildId}`);
          socket.emit("error", { code: "ACCESS_DENIED", message: "You are not a member of this guild." });
          return;
        }
      } catch (err) {
        console.error(`[Socket.io join_guild DB Error]:`, err);
        socket.emit("error", { code: "INTERNAL_ERROR", message: "Failed to verify guild membership." });
        return;
      }

      // Leave any existing guild rooms first to clean up connections
      socket.rooms.forEach((room) => {
        if (room.startsWith("guild:") && room !== `guild:${guildId}`) {
          socket.leave(room);
          console.log(`[Socket.io Room Leave]: Client ${socket.id} left room ${room}`);
        }
      });

      socket.join(`guild:${guildId}`);
      console.log(`[Socket.io Room Join]: User ${user?.email} joined guild room: guild:${guildId}`);
      socket.emit("joined_guild_room", { guildId });
    });

    socket.on("disconnect", (reason) => {
      console.log(`[Socket.io Disconnected]: ID: ${socket.id} | Reason: ${reason}`);
    });
  });

  return io;
}

/**
 * Helper to emit events to active guild rooms or faction-wide channel
 */
export function broadcastToGuild<T = unknown>(
  guildId: string | null | undefined,
  event: string,
  payload: T
): void {
  if (!io) {
    console.error("[Socket.io Broadcast Warning]: Attempted broadcast before Socket.io initialized.");
    return;
  }

  if (guildId) {
    console.log(`[Socket.io Broadcast]: Emitting "${event}" to room "guild:${guildId}"`);
    io.to(`guild:${guildId}`).emit(event, payload);
  } else {
    // If guildId is null, it's a faction-wide/alliance broadcast
    console.log(`[Socket.io Broadcast]: Emitting "${event}" to all connected clients`);
    io.emit(event, payload);
  }
}

/**
 * Get active Socket.IO server instance
 */
export function getSocketIO(): Server | null {
  return io;
}
