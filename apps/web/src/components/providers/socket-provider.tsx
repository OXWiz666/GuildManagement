"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { io, Socket } from "socket.io-client";
import { useAuth } from "@/lib/auth-context";
import { getAccessToken } from "@/lib/api";

interface SocketContextType {
  socket: Socket | null;
  isConnected: boolean;
  error: string | null;
}

const SocketContext = createContext<SocketContextType>({
  socket: null,
  isConnected: false,
  error: null,
});

export function SocketProvider({ children }: { children: ReactNode }) {
  const { user, isAuthenticated, isSessionReady } = useAuth();
  const [socket, setSocket] = useState<Socket | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isAuthenticated || !isSessionReady) {
      // Disconnect and clean up if not authenticated or session checks aren't fully resolved yet
      if (socket) {
        console.log("[Socket Client]: Disconnecting because user session is not fully ready");
        socket.disconnect();
        setSocket(null);
        setIsConnected(false);
      }
      return;
    }

    const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";
    // Connect to the base domain where the Express server listens.
    // Standardizing paths so Socket.IO works cleanly over the single Express port.
    const socketUrl = API_URL.replace("/api", "");

    console.log(`[Socket Client]: Initializing WebSocket connection to: ${socketUrl}`);

    const newSocket = io(socketUrl, {
      auth: (cb) => {
        // Send the fresh JWT access token in handshake payload
        cb({ token: getAccessToken() });
      },
      transports: ["websocket", "polling"],
      reconnection: true,
      reconnectionAttempts: 10,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      timeout: 20000,
    });

    newSocket.on("connect", () => {
      console.log(`[Socket Client]: Connected. ID: ${newSocket.id}`);
      setIsConnected(true);
      setError(null);
    });

    newSocket.on("disconnect", (reason) => {
      console.log(`[Socket Client]: Disconnected. Reason: ${reason}`);
      setIsConnected(false);
    });

    newSocket.on("connect_error", (err) => {
      console.error("[Socket Client Connection Error]:", err.message);
      setError(err.message);
      setIsConnected(false);
    });

    newSocket.on("error", (err: { code?: string; message?: string }) => {
      console.error("[Socket Client General Error]:", err);
      setError(err.message || "An unexpected websocket error occurred");
    });

    setSocket(newSocket);

    return () => {
      console.log("[Socket Client]: Cleaning up connection on unmount");
      newSocket.disconnect();
    };
  }, [isAuthenticated, isSessionReady]);

  // Active Guild Room Subscription logic
  useEffect(() => {
    if (!socket || !isConnected || !user) return;

    const activeGuild = user.guilds?.[0];
    if (!activeGuild) return;

    console.log(`[Socket Client]: Automatically joining guild room "guild:${activeGuild.guildId}"`);
    socket.emit("join_guild", activeGuild.guildId);

    socket.on("joined_guild_room", (data) => {
      console.log(`[Socket Client]: Confirmed subscription to room: guild:${data.guildId}`);
    });

    return () => {
      socket.off("joined_guild_room");
    };
  }, [socket, isConnected, user]);

  return (
    <SocketContext.Provider value={{ socket, isConnected, error }}>
      {children}
    </SocketContext.Provider>
  );
}

export function useSocket() {
  return useContext(SocketContext);
}
