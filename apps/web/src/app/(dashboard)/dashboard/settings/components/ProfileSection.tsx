"use client";

import React from "react";
import SettingsCard from "./SettingsCard";
import Input from "@/components/ui/Input";
import Button from "@/components/ui/Button";
import { AvatarUploadField, Magnetic } from "@/components/dashboard/DashboardHelpers";

export interface ProfileSectionProps {
  avatarUrl: string;
  setAvatarUrl: (val: string) => void;
  displayName: string;
  setDisplayName: (val: string) => void;
  email: string;
  setEmail: (val: string) => void;
  isSavingProfile: boolean;
  handleUpdateProfile: (e: React.FormEvent) => void;
}

export default function ProfileSection({
  avatarUrl,
  setAvatarUrl,
  displayName,
  setDisplayName,
  email,
  setEmail,
  isSavingProfile,
  handleUpdateProfile,
}: ProfileSectionProps) {
  return (
    <SettingsCard
      eyebrow="Profile"
      title="User settings"
      description="Your public-facing identity on ForgeKeep."
    >
      <form onSubmit={handleUpdateProfile} className="space-y-5">
        <AvatarUploadField
          label="Profile photo"
          value={avatarUrl}
          onChange={setAvatarUrl}
          fallbackInitial={
            displayName
              ? displayName
                  .split(" ")
                  .map((w) => w[0])
                  .join("")
                  .toUpperCase()
                  .slice(0, 2)
              : "?"
          }
          helperText="Upload any local image from your PC (JPG, PNG, WEBP) or drag it onto the circle."
        />

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2 border-t border-white/[0.06]">
          <Input
            label="Display Name"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            required
            icon={
              <svg
                className="h-4 w-4 text-white/40"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
              >
                <path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2" />
                <circle cx="12" cy="7" r="4" />
              </svg>
            }
          />
          <Input
            label="Email Address"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            type="email"
            icon={
              <svg
                className="h-4 w-4 text-white/40"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
              >
                <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
                <path d="M22 6l-10 7L2 6" />
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
              isLoading={isSavingProfile}
            >
              Save profile
            </Button>
          </Magnetic>
        </div>
      </form>
    </SettingsCard>
  );
}
