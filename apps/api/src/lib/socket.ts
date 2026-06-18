import { env } from "../config/env";

/**
 * Re-implemented broadcastToGuild using Supabase Realtime REST API
 * to keep the application fully serverless-ready on Vercel.
 */
export async function broadcastToGuild<T = unknown>(
  guildId: string | null | undefined,
  event: string,
  payload: T
): Promise<void> {
  const topic = guildId ? `guild-${guildId}` : "guild-global";
  const supabaseUrl = env.SUPABASE_URL;
  const supabaseKey = env.SUPABASE_KEY;

  if (!supabaseUrl || !supabaseKey) {
    console.error(
      "[Realtime Broadcast Error]: SUPABASE_URL or SUPABASE_KEY is not configured in env."
    );
    return;
  }

  const endpoint = `${supabaseUrl}/realtime/v1/api/broadcast`;

  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "apikey": supabaseKey,
        "Authorization": `Bearer ${supabaseKey}`,
        "Content-Type": "application/json",
      },
      signal: AbortSignal.timeout(3000),
      body: JSON.stringify({
        messages: [
          {
            topic,
            event,
            payload,
          },
        ],
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(
        `[Realtime Broadcast Failed]: ${response.status} ${response.statusText} - ${errorText}`
      );
    } else {
      console.log(
        `[Realtime Broadcast Success]: Sent "${event}" to topic "${topic}"`
      );
    }
  } catch (err) {
    console.error("[Realtime Broadcast Exception]:", err);
  }
}

export async function broadcastToUser<T = unknown>(
  userId: string,
  event: string,
  payload: T
): Promise<void> {
  await broadcastToTopic(`user-${userId}`, event, payload);
}

async function broadcastToTopic<T = unknown>(
  topic: string,
  event: string,
  payload: T
): Promise<void> {
  const supabaseUrl = env.SUPABASE_URL;
  const supabaseKey = env.SUPABASE_KEY;

  if (!supabaseUrl || !supabaseKey) {
    console.error(
      "[Realtime Broadcast Error]: SUPABASE_URL or SUPABASE_KEY is not configured in env."
    );
    return;
  }

  const endpoint = `${supabaseUrl}/realtime/v1/api/broadcast`;

  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "apikey": supabaseKey,
        "Authorization": `Bearer ${supabaseKey}`,
        "Content-Type": "application/json",
      },
      signal: AbortSignal.timeout(3000),
      body: JSON.stringify({
        messages: [
          {
            topic,
            event,
            payload,
          },
        ],
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(
        `[Realtime Broadcast Failed]: ${response.status} ${response.statusText} - ${errorText}`
      );
    } else {
      console.log(
        `[Realtime Broadcast Success]: Sent "${event}" to topic "${topic}"`
      );
    }
  } catch (err) {
    console.error("[Realtime Broadcast Exception]:", err);
  }
}

/**
 * Stub implementations for backwards compatibility
 */
export function initSocketServer(httpServer: any): any {
  console.log("[Realtime Server]: Socket.IO server initialization bypassed in favor of Supabase Realtime.");
  return null;
}

export function getSocketIO(): null {
  return null;
}

export function getRedisClient(): null {
  return null;
}
