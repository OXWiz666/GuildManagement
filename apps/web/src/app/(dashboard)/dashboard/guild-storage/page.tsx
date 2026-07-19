"use client";

import { useEffect } from "react";
import { useAuth } from "@/lib/auth-context";
import { useSocket } from "@/components/providers/socket-provider";
import { queryClient } from "@/lib/query";
import DashboardDecor from "@/components/dashboard/DashboardDecor";
import { ModuleHeader } from "@/components/dashboard/DashboardHelpers";
import GuildStorageTab from "../guild-market/components/GuildStorageTab";

export default function GuildStoragePage() {
  const { user } = useAuth();
  const { socket } = useSocket();
  const activeGuild = user?.guilds?.[0];

  useEffect(() => {
    if (!socket || !activeGuild) return;
    const key = `market_storage:${activeGuild.guildId}`;
    const handleStorage = () => queryClient.invalidateQueries(key);

    socket.on("storage_updated", handleStorage);
    return () => {
      socket.off("storage_updated", handleStorage);
    };
  }, [socket, activeGuild]);

  if (!user || !activeGuild) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-white/40">No active guild selected</p>
      </div>
    );
  }

  return (
    <div className="relative max-w-7xl mx-auto w-full px-2 md:px-4 pb-12">
      <DashboardDecor />

      <div className="relative z-10 space-y-6 text-white/85">
        <ModuleHeader
          eyebrow="Storage"
          title="Guild Storage"
          description="Review vaulted boss drops, listed market items, and storage distribution actions."
        />

        <GuildStorageTab guildId={activeGuild.guildId} />
      </div>
    </div>
  );
}
