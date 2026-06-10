"use client";

import React from "react";
import BaseGuildDashboard from "./BaseGuildDashboard";

export default function GuildLeaderDashboard() {
  return (
    <BaseGuildDashboard
      role="GUILD_LEADER"
      isOfficer={true}
      isGuildLeader={true}
      isAdmin={false}
    />
  );
}
