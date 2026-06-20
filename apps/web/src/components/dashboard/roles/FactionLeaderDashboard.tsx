"use client";

import React from "react";
import BaseGuildDashboard from "./BaseGuildDashboard";

export default function FactionLeaderDashboard() {
  return (
    <BaseGuildDashboard
      role="FACTION_LEADER"
      isOfficer={true}
      isGuildLeader={true}
      isAdmin={false}
    />
  );
}
