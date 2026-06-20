"use client";

import React from "react";
import BaseGuildDashboard from "./BaseGuildDashboard";

export default function AdminDashboard() {
  return (
    <BaseGuildDashboard
      role="ADMIN"
      isOfficer={true}
      isGuildLeader={true}
      isAdmin={true}
    />
  );
}
