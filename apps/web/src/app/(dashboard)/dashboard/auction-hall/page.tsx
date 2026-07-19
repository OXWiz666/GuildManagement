"use client";

import { useEffect } from "react";
import { useAuth } from "@/lib/auth-context";
import { useSocket } from "@/components/providers/socket-provider";
import { queryClient } from "@/lib/query";
import DashboardDecor from "@/components/dashboard/DashboardDecor";
import { ModuleHeader } from "@/components/dashboard/DashboardHelpers";
import AuctionHallTab from "../guild-market/components/AuctionHallTab";

export default function AuctionHallPage() {
  const { user } = useAuth();
  const { socket } = useSocket();
  const activeGuild = user?.guilds?.[0];

  useEffect(() => {
    if (!socket || !activeGuild) return;
    const gid = activeGuild.guildId;
    const handleAuction = () => {
      queryClient.invalidateQueries(`market_auctions:${gid}`);
      queryClient.invalidateQueries(`market_auction_history:${gid}`);
    };

    socket.on("auction_updated", handleAuction);
    return () => {
      socket.off("auction_updated", handleAuction);
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
          eyebrow="Auction"
          title="Auction Hall"
          description="Create guild auctions, bid with Guild Points, and review closed auction history."
        />

        <AuctionHallTab guildId={activeGuild.guildId} />
      </div>
    </div>
  );
}
