"use client";

import React from "react";
import BaseGuildDashboard from "./BaseGuildDashboard";

export default function MemberDashboard() {
  return (
    <BaseGuildDashboard
      role="MEMBER"
      isOfficer={false}
      isGuildLeader={false}
      isAdmin={false}
    />
  );
}
