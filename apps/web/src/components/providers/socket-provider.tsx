"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  useRef,
  type ReactNode,
} from "react";
import { useAuth } from "@/lib/auth-context";
import { createClient } from "@/utils/supabase/client";

interface SocketContextType {
  socket: {
    on: (event: string, cb: Function) => void;
    off: (event: string, cb: Function) => void;
    emit: (event: string, ...args: any[]) => void;
  } | null;
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
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  const listeners = useRef<Record<string, Set<Function>>>({});

  // Re-create the Socket.IO client interface for backward compatibility
  const socketRef = useRef<SocketContextType["socket"]>({
    on: (event, cb) => {
      if (!listeners.current[event]) {
        listeners.current[event] = new Set();
      }
      listeners.current[event].add(cb);
    },
    off: (event, cb) => {
      listeners.current[event]?.delete(cb);
    },
    emit: (event, ...args) => {
      console.log(`[Realtime Client]: emit("${event}")`, args);
    },
  });

  useEffect(() => {
    if (!isAuthenticated || !isSessionReady || !user) {
      setIsConnected(false);
      return;
    }

    const supabase = createClient();
    
    const handleBroadcast = (event: string, payload: any) => {
      console.log(`[Realtime Client]: Received broadcast "${event}"`, payload);
      listeners.current[event]?.forEach((cb) => cb(payload));
    };

    console.log("[Realtime Client]: Initializing Supabase Realtime subscriptions");

    // 1. Subscribe to the global updates channel
    const globalChannel = supabase.channel("guild-global", {
      config: { broadcast: { self: true } },
    });

    globalChannel
      .on("broadcast", { event: "*" }, ({ event, payload }: { event: string; payload: any }) => {
        handleBroadcast(event, payload);
      })
      .subscribe((status: string) => {
        console.log(`[Realtime Client]: Global channel status: ${status}`);
        if (status === "SUBSCRIBED") {
          setIsConnected(true);
        }
      });

    // 2. Subscribe to the specific guild channel if user has a guild
    const activeGuild = user.guilds?.[0];
    let guildChannel: any = null;

    if (activeGuild) {
      const guildId = activeGuild.guildId;
      console.log(`[Realtime Client]: Subscribing to guild room: guild-${guildId}`);
      
      guildChannel = supabase.channel(`guild-${guildId}`, {
        config: { broadcast: { self: true } },
      });

      guildChannel
        .on("broadcast", { event: "*" }, ({ event, payload }: { event: string; payload: any }) => {
          handleBroadcast(event, payload);
        })
        .subscribe((status: string) => {
          console.log(`[Realtime Client]: Guild channel status: ${status}`);
          // Trigger the 'joined_guild_room' event for backward compatibility
          if (status === "SUBSCRIBED") {
            handleBroadcast("joined_guild_room", { guildId });
          }
        });
    }

    return () => {
      console.log("[Realtime Client]: Cleaning up Supabase subscriptions");
      if (globalChannel) supabase.removeChannel(globalChannel);
      if (guildChannel) supabase.removeChannel(guildChannel);
    };
  }, [isAuthenticated, isSessionReady, user]);

  return (
    <SocketContext.Provider value={{ socket: socketRef.current, isConnected, error }}>
      {children}
    </SocketContext.Provider>
  );
}

export function useSocket() {
  return useContext(SocketContext);
}
