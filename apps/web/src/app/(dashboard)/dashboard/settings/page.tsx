"use client";

import { useState, useEffect, useCallback } from "react";
import { useAuth } from "@/lib/auth-context";
import { authApi } from "@/lib/api";
import { useToast } from "@/components/ui/Toast";
import Button from "@/components/ui/Button";
import DashboardDecor from "@/components/dashboard/DashboardDecor";
import {
  Reveal,
  ModuleHeader,
  Magnetic,
} from "@/components/dashboard/DashboardHelpers";

// Imports from co-located components
import ProfileSection from "./components/ProfileSection";
import PaymentMethodsSection from "./components/PaymentMethodsSection";
import CharacterSection from "./components/CharacterSection";
import PasswordSection from "./components/PasswordSection";
import SessionsSection, { type SessionData } from "./components/SessionsSection";

export default function SettingsPage() {
  const { user, refreshUser, logout } = useAuth();
  const { addToast } = useToast();
  const [sessions, setSessions] = useState<SessionData[]>([]);
  const [isLoadingSessions, setIsLoadingSessions] = useState(true);

  // Profile states
  const [displayName, setDisplayName] = useState(user?.displayName || "");
  const [email, setEmail] = useState(user?.email || "");
  const [avatarUrl, setAvatarUrl] = useState(user?.avatarUrl || "");
  const [isSavingProfile, setIsSavingProfile] = useState(false);

  // Character Pre-Guild Profile states
  const [ign, setIgn] = useState(user?.ign || "");
  const [cp, setCp] = useState(user?.cp ? user.cp.toString() : "");
  const [classType, setClassType] = useState(user?.class || "");
  const [weapon, setWeapon] = useState(user?.weapon || "");
  const [isSavingCharacter, setIsSavingCharacter] = useState(false);

  // Password states
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isSavingPassword, setIsSavingPassword] = useState(false);

  const loadSessions = useCallback(async () => {
    setIsLoadingSessions(true);
    try {
      const result = await authApi.getSessions();
      if (result.success && result.data?.sessions) {
        setSessions(result.data.sessions);
      }
    } catch {
      addToast("error", "Failed to load sessions");
    } finally {
      setIsLoadingSessions(false);
    }
  }, [addToast]);

  useEffect(() => {
    loadSessions();
  }, [loadSessions]);

  // Sync state values on initial fetch or user update
  useEffect(() => {
    if (user) {
      setDisplayName(user.displayName);
      setEmail(user.email);
      setAvatarUrl(user.avatarUrl || "");
      setIgn(user.ign || "");
      setCp(user.cp ? user.cp.toString() : "");
      setClassType(user.class || "");
      setWeapon(user.weapon || "");
    }
  }, [user]);

  function handleRevokeSession(sessionId: string) {
    addToast(
      "warning",
      "Are you sure you want to revoke this active session?",
      0, // stays until action or dismiss
      {
        label: "Revoke",
        variant: "danger",
        onClick: async () => {
          const result = await authApi.revokeSession(sessionId);
          if (result.success) {
            addToast("success", "Session revoked");
            loadSessions();
          } else {
            addToast("error", "Failed to revoke session");
          }
        },
      }
    );
  }

  function handleLogoutAll() {
    addToast(
      "warning",
      "Are you sure you want to sign out everywhere? This will terminate all active sessions on other devices.",
      0, // stays until action or dismiss
      {
        label: "Sign Out All",
        variant: "danger",
        onClick: async () => {
          await authApi.logoutAll();
          addToast("info", "All sessions terminated");
          window.location.href = "/login";
        },
      }
    );
  }

  async function handleUpdateProfile(e: React.FormEvent) {
    e.preventDefault();
    if (!displayName.trim() || !email.trim()) {
      addToast("error", "Display Name and Email are required");
      return;
    }
    setIsSavingProfile(true);
    try {
      const result = await authApi.updateMe({
        displayName: displayName.trim(),
        email: email.trim(),
        avatarUrl: avatarUrl.trim() || null,
      });
      if (result.success) {
        addToast("success", "Profile updated successfully");
        await refreshUser();
      } else {
        addToast("error", result.error?.message || "Failed to update profile");
      }
    } catch (err: any) {
      addToast("error", err?.message || "An error occurred");
    } finally {
      setIsSavingProfile(false);
    }
  }

  async function handleUpdateCharacter(e: React.FormEvent) {
    e.preventDefault();
    setIsSavingCharacter(true);
    try {
      const cpNumber = cp ? parseInt(cp.replace(/[^0-9]/g, "")) : null;
      if (cp && isNaN(Number(cpNumber))) {
        addToast("error", "Combat Power must be a number");
        setIsSavingCharacter(false);
        return;
      }
      const result = await authApi.updateMe({
        ign: ign.trim() || null,
        cp: cpNumber,
        class: classType || null,
        weapon: weapon.trim() || null,
      });
      if (result.success) {
        addToast("success", "Character details saved");
        await refreshUser();
      } else {
        addToast("error", result.error?.message || "Failed to save character profile");
      }
    } catch (err: any) {
      addToast("error", err?.message || "An error occurred");
    } finally {
      setIsSavingCharacter(false);
    }
  }

  async function handleUpdatePassword(e: React.FormEvent) {
    e.preventDefault();
    if (!newPassword) {
      addToast("error", "Please enter a new password");
      return;
    }
    if (newPassword !== confirmPassword) {
      addToast("error", "Passwords do not match");
      return;
    }
    setIsSavingPassword(true);
    try {
      const result = await authApi.updateMe({
        password: newPassword,
      });
      if (result.success) {
        addToast("success", "Password changed successfully");
        setNewPassword("");
        setConfirmPassword("");
      } else {
        addToast("error", result.error?.message || "Failed to update password");
      }
    } catch (err: any) {
      addToast("error", err?.message || "An error occurred");
    } finally {
      setIsSavingPassword(false);
    }
  }

  if (!user) return null;

  return (
    <div className="relative max-w-4xl mx-auto w-full pb-10">
      <DashboardDecor />

      <div className="relative z-10 space-y-7 text-white/85">
        <ModuleHeader
          eyebrow="Account"
          title="Settings"
          description="Manage your personal details, character profile, and active sessions."
        />

        {/* User Profile Section */}
        <Reveal>
          <ProfileSection
            avatarUrl={avatarUrl}
            setAvatarUrl={setAvatarUrl}
            displayName={displayName}
            setDisplayName={setDisplayName}
            email={email}
            setEmail={setEmail}
            isSavingProfile={isSavingProfile}
            handleUpdateProfile={handleUpdateProfile}
          />
        </Reveal>

        {/* Payment Methods (QR codes) */}
        <Reveal>
          <PaymentMethodsSection />
        </Reveal>

        {/* Character Profile Section */}
        <Reveal>
          <CharacterSection
            ign={ign}
            setIgn={setIgn}
            cp={cp}
            setCp={setCp}
            classType={classType}
            setClassType={setClassType}
            weapon={weapon}
            setWeapon={setWeapon}
            isSavingCharacter={isSavingCharacter}
            handleUpdateCharacter={handleUpdateCharacter}
          />
        </Reveal>

        {/* Change Password */}
        <Reveal>
          <PasswordSection
            newPassword={newPassword}
            setNewPassword={setNewPassword}
            confirmPassword={confirmPassword}
            setConfirmPassword={setConfirmPassword}
            isSavingPassword={isSavingPassword}
            handleUpdatePassword={handleUpdatePassword}
          />
        </Reveal>

        {/* Active Sessions */}
        <Reveal>
          <SessionsSection
            sessions={sessions}
            isLoadingSessions={isLoadingSessions}
            handleRevokeSession={handleRevokeSession}
            handleLogoutAll={handleLogoutAll}
          />
        </Reveal>



        {/* Danger Zone */}
        <Reveal>
          <div className="relative glass rounded-2xl p-6 border border-red-500/15 overflow-hidden">
            <span
              aria-hidden
              className="absolute inset-x-6 top-0 h-px"
              style={{
                background:
                  "linear-gradient(90deg, transparent, oklch(0.62 0.18 22 / 0.45), transparent)",
              }}
            />
            <div className="flex items-center gap-2 mb-3">
              <span className="text-[10px] text-red-400/80 uppercase tracking-[0.22em]">
                Danger zone
              </span>
              <span className="h-px flex-1 bg-gradient-to-r from-red-500/30 to-transparent" />
            </div>
            <h2 className="text-[16px] font-semibold text-white mb-2 tracking-tight">
              Irreversible actions
            </h2>
            <p className="text-sm text-white/45 mb-4 leading-relaxed">
              These actions cannot be undone. Proceed with caution.
            </p>
            <Magnetic strength={4}>
              <Button
                variant="danger"
                size="sm"
                onClick={async () => {
                  await logout();
                  window.location.href = "/login";
                }}
              >
                Sign out current session
              </Button>
            </Magnetic>
          </div>
        </Reveal>
      </div>
    </div>
  );
}
