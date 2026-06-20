"use client";

import React from "react";
import BaseGuildDashboard from "./BaseGuildDashboard";

export default function OfficerDashboard() {
  return (
    <BaseGuildDashboard
      role="OFFICER"
      isOfficer={true}
      isGuildLeader={false}
      isAdmin={false}
    />
  );
}
