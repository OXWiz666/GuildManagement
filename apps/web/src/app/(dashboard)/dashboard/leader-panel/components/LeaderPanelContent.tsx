"use client";

import GuildSettingsSection from "../../settings/components/GuildSettingsSection";
import DistributionRulesSection from "../../settings/components/DistributionRulesSection";
import GuildPointsResetSection from "./GuildPointsResetSection";
import MountWishlistSection from "./MountWishlistSection";
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
        <DistributionRulesSection guildId={guildId} />
      </Reveal>
      <Reveal>
        <GuildPointsResetSection guildId={guildId} />
      </Reveal>
      <Reveal>
        <MountWishlistSection guildId={guildId} />
      </Reveal>
    </div>
  );
}
