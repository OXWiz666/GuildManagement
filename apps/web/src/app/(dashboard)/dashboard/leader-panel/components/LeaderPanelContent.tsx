"use client";

import GuildSettingsSection from "../../settings/components/GuildSettingsSection";
import { Reveal } from "@/components/dashboard/DashboardHelpers";

interface LeaderPanelContentProps {
  guildId: string;
}

export default function LeaderPanelContent({ guildId }: LeaderPanelContentProps) {
  return (
    <Reveal>
      <GuildSettingsSection guildId={guildId} />
    </Reveal>
  );
}
