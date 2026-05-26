"use client";

import React from "react";
import SettingsCard from "./SettingsCard";
import Input from "@/components/ui/Input";
import Button from "@/components/ui/Button";
import { Magnetic } from "@/components/dashboard/DashboardHelpers";

export interface CharacterSectionProps {
  ign: string;
  setIgn: (val: string) => void;
  cp: string;
  setCp: (val: string) => void;
  classType: string;
  setClassType: (val: string) => void;
  weapon: string;
  setWeapon: (val: string) => void;
  isSavingCharacter: boolean;
  handleUpdateCharacter: (e: React.FormEvent) => void;
}

export default function CharacterSection({
  ign,
  setIgn,
  cp,
  setCp,
  classType,
  setClassType,
  weapon,
  setWeapon,
  isSavingCharacter,
  handleUpdateCharacter,
}: CharacterSectionProps) {
  return (
    <SettingsCard
      eyebrow="Character"
      title="Pre-guild character profile"
      description="Standard in-game stats. Stored on your profile and pre-fill guild application invites."
    >
      <form onSubmit={handleUpdateCharacter} className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Input
            label="In-Game Name (IGN)"
            value={ign}
            onChange={(e) => setIgn(e.target.value)}
            placeholder="e.g. Wiz"
            icon={
              <svg
                className="h-4 w-4 text-white/40"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
              >
                <path d="M12 2l3 6 6 1-4 4 1 6-6-3-6 3 1-6-4-4 6-1 3-6z" />
              </svg>
            }
          />
          <Input
            label="Combat Power (CP)"
            value={cp}
            onChange={(e) => {
              const clean = e.target.value.replace(/[^0-9]/g, "");
              setCp(clean ? Number(clean).toLocaleString() : "");
            }}
            placeholder="e.g. 75,000"
            icon={
              <svg
                className="h-4 w-4 text-white/40"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
              >
                <polygon points="12 2 2 7 12 12 22 7 12 2" />
                <polyline points="2 17 12 22 22 17" />
                <polyline points="2 12 12 17 22 12" />
              </svg>
            }
          />
          <Input
            label="Class"
            value={classType}
            onChange={(e) => setClassType(e.target.value)}
            placeholder="e.g. Destroyer, Hunter"
            icon={
              <svg
                className="h-4 w-4 text-white/40"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
              >
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
              </svg>
            }
          />
          <Input
            label="Main Weapon"
            value={weapon}
            onChange={(e) => setWeapon(e.target.value)}
            placeholder="e.g. Dual Dagger"
            icon={
              <svg
                className="h-4 w-4 text-white/40"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
              >
                <path d="M14.5 17.5L3 6V3h3l11.5 11.5M13 19l8-8M19 19l2-2" />
              </svg>
            }
          />
        </div>

        <div className="flex justify-end pt-3 border-t border-white/[0.06]">
          <Magnetic strength={4}>
            <Button
              variant="primary"
              size="sm"
              type="submit"
              isLoading={isSavingCharacter}
            >
              Save character
            </Button>
          </Magnetic>
        </div>
      </form>
    </SettingsCard>
  );
}
