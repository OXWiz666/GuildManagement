"use client";

import React from "react";
import SettingsCard from "./SettingsCard";
import Input from "@/components/ui/Input";
import Button from "@/components/ui/Button";
import { Magnetic } from "@/components/dashboard/DashboardHelpers";

export interface PasswordSectionProps {
  newPassword: string;
  setNewPassword: (val: string) => void;
  confirmPassword: string;
  setConfirmPassword: (val: string) => void;
  isSavingPassword: boolean;
  handleUpdatePassword: (e: React.FormEvent) => void;
}

export default function PasswordSection({
  newPassword,
  setNewPassword,
  confirmPassword,
  setConfirmPassword,
  isSavingPassword,
  handleUpdatePassword,
}: PasswordSectionProps) {
  return (
    <SettingsCard
      eyebrow="Security"
      title="Password"
      description="Use a strong unique password — 8+ characters with letters and numbers."
    >
      <form onSubmit={handleUpdatePassword} className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Input
            label="New Password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            type="password"
            placeholder="••••••••"
            icon={
              <svg
                className="h-4 w-4 text-white/40"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
              >
                <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                <path d="M7 11V7a5 5 0 0110 0v4" />
              </svg>
            }
          />
          <Input
            label="Confirm New Password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            type="password"
            placeholder="••••••••"
            icon={
              <svg
                className="h-4 w-4 text-white/40"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
              >
                <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                <path d="M7 11V7a5 5 0 0110 0v4" />
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
              isLoading={isSavingPassword}
            >
              Change password
            </Button>
          </Magnetic>
        </div>
      </form>
    </SettingsCard>
  );
}
