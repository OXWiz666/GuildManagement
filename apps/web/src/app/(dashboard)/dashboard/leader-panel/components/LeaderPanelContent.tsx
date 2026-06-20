"use client";

import GuildSettingsSection from "../../settings/components/GuildSettingsSection";
import GuildPointsResetSection from "./GuildPointsResetSection";
import { Reveal } from "@/components/dashboard/DashboardHelpers";

interface LeaderPanelContentProps {
  guildId: string;
}

export default function LeaderPanelContent({ guildId }: LeaderPanelContentProps) {
  return (
    <div className="space-y-6">
      <Reveal>
        <GuildSettingsSection guildId={guildId} />
      </Reveal>
      <Reveal>
        <GuildPointsResetSection guildId={guildId} />
      </Reveal>
    </div>
  );
}
